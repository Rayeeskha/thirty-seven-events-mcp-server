import { describe, expect, it } from '@jest/globals';
import { canonicalHash, canonicalize, sha256Hex } from '../../src/utils/hash';

describe('sha256Hex', () => {
  it('matches the published SHA-256 test vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('canonicalize', () => {
  it('sorts object keys at every depth', () => {
    expect(canonicalize({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it('keeps array order, because order is meaningful', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalHash([1, 2])).not.toBe(canonicalHash([2, 1]));
  });

  it('ignores properties whose value is undefined', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });

  it('escapes strings, so crafted values cannot imitate other structures', () => {
    expect(canonicalHash({ a: 'b,"c":1' })).not.toBe(canonicalHash({ a: 'b', c: 1 }));
    expect(canonicalize({ a: 'say "hi"\n' })).toBe('{"a":"say \\"hi\\"\\n"}');
  });

  it('handles unicode and Arabic text', () => {
    expect(canonicalize({ name: 'معرض الرياض' })).toBe('{"name":"معرض الرياض"}');
  });
});

describe('canonicalHash', () => {
  it('is independent of key order', () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
  });

  it.each([
    ['a changed value', { a: 1 }, { a: 2 }],
    ['a number versus its string form', { a: 1 }, { a: '1' }],
    ['null versus a missing key', { a: null }, {}],
    ['a different key', { a: 1 }, { b: 1 }],
    ['a decimal change', { budget: 310500.5 }, { budget: 310500.51 }],
  ])('differs for %s', (_label, left, right) => {
    expect(canonicalHash(left)).not.toBe(canonicalHash(right));
  });

  it('produces a 64-character hex digest', () => {
    expect(canonicalHash({ any: 'thing' })).toMatch(/^[0-9a-f]{64}$/);
  });
});
