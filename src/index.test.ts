import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hmacSha256Hex } from './lib/crypto.ts';
import { MercadoPagoLookupError } from './lib/mercadopago.ts';
import { webhookManifest } from './lib/webhook-signature.ts';

const mercadoPagoMocks = vi.hoisted(() => ({
  fetchMercadoPagoPayment: vi.fn(),
  fetchMercadoPagoOrder: vi.fn(),
  cancelMercadoPagoOrder: vi.fn(),
  refundMercadoPagoOrder: vi.fn(),
}));

vi.mock('./lib/mercadopago.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/mercadopago.ts')>();
  return {
    ...actual,
    fetchMercadoPagoOrder: mercadoPagoMocks.fetchMercadoPagoOrder,
    fetchMercadoPagoPayment: mercadoPagoMocks.fetchMercadoPagoPayment,
    cancelMercadoPagoOrder: mercadoPagoMocks.cancelMercadoPagoOrder,
    refundMercadoPagoOrder: mercadoPagoMocks.refundMercadoPagoOrder,
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
    mercadoPagoMocks.fetchMercadoPagoOrder.mockReset();
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

describe('Mercado Pago status fallback', () => {
  beforeEach(() => {
    mercadoPagoMocks.fetchMercadoPagoOrder.mockReset();
    mercadoPagoMocks.fetchMercadoPagoPayment.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consults the Orders API when a local status is still non-terminal and an order id is available', async () => {
    mercadoPagoMocks.fetchMercadoPagoOrder.mockResolvedValueOnce({
      id: 'ORD-STATUS',
      external_reference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000010',
      status: 'processed',
      status_detail: 'accredited',
      total_paid_amount: '12.00',
      currency: 'BRL',
      transactions: {
        payments: [
          {
            id: 'PAY-STATUS',
            amount: '12.00',
            paid_amount: '12.00',
            status: 'processed',
            status_detail: 'accredited',
          },
        ],
      },
    });
    const run = vi.fn(async () => ({ success: true }));
    let firstCalls = 0;
    const first = vi.fn(async () => {
      firstCalls++;
      if (firstCalls === 1) {
        return {
          external_reference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000010',
          project_slug: 'lcv-ideas-software',
          provider_api: 'orders',
          preference_id: null,
          sponsor_order_id: 'ORD-STATUS',
          payment_id: 'PAY-STATUS',
          payment_resource_id: null,
          status: 'action_required',
          status_detail: 'pending_challenge',
          amount_cents: 1200,
          currency: 'BRL',
          created_at: 1,
          updated_at: 1,
        };
      }
      return {
        external_reference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000010',
        project_slug: 'lcv-ideas-software',
        provider_api: 'orders',
        preference_id: null,
        sponsor_order_id: 'ORD-STATUS',
        payment_id: 'PAY-STATUS',
        payment_resource_id: null,
        status: 'processed',
        status_detail: 'accredited',
        amount_cents: 1200,
        currency: 'BRL',
        created_at: 1,
        updated_at: 2,
      };
    });
    const bind = vi.fn(() => ({ run, first }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    const response = await app.fetch(
      new Request(
        'https://sponsor-motor.lcv.app.br/api/status/sp_lcv-ideas-software_00000000-0000-4000-8000-000000000010',
      ),
      envWithDb(db),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'processed', status_detail: 'accredited' });
    expect(mercadoPagoMocks.fetchMercadoPagoOrder).toHaveBeenCalledWith('APP_USR-test-token', 'ORD-STATUS', undefined);
    expect(bind).toHaveBeenCalledWith(
      'ORD-STATUS',
      'PAY-STATUS',
      null,
      null,
      'processed',
      'accredited',
      1200,
      'BRL',
      expect.any(Number),
      'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000010',
    );
  });

  it('returns the local status if the Orders API fallback is temporarily unavailable', async () => {
    mercadoPagoMocks.fetchMercadoPagoOrder.mockRejectedValueOnce(new Error('upstream unavailable'));
    const first = vi.fn(async () => ({
      external_reference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000011',
      project_slug: 'lcv-ideas-software',
      provider_api: 'orders',
      preference_id: null,
      sponsor_order_id: 'ORD-PENDING',
      payment_id: null,
      payment_resource_id: null,
      status: 'action_required',
      status_detail: 'pending_challenge',
      amount_cents: 1200,
      currency: 'BRL',
      created_at: 1,
      updated_at: 1,
    }));
    const bind = vi.fn(() => ({ run: vi.fn(), first }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    const response = await app.fetch(
      new Request(
        'https://sponsor-motor.lcv.app.br/api/status/sp_lcv-ideas-software_00000000-0000-4000-8000-000000000011',
      ),
      envWithDb(db),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sponsor_order_id: 'ORD-PENDING',
      status: 'action_required',
      status_detail: 'pending_challenge',
    });
  });
});

// v01.02.00: integration quality recommendations — operator-only
// admin endpoints. Tests cover the bearer-auth gate + the SDK
// passthrough on success; the SDK helpers themselves are unit-tested
// implicitly through the live MP test environment, not here.
describe('Operator admin endpoints', () => {
  beforeEach(() => {
    mercadoPagoMocks.cancelMercadoPagoOrder.mockReset();
    mercadoPagoMocks.refundMercadoPagoOrder.mockReset();
  });

  it('refuses cancel when SPONSOR_OPERATOR_TOKEN is not configured (defaults to disabled, not open)', async () => {
    const d1 = createDbMock();
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-1234/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer something', 'content-type': 'application/json' },
      }),
      envWithDb(d1.db),
    );
    expect(response.status).toBe(403);
    expect(mercadoPagoMocks.cancelMercadoPagoOrder).not.toHaveBeenCalled();
  });

  it('refuses cancel when Authorization header is missing', async () => {
    const d1 = createDbMock();
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-1234/cancel', { method: 'POST' }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(401);
    expect(mercadoPagoMocks.cancelMercadoPagoOrder).not.toHaveBeenCalled();
  });

  it('refuses cancel when Bearer token does not match', async () => {
    const d1 = createDbMock();
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-1234/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(401);
    expect(mercadoPagoMocks.cancelMercadoPagoOrder).not.toHaveBeenCalled();
  });

  it('cancels via SDK and reflects status in DB on a matching Bearer token', async () => {
    const d1 = createDbMock();
    mercadoPagoMocks.cancelMercadoPagoOrder.mockResolvedValueOnce({
      id: 'ORD-1234',
      status: 'cancelled',
      status_detail: 'cancelled_by_operator',
      external_reference: 'sp_lcv-ideas-software_aaaa',
    });
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-1234/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer op-secret' },
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: 'ORD-1234',
      status: 'cancelled',
      externalReference: 'sp_lcv-ideas-software_aaaa',
    });
    expect(mercadoPagoMocks.cancelMercadoPagoOrder).toHaveBeenCalledWith('APP_USR-test-token', 'ORD-1234', undefined);
  });

  it('forwards integratorId to the cancel SDK helper when MERCADOPAGO_INTEGRATOR_ID is set', async () => {
    const d1 = createDbMock();
    mercadoPagoMocks.cancelMercadoPagoOrder.mockResolvedValueOnce({
      id: 'ORD-1234',
      status: 'cancelled',
      external_reference: 'sp_lcv-ideas-software_bbbb',
    });
    await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-1234/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer op-secret' },
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret', MERCADOPAGO_INTEGRATOR_ID: 'dev-1234' },
    );
    expect(mercadoPagoMocks.cancelMercadoPagoOrder).toHaveBeenCalledWith('APP_USR-test-token', 'ORD-1234', 'dev-1234');
  });

  it('refunds with no body (full refund) on a matching Bearer token', async () => {
    const d1 = createDbMock();
    mercadoPagoMocks.refundMercadoPagoOrder.mockResolvedValueOnce({
      id: 'ORD-9999',
      status: 'refunded',
      external_reference: 'sp_lcv-ideas-software_cccc',
    });
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-9999/refund', {
        method: 'POST',
        headers: { authorization: 'Bearer op-secret', 'content-length': '0' },
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: 'ORD-9999',
      status: 'refunded',
      partial: false,
    });
    const call = mercadoPagoMocks.refundMercadoPagoOrder.mock.calls[0];
    expect(call?.[0]).toBe('APP_USR-test-token');
    expect(call?.[1]).toBe('ORD-9999');
    expect(call?.[2]).toMatchObject({ transactions: undefined, integratorId: undefined });
  });

  it('refunds with a partial transactions body when provided', async () => {
    const d1 = createDbMock();
    mercadoPagoMocks.refundMercadoPagoOrder.mockResolvedValueOnce({
      id: 'ORD-PARTIAL',
      status: 'partially_refunded',
      external_reference: 'sp_lcv-ideas-software_dddd',
    });
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-PARTIAL/refund', {
        method: 'POST',
        headers: { authorization: 'Bearer op-secret', 'content-type': 'application/json' },
        body: JSON.stringify({ transactions: [{ id: 'txn-1', amount: '5.00' }] }),
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ partial: true });
    const call = mercadoPagoMocks.refundMercadoPagoOrder.mock.calls[0];
    expect(call?.[2]).toMatchObject({
      transactions: [{ id: 'txn-1', amount: '5.00' }],
    });
  });

  it('rejects malformed refund bodies before hitting the SDK', async () => {
    const d1 = createDbMock();
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-BADBODY/refund', {
        method: 'POST',
        headers: { authorization: 'Bearer op-secret', 'content-type': 'application/json' },
        body: JSON.stringify({ transactions: [{ amount: 'not-a-number' }] }),
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(400);
    expect(mercadoPagoMocks.refundMercadoPagoOrder).not.toHaveBeenCalled();
  });

  it('rejects unparseable JSON refund bodies with 400 instead of silently full-refunding', async () => {
    // Regression guard for codex R2 cross-review catch (session 31d7a5dc):
    // unparseable JSON used to fall through to full refund because
    // `c.req.json().catch(() => null) ?? undefined` collapsed both the
    // catch and the absent-body case into `safeParse(undefined)` on an
    // optional schema. The parse-error path must now respond 400 and
    // never call refundMercadoPagoOrder.
    const d1 = createDbMock();
    const response = await app.fetch(
      new Request('https://sponsor-motor.lcv.app.br/api/orders/ORD-PARSEERR/refund', {
        method: 'POST',
        headers: { authorization: 'Bearer op-secret', 'content-type': 'application/json' },
        body: '}}}',
      }),
      { ...envWithDb(d1.db), SPONSOR_OPERATOR_TOKEN: 'op-secret' },
    );
    expect(response.status).toBe(400);
    expect(mercadoPagoMocks.refundMercadoPagoOrder).not.toHaveBeenCalled();
  });
});
