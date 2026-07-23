import { BadRequestException } from '@nestjs/common';
import { buildMoney, convertToBase, roundMoney } from './money';

describe('money', () => {
  describe('roundMoney', () => {
    it('rounds half-up to 2 decimals by default', () => {
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(2.675)).toBe(2.68);
      expect(roundMoney(100)).toBe(100);
    });

    it('honours a custom decimal count (0 for LBP)', () => {
      expect(roundMoney(8950000.6, 0)).toBe(8950001);
    });
  });

  describe('convertToBase', () => {
    it('is the identity when currency equals the base currency', () => {
      expect(convertToBase(100, 'USD', 1, 'USD')).toBe(100);
    });

    it('converts a foreign amount into a USD base (original / rate)', () => {
      // 8,950,000 LBP at 89,500 LBP per USD = 100 USD
      expect(convertToBase(8_950_000, 'LBP', 89_500, 'USD')).toBe(100);
    });

    it('converts a USD amount into a non-USD base (original * rate)', () => {
      // 100 USD at 89,500 LBP per USD = 8,950,000 LBP
      expect(convertToBase(100, 'USD', 89_500, 'LBP', 0)).toBe(8_950_000);
    });

    it('rejects a non-positive rate for a cross-currency conversion', () => {
      expect(() => convertToBase(100, 'LBP', 0, 'USD')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a conversion where neither side is the USD anchor', () => {
      expect(() => convertToBase(100, 'EUR', 1.1, 'LBP')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildMoney', () => {
    it('normalizes the rate to 1 when currency is the base currency', () => {
      const m = buildMoney(250, 'USD', 999, 'USD');
      expect(m).toEqual({
        amountOriginal: 250,
        currency: 'USD',
        rate: 1,
        amountBase: 250,
      });
    });

    it('computes the base amount from a foreign amount + rate', () => {
      const m = buildMoney(8_950_000, 'LBP', 89_500, 'USD');
      expect(m.amountBase).toBe(100);
      expect(m.rate).toBe(89_500);
    });
  });
});
