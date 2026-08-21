#!/usr/bin/env node
/**
 * CLI administrativa do sponsor-motor (issue #152): status, cancel e refund
 * sem curl artesanal. Fala EXCLUSIVAMENTE com a API do worker (os endpoints
 * operator-only já existentes) — nunca com o provedor de pagamentos direto,
 * então sobrevive à futura troca de provedor (issue #186).
 *
 * Uso:
 *   node scripts/sponsor-admin.mjs status <externalReference>
 *   node scripts/sponsor-admin.mjs cancel <orderId> [--yes]
 *   node scripts/sponsor-admin.mjs refund <orderId> [--amount 12.34] [--transaction-id ID] [--yes]
 *
 * Config por ambiente (nunca por argv — token em argv vazaria em ps/history):
 *   SPONSOR_API_BASE_URL    default https://sponsor-motor.lcv.app.br
 *   SPONSOR_OPERATOR_TOKEN  obrigatório para cancel/refund
 *
 * Exit codes: 0 sucesso; 1 erro da API; 2 erro de uso/abortado.
 */
import { createInterface } from 'node:readline/promises';

const DEFAULT_BASE_URL = 'https://sponsor-motor.lcv.app.br';
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const TARGET_PATTERN = /^[0-9a-zA-Z_-]{4,80}$/;

export function parseCliArgs(argv) {
  const [command, target, ...rest] = argv;
  if (!['status', 'cancel', 'refund'].includes(command ?? '')) {
    return { error: `Comando inválido: "${command ?? ''}". Use status, cancel ou refund.` };
  }
  if (!target || !TARGET_PATTERN.test(target)) {
    return { error: 'Identificador ausente ou inválido (externalReference para status; orderId para cancel/refund).' };
  }
  const parsed = { command, target, yes: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--yes') {
      parsed.yes = true;
    } else if (flag === '--amount' && command === 'refund') {
      i += 1;
      const value = rest[i];
      if (!value || !AMOUNT_PATTERN.test(value)) {
        return { error: '--amount deve ser decimal positivo com até 2 casas (ex.: 12.34).' };
      }
      parsed.amount = value;
    } else if (flag === '--transaction-id' && command === 'refund') {
      i += 1;
      const value = rest[i];
      if (!value) return { error: '--transaction-id requer um valor.' };
      parsed.transactionId = value;
    } else {
      return { error: `Flag desconhecida para ${command}: ${flag}` };
    }
  }
  return parsed;
}

export function buildRefundBody({ amount, transactionId }) {
  if (!amount && !transactionId) return undefined; // reembolso total: sem body
  const transaction = {};
  if (transactionId) transaction.id = transactionId;
  if (amount) transaction.amount = amount;
  return JSON.stringify({ transactions: [transaction] });
}

const describeCall = (args) => {
  if (args.command === 'cancel') return `CANCELAR o pedido ${args.target}`;
  const scope = args.amount ? `parcial de ${args.amount}` : 'TOTAL';
  return `REEMBOLSO ${scope} do pedido ${args.target}`;
};

export async function runCommand(args, env, { fetchImpl, confirm }) {
  if (args.error) return { exitCode: 2, message: args.error };
  const baseUrl = (env.SPONSOR_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  if (args.command === 'status') {
    const response = await fetchImpl(`${baseUrl}/api/status/${args.target}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { exitCode: 1, message: `Falha na consulta (HTTP ${response.status}): ${body.error ?? 'sem detalhe'}` };
    }
    return { exitCode: 0, message: JSON.stringify(body, null, 2) };
  }

  const token = env.SPONSOR_OPERATOR_TOKEN;
  if (!token) {
    return {
      exitCode: 2,
      message: 'SPONSOR_OPERATOR_TOKEN ausente no ambiente — obrigatório para cancel/refund.',
    };
  }
  if (!args.yes) {
    const confirmed = await confirm(`Confirma ${describeCall(args)}? (yes/NO) `);
    if (!confirmed) return { exitCode: 2, message: 'Abortado pelo operador — nenhuma chamada foi feita.' };
  }

  const path = args.command === 'cancel' ? 'cancel' : 'refund';
  const body = args.command === 'refund' ? buildRefundBody(args) : undefined;
  const headers = { authorization: `Bearer ${token}` };
  if (body) headers['content-type'] = 'application/json';
  const response = await fetchImpl(`${baseUrl}/api/orders/${args.target}/${path}`, {
    method: 'POST',
    headers,
    ...(body ? { body } : {}),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      exitCode: 1,
      message: `Falha no ${args.command} (HTTP ${response.status}): ${responseBody.error ?? 'sem detalhe'}`,
    };
  }
  return { exitCode: 0, message: JSON.stringify(responseBody, null, 2) };
}

const interactiveConfirm = async (prompt) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(prompt);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
};

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await runCommand(args, process.env, { fetchImpl: fetch, confirm: interactiveConfirm });
  console.log(result.message);
  process.exit(result.exitCode);
}
