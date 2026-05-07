export const APP_VERSION = 'APP v01.01.05';

export interface SecretStoreBinding {
  get(): Promise<string>;
}

export interface Env {
  BIGDATA_DB: D1Database;
  MERCADOPAGO_ACCESS_TOKEN: SecretStoreBinding | string;
  MERCADOPAGO_WEBHOOK_SECRET: SecretStoreBinding | string;
  MERCADOPAGO_PUBLIC_KEY?: SecretStoreBinding | string;
  ENVIRONMENT?: string;
  SPONSOR_PUBLIC_BASE_URL?: string;
  SPONSOR_API_BASE_URL?: string;
}

export interface ResolvedEnv
  extends Omit<Env, 'MERCADOPAGO_ACCESS_TOKEN' | 'MERCADOPAGO_WEBHOOK_SECRET' | 'MERCADOPAGO_PUBLIC_KEY'> {
  MERCADOPAGO_ACCESS_TOKEN: string;
  MERCADOPAGO_WEBHOOK_SECRET: string;
  MERCADOPAGO_PUBLIC_KEY?: string | undefined;
}

export async function resolveSecret(binding: SecretStoreBinding | string | undefined): Promise<string | undefined> {
  if (typeof binding === 'string') return binding;
  if (binding && typeof binding.get === 'function') return binding.get();
  return undefined;
}
