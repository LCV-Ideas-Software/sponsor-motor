import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timing } from 'hono/timing';
import { APP_VERSION, type Env, type ResolvedEnv, resolveSecret } from './env.ts';
import { optionalHash, sha256Hex } from './lib/crypto.ts';
import {
  createMercadoPagoOrder,
  fetchMercadoPagoOrder,
  fetchMercadoPagoPayment,
  isMercadoPagoLookupNotFound,
  type MercadoPagoOrderResponse,
} from './lib/mercadopago.ts';
import { amountFromCents, centsFromAmount, nowMs } from './lib/money.ts';
import { getAllowedOrigin } from './lib/origins.ts';
import { normalizeProjectSlug, PROJECT_BY_SLUG, SPONSOR_PROJECTS } from './lib/projects.ts';
import { CreateOrderSchema } from './lib/schemas.ts';
import {
  findPaymentStatus,
  insertEvent,
  markOrderCreationFailed,
  updatePaymentStatus,
  updatePaymentStatusByProviderIds,
  upsertOrderPayment,
} from './lib/storage.ts';
import { verifyMercadoPagoWebhookSignature } from './lib/webhook-signature.ts';

const app = new Hono<{ Bindings: Env }>();

async function resolveEnv(env: Env): Promise<ResolvedEnv> {
  const accessToken = await resolveSecret(env.MERCADOPAGO_ACCESS_TOKEN);
  const webhookSecret = await resolveSecret(env.MERCADOPAGO_WEBHOOK_SECRET);
  const publicKey = await resolveSecret(env.MERCADOPAGO_PUBLIC_KEY);
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN missing.');
  if (!webhookSecret) throw new Error('MERCADOPAGO_WEBHOOK_SECRET missing.');
  return {
    ...env,
    MERCADOPAGO_ACCESS_TOKEN: accessToken,
    MERCADOPAGO_WEBHOOK_SECRET: webhookSecret,
    MERCADOPAGO_PUBLIC_KEY: publicKey,
  };
}

function publicBaseUrl(env: Env): string {
  return (env.SPONSOR_PUBLIC_BASE_URL || 'https://www.lcv.dev').replace(/\/$/, '');
}

function centsFromMercadoPagoAmount(value: string | number | undefined): number | undefined {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

function normalizeAddress(input: {
  zipCode: string;
  streetName: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string | undefined;
}) {
  const complement = input.complement?.trim();
  return {
    zip_code: input.zipCode.trim(),
    street_name: input.streetName.trim(),
    street_number: input.streetNumber.trim(),
    neighborhood: input.neighborhood.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    ...(complement ? { complement } : {}),
  };
}

app.use('*', timing());

app.use(
  '/api/*',
  cors({
    origin: (origin) => getAllowedOrigin(origin),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 86400,
  }),
);

app.get('/', (c) =>
  c.json({
    service: 'sponsor-motor',
    version: APP_VERSION,
    sponsor: `${publicBaseUrl(c.env)}/sponsor`,
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, service: 'sponsor-motor', version: APP_VERSION }));

app.get('/api/config', async (c) => {
  const resolved = await resolveEnv(c.env);
  if (!resolved.MERCADOPAGO_PUBLIC_KEY) return c.json({ error: 'Mercado Pago public key missing.' }, 500);
  return c.json({ publicKey: resolved.MERCADOPAGO_PUBLIC_KEY, locale: 'pt-BR' });
});

app.get('/api/projects', (c) => c.json({ projects: SPONSOR_PROJECTS }));

app.post('/api/preferences', async (c) => {
  return c.json({ error: 'Checkout Pro preferences are disabled. Use /api/orders.' }, 410);
});

app.post('/api/orders', async (c) => {
  const origin = c.req.header('origin');
  if (origin && !getAllowedOrigin(origin)) return c.json({ error: 'Origin not allowed.' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Dados de pagamento inválidos.' }, 400);

  const amountCents = centsFromAmount(parsed.data.amount);
  if (amountCents === null) return c.json({ error: 'Informe um valor entre R$ 1,00 e R$ 10.000,00.' }, 400);

  const projectSlug = normalizeProjectSlug(parsed.data.project);
  const project = PROJECT_BY_SLUG.get(projectSlug);
  if (!project) return c.json({ error: 'Projeto inválido.' }, 400);

  const resolved = await resolveEnv(c.env);
  const timestamp = nowMs();
  const externalReference = `sp_${projectSlug}_${crypto.randomUUID()}`;
  const email = parsed.data.email.trim().toLowerCase();
  const firstName = parsed.data.firstName.trim();
  const lastName = parsed.data.lastName.trim();
  const name = `${firstName} ${lastName}`;
  const address = normalizeAddress(parsed.data.address);

  await upsertOrderPayment(c.env.BIGDATA_DB, {
    externalReference,
    projectSlug,
    status: 'order_requested',
    amountCents,
    payerEmailHash: await optionalHash(email),
    payerNameHash: await optionalHash(name),
    now: timestamp,
  });

  const order = await createMercadoPagoOrder({
    accessToken: resolved.MERCADOPAGO_ACCESS_TOKEN,
    projectSlug,
    externalReference,
    amountCents,
    token: parsed.data.token,
    paymentMethodId: parsed.data.paymentMethodId,
    paymentType: parsed.data.paymentType,
    installments: parsed.data.installments,
    payerEmail: email,
    payerFirstName: firstName,
    payerLastName: lastName,
    payerIdentification: parsed.data.identification,
    payerAddress: address,
    payerRegistrationDate: new Date(parsed.data.payerRegistrationDate).toISOString(),
    firstPurchaseOnline: parsed.data.firstPurchaseOnline,
  }).catch(async (error: unknown) => {
    await markOrderCreationFailed(c.env.BIGDATA_DB, externalReference, nowMs());
    throw error;
  });

  await upsertOrderPayment(c.env.BIGDATA_DB, {
    externalReference,
    projectSlug,
    orderId: order.orderId,
    paymentId: order.paymentId,
    status: order.paymentStatus || order.status || 'created',
    statusDetail: order.paymentStatusDetail || order.statusDetail,
    amountCents,
    payerEmailHash: await optionalHash(email),
    payerNameHash: await optionalHash(name),
    now: nowMs(),
  });

  return c.json({
    orderId: order.orderId,
    externalReference,
    status: order.status,
    statusDetail: order.statusDetail,
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    paymentStatusDetail: order.paymentStatusDetail,
    challengeUrl: order.challengeUrl,
    amount: amountFromCents(amountCents),
    currency: 'BRL',
    project,
  });
});

app.get('/api/status/:externalReference', async (c) => {
  const externalReference = c.req.param('externalReference');
  if (!/^sp_[a-z0-9-]+_[0-9a-f-]{36}$/i.test(externalReference)) return c.json({ error: 'Referência inválida.' }, 400);
  const status = await findPaymentStatus(c.env.BIGDATA_DB, externalReference);
  if (!status) return c.json({ error: 'Pagamento não encontrado.' }, 404);
  return c.json(status);
});

interface MercadoPagoWebhookPayload {
  type?: string;
  action?: string;
  topic?: string;
  resource?: string;
  data?: ({ id?: string | number } & Partial<MercadoPagoOrderResponse> & Record<string, unknown>) | undefined;
  id?: string | number;
  version?: number;
}

type MercadoPagoWebhookTopic =
  | 'orders'
  | 'payment'
  | 'fraud_alert'
  | 'claim'
  | 'chargeback'
  | 'card_updater'
  | 'merchant_order'
  | 'subscription'
  | 'mp_connect'
  | 'wallet_connect'
  | 'point_integration'
  | 'shipment'
  | 'delivery'
  | 'self_service'
  | 'generic';

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function webhookTokens(payload: MercadoPagoWebhookPayload, queryType: string | undefined): Set<string> {
  const candidates = [payload.type, payload.topic, queryType, payload.action?.split('.')[0], payload.resource];
  return new Set(candidates.flatMap((candidate) => (candidate ? [candidate.trim().toLowerCase()] : [])));
}

function classifyWebhookTopic(
  payload: MercadoPagoWebhookPayload,
  queryType: string | undefined,
): MercadoPagoWebhookTopic {
  const tokens = webhookTokens(payload, queryType);
  if (tokens.has('order') || tokens.has('orders')) return 'orders';
  if (tokens.has('payment') || tokens.has('payments')) return 'payment';
  if (tokens.has('stop_delivery_op_wh') || tokens.has('delivery_cancellation')) return 'fraud_alert';
  if (tokens.has('automatic-payments') || tokens.has('topic_card_id_wh') || payload.action === 'card.updated') {
    return 'card_updater';
  }
  if (tokens.has('topic_claims_integration_wh') || tokens.has('claim') || tokens.has('claims')) return 'claim';
  if (tokens.has('topic_chargebacks_wh') || tokens.has('chargeback') || tokens.has('chargebacks')) return 'chargeback';
  if (tokens.has('topic_merchant_order_wh') || tokens.has('merchant_order') || tokens.has('merchant_orders')) {
    return 'merchant_order';
  }
  if (
    tokens.has('subscription_authorized_payment') ||
    tokens.has('subscription_preapproval') ||
    tokens.has('subscription_preapproval_plan') ||
    tokens.has('preapproval') ||
    tokens.has('preapproval_plan')
  ) {
    return 'subscription';
  }
  if (tokens.has('mp-connect') || tokens.has('mp_connect')) return 'mp_connect';
  if (tokens.has('wallet_connect') || tokens.has('wallet-connect')) return 'wallet_connect';
  if (tokens.has('point_integration_wh') || tokens.has('point_integration_ipn')) return 'point_integration';
  if (tokens.has('shipment') || tokens.has('shipments') || tokens.has('topic_shipments_wh')) return 'shipment';
  if (tokens.has('delivery') || tokens.has('delivery_proximity') || tokens.has('proximity_marketplace'))
    return 'delivery';
  if (tokens.has('self_service') || tokens.has('self-service') || tokens.has('self_service_wh')) return 'self_service';
  return 'generic';
}

function webhookProviderId(payload: MercadoPagoWebhookPayload, queryDataId: string | undefined): string {
  const data = payload.data || {};
  return (
    queryDataId ||
    stringFromUnknown(data.id) ||
    stringFromUnknown(data.payment_id) ||
    stringFromUnknown(data.merchant_order) ||
    stringFromUnknown(data.merchant_order_id) ||
    stringFromUnknown(data.order_id) ||
    stringFromUnknown(data.customer_id) ||
    stringFromUnknown(payload.id) ||
    ''
  );
}

function webhookStatus(topic: MercadoPagoWebhookTopic, payload: MercadoPagoWebhookPayload): string | undefined {
  const data = payload.data || {};
  return (
    stringFromUnknown(data.status) ||
    stringFromUnknown(data.status_detail) ||
    (topic === 'fraud_alert' ? 'fraud_alert' : undefined) ||
    (topic === 'chargeback' ? 'chargeback' : undefined) ||
    (topic === 'claim' ? 'claim' : undefined) ||
    (topic === 'card_updater' ? 'card_updated' : undefined) ||
    (topic === 'mp_connect' ? 'mp_connect' : undefined) ||
    (topic === 'wallet_connect' ? 'wallet_connect' : undefined) ||
    (topic === 'point_integration' ? 'point_integration' : undefined) ||
    (topic === 'shipment' ? 'shipment' : undefined) ||
    (topic === 'delivery' ? 'delivery' : undefined) ||
    (topic === 'self_service' ? 'self_service' : undefined)
  );
}

function providerPaymentId(payload: MercadoPagoWebhookPayload): string | undefined {
  const data = payload.data || {};
  return stringFromUnknown(data.payment_id) || stringFromUnknown(data.paymentId) || stringFromUnknown(data.payment);
}

function providerMerchantOrderId(
  payload: MercadoPagoWebhookPayload,
  topic: MercadoPagoWebhookTopic,
): string | undefined {
  const data = payload.data || {};
  return (
    stringFromUnknown(data.merchant_order) ||
    stringFromUnknown(data.merchant_order_id) ||
    (topic === 'merchant_order' ? stringFromUnknown(data.id) : undefined)
  );
}

function providerOrderId(payload: MercadoPagoWebhookPayload, topic: MercadoPagoWebhookTopic): string | undefined {
  const data = payload.data || {};
  return stringFromUnknown(data.order_id) || (topic === 'orders' ? stringFromUnknown(data.id) : undefined);
}

function orderFromWebhookPayload(payload: MercadoPagoWebhookPayload): MercadoPagoOrderResponse | undefined {
  if (!payload.data || typeof payload.data !== 'object') return undefined;
  const data = payload.data;
  const hasOrderFields =
    typeof data.external_reference === 'string' ||
    typeof data.status === 'string' ||
    typeof data.status_detail === 'string' ||
    typeof data.transactions === 'object';
  if (!hasOrderFields) return undefined;
  const id = stringFromUnknown(data.id);
  return {
    ...data,
    ...(id ? { id } : {}),
  };
}

app.post('/api/webhooks/mercadopago', async (c) => {
  const rawBody = await c.req.text();
  const payload = JSON.parse(rawBody || '{}') as MercadoPagoWebhookPayload;
  const queryDataId = c.req.query('data.id') || c.req.query('id');
  const queryType = c.req.query('type') || c.req.query('topic');
  const topic = classifyWebhookTopic(payload, queryType);
  const dataId = webhookProviderId(payload, queryDataId);
  const requestId = c.req.header('x-request-id') || '';
  const signature = c.req.header('x-signature');
  const resolved = await resolveEnv(c.env);
  const eventType = payload.action || payload.type || 'unknown';
  const signatureDataId = queryDataId ? queryDataId.toLowerCase() : undefined;

  let verified = await verifyMercadoPagoWebhookSignature({
    secret: resolved.MERCADOPAGO_WEBHOOK_SECRET,
    dataId: signatureDataId,
    requestId,
    xSignature: signature,
  });
  if (!verified && !queryDataId && dataId) {
    verified = await verifyMercadoPagoWebhookSignature({
      secret: resolved.MERCADOPAGO_WEBHOOK_SECRET,
      dataId: dataId.toLowerCase(),
      requestId,
      xSignature: signature,
    });
  }
  if (!verified) return c.json({ error: 'Invalid signature.' }, 401);

  const receivedAt = nowMs();
  const payloadSha256 = await sha256Hex(rawBody);
  let externalReference: string | undefined;
  let status: string | undefined;

  if (dataId && topic === 'orders') {
    const order =
      orderFromWebhookPayload(payload) ||
      (await fetchMercadoPagoOrder(resolved.MERCADOPAGO_ACCESS_TOKEN, dataId).catch((error: unknown) => {
        if (!isMercadoPagoLookupNotFound(error)) throw error;
        console.warn('[sponsor-motor] Mercado Pago webhook order not found.', { eventType, providerId: dataId });
        status = 'not_found';
        return undefined;
      }));
    const payment = order?.transactions?.payments?.[0];
    externalReference = order?.external_reference || undefined;
    status = payment?.status || order?.status || status;
    if (order && externalReference && status) {
      await updatePaymentStatus(c.env.BIGDATA_DB, {
        externalReference,
        orderId: order.id || dataId,
        paymentId: payment?.id,
        status,
        statusDetail: payment?.status_detail || order.status_detail,
        amountCents: centsFromMercadoPagoAmount(
          payment?.paid_amount || payment?.amount || order.total_paid_amount || order.total_amount,
        ),
        currency: order.currency || 'BRL',
        now: receivedAt,
      });
    }
  } else if (dataId && topic === 'payment') {
    const payment = await fetchMercadoPagoPayment(resolved.MERCADOPAGO_ACCESS_TOKEN, dataId).catch((error: unknown) => {
      if (!isMercadoPagoLookupNotFound(error)) throw error;
      console.warn('[sponsor-motor] Mercado Pago webhook payment not found.', { eventType, providerId: dataId });
      status = 'not_found';
      return undefined;
    });
    externalReference = payment?.external_reference || undefined;
    status = payment?.status || status;
    if (payment && externalReference && status) {
      await updatePaymentStatus(c.env.BIGDATA_DB, {
        externalReference,
        paymentResourceId: payment.id ? String(payment.id) : dataId,
        merchantOrderId: payment.merchant_order_id ? String(payment.merchant_order_id) : undefined,
        status,
        statusDetail: payment.status_detail,
        amountCents:
          typeof payment.transaction_amount === 'number' ? Math.round(payment.transaction_amount * 100) : undefined,
        currency: payment.currency_id,
        now: receivedAt,
      });
    }
  } else {
    status = webhookStatus(topic, payload);
    if (status) {
      await updatePaymentStatusByProviderIds(c.env.BIGDATA_DB, {
        paymentId: providerPaymentId(payload),
        merchantOrderId: providerMerchantOrderId(payload, topic),
        orderId: providerOrderId(payload, topic),
        status,
        statusDetail: stringFromUnknown(payload.data?.status_detail) || eventType,
        now: receivedAt,
      });
    }
  }

  await insertEvent(c.env.BIGDATA_DB, {
    id: `mp_${requestId}_${dataId || crypto.randomUUID()}`,
    externalReference,
    eventType,
    providerId: dataId || undefined,
    status,
    payloadSha256,
    receivedAt,
  });

  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

app.onError((error, c) => {
  console.error('[sponsor-motor]', error);
  return c.json({ error: 'Internal server error.' }, 500);
});

export default app;
