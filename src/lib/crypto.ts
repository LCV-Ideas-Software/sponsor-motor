const ENCODER = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', ENCODER.encode(value)));
}

export async function hmacSha256Hex(secret: string, manifest: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', ENCODER.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return bytesToHex(await crypto.subtle.sign('HMAC', key, ENCODER.encode(manifest)));
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = ENCODER.encode(a);
  const right = ENCODER.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export async function optionalHash(value: string | undefined): Promise<string | null> {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized ? sha256Hex(normalized) : null;
}
