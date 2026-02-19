#!/bin/bash
# Generate placeholder PNG icons using ImageMagick or sips
# For now, create simple colored PNGs

for size in 16 48 128; do
  python3 -c "
import struct, zlib

def create_png(width, height, filename):
    # Simple blue PNG
    def raw_data():
        for y in range(height):
            yield b'\x00'  # filter byte
            for x in range(width):
                # Simple circle-ish shape
                cx, cy = width/2, height/2
                r = min(width, height) * 0.4
                dx, dy = x - cx, y - cy
                if dx*dx + dy*dy < r*r:
                    yield bytes([26, 115, 232, 255])  # Google Blue
                else:
                    yield bytes([0, 0, 0, 0])  # transparent
    
    raw = b''.join(raw_data())
    
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw)
    
    with open(filename, 'wb') as f:
        f.write(sig)
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))

create_png($size, $size, '$size.png')
" 2>/dev/null && mv ${size}.png /Users/calder/hackathon/chormeplugin/extension/assets/icons/icon-${size}.png
done
