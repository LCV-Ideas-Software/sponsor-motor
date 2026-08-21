import { describe, expect, it, vi } from 'vitest';
import { buildRefundBody, parseCliArgs, runCommand } from './sponsor-admin.mjs';

const envWith = (overrides = {}) => ({
  SPONSOR_API_BASE_URL: 'https://sponsor.example',
  SPONSOR_OPERATOR_TOKEN: 'op-secret',
  ...overrides,
});

const okJson = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

describe('parseCliArgs', () => {
  it('aceita os três comandos com seus argumentos', () => {
    expect(parseCliArgs(['status', 'sp_proj-x_123'])).toEqual({
      command: 'status',
      target: 'sp_proj-x_123',
      yes: false,
    });
    expect(parseCliArgs(['cancel', 'ORD-1', '--yes'])).toEqual({ command: 'cancel', target: 'ORD-1', yes: true });
    expect(parseCliArgs(['refund', 'ORD-2', '--amount', '12.34'])).toEqual({
      command: 'refund',
      target: 'ORD-2',
      amount: '12.34',
      yes: false,
    });
  });

  it('rejeita comando desconhecido, alvo ausente e amount malformado', () => {
    expect(parseCliArgs(['pay', 'X']).error).toMatch(/comando/i);
    expect(parseCliArgs(['cancel']).error).toMatch(/identificador/i);
    expect(parseCliArgs(['refund', 'ORD-2', '--amount', 'doze']).error).toMatch(/amount/i);
  });
});

describe('buildRefundBody', () => {
  it('reembolso total = sem body', () => {
    expect(buildRefundBody({})).toBeUndefined();
  });

  it('reembolso parcial usa o shape transactions do RefundOrderSchema', () => {
    expect(JSON.parse(buildRefundBody({ amount: '12.34' }))).toEqual({ transactions: [{ amount: '12.34' }] });
    expect(JSON.parse(buildRefundBody({ amount: '5.00', transactionId: 'TX-9' }))).toEqual({
      transactions: [{ id: 'TX-9', amount: '5.00' }],
    });
  });
});

describe('runCommand', () => {
  it('status consulta o endpoint público sem Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ status: 'processed' }));
    const result = await runCommand(parseCliArgs(['status', 'sp_proj-x_123']), envWith(), {
      fetchImpl: fetchMock,
      confirm: async () => true,
    });
    expect(result.exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sponsor.example/api/status/sp_proj-x_123');
    expect(init?.headers?.authorization).toBeUndefined();
  });

  it('cancel envia POST com Bearer e exige confirmação', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ orderId: 'ORD-1', status: 'cancelled' }));
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await runCommand(parseCliArgs(['cancel', 'ORD-1']), envWith(), {
      fetchImpl: fetchMock,
      confirm,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sponsor.example/api/orders/ORD-1/cancel');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer op-secret');
  });

  it('confirmação negada aborta sem chamar a API', async () => {
    const fetchMock = vi.fn();
    const result = await runCommand(parseCliArgs(['cancel', 'ORD-1']), envWith(), {
      fetchImpl: fetchMock,
      confirm: async () => false,
    });
    expect(result.exitCode).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refund parcial envia o body de transactions; --yes pula a confirmação', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ orderId: 'ORD-2', status: 'refunded' }));
    const confirm = vi.fn();
    const result = await runCommand(parseCliArgs(['refund', 'ORD-2', '--amount', '12.34', '--yes']), envWith(), {
      fetchImpl: fetchMock,
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ transactions: [{ amount: '12.34' }] });
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('token ausente em cancel/refund é erro de uso, sem chamada de rede', async () => {
    const fetchMock = vi.fn();
    const result = await runCommand(
      parseCliArgs(['cancel', 'ORD-1', '--yes']),
      envWith({ SPONSOR_OPERATOR_TOKEN: undefined }),
      { fetchImpl: fetchMock, confirm: async () => true },
    );
    expect(result.exitCode).toBe(2);
    expect(result.message).toMatch(/SPONSOR_OPERATOR_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erro da API vira exit code 1 com a mensagem do worker', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid operator token.' }),
    });
    const result = await runCommand(parseCliArgs(['cancel', 'ORD-1', '--yes']), envWith(), {
      fetchImpl: fetchMock,
      confirm: async () => true,
    });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('Invalid operator token.');
    expect(result.message).toContain('401');
  });
});
