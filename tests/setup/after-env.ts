import { afterAll } from '@jest/globals';
import { disconnectDatabase } from '../../src/config/database';

// One connection pool per test file; close it once, after every suite in the file has finished.
afterAll(async () => {
  await disconnectDatabase();
});
