export interface AiFinanceProvider {
  analyze(input: {
    summary: unknown;
    question?: string;
  }): Promise<{ provider: string; status: 'not_configured' | 'completed'; text: string }>;
}
/** Does not pretend analysis happened when an AI provider credential is absent. */
export const unavailableAiFinanceProvider: AiFinanceProvider = {
  async analyze(_input) {
    return { provider: 'mock', status: 'not_configured', text: 'AI provider is not configured.' };
  },
};
