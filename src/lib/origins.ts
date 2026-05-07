const EXACT_ALLOWED_ORIGINS = new Set(['https://www.lcv.dev', 'https://lcv.dev', 'https://github.lcv.dev']);

const ALLOWED_HOSTNAMES = new Set([
  'admin-app.lcv.app.br',
  'astrologo-app.lcv.app.br',
  'calculadora-app.lcv.app.br',
  'cross-review-v1.lcv.app.br',
  'cross-review-v2.lcv.app.br',
  'grok-cli.lcv.app.br',
  'maestro-app.lcv.app.br',
  'mainsite-app.lcv.app.br',
  'mtasts-motor.lcv.app.br',
  'oraculo-financeiro-app.lcv.app.br',
  'reflexosdaalma.blog',
  'www.reflexosdaalma.blog',
]);

export function getAllowedOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  if (EXACT_ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return null;
    return ALLOWED_HOSTNAMES.has(url.hostname.toLowerCase()) ? origin : null;
  } catch {
    return null;
  }
}
