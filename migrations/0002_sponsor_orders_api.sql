-- sponsor-motor v01.01.00
-- Checkout Transparente via Orders API support in shared bigdata_db.

ALTER TABLE sponsor_payments ADD COLUMN sponsor_order_id TEXT;

ALTER TABLE sponsor_payments ADD COLUMN provider_api TEXT NOT NULL DEFAULT 'checkout_pro';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_payments_sponsor_order_id
ON sponsor_payments(sponsor_order_id);

CREATE INDEX IF NOT EXISTS idx_sponsor_payments_provider_api
ON sponsor_payments(provider_api);
