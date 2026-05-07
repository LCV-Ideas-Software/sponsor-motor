import { MercadoPagoConfig, Order, Payment, Preference } from 'mercadopago';
import { amountFromCents, appendQuery } from './money.ts';
import { PROJECT_BY_SLUG, type SponsorProjectSlug } from './projects.ts';

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string | undefined;
}

export interface OrderResult {
  orderId: string;
  externalReference?: string | undefined;
  status?: string | undefined;
  statusDetail?: string | undefined;
  paymentId?: string | undefined;
  paymentStatus?: string | undefined;
  paymentStatusDetail?: string | undefined;
  challengeUrl?: string | undefined;
}

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

interface MercadoPagoOrderPayment {
  id?: string;
  amount?: string;
  paid_amount?: string;
  reference_id?: string;
  status?: string;
  status_detail?: string;
  payment_method?: {
    id?: string;
    type?: string;
    token?: string;
    installments?: number;
    transaction_security?: {
      url?: string;
      validation?: string;
      liability_shift?: string;
      status?: string;
    };
  };
}

interface MercadoPagoOrderResponse {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  total_paid_amount?: string;
  currency?: string;
  transactions?: {
    payments?: MercadoPagoOrderPayment[];
  };
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

export interface OrderRequest {
  accessToken: string;
  projectSlug: SponsorProjectSlug;
  externalReference: string;
  amountCents: number;
  token: string;
  paymentMethodId: string;
  paymentType: 'credit_card' | 'debit_card';
  installments: number;
  payerEmail: string;
  payerName?: string | undefined;
  payerIdentification?: { type: string; number: string } | undefined;
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

function amountStringFromCents(cents: number): string {
  return amountFromCents(cents).toFixed(2);
}

function sponsorItem(projectSlug: SponsorProjectSlug, amount: string) {
  const project = PROJECT_BY_SLUG.get(projectSlug);
  return {
    title: project ? `Apoio ${project.name}` : 'Apoio LCV Ideas & Software',
    unit_price: amount,
    quantity: 1,
    external_code: projectSlug,
    category_id: SPONSOR_ITEM_CATEGORY_ID,
    type: 'service',
    description: 'Apoio voluntario aos projetos da LCV Ideas & Software',
  };
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

export async function createMercadoPagoOrder(request: OrderRequest): Promise<OrderResult> {
  const amount = amountStringFromCents(request.amountCents);
  const paymentMethod = {
    id: request.paymentMethodId,
    type: request.paymentType,
    token: request.token,
    installments: request.installments,
    statement_descriptor: 'LCV IDEAS',
  };

  const payer = {
    email: request.payerEmail,
    ...(request.payerName ? { first_name: request.payerName } : {}),
    ...(request.payerIdentification ? { identification: request.payerIdentification } : {}),
  };

  const orderBody = {
    type: 'online',
    processing_mode: 'automatic',
    capture_mode: 'automatic_async',
    external_reference: request.externalReference,
    total_amount: amount,
    currency: 'BRL',
    payer,
    items: [sponsorItem(request.projectSlug, amount)],
    config: {
      online: {
        transaction_security: {
          validation: 'on_fraud_risk' as const,
          liability_shift: 'required' as const,
        },
      },
    },
    transactions: {
      payments: [
        {
          amount,
          payment_method: paymentMethod,
        },
      ],
    },
    additional_info: {
      source: 'sponsor-motor',
      project_slug: request.projectSlug,
    },
  };

  let data: MercadoPagoOrderResponse;
  try {
    data = await new Order(mercadoPagoClient(request.accessToken)).create({
      body: orderBody,
      requestOptions: { idempotencyKey: request.externalReference },
    });
  } catch (error) {
    throw new Error(sdkErrorMessage(error, 'Mercado Pago order creation failed.'));
  }
  if (!data.id) throw new Error('Mercado Pago did not return a valid order.');

  const payment = data.transactions?.payments?.[0];
  return {
    orderId: data.id,
    externalReference: data.external_reference,
    status: data.status,
    statusDetail: data.status_detail,
    paymentId: payment?.id,
    paymentStatus: payment?.status,
    paymentStatusDetail: payment?.status_detail,
    challengeUrl: payment?.payment_method?.transaction_security?.url,
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

export async function fetchMercadoPagoOrder(accessToken: string, orderId: string): Promise<MercadoPagoOrderResponse> {
  try {
    return await new Order(mercadoPagoClient(accessToken)).get({ id: orderId });
  } catch (error) {
    throw new Error(sdkErrorMessage(error, 'Mercado Pago order lookup failed.'));
  }
}
