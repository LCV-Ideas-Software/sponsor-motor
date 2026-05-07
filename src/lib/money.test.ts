import { describe, expect, it } from 'vitest';
import { centsFromAmount } from './money.ts';

describe('centsFromAmount', () => {
  it('parses Brazilian decimal strings', () => {
    expect(centsFromAmount('25,50')).toBe(2550);
    expect(centsFromAmount('1.234,56')).toBe(123456);
  });

  it('rejects out of range values', () => {
    expect(centsFromAmount('0,99')).toBeNull();
    expect(centsFromAmount('10000,01')).toBeNull();
  });
});
