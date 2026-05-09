export const APP_VERSION = 'APP v01.02.02';

export interface SecretStoreBinding {
  get(): Promise<string>;
}

export interface Env {
  BIGDATA_DB: D1Database;
  MERCADOPAGO_ACCESS_TOKEN: SecretStoreBinding | string;
  MERCADOPAGO_WEBHOOK_SECRET: SecretStoreBinding | string;
  MERCADOPAGO_PUBLIC_KEY?: SecretStoreBinding | string;
  MERCADOPAGO_3DS_VALIDATION?: string;
  // v01.02.00: Mercado Pago integration quality recommendation
  // "Integrator ID" — set when the integration is registered in the
  // Programa de Parcerias. Forwarded to the SDK via
  // MercadoPagoConfig.options.integratorId. Optional; absence is fine
  // for self-deployed integrations.
  MERCADOPAGO_INTEGRATOR_ID?: string;
  // v01.02.00: bearer token gating the operator-only refund + cancel
  // endpoints. Required to hit /api/orders/:id/refund or /cancel; the
  // worker returns 401 when missing or mismatched. Compared with a
  // timing-safe routine.
  SPONSOR_OPERATOR_TOKEN?: SecretStoreBinding | string;
  ENVIRONMENT?: string;
  SPONSOR_PUBLIC_BASE_URL?: string;
  SPONSOR_API_BASE_URL?: string;
}

export interface ResolvedEnv
  extends Omit<
    Env,
    'MERCADOPAGO_ACCESS_TOKEN' | 'MERCADOPAGO_WEBHOOK_SECRET' | 'MERCADOPAGO_PUBLIC_KEY' | 'SPONSOR_OPERATOR_TOKEN'
  > {
  MERCADOPAGO_ACCESS_TOKEN: string;
  MERCADOPAGO_WEBHOOK_SECRET: string;
  MERCADOPAGO_PUBLIC_KEY?: string | undefined;
  SPONSOR_OPERATOR_TOKEN?: string | undefined;
}

export async function resolveSecret(binding: SecretStoreBinding | string | undefined): Promise<string | undefined> {
  if (typeof binding === 'string') return binding;
  if (binding && typeof binding.get === 'function') return binding.get();
  return undefined;
}
