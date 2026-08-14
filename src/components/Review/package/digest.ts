import type { ReviewPackageDigest } from './contracts';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (const value of bytes) text += String.fromCharCode(value);
  return btoa(text);
}

function rotateLeft(value: number, count: number): number {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

function md5(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  const total = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(total);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(total - 8, bitLength >>> 0, true);
  view.setUint32(total - 4, Math.floor(bitLength / 0x1_0000_0000) >>> 0, true);
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < total; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) { f = (b & c) | (~b & d); g = index; }
      else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16; }
      else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * index) % 16; }
      const constant = Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0;
      const shift = shifts[(index >> 4) * 4 + (index % 4)];
      const next = d;
      d = c;
      c = b;
      b = (b + rotateLeft((a + f + constant + words[g]) >>> 0, shift)) >>> 0;
      a = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const output = new Uint8Array(16);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, a0, true);
  outputView.setUint32(4, b0, true);
  outputView.setUint32(8, c0, true);
  outputView.setUint32(12, d0, true);
  return output;
}

export async function calculateReviewPackageDigest(blob: Blob): Promise<ReviewPackageDigest> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!globalThis.crypto?.subtle) throw new Error('review-package-digest-unavailable');
  const sha256 = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return { byteLength: bytes.byteLength, sha256: hex(sha256), contentMd5: base64(md5(bytes)) };
}
