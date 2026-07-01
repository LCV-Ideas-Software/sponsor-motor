import { afterEach, describe, expect, it, vi } from 'vitest';

const mercadoPagoSdk = vi.hoisted(() => {
  const orderCreate = vi.fn();
  class MercadoPagoConfig {
    accessToken: string;
    options?: unknown;

    constructor(config: { accessToken: string; options?: unknown }) {
      this.accessToken = config.accessToken;
      this.options = config.options;
    }
  }
  class Order {
    config: MercadoPagoConfig;

    constructor(config: MercadoPagoConfig) {
      this.config = config;
    }

    create(args: { body: unknown; requestOptions?: unknown }) {
      return orderCreate({ ...args, config: this.config });
    }
  }
  class Payment {}
  return { MercadoPagoConfig, Order, Payment, orderCreate };
});

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: mercadoPagoSdk.MercadoPagoConfig,
  Order: mercadoPagoSdk.Order,
  Payment: mercadoPagoSdk.Payment,
}));

const { createMercadoPagoOrder } = await import('./mercadopago.ts');

interface CapturedOrderBody {
  payer: Record<string, unknown>;
  shipment: { address: unknown };
  additional_info: unknown;
  items: Array<{ category_id?: string }>;
  config: { online: { transaction_security: unknown } };
  transactions: { payments: Array<{ payment_method: { transaction_security?: unknown } }> };
}

const baseRequest = {
  accessToken: 'APP_USR-test-token',
  projectSlug: 'lcv-ideas-software' as const,
  externalReference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000000',
  amountCents: 1000,
  token: '00000000000000000000000000000000',
  paymentMethodId: 'master',
  paymentType: 'credit_card' as const,
  installments: 1,
  payerEmail: 'sponsor@example.com',
  payerFirstName: 'Sponsor',
  payerLastName: 'Test',
  payerPhone: {
    area_code: '11',
    number: '987654321',
  },
  payerAddress: {
    zip_code: '05424-150',
    street_name: 'Rua Pais Leme',
    street_number: '215',
    neighborhood: 'Pinheiros',
    city: 'Sao Paulo',
    state: 'SP',
    complement: 'Conj 1713',
  },
  payerRegistrationDate: '2026-01-01T00:00:00.000Z',
  firstPurchaseOnline: true,
  threeDsValidation: 'on_fraud_risk' as const,
};

describe('createMercadoPagoOrder', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends the Orders API payload with category and 3DS config in the documented nodes', async () => {
    mercadoPagoSdk.orderCreate.mockImplementationOnce(
      async (args: { body: Record<string, unknown>; config: { accessToken: string }; requestOptions?: unknown }) => {
        const body = args.body as unknown as CapturedOrderBody;
        expect(args.config.accessToken).toBe('APP_USR-test-token');
        expect(args.requestOptions).toEqual({ idempotencyKey: baseRequest.externalReference });
        expect(body.payer).toMatchObject({
          email: baseRequest.payerEmail,
          entity_type: 'individual',
          first_name: baseRequest.payerFirstName,
          last_name: baseRequest.payerLastName,
          phone: baseRequest.payerPhone,
          address: baseRequest.payerAddress,
        });
        expect(body.shipment.address).toEqual(baseRequest.payerAddress);
        expect(body.additional_info).toEqual({
          'shipment.express': false,
          'shipment.local_pickup': false,
          'payer.registration_date': baseRequest.payerRegistrationDate,
          'payer.authentication_type': 'WEB',
          'payer.is_first_purchase_online': true,
        });
        expect(body.items[0]?.category_id).toBe('services');
        expect(body.config?.online).toBeUndefined();
        expect(body.transactions.payments[0]?.payment_method.transaction_security).toEqual({
          validation: 'on_fraud_risk',
          liability_shift: 'required',
        });
        return {
          id: 'ORD-1',
          status: 'processed',
          status_detail: 'accredited',
          external_reference: baseRequest.externalReference,
          transactions: {
            payments: [{ id: 'PAY-1', status: 'processed', status_detail: 'accredited' }],
          },
        };
      },
    );

    const result = await createMercadoPagoOrder(baseRequest);

    expect(result).toMatchObject({
      orderId: 'ORD-1',
      paymentId: 'PAY-1',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    });
    expect(mercadoPagoSdk.orderCreate).toHaveBeenCalledOnce();
  });

  it('returns failed order data when Mercado Pago wraps a declined payment in a non-2xx response', async () => {
    mercadoPagoSdk.orderCreate.mockRejectedValueOnce({
      errors: [{ code: 'failed', message: 'The following transactions failed' }],
      data: {
        id: 'ORD-FAILED',
        status: 'failed',
        status_detail: 'failed',
        external_reference: baseRequest.externalReference,
        transactions: {
          payments: [{ id: 'PAY-FAILED', status: 'failed', status_detail: 'invalid_card_token' }],
        },
      },
    });

    await expect(createMercadoPagoOrder(baseRequest)).resolves.toMatchObject({
      orderId: 'ORD-FAILED',
      status: 'failed',
      paymentStatus: 'failed',
      paymentStatusDetail: 'invalid_card_token',
    });
  });

  it('extracts the documented Orders API 3DS challenge URL from transaction_security.url', async () => {
    mercadoPagoSdk.orderCreate.mockResolvedValueOnce({
      id: 'ORD-CHALLENGE',
      status: 'action_required',
      status_detail: 'pending_challenge',
      external_reference: baseRequest.externalReference,
      transactions: {
        payments: [
          {
            id: 'PAY-CHALLENGE',
            status: 'action_required',
            status_detail: 'pending_challenge',
            payment_method: {
              transaction_security: {
                url: 'https://www.mercadopago.com/auth/card/validation/pages/remedies/challenge',
                validation: 'on_fraud_risk',
                liability_shift: 'required',
              },
            },
          },
        ],
      },
    });

    await expect(createMercadoPagoOrder(baseRequest)).resolves.toMatchObject({
      orderId: 'ORD-CHALLENGE',
      paymentId: 'PAY-CHALLENGE',
      paymentStatus: 'action_required',
      paymentStatusDetail: 'pending_challenge',
      challengeUrl: 'https://www.mercadopago.com/auth/card/validation/pages/remedies/challenge',
    });
  });
});
