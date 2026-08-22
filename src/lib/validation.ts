/**
 * Small helpers for turning Zod parse results into AppError.validation
 * consistently across modules and Edge Functions.
 */
import type { z } from 'zod';
import { AppError } from './errors';

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.validation('Маълумоти воридшуда нодуруст аст.', result.error.flatten());
  }
  return result.data;
}
