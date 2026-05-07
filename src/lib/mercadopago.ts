import { amountFromCents, appendQuery } from './money.ts';
import { PROJECT_BY_SLUG, type SponsorProjectSlug } from './projects.ts';

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string | undefined;
}

export interface PreferenceRequest {
  accessToken: string;
  publicBaseUrl: string;
  apiBaseUrl: string;
  projectSlug: SponsorProjectSlug;
  externalReference: string;
  amountCents: number;
  payerEmail?: string | undefined;
  payerName?: string | undefined;
}

export async function createMercadoPagoPreference(request: PreferenceRequest): Promise<PreferenceResult> {
  const project = PROJECT_BY_SLUG.get(request.projectSlug);
  const title = project ? `Apoio ${project.name}` : 'Apoio LCV Ideas & Software';
  const amount = amountFromCents(request.amountCents);
  const returnBase = `${request.publicBaseUrl.replace(/\/$/, '')}/sponsor`;
  const notificationUrl = `${request.apiBaseUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`;

  const preferenceBody = {
    items: [
      {
        id: request.projectSlug,
        title,
        description: 'Apoio voluntario aos projetos da LCV Ideas & Software',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: amount,
      },
    ],
    payer: {
      name: request.payerName || undefined,
      email: request.payerEmail || undefined,
    },
    external_reference: request.externalReference,
    notification_url: notificationUrl,
    back_urls: {
      success: appendQuery(returnBase, { status: 'success', ref: request.externalReference }),
      failure: appendQuery(returnBase, { status: 'failure', ref: request.externalReference }),
      pending: appendQuery(returnBase, { status: 'pending', ref: request.externalReference }),
    },
    auto_return: 'approved',
    statement_descriptor: 'LCV IDEAS',
    metadata: {
      project_slug: request.projectSlug,
      source: 'sponsor-motor',
    },
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferenceBody),
  });

  const data = (await response.json().catch(() => ({}))) as MercadoPagoPreferenceResponse & {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    const message = data.message || data.error || 'Mercado Pago preference creation failed.';
    throw new Error(message);
  }
  if (!data.id || !data.init_point) throw new Error('Mercado Pago did not return a valid preference.');

  return {
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
  };
}

interface MercadoPagoPaymentResponse {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  merchant_order_id?: number | string;
  transaction_amount?: number;
  currency_id?: string;
}

export async function fetchMercadoPagoPayment(
  accessToken: string,
  paymentId: string,
): Promise<MercadoPagoPaymentResponse> {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json().catch(() => ({}))) as MercadoPagoPaymentResponse & {
    message?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(data.message || data.error || 'Mercado Pago payment lookup failed.');
  return data;
}
