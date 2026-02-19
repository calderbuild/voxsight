const WS_SHARED_SECRET = 'voxsight-dev-shared-secret';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createNonce(bytes = 12): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toHex(buffer);
}

async function signPayload(payload: string): Promise<string> {
  const keyData = new TextEncoder().encode(WS_SHARED_SECRET);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(new Uint8Array(signature));
}

export async function createAuthenticatedWebSocketUrl(baseUrl: string): Promise<string> {
  const ts = Date.now().toString();
  const nonce = createNonce();
  const payload = `${ts}.${nonce}`;
  const sig = await signPayload(payload);

  const url = new URL(baseUrl);
  url.searchParams.set('ts', ts);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('sig', sig);
  return url.toString();
}
