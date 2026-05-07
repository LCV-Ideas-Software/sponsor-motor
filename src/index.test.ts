import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hmacSha256Hex } from './lib/crypto.ts';
import { MercadoPagoLookupError } from './lib/mercadopago.ts';
import { webhookManifest } from './lib/webhook-signature.ts';

const mercadoPagoMocks = vi.hoisted(() => ({
  fetchMercadoPagoPayment: vi.fn(),
}));

vi.mock('./lib/mercadopago.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/mercadopago.ts')>();
  return {
    ...actual,
    fetchMercadoPagoPayment: mercadoPagoMocks.fetchMercadoPagoPayment,
  };
});

const { default: app } = await import('./index.ts');

const WEBHOOK_SECRET = 'test-webhook-secret';

function createDbMock() {
  const run = vi.fn(async () => ({ success: true }));
  const first = vi.fn(async () => null);
  const bind = vi.fn(() => ({ run, first }));
  const prepare = vi.fn(() => ({ bind }));
  return {
    db: { prepare } as unknown as D1Database,
    bind,
    prepare,
    run,
  };
}

async function signedWebhookRequest(
  body: Record<string, unknown>,
  options?: { includeQueryDataId?: boolean; queryType?: string },
): Promise<Request> {
  const payload = body as { data?: { id?: string } };
  const dataId = payload.data?.id || '123457';
  const requestId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const signatureDataId = options?.includeQueryDataId === false ? undefined : dataId.toLowerCase();
  const signature = await hmacSha256Hex(WEBHOOK_SECRET, webhookManifest(signatureDataId, requestId, timestamp));
  const query =
    options?.includeQueryDataId === false ? '' : `?data.id=${dataId}&type=${options?.queryType || 'payment'}`;

  return new Request(`https://sponsor-motor.lcv.app.br/api/webhooks/mercadopago${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      'x-signature': `ts=${timestamp},v1=${signature}`,
    },
    body: JSON.stringify(body),
  });
}

function envWithDb(db: D1Database) {
  return {
    BIGDATA_DB: db,
    MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-test-token',
    MERCADOPAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    MERCADOPAGO_PUBLIC_KEY: 'TEST-public-key',
  };
}

describe('Mercado Pago Checkout Pro fallback', () => {
  it('keeps legacy preference creation disabled to avoid mixed Checkout Pro and Orders API flows', async () => {
    const d1 = createDbMock();
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: '10', email: 'payer@example.com', walletOnly: true }),
      }),
      envWithDb(d1.db),
    );

    await expect(response.json()).resolves.toEqual({
      error: 'Checkout Pro preferences are disabled. Use /api/orders.',
    });
    expect(response.status).toBe(410);
    expect(d1.prepare).not.toHaveBeenCalled();
  });
});

describe('Mercado Pago webhook', () => {
  beforeEach(() => {
    mercadoPagoMocks.fetchMercadoPagoPayment.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acknowledges signed dashboard payment simulations even when the fake payment id is not found', async () => {
    mercadoPagoMocks.fetchMercadoPagoPayment.mockRejectedValueOnce(
      new MercadoPagoLookupError('Mercado Pago payment lookup failed.: status=404 | Payment not found | not_found', {
        status: 404,
      }),
    );
    const d1 = createDbMock();
    const request = await signedWebhookRequest({
      action: 'payment.updated',
      api_version: 'v1',
      data: { id: '123457' },
      date_created: '2021-11-01T02:02:02Z',
      id: '123456',
      live_mode: false,
      type: 'payment',
      user_id: 3383599750,
    });

    const response = await app.fetch(request, envWithDb(d1.db));

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(d1.bind).toHaveBeenCalledWith(
      expect.stringMatching(/^mp_/),
      null,
      'payment.updated',
      '123457',
      'not_found',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('keeps non-404 Mercado Pago lookup failures visible as server errors', async () => {
    mercadoPagoMocks.fetchMercadoPagoPayment.mockRejectedValueOnce(
      new MercadoPagoLookupError('Mercado Pago payment lookup failed.: status=500 | upstream unavailable', {
        status: 500,
      }),
    );
    const d1 = createDbMock();
    const request = await signedWebhookRequest({
      action: 'payment.updated',
      data: { id: 'PAY-500' },
      type: 'payment',
    });

    const response = await app.fetch(request, envWithDb(d1.db));

    await expect(response.json()).resolves.toEqual({ error: 'Internal server error.' });
    expect(response.status).toBe(500);
    expect(d1.run).not.toHaveBeenCalled();
  });

  it('stores numeric Payment API resource IDs separately from Orders PAY IDs', async () => {
    mercadoPagoMocks.fetchMercadoPagoPayment.mockResolvedValueOnce({
      id: 157346200401,
      external_reference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000001',
      status: 'in_process',
      status_detail: 'pending_review_manual',
      transaction_amount: 6,
      currency_id: 'BRL',
    });
    const d1 = createDbMock();
    const request = await signedWebhookRequest({
      action: 'payment.created',
      data: { id: '157346200401' },
      type: 'payment',
    });

    const response = await app.fetch(request, envWithDb(d1.db));

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(d1.bind).toHaveBeenCalledWith(
      null,
      null,
      '157346200401',
      null,
      'in_process',
      'pending_review_manual',
      600,
      'BRL',
      expect.any(Number),
      'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000001',
    );
  });

  it('updates status directly from rich order webhook payloads without fetching the fake dashboard order id', async () => {
    const d1 = createDbMock();
    const request = await signedWebhookRequest(
      {
        action: 'order.processed',
        api_version: 'v1',
        application_id: '6494167565944412',
        data: {
          external_reference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000000',
          id: '123457',
          status: 'processed',
          status_detail: 'accredited',
          total_paid_amount: 1000,
          transactions: {
            payments: [
              {
                amount: 1000,
                id: 'PAY01K7S9596QBWZRTY02NF',
                paid_amount: 1000,
                payment_method: { id: 'visa', installments: 1, type: 'credit_card' },
                status: 'processed',
                status_detail: 'accredited',
              },
            ],
          },
          type: 'point',
          version: 3,
        },
        date_created: '2021-11-01T02:02:02-04:00',
        live_mode: true,
        type: 'order',
        user_id: 3383599750,
      },
      { queryType: 'order' },
    );

    const response = await app.fetch(request, envWithDb(d1.db));

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(d1.bind).toHaveBeenCalledWith(
      '123457',
      'PAY01K7S9596QBWZRTY02NF',
      null,
      null,
      'processed',
      'accredited',
      100000,
      'BRL',
      expect.any(Number),
      'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000000',
    );
  });

  it('accepts signed automatic-payments notifications that have no data.id query parameter', async () => {
    const d1 = createDbMock();
    const request = await signedWebhookRequest(
      {
        action: 'card.updated',
        api_version: 'v1',
        application_id: '6494167565944412',
        data: {
          customer_id: '12345678-aluyasdhfyt',
          new_card_id: '50000000000',
          old_card_id: '50000000000',
        },
        date_created: '2024-10-01T15:22:43-03:00',
        id: 'a22fc07721cf4e098a31aeab1894c521',
        live_mode: true,
        type: 'automatic-payments',
        user_id: 3383599750,
        version: 1,
      },
      { includeQueryDataId: false },
    );

    const response = await app.fetch(request, envWithDb(d1.db));

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(d1.bind).toHaveBeenCalledWith(
      expect.stringMatching(/^mp_/),
      null,
      'card.updated',
      '12345678-aluyasdhfyt',
      'card_updated',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('acknowledges every Mercado Pago webhook topic enabled in the dashboard', async () => {
    const samples = [
      {
        action: 'Created',
        type: 'stop_delivery_op_wh',
        data: { description: 'desc', merchant_order: 249940988000, payment_id: 58980959081, site_id: 'MLB' },
        id: '58980959081',
      },
      {
        action: 'claim.opened',
        type: 'topic_claims_integration_wh',
        data: { id: 'CLAIM-1', payment_id: 'PAY-CLAIM', status: 'opened' },
      },
      {
        type: 'topic_chargebacks_wh',
        data: { id: 'CHB-1', payment_id: 'PAY-CHB', status: 'opened' },
      },
      {
        action: 'merchant_order.updated',
        type: 'topic_merchant_order_wh',
        data: { id: 'MO-1', status: 'closed' },
      },
      {
        action: 'subscription_authorized_payment.created',
        type: 'subscription_authorized_payment',
        data: { id: 'AUTH-1', status: 'processed' },
      },
      {
        action: 'subscription_preapproval.updated',
        type: 'subscription_preapproval',
        data: { id: 'PREAPPROVAL-1', status: 'authorized' },
      },
      {
        action: 'subscription_preapproval_plan.updated',
        type: 'subscription_preapproval_plan',
        data: { id: 'PLAN-1', status: 'active' },
      },
      {
        action: 'application.authorized',
        type: 'mp-connect',
        data: { id: 'APP-LINK-1', status: 'authorized' },
      },
      {
        action: 'wallet_connect.updated',
        type: 'wallet_connect',
        data: { id: 'WALLET-1', status: 'approved' },
      },
      {
        action: 'payment_intent.finished',
        type: 'point_integration_wh',
        data: { id: 'POINT-1', status: 'finished' },
      },
      {
        action: 'shipment.updated',
        type: 'shipments',
        data: { id: 'SHIP-1', status: 'ready_to_ship' },
      },
      {
        action: 'delivery.updated',
        type: 'delivery',
        data: { id: 'DELIVERY-1', status: 'delivered' },
      },
      {
        action: 'self_service.updated',
        type: 'self_service',
        data: { id: 'SELF-1', status: 'processed' },
      },
    ];

    for (const sample of samples) {
      const d1 = createDbMock();
      const request = await signedWebhookRequest(
        {
          api_version: 'v1',
          application_id: '6494167565944412',
          date_created: '2026-05-07T01:00:00-03:00',
          live_mode: true,
          user_id: 3383599750,
          version: 1,
          ...sample,
        },
        { includeQueryDataId: false },
      );

      const response = await app.fetch(request, envWithDb(d1.db));

      expect(response.status, `topic ${sample.type}`).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(d1.run, `topic ${sample.type}`).toHaveBeenCalled();
    }
  });
});
