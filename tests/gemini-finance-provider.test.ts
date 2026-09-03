import { describe, expect, it, vi } from 'vitest';
import { AiFinanceProviderError } from '../src/modules/ai/ai.types.ts';
import { GeminiFinanceProvider } from '../supabase/functions/ai-finance-chat/gemini-finance.provider.ts';

const input = { summary: { income: 1000, expenses: 600 }, question: 'How am I doing?' };

describe('GeminiFinanceProvider', () => {
  it('reports a missing server secret without making a network request', async () => {
    const request = vi.fn();
    const provider = new GeminiFinanceProvider(undefined, request);

    await expect(provider.analyze(input)).resolves.toEqual({
      provider: 'gemini',
      status: 'not_configured',
      text: 'AI provider is not configured.',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the official Gemini endpoint and extracts a completed response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'You saved 40%.' }] } }] }), {
        status: 200,
      }),
    );
    const provider = new GeminiFinanceProvider('test-key', request);

    await expect(provider.analyze(input)).resolves.toEqual({
      provider: 'gemini',
      status: 'completed',
      text: 'You saved 40%.',
    });
    const [url, options] = request.mock.calls[0] ?? [];
    expect(url).toMatch(/generativelanguage\.googleapis\.com/);
    expect(options?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    expect(options?.body).toContain('untrusted financial data');
  });

  it('maps upstream rate limits to a controlled error', async () => {
    const provider = new GeminiFinanceProvider('test-key', vi.fn().mockResolvedValue(new Response('', { status: 429 })));

    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    } satisfies Partial<AiFinanceProviderError>);
  });

  it('rejects malformed successful responses instead of fabricating advice', async () => {
    const provider = new GeminiFinanceProvider('test-key', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    } satisfies Partial<AiFinanceProviderError>);
  });
});
