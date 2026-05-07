-- sponsor-motor v01.01.06
-- Keep Orders transaction IDs (PAY...) separate from numeric Payment API resource IDs.

ALTER TABLE sponsor_payments ADD COLUMN payment_resource_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sponsor_payments_payment_resource_id
ON sponsor_payments(payment_resource_id);
