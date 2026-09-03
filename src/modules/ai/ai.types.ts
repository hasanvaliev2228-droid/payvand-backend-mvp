export interface AiFinanceProvider {
  analyze(input: {
    summary: unknown;
    question?: string;
  }): Promise<{ provider: string; status: 'not_configured' | 'completed'; text: string }>;
}

export type AiFinanceProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE';

/** A safe, public error category for failures from an AI provider. */
export class AiFinanceProviderError extends Error {
  constructor(public readonly code: AiFinanceProviderErrorCode) {
    super(code);
    this.name = 'AiFinanceProviderError';
  }
}

/** Does not pretend analysis happened when an AI provider credential is absent. */
export const unavailableAiFinanceProvider: AiFinanceProvider = {
  async analyze(_input) {
    return { provider: 'mock', status: 'not_configured', text: 'AI provider is not configured.' };
  },
};
