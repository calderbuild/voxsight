import { createHmac, timingSafeEqual } from 'crypto';

const WS_SHARED_SECRET = process.env.WS_SHARED_SECRET || 'voxsight-dev-shared-secret';
const MAX_CLOCK_SKEW_MS = parseInt(process.env.WS_AUTH_MAX_SKEW_MS || '60000', 10);
const NONCE_PATTERN = /^[a-f0-9]{24,64}$/;

const usedNonces = new Map<string, number>();

function cleanupExpiredNonces(now: number): void {
  for (const [nonce, ts] of usedNonces) {
    if (now - ts > MAX_CLOCK_SKEW_MS) {
      usedNonces.delete(nonce);
    }
  }
}

function sign(payload: string): string {
  return createHmac('sha256', WS_SHARED_SECRET).update(payload).digest('hex');
}

function safeEqualHex(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(actual, 'hex');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function verifyWebSocketAuth(requestUrl?: string): { ok: true } | { ok: false; reason: string } {
  if (!requestUrl) {
    return { ok: false, reason: 'Missing request URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(requestUrl, 'http://localhost');
  } catch {
    return { ok: false, reason: 'Malformed request URL' };
  }

  const tsRaw = parsed.searchParams.get('ts');
  const nonce = parsed.searchParams.get('nonce');
  const sig = parsed.searchParams.get('sig');

  if (!tsRaw || !nonce || !sig) {
    return { ok: false, reason: 'Missing auth query params' };
  }

  if (!NONCE_PATTERN.test(nonce)) {
    return { ok: false, reason: 'Invalid nonce format' };
  }

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'Invalid timestamp' };
  }

  const now = Date.now();
  if (Math.abs(now - ts) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: 'Expired timestamp' };
  }

  cleanupExpiredNonces(now);
  if (usedNonces.has(nonce)) {
    return { ok: false, reason: 'Replay detected' };
  }

  const expectedSig = sign(`${tsRaw}.${nonce}`);
  if (!safeEqualHex(expectedSig, sig)) {
    return { ok: false, reason: 'Signature mismatch' };
  }

  usedNonces.set(nonce, now);
  return { ok: true };
}
