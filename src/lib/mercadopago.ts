import { MercadoPagoConfig, Order, Payment } from 'mercadopago';
import { amountFromCents } from './money.ts';
import { PROJECT_BY_SLUG, type SponsorProjectSlug } from './projects.ts';

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

export interface MercadoPagoOrderPayment {
  id?: string;
  amount?: string | number;
  paid_amount?: string | number;
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

export interface MercadoPagoOrderResponse {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string | number;
  total_paid_amount?: string | number;
  currency?: string;
  type?: string;
  version?: number;
  transactions?: {
    payments?: MercadoPagoOrderPayment[];
  };
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
  payerFirstName: string;
  payerLastName: string;
  payerIdentification?: { type: string; number: string } | undefined;
  payerAddress: MercadoPagoAddress;
  payerRegistrationDate: string;
  firstPurchaseOnline: boolean;
}

const SPONSOR_ITEM_CATEGORY_ID = 'services';

export interface MercadoPagoAddress {
  zip_code: string;
  street_name: string;
  street_number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string | undefined;
}

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
  const details: string[] = [];
  if (error instanceof Error && error.message) details.push(error.message);
  if (error && typeof error === 'object') {
    const response = error as {
      message?: unknown;
      error?: unknown;
      status?: unknown;
      statusCode?: unknown;
      cause?: unknown;
    };
    if (typeof response.status === 'number') details.push(`status=${response.status}`);
    if (typeof response.statusCode === 'number') details.push(`status=${response.statusCode}`);
    if (typeof response.message === 'string' && response.message) details.push(response.message);
    if (typeof response.error === 'string' && response.error) details.push(response.error);
    if (typeof response.cause === 'string' && response.cause) {
      details.push(response.cause);
    } else if (Array.isArray(response.cause)) {
      for (const cause of response.cause) {
        if (!cause || typeof cause !== 'object') continue;
        const item = cause as { code?: unknown; description?: unknown; message?: unknown };
        const code = typeof item.code === 'string' ? item.code : undefined;
        const description =
          typeof item.description === 'string'
            ? item.description
            : typeof item.message === 'string'
              ? item.message
              : undefined;
        if (code || description) details.push([code, description].filter(Boolean).join(': '));
      }
    }
  }
  const uniqueDetails = [...new Set(details.map((detail) => detail.trim()).filter(Boolean))];
  if (!uniqueDetails.length) return fallback;
  return `${fallback}: ${uniqueDetails.join(' | ')}`;
}

function sdkErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const response = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown; statusCode?: unknown };
  };
  if (typeof response.status === 'number') return response.status;
  if (typeof response.statusCode === 'number') return response.statusCode;
  if (typeof response.response?.status === 'number') return response.response.status;
  if (typeof response.response?.statusCode === 'number') return response.response.statusCode;
  return undefined;
}

function isNotFoundMessage(message: string): boolean {
  return /\b(status=404|not_found|not found)\b/i.test(message);
}

export class MercadoPagoLookupError extends Error {
  readonly status: number | undefined;

  constructor(message: string, options?: { status?: number | undefined }) {
    super(message);
    this.name = 'MercadoPagoLookupError';
    this.status = options?.status;
  }
}

export function isMercadoPagoLookupNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof MercadoPagoLookupError) return error.status === 404 || isNotFoundMessage(error.message);
  return isNotFoundMessage(error.message);
}

function mercadoPagoApiErrorMessage(status: number, payload: unknown, fallback: string): string {
  const details: string[] = [`status=${status}`];
  if (payload && typeof payload === 'object') {
    const response = payload as {
      message?: unknown;
      error?: unknown;
      errors?: unknown;
      cause?: unknown;
    };
    if (typeof response.message === 'string' && response.message) details.push(response.message);
    if (typeof response.error === 'string' && response.error) details.push(response.error);
    const items = Array.isArray(response.errors)
      ? response.errors
      : Array.isArray(response.cause)
        ? response.cause
        : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const error = item as { code?: unknown; message?: unknown; description?: unknown; details?: unknown };
      const code = typeof error.code === 'string' ? error.code : undefined;
      const message =
        typeof error.message === 'string'
          ? error.message
          : typeof error.description === 'string'
            ? error.description
            : undefined;
      const nestedDetails = Array.isArray(error.details)
        ? error.details.filter((detail): detail is string => typeof detail === 'string').join('; ')
        : undefined;
      details.push([code, message, nestedDetails].filter(Boolean).join(': '));
    }
  } else if (typeof payload === 'string' && payload) {
    details.push(payload);
  }
  return `${fallback}: ${[...new Set(details)].join(' | ')}`;
}

async function parseMercadoPagoResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

function extractMercadoPagoOrderResponse(payload: unknown): MercadoPagoOrderResponse | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const direct = payload as MercadoPagoOrderResponse;
  if (typeof direct.id === 'string' && direct.id) return direct;
  const wrapped = payload as { data?: unknown };
  if (!wrapped.data || typeof wrapped.data !== 'object') return undefined;
  const data = wrapped.data as MercadoPagoOrderResponse;
  return typeof data.id === 'string' && data.id ? data : undefined;
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
    entity_type: 'individual',
    first_name: request.payerFirstName,
    last_name: request.payerLastName,
    ...(request.payerIdentification ? { identification: request.payerIdentification } : {}),
    address: request.payerAddress,
  };

  const orderBody = {
    type: 'online',
    processing_mode: 'automatic',
    capture_mode: 'automatic_async',
    external_reference: request.externalReference,
    total_amount: amount,
    currency: 'BRL',
    description: `Apoio ${request.projectSlug}`,
    payer,
    shipment: {
      address: request.payerAddress,
    },
    additional_info: {
      'shipment.express': false,
      'shipment.local_pickup': false,
      'payer.registration_date': request.payerRegistrationDate,
      'payer.authentication_type': 'WEB',
      'payer.is_first_purchase_online': request.firstPurchaseOnline,
    },
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
  };

  const response = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': request.externalReference,
    },
    body: JSON.stringify(orderBody),
  });
  const payload = await parseMercadoPagoResponse(response);
  const data = extractMercadoPagoOrderResponse(payload);
  if (!response.ok && !data) {
    throw new Error(mercadoPagoApiErrorMessage(response.status, payload, 'Mercado Pago order creation failed.'));
  }
  if (!data?.id) throw new Error('Mercado Pago did not return a valid order.');

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
    throw new MercadoPagoLookupError(sdkErrorMessage(error, 'Mercado Pago payment lookup failed.'), {
      status: sdkErrorStatus(error),
    });
  }
}

export async function fetchMercadoPagoOrder(accessToken: string, orderId: string): Promise<MercadoPagoOrderResponse> {
  try {
    return await new Order(mercadoPagoClient(accessToken)).get({ id: orderId });
  } catch (error) {
    throw new MercadoPagoLookupError(sdkErrorMessage(error, 'Mercado Pago order lookup failed.'), {
      status: sdkErrorStatus(error),
    });
  }
}
