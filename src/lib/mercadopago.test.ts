import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMercadoPagoOrder } from './mercadopago.ts';

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
};

describe('createMercadoPagoOrder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Orders API payload with category and 3DS config in the documented nodes', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'ORD-1',
          status: 'processed',
          status_detail: 'accredited',
          external_reference: baseRequest.externalReference,
          transactions: {
            payments: [{ id: 'PAY-1', status: 'processed', status_detail: 'accredited' }],
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createMercadoPagoOrder(baseRequest);

    expect(result).toMatchObject({
      orderId: 'ORD-1',
      paymentId: 'PAY-1',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    });
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(String(init.body));

    expect(url).toBe('https://api.mercadopago.com/v1/orders');
    expect(headers.Authorization).toBe('Bearer APP_USR-test-token');
    expect(headers['X-Idempotency-Key']).toBe(baseRequest.externalReference);
    expect(body.payer).toMatchObject({
      email: baseRequest.payerEmail,
      entity_type: 'individual',
      first_name: baseRequest.payerFirstName,
      last_name: baseRequest.payerLastName,
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
    expect(body.items[0].category_id).toBe('services');
    expect(body.config.online.transaction_security).toEqual({
      validation: 'on_fraud_risk',
      liability_shift: 'required',
    });
    expect(body.transactions.payments[0].payment_method.transaction_security).toBeUndefined();
  });

  it('returns failed order data when Mercado Pago wraps a declined payment in a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
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
        }),
        { status: 402, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createMercadoPagoOrder(baseRequest)).resolves.toMatchObject({
      orderId: 'ORD-FAILED',
      status: 'failed',
      paymentStatus: 'failed',
      paymentStatusDetail: 'invalid_card_token',
    });
  });
});
