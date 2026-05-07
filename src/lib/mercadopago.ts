import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { amountFromCents, appendQuery } from './money.ts';
import { PROJECT_BY_SLUG, type SponsorProjectSlug } from './projects.ts';

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string | undefined;
}

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
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

const SPONSOR_ITEM_CATEGORY_ID = 'services';

type HeadersWithRaw = Headers & {
  raw?: () => Record<string, string[]>;
};

function ensureNodeFetchHeadersCompat(): void {
  const prototype = Headers.prototype as HeadersWithRaw;
  if (typeof prototype.raw === 'function') return;
  Object.defineProperty(prototype, 'raw', {
    configurable: true,
    value: function raw(this: Headers): Record<string, string[]> {
      const headers: Record<string, string[]> = {};
      this.forEach((value, key) => {
        headers[key] = [value];
      });
      return headers;
    },
  });
}

function mercadoPagoClient(accessToken: string): MercadoPagoConfig {
  ensureNodeFetchHeadersCompat();
  return new MercadoPagoConfig({ accessToken });
}

function sdkErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const response = error as { message?: unknown; error?: unknown; cause?: unknown };
    if (typeof response.message === 'string' && response.message) return response.message;
    if (typeof response.error === 'string' && response.error) return response.error;
    if (typeof response.cause === 'string' && response.cause) return response.cause;
  }
  return fallback;
}

export async function createMercadoPagoPreference(request: PreferenceRequest): Promise<PreferenceResult> {
  const project = PROJECT_BY_SLUG.get(request.projectSlug);
  const title = project ? `Apoio ${project.name}` : 'Apoio LCV Ideas & Software';
  const amount = amountFromCents(request.amountCents);
  const returnBase = `${request.publicBaseUrl.replace(/\/$/, '')}/sponsor`;
  const notificationUrl = `${request.apiBaseUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`;
  const payer: { name?: string; email?: string } = {};
  if (request.payerName) payer.name = request.payerName;
  if (request.payerEmail) payer.email = request.payerEmail;

  const preferenceBody = {
    items: [
      {
        id: request.projectSlug,
        title,
        description: 'Apoio voluntario aos projetos da LCV Ideas & Software',
        category_id: SPONSOR_ITEM_CATEGORY_ID,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: amount,
      },
    ],
    ...(Object.keys(payer).length ? { payer } : {}),
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

  let data: MercadoPagoPreferenceResponse;
  try {
    data = await new Preference(mercadoPagoClient(request.accessToken)).create({
      body: preferenceBody,
    });
  } catch (error) {
    throw new Error(sdkErrorMessage(error, 'Mercado Pago preference creation failed.'));
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
  try {
    return await new Payment(mercadoPagoClient(accessToken)).get({ id: paymentId });
  } catch (error) {
    throw new Error(sdkErrorMessage(error, 'Mercado Pago payment lookup failed.'));
  }
}
