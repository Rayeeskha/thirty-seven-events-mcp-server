import { afterEach, describe, expect, it, jest } from '@jest/globals';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  jest.restoreAllMocks();
});

function loadLogger(nodeEnv: string) {
  process.env.NODE_ENV = nodeEnv;
  let loaded: typeof import('../../src/utils/logger') | undefined;
  jest.isolateModules(() => {
    loaded = require('../../src/utils/logger');
  });
  return loaded!.logger;
}

describe('logger', () => {
  it('is silent under test so test output stays readable', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = loadLogger('test');
    logger.info('hello');
    logger.debug('hello');
    logger.error('hello', new Error('x'));
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('writes timestamped, levelled lines in other environments', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = loadLogger('development');
    logger.info('server started');
    logger.debug('SELECT 1');
    expect(log).toHaveBeenNthCalledWith(1, expect.stringMatching(/^\[\d{4}-\d\d-\d\dT[\d:.]+Z\] INFO server started$/));
    expect(log).toHaveBeenNthCalledWith(2, expect.stringMatching(/\] DEBUG SELECT 1$/));
  });

  it('sends errors to stderr together with the error object', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = new Error('boom');
    loadLogger('production').error('Unhandled request error', cause);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/\] ERROR Unhandled request error$/), cause);
  });

  it('omits the extra argument when there is no error object', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    loadLogger('production').error('plain');
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/\] ERROR plain$/));
  });
});
