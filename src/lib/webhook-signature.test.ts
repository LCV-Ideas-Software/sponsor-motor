import { describe, expect, it } from 'vitest';
import { hmacSha256Hex } from './crypto.ts';
import { verifyMercadoPagoWebhookSignature, webhookManifest } from './webhook-signature.ts';

describe('verifyMercadoPagoWebhookSignature', () => {
  it('accepts a valid Mercado Pago HMAC manifest', async () => {
    const secret = 'secret';
    const ts = String(Date.now());
    const requestId = 'req-123';
    const dataId = 'pay-456';
    const v1 = await hmacSha256Hex(secret, webhookManifest(dataId, requestId, ts));

    await expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        dataId,
        requestId,
        xSignature: `ts=${ts},v1=${v1}`,
        nowMs: Number(ts),
      }),
    ).resolves.toBe(true);
  });

  it('rejects invalid signatures', async () => {
    await expect(
      verifyMercadoPagoWebhookSignature({
        secret: 'secret',
        dataId: 'pay-456',
        requestId: 'req-123',
        xSignature: `ts=${Date.now()},v1=bad`,
      }),
    ).resolves.toBe(false);
  });

  it('accepts Mercado Pago signatures without data.id when the notification has no resource id', async () => {
    const secret = 'secret';
    const ts = String(Date.now());
    const requestId = 'req-automatic-payments';
    const v1 = await hmacSha256Hex(secret, webhookManifest(undefined, requestId, ts));

    await expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        requestId,
        xSignature: `ts=${ts},v1=${v1}`,
        nowMs: Number(ts),
      }),
    ).resolves.toBe(true);
  });
});
