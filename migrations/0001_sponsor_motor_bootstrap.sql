-- sponsor-motor v01.00.00
-- Mercado Pago Checkout Pro audit tables in shared bigdata_db.

CREATE TABLE IF NOT EXISTS sponsor_payments (
  external_reference TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  project_slug TEXT NOT NULL,
  preference_id TEXT UNIQUE,
  payment_id TEXT,
  merchant_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'preference_created',
  status_detail TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  payer_email_hash TEXT,
  payer_name_hash TEXT,
  init_point TEXT,
  sandbox_init_point TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsor_payments_project_slug
ON sponsor_payments(project_slug);

CREATE INDEX IF NOT EXISTS idx_sponsor_payments_payment_id
ON sponsor_payments(payment_id);

CREATE INDEX IF NOT EXISTS idx_sponsor_payments_status
ON sponsor_payments(status);

CREATE TABLE IF NOT EXISTS sponsor_payment_events (
  id TEXT PRIMARY KEY,
  external_reference TEXT,
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  event_type TEXT NOT NULL,
  provider_id TEXT,
  status TEXT,
  payload_sha256 TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsor_payment_events_reference
ON sponsor_payment_events(external_reference);

CREATE INDEX IF NOT EXISTS idx_sponsor_payment_events_provider_id
ON sponsor_payment_events(provider_id);

CREATE TABLE IF NOT EXISTS sponsor_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
