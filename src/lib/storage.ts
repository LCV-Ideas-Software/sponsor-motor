import type { SponsorProjectSlug } from './projects.ts';

export interface OrderPaymentRecord {
  externalReference: string;
  projectSlug: SponsorProjectSlug;
  orderId?: string | undefined;
  paymentId?: string | undefined;
  paymentResourceId?: string | undefined;
  status: string;
  statusDetail?: string | undefined;
  amountCents: number;
  payerEmailHash: string | null;
  payerNameHash: string | null;
  now: number;
}

export interface PaymentStatusRecord {
  external_reference: string;
  project_slug: SponsorProjectSlug;
  provider_api: string | null;
  preference_id: string | null;
  sponsor_order_id: string | null;
  payment_id: string | null;
  payment_resource_id: string | null;
  status: string;
  status_detail: string | null;
  amount_cents: number;
  currency: string | null;
  created_at: number;
  updated_at: number;
}

export async function upsertOrderPayment(db: D1Database, record: OrderPaymentRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sponsor_payments (
        external_reference, provider, provider_api, project_slug, sponsor_order_id, payment_id, payment_resource_id,
        status, status_detail, amount_cents, currency, payer_email_hash, payer_name_hash,
        created_at, updated_at
      ) VALUES (?, 'mercadopago', 'orders', ?, ?, ?, ?, ?, ?, ?, 'BRL', ?, ?, ?, ?)
      ON CONFLICT(external_reference) DO UPDATE SET
        provider_api = 'orders',
        project_slug = excluded.project_slug,
        sponsor_order_id = COALESCE(excluded.sponsor_order_id, sponsor_payments.sponsor_order_id),
        payment_id = COALESCE(excluded.payment_id, sponsor_payments.payment_id),
        payment_resource_id = COALESCE(excluded.payment_resource_id, sponsor_payments.payment_resource_id),
        status = CASE
          WHEN sponsor_payments.status IN ('processed', 'failed', 'rejected', 'cancelled', 'canceled', 'refunded', 'charged_back')
            THEN sponsor_payments.status
          WHEN excluded.status = 'order_requested' AND sponsor_payments.status <> 'order_requested'
            THEN sponsor_payments.status
          ELSE excluded.status
        END,
        status_detail = CASE
          WHEN sponsor_payments.status IN ('processed', 'failed', 'rejected', 'cancelled', 'canceled', 'refunded', 'charged_back')
            THEN sponsor_payments.status_detail
          ELSE COALESCE(excluded.status_detail, sponsor_payments.status_detail)
        END,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        payer_email_hash = COALESCE(excluded.payer_email_hash, sponsor_payments.payer_email_hash),
        payer_name_hash = COALESCE(excluded.payer_name_hash, sponsor_payments.payer_name_hash),
        updated_at = excluded.updated_at`,
    )
    .bind(
      record.externalReference,
      record.projectSlug,
      record.orderId || null,
      record.paymentId || null,
      record.paymentResourceId || null,
      record.status,
      record.statusDetail || null,
      record.amountCents,
      record.payerEmailHash,
      record.payerNameHash,
      record.now,
      record.now,
    )
    .run();
}

export async function markOrderCreationFailed(db: D1Database, externalReference: string, now: number): Promise<void> {
  await db
    .prepare(
      `UPDATE sponsor_payments
       SET status = 'order_creation_failed',
           status_detail = COALESCE(status_detail, 'creation_failed'),
           updated_at = ?
       WHERE external_reference = ?
         AND status = 'order_requested'`,
    )
    .bind(now, externalReference)
    .run();
}

export async function updatePaymentStatus(
  db: D1Database,
  args: {
    externalReference: string;
    orderId?: string | undefined;
    paymentId?: string | undefined;
    paymentResourceId?: string | undefined;
    merchantOrderId?: string | undefined;
    status: string;
    statusDetail?: string | undefined;
    amountCents?: number | undefined;
    currency?: string | undefined;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE sponsor_payments
       SET sponsor_order_id = COALESCE(?, sponsor_order_id),
           payment_id = COALESCE(?, payment_id),
           payment_resource_id = COALESCE(?, payment_resource_id),
           merchant_order_id = COALESCE(?, merchant_order_id),
           status = ?,
           status_detail = ?,
           amount_cents = COALESCE(?, amount_cents),
           currency = COALESCE(?, currency),
           updated_at = ?
       WHERE external_reference = ?`,
    )
    .bind(
      args.orderId || null,
      args.paymentId || null,
      args.paymentResourceId || null,
      args.merchantOrderId || null,
      args.status,
      args.statusDetail || null,
      args.amountCents || null,
      args.currency || null,
      args.now,
      args.externalReference,
    )
    .run();
}

export async function updatePaymentStatusByProviderIds(
  db: D1Database,
  args: {
    paymentId?: string | undefined;
    paymentResourceId?: string | undefined;
    merchantOrderId?: string | undefined;
    orderId?: string | undefined;
    status: string;
    statusDetail?: string | undefined;
    now: number;
  },
): Promise<void> {
  const paymentLookupId = args.paymentId || args.paymentResourceId;
  if (!paymentLookupId && !args.merchantOrderId && !args.orderId) return;
  await db
    .prepare(
      `UPDATE sponsor_payments
       SET status = ?,
           status_detail = COALESCE(?, status_detail),
           updated_at = ?
       WHERE (? IS NOT NULL AND payment_id = ?)
          OR (? IS NOT NULL AND payment_resource_id = ?)
          OR (? IS NOT NULL AND merchant_order_id = ?)
          OR (? IS NOT NULL AND sponsor_order_id = ?)`,
    )
    .bind(
      args.status,
      args.statusDetail || null,
      args.now,
      paymentLookupId || null,
      paymentLookupId || null,
      paymentLookupId || null,
      paymentLookupId || null,
      args.merchantOrderId || null,
      args.merchantOrderId || null,
      args.orderId || null,
      args.orderId || null,
    )
    .run();
}

export async function insertEvent(
  db: D1Database,
  args: {
    id: string;
    externalReference?: string | undefined;
    eventType: string;
    providerId?: string | undefined;
    status?: string | undefined;
    payloadSha256: string;
    receivedAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO sponsor_payment_events (
        id, external_reference, provider, event_type, provider_id, status, payload_sha256, received_at
      ) VALUES (?, ?, 'mercadopago', ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.id,
      args.externalReference || null,
      args.eventType,
      args.providerId || null,
      args.status || null,
      args.payloadSha256,
      args.receivedAt,
    )
    .run();
}

export async function findPaymentStatus(
  db: D1Database,
  externalReference: string,
): Promise<PaymentStatusRecord | null> {
  const row = await db
    .prepare(
      `SELECT external_reference, project_slug, provider_api, preference_id, sponsor_order_id, payment_id, payment_resource_id, status, status_detail,
              amount_cents, currency, created_at, updated_at
       FROM sponsor_payments
       WHERE external_reference = ?`,
    )
    .bind(externalReference)
    .first<PaymentStatusRecord>();
  return row || null;
}
