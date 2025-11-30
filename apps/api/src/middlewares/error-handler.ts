// Global error handler middleware

import type { Context } from 'hono';
import type { HonoContext } from '../types/context';

export function errorHandler(err: Error, c: Context<HonoContext>) {
  console.error('Unhandled error:', err);

  // Check if it's a known error type
  if (err.name === 'ZodError') {
    return c.json(
      {
        error: 'Validation error',
        details: err.message,
      },
      400
    );
  }

  // Default error response
  return c.json(
    {
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
    500
  );
}
