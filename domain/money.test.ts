import { describe, it, expect } from 'vitest';
import { parseJPYPrice, parseJPYAmount, parseUSDPrice, parseUSDAmount } from '@/domain/money';

describe('parseJPYPrice', () => {
  it('小数第1位までの正の数を受理する', () => {
    expect(parseJPYPrice('2180.5')).toBe(2180.5);
    expect(parseJPYPrice('2000')).toBe(2000);
  });
  it('空文字・非数値・負数・小数第2位以降はnull', () => {
    expect(parseJPYPrice('')).toBeNull();
    expect(parseJPYPrice('abc')).toBeNull();
    expect(parseJPYPrice('-100')).toBeNull();
    expect(parseJPYPrice('100.55')).toBeNull();
    expect(parseJPYPrice('0')).toBeNull();
    expect(parseJPYPrice('１２３')).toBeNull(); // 全角数字
    expect(parseJPYPrice('1,234')).toBeNull();
  });
});

describe('parseJPYAmount', () => {
  it('整数のみ受理する', () => {
    expect(parseJPYAmount('200000')).toBe(200000);
  });
  it('小数を含む・負数・ゼロはnull', () => {
    expect(parseJPYAmount('200000.5')).toBeNull();
    expect(parseJPYAmount('-1')).toBeNull();
    expect(parseJPYAmount('0')).toBeNull();
    expect(parseJPYAmount('')).toBeNull();
  });
});

describe('parseUSDPrice', () => {
  it('小数第4位までの正の数を受理する', () => {
    expect(parseUSDPrice('20.5100')).toBe(20.51);
    expect(parseUSDPrice('26.25')).toBe(26.25);
  });
  it('小数第5位以降・負数・非数値はnull', () => {
    expect(parseUSDPrice('20.51005')).toBeNull();
    expect(parseUSDPrice('-20.51')).toBeNull();
    expect(parseUSDPrice('')).toBeNull();
  });
});

describe('parseUSDAmount', () => {
  it('小数第2位までの入力を整数セントへ変換する', () => {
    expect(parseUSDAmount('104.49')).toBe(10449);
    expect(parseUSDAmount('100')).toBe(10000);
  });
  it('小数第3位以降・負数・非数値はnull', () => {
    expect(parseUSDAmount('104.495')).toBeNull();
    expect(parseUSDAmount('-1')).toBeNull();
    expect(parseUSDAmount('')).toBeNull();
  });
  it('浮動小数点誤差が出ない値でも正しく丸められる', () => {
    expect(parseUSDAmount('0.29')).toBe(29);
  });
});
