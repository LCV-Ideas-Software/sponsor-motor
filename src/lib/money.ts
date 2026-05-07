export function centsFromAmount(value: unknown): number | null {
  const text = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (cents < 100 || cents > 1_000_000) return null;
  return cents;
}

export function amountFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function nowMs(): number {
  return Date.now();
}

export function appendQuery(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) parsed.searchParams.set(key, value);
  return parsed.toString();
}
