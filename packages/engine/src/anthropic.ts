import Anthropic from '@anthropic-ai/sdk';

export type MessageParam = Anthropic.MessageParam;
export type ContentBlock = Anthropic.ContentBlock;
export type ToolUseBlock = Anthropic.ToolUseBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
export type Tool = Anthropic.Tool;
export type Message = Anthropic.Message;

/** Tracks cumulative token usage and tool call counts across the session. */
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

/**
 * Thin wrapper around the Anthropic Messages API.
 * Provides retry-with-exponential-backoff and aggregated usage tracking.
 */
export class AnthropicClient {
  private readonly client: Anthropic;
  private readonly stats: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
  };

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'],
    });
  }

  /**
   * Creates a message with automatic retry on transient errors.
   * Tracks token usage on every successful call.
   */
  async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    const response = await this.withRetry(() =>
      this.client.messages.create(params),
    );

    this.stats.inputTokens += response.usage.input_tokens;
    this.stats.outputTokens += response.usage.output_tokens;

    return response;
  }

  /** Returns a snapshot of cumulative usage since this client was constructed. */
  getStats(): Readonly<UsageStats> {
    return { ...this.stats };
  }

  /** Increments the tool call counter — callers must do this after each tool execution. */
  recordToolCall(): void {
    this.stats.toolCalls += 1;
  }

  /**
   * Retries `fn` up to `maxAttempts` times with exponential backoff.
   * Only retries on 429 (rate limit) and 5xx (server error) responses.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 4,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;

        if (!isRetryable(err)) throw err;
        if (attempt === maxAttempts) break;

        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
        const jitter = Math.random() * 500;
        await sleep(delayMs + jitter);
      }
    }

    throw lastError;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    return err.status === 429 || (err.status >= 500 && err.status < 600);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
