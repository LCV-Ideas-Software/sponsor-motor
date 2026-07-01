import { MercadoPagoConfig, Order, Payment } from 'mercadopago';
import type { CreateOrderRequest } from 'mercadopago/dist/clients/order/create/types';
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
  payerPhone?: MercadoPagoPhone | undefined;
  payerAddress: MercadoPagoAddress;
  payerRegistrationDate: string;
  firstPurchaseOnline: boolean;
  // v01.02.00: integration quality recommendation —
  // `additional_info.payer.last_purchase` is forwarded to MP fraud
  // analysis when the caller has prior order history available. The
  // sponsor flow defaults to omitting it (most donors are new), but
  // the API surface accepts an ISO-8601 timestamp so a future caller
  // (logged-in operator, repeat-donor lookup, etc.) can supply it
  // without re-shaping the contract.
  payerLastPurchase?: string | undefined;
  threeDsValidation?: ThreeDsValidation | undefined;
  // v01.02.00: Programa de Parcerias Integrator ID forwarded as the
  // `x-integrator-id` header by the SDK; undefined means "no header".
  integratorId?: string | undefined;
}

const SPONSOR_ITEM_CATEGORY_ID = 'services';

export type ThreeDsValidation = 'always' | 'on_fraud_risk';

export interface MercadoPagoPhone {
  area_code: string;
  number: string;
}

export interface MercadoPagoAddress {
  zip_code: string;
  street_name: string;
  street_number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string;
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

// v01.02.00: integration quality recommendation — propagate the
// Integrator ID assigned by the Programa de Parcerias when present.
// The SDK forwards `options.integratorId` as the `x-integrator-id`
// header on every request; absence is fine for self-deployed
// integrations and the SDK simply omits the header.
function mercadoPagoClient(accessToken: string, integratorId?: string): MercadoPagoConfig {
  ensureNodeFetchHeadersCompat();
  if (integratorId && integratorId.trim().length > 0) {
    return new MercadoPagoConfig({
      accessToken,
      options: { integratorId: integratorId.trim() },
    });
  }
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
      errors?: unknown;
    };
    if (typeof response.status === 'number') details.push(`status=${response.status}`);
    if (typeof response.statusCode === 'number') details.push(`status=${response.statusCode}`);
    if (typeof response.message === 'string' && response.message) details.push(response.message);
    if (typeof response.error === 'string' && response.error) details.push(response.error);
    if (typeof response.cause === 'string' && response.cause) {
      details.push(response.cause);
    } else {
      const causes = Array.isArray(response.cause)
        ? response.cause
        : Array.isArray(response.errors)
          ? response.errors
          : [];
      for (const cause of causes) {
        if (!cause || typeof cause !== 'object') continue;
        const item = cause as { code?: unknown; description?: unknown; message?: unknown; details?: unknown };
        const code = typeof item.code === 'string' ? item.code : undefined;
        const description =
          typeof item.description === 'string'
            ? item.description
            : typeof item.message === 'string'
              ? item.message
              : undefined;
        const nestedDetails = Array.isArray(item.details)
          ? item.details.filter((detail): detail is string => typeof detail === 'string').join('; ')
          : undefined;
        if (code || description || nestedDetails)
          details.push([code, description, nestedDetails].filter(Boolean).join(': '));
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
    transaction_security: {
      validation: request.threeDsValidation || 'on_fraud_risk',
      liability_shift: 'required' as const,
    },
  };

  const payer = {
    email: request.payerEmail,
    entity_type: 'individual',
    first_name: request.payerFirstName,
    last_name: request.payerLastName,
    ...(request.payerIdentification ? { identification: request.payerIdentification } : {}),
    ...(request.payerPhone ? { phone: request.payerPhone } : {}),
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
      // v01.02.00: integration quality recommendation —
      // `additional_info.payer.last_purchase` (ISO timestamp). Only
      // include when the caller actually knows a prior purchase
      // date; sending an empty string would degrade fraud analysis.
      ...(request.payerLastPurchase ? { 'payer.last_purchase': request.payerLastPurchase } : {}),
    },
    items: [sponsorItem(request.projectSlug, amount)],
    transactions: {
      payments: [
        {
          amount,
          payment_method: paymentMethod,
        },
      ],
    },
  } satisfies CreateOrderRequest & {
    shipment: { address: MercadoPagoAddress };
  };

  let data: MercadoPagoOrderResponse | undefined;
  try {
    const payload = await new Order(mercadoPagoClient(request.accessToken, request.integratorId)).create({
      body: orderBody,
      requestOptions: { idempotencyKey: request.externalReference },
    });
    data = extractMercadoPagoOrderResponse(payload);
  } catch (error: unknown) {
    data = extractMercadoPagoOrderResponse(error);
    if (!data) throw new Error(sdkErrorMessage(error, 'Mercado Pago order creation failed.'));
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
  integratorId?: string,
): Promise<MercadoPagoPaymentResponse> {
  try {
    return await new Payment(mercadoPagoClient(accessToken, integratorId)).get({ id: paymentId });
  } catch (error) {
    throw new MercadoPagoLookupError(sdkErrorMessage(error, 'Mercado Pago payment lookup failed.'), {
      status: sdkErrorStatus(error),
    });
  }
}

export async function fetchMercadoPagoOrder(
  accessToken: string,
  orderId: string,
  integratorId?: string,
): Promise<MercadoPagoOrderResponse> {
  try {
    return await new Order(mercadoPagoClient(accessToken, integratorId)).get({ id: orderId });
  } catch (error) {
    throw new MercadoPagoLookupError(sdkErrorMessage(error, 'Mercado Pago order lookup failed.'), {
      status: sdkErrorStatus(error),
    });
  }
}

// v01.02.00: integration quality recommendation —
// "Cancelamento do pedido via API". Cancels an order that hasn't been
// captured/processed yet (sponsor flow uses `capture_mode:
// automatic_async`, so the cancel window is short — once MP captures
// the auth, the operator path is `refundMercadoPagoOrder` instead).
// The Worker route guards this behind a bearer token; the SDK call
// here does not authenticate beyond the standard access token.
export async function cancelMercadoPagoOrder(
  accessToken: string,
  orderId: string,
  integratorId?: string,
): Promise<MercadoPagoOrderResponse> {
  try {
    const payload = await new Order(mercadoPagoClient(accessToken, integratorId)).cancel({ id: orderId });
    const data = extractMercadoPagoOrderResponse(payload);
    if (!data?.id) throw new Error('Mercado Pago did not return a valid order on cancel.');
    return data;
  } catch (error) {
    const data = extractMercadoPagoOrderResponse(error);
    if (data?.id) return data;
    throw new MercadoPagoLookupError(sdkErrorMessage(error, 'Mercado Pago order cancel failed.'), {
      status: sdkErrorStatus(error),
    });
  }
}

// v01.02.00: integration quality recommendation — "Reembolsos".
// Refunds an order in full when `transactions` is omitted, or
// per-transaction (partial) when the caller passes `transactions: [{
// id, amount }, ...]`. The amount is a string with two decimals (BRL
// convention). The Worker route guards this behind a bearer token.
//
// Optional-key shape (no explicit `| undefined`) matches the SDK's
// `TransactionRefundRequest` under `exactOptionalPropertyTypes`. The
// Worker normalizes zod-parsed bodies before passing them in so that
// `undefined` fields are stripped rather than carried through.
export interface OrderRefundTransaction {
  id?: string;
  amount?: string;
}

function normalizeRefundTransaction(input: {
  id?: string | undefined;
  amount?: string | undefined;
}): OrderRefundTransaction {
  const out: OrderRefundTransaction = {};
  if (typeof input.id === 'string' && input.id.length > 0) out.id = input.id;
  if (typeof input.amount === 'string' && input.amount.length > 0) out.amount = input.amount;
  return out;
}

export async function refundMercadoPagoOrder(
  accessToken: string,
  orderId: string,
  options: {
    transactions?: Array<{ id?: string | undefined; amount?: string | undefined }> | undefined;
    integratorId?: string | undefined;
  } = {},
): Promise<MercadoPagoOrderResponse> {
  try {
    const normalizedTxns = options.transactions?.map(normalizeRefundTransaction) ?? [];
    const refundBody = normalizedTxns.length > 0 ? { transactions: normalizedTxns } : undefined;
    const payload = await new Order(mercadoPagoClient(accessToken, options.integratorId)).refund({
      id: orderId,
      ...(refundBody ? { body: refundBody } : {}),
    });
    const data = extractMercadoPagoOrderResponse(payload);
    if (!data?.id) throw new Error('Mercado Pago did not return a valid order on refund.');
    return data;
  } catch (error) {
    const data = extractMercadoPagoOrderResponse(error);
    if (data?.id) return data;
    throw new MercadoPagoLookupError(sdkErrorMessage(error, 'Mercado Pago order refund failed.'), {
      status: sdkErrorStatus(error),
    });
  }
}
