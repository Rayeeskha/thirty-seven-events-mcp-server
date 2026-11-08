import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { AppError, ConfirmationError, ConflictError, NotFoundError, normalizeError, ValidationError } from '../../src/utils/errors';

describe('normalizeError', () => {
  it('passes application errors through unchanged', () => {
    const error = new NotFoundError('Event', 7);
    expect(normalizeError(error)).toBe(error);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Event with id 7 was not found' });
  });

  it('converts a Zod error into a 400 with dotted field paths', () => {
    const parsed = z.object({ budget: z.number().min(0), nested: z.object({ name: z.string() }) }).safeParse({ budget: -1, nested: {} });
    expect(parsed.success).toBe(false);
    const error = normalizeError(parsed.error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.statusCode).toBe(400);
    expect(error.details?.map((detail) => detail.path).sort()).toEqual(['budget', 'nested.name']);
  });

  it('maps body-parser failures: malformed JSON is 400, oversized is 413', () => {
    expect(normalizeError({ type: 'entity.parse.failed' })).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(normalizeError({ type: 'entity.too.large' })).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it.each([
    ['an Error', new Error('password=hunter2')],
    ['a string', 'password=hunter2'],
    ['null', null],
    ['an object with an unrelated type', { type: 'something.else', secret: 'hunter2' }],
  ])('hides the cause of %s behind a generic 500', (_label, thrown) => {
    const error = normalizeError(thrown);
    expect(error).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    expect(JSON.stringify(error)).not.toContain('hunter2');
  });
});

describe('error classes', () => {
  it.each([
    ['INVALID', 400, 'CONFIRMATION_TOKEN_INVALID'],
    ['EXPIRED', 410, 'CONFIRMATION_TOKEN_EXPIRED'],
    ['ALREADY_USED', 409, 'CONFIRMATION_TOKEN_ALREADY_USED'],
    ['PARAMETERS_MISMATCH', 422, 'CONFIRMATION_PARAMETERS_MISMATCH'],
  ] as const)('ConfirmationError %s is HTTP %i / %s', (reason, status, code) => {
    const error = new ConfirmationError(reason, 'msg');
    expect(error).toMatchObject({ statusCode: status, code, reason, message: 'msg' });
    expect(error).toBeInstanceOf(AppError);
  });

  it('ConflictError is HTTP 409 CONFLICT', () => {
    expect(new ConflictError('x')).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('names errors after their class, for readable logs', () => {
    expect(new NotFoundError('Event', 1).name).toBe('NotFoundError');
    expect(new ConflictError('x').name).toBe('ConflictError');
  });
});
