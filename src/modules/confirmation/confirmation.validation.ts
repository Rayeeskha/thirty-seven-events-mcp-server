import { z } from 'zod';

export const confirmationTokenSchema = z.string().trim().min(1).max(256);

export const confirmationTokenShape = {
  confirmation_token: confirmationTokenSchema
    .optional()
    .describe(
      'Omit on the first call to receive a summary and a token. Pass the token, with identical parameters, only after the user has explicitly confirmed.',
    ),
};
