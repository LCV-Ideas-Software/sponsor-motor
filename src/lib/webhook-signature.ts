import { hmacSha256Hex, timingSafeEqualHex } from './crypto.ts';

export interface WebhookSignatureParts {
  ts: string;
  v1: string;
}

export function parseXSignature(header: string | null | undefined): WebhookSignatureParts | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(',').map((segment) => {
      const [key, ...rest] = segment.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

export function webhookManifest(dataId: string | undefined, requestId: string, timestamp: string): string {
  const idSegment = dataId ? `id:${dataId};` : '';
  return `${idSegment}request-id:${requestId};ts:${timestamp};`;
}

export async function verifyMercadoPagoWebhookSignature(args: {
  secret: string;
  dataId?: string | undefined;
  requestId: string;
  xSignature: string | null | undefined;
  maxAgeMs?: number;
  nowMs?: number;
}): Promise<boolean> {
  const parts = parseXSignature(args.xSignature);
  if (!parts || !args.requestId) return false;

  const timestamp = Number(parts.ts);
  if (!Number.isFinite(timestamp)) return false;
  const maxAgeMs = args.maxAgeMs ?? 15 * 60 * 1000;
  const nowMs = args.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestamp) > maxAgeMs) return false;

  const expected = await hmacSha256Hex(args.secret, webhookManifest(args.dataId, args.requestId, parts.ts));
  return timingSafeEqualHex(expected, parts.v1);
}
