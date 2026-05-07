import { describe, expect, it, vi } from 'vitest';
import { markOrderCreationFailed, upsertOrderPayment } from './storage.ts';

function createDbMock() {
  const run = vi.fn(async () => ({ success: true }));
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn(() => ({ bind }));
  return {
    db: { prepare } as unknown as D1Database,
    bind,
    prepare,
    run,
  };
}

describe('sponsor payment storage', () => {
  it('upserts order rows without overwriting terminal webhook statuses', async () => {
    const d1 = createDbMock();

    await upsertOrderPayment(d1.db, {
      externalReference: 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000000',
      projectSlug: 'lcv-ideas-software',
      status: 'order_requested',
      amountCents: 1000,
      payerEmailHash: null,
      payerNameHash: null,
      now: 123,
    });

    const calls = d1.prepare.mock.calls as unknown as Array<[string]>;
    const sql = String(calls[0]?.[0] || '');
    expect(sql).toContain("sponsor_payments.status IN ('processed', 'failed', 'rejected'");
    expect(sql).toContain("excluded.status = 'order_requested'");
    expect(sql).toContain('payment_resource_id = COALESCE');
    expect(sql).toContain('ON CONFLICT(external_reference) DO UPDATE');
  });

  it('marks order creation failures only while the local row is still order_requested', async () => {
    const d1 = createDbMock();

    await markOrderCreationFailed(d1.db, 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000000', 456);

    const calls = d1.prepare.mock.calls as unknown as Array<[string]>;
    const sql = String(calls[0]?.[0] || '');
    expect(sql).toContain("status = 'order_creation_failed'");
    expect(sql).toContain("AND status = 'order_requested'");
    expect(d1.bind).toHaveBeenCalledWith(456, 'sp_lcv-ideas-software_00000000-0000-4000-8000-000000000000');
  });
});
