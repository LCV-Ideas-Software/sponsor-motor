import type { SponsorProjectSlug } from './projects.ts';

export interface PaymentRecord {
  externalReference: string;
  projectSlug: SponsorProjectSlug;
  preferenceId: string;
  amountCents: number;
  payerEmailHash: string | null;
  payerNameHash: string | null;
  initPoint: string;
  sandboxInitPoint?: string | undefined;
  now: number;
}

export async function insertPreference(db: D1Database, record: PaymentRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sponsor_payments (
        external_reference, provider, project_slug, preference_id, status, amount_cents, currency,
        payer_email_hash, payer_name_hash, init_point, sandbox_init_point, created_at, updated_at
      ) VALUES (?, 'mercadopago', ?, ?, 'preference_created', ?, 'BRL', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.externalReference,
      record.projectSlug,
      record.preferenceId,
      record.amountCents,
      record.payerEmailHash,
      record.payerNameHash,
      record.initPoint,
      record.sandboxInitPoint || null,
      record.now,
      record.now,
    )
    .run();
}

export async function updatePaymentStatus(
  db: D1Database,
  args: {
    externalReference: string;
    paymentId?: string | undefined;
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
       SET payment_id = COALESCE(?, payment_id),
           merchant_order_id = COALESCE(?, merchant_order_id),
           status = ?,
           status_detail = ?,
           amount_cents = COALESCE(?, amount_cents),
           currency = COALESCE(?, currency),
           updated_at = ?
       WHERE external_reference = ?`,
    )
    .bind(
      args.paymentId || null,
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

export async function findPaymentStatus(db: D1Database, externalReference: string): Promise<unknown | null> {
  const row = await db
    .prepare(
      `SELECT external_reference, project_slug, preference_id, payment_id, status, status_detail,
              amount_cents, currency, created_at, updated_at
       FROM sponsor_payments
       WHERE external_reference = ?`,
    )
    .bind(externalReference)
    .first();
  return row || null;
}
