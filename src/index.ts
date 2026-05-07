import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timing } from 'hono/timing';
import { APP_VERSION, type Env, type ResolvedEnv, resolveSecret } from './env.ts';
import { optionalHash, sha256Hex } from './lib/crypto.ts';
import { createMercadoPagoPreference, fetchMercadoPagoPayment } from './lib/mercadopago.ts';
import { amountFromCents, centsFromAmount, nowMs } from './lib/money.ts';
import { getAllowedOrigin } from './lib/origins.ts';
import { normalizeProjectSlug, PROJECT_BY_SLUG, SPONSOR_PROJECTS } from './lib/projects.ts';
import { CreatePreferenceSchema } from './lib/schemas.ts';
import { findPaymentStatus, insertEvent, insertPreference, updatePaymentStatus } from './lib/storage.ts';
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

function apiBaseUrl(env: Env): string {
  return (env.SPONSOR_API_BASE_URL || 'https://sponsor-motor.lcv.app.br').replace(/\/$/, '');
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

app.get('/api/projects', (c) => c.json({ projects: SPONSOR_PROJECTS }));

app.post('/api/preferences', async (c) => {
  const origin = c.req.header('origin');
  if (origin && !getAllowedOrigin(origin)) return c.json({ error: 'Origin not allowed.' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = CreatePreferenceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Dados inválidos.' }, 400);

  const amountCents = centsFromAmount(parsed.data.amount);
  if (amountCents === null) return c.json({ error: 'Informe um valor entre R$ 1,00 e R$ 10.000,00.' }, 400);

  const projectSlug = normalizeProjectSlug(parsed.data.project);
  const project = PROJECT_BY_SLUG.get(projectSlug);
  if (!project) return c.json({ error: 'Projeto inválido.' }, 400);

  const resolved = await resolveEnv(c.env);
  const timestamp = nowMs();
  const externalReference = `sp_${projectSlug}_${crypto.randomUUID()}`;
  const email = parsed.data.email ? parsed.data.email.trim().toLowerCase() : undefined;
  const name = parsed.data.name ? parsed.data.name.trim() : undefined;

  const preference = await createMercadoPagoPreference({
    accessToken: resolved.MERCADOPAGO_ACCESS_TOKEN,
    publicBaseUrl: publicBaseUrl(c.env),
    apiBaseUrl: apiBaseUrl(c.env),
    projectSlug,
    externalReference,
    amountCents,
    payerEmail: email,
    payerName: name,
  });

  await insertPreference(c.env.BIGDATA_DB, {
    externalReference,
    projectSlug,
    preferenceId: preference.preferenceId,
    amountCents,
    payerEmailHash: await optionalHash(email),
    payerNameHash: await optionalHash(name),
    initPoint: preference.initPoint,
    sandboxInitPoint: preference.sandboxInitPoint,
    now: timestamp,
  });

  return c.json({
    preferenceId: preference.preferenceId,
    externalReference,
    initPoint: preference.initPoint,
    sandboxInitPoint: preference.sandboxInitPoint,
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
  data?: { id?: string | number };
  id?: string | number;
}

app.post('/api/webhooks/mercadopago', async (c) => {
  const rawBody = await c.req.text();
  const payload = JSON.parse(rawBody || '{}') as MercadoPagoWebhookPayload;
  const queryDataId = c.req.query('data.id') || c.req.query('id');
  const dataId = String(payload.data?.id || payload.id || queryDataId || '');
  const requestId = c.req.header('x-request-id') || '';
  const signature = c.req.header('x-signature');
  const resolved = await resolveEnv(c.env);

  const verified = await verifyMercadoPagoWebhookSignature({
    secret: resolved.MERCADOPAGO_WEBHOOK_SECRET,
    dataId,
    requestId,
    xSignature: signature,
  });
  if (!verified) return c.json({ error: 'Invalid signature.' }, 401);

  const eventType = payload.type || payload.action || 'unknown';
  const receivedAt = nowMs();
  const payloadSha256 = await sha256Hex(rawBody);
  let externalReference: string | undefined;
  let status: string | undefined;

  if (dataId && (eventType.includes('payment') || payload.type === 'payment')) {
    const payment = await fetchMercadoPagoPayment(resolved.MERCADOPAGO_ACCESS_TOKEN, dataId);
    externalReference = payment.external_reference || undefined;
    status = payment.status || undefined;
    if (externalReference && status) {
      await updatePaymentStatus(c.env.BIGDATA_DB, {
        externalReference,
        paymentId: payment.id ? String(payment.id) : dataId,
        merchantOrderId: payment.merchant_order_id ? String(payment.merchant_order_id) : undefined,
        status,
        statusDetail: payment.status_detail,
        amountCents:
          typeof payment.transaction_amount === 'number' ? Math.round(payment.transaction_amount * 100) : undefined,
        currency: payment.currency_id,
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
