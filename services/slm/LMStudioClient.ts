import {
  ISLMClient,
  SLMConfig,
  ChatMessage,
  OpenAITool,
  SLMCompletionResponse
} from './SLMService.types';

/**
 * Normalizes OpenAI/LM Studio base URL to ensure it always targets the /v1 API namespace.
 * Handles inputs like "http://localhost:1234", "http://localhost:1234/", and "http://localhost:1234/v1".
 */
export function normalizeOpenAIBaseUrl(baseUrl: string): string {
  let cleaned = (baseUrl || 'http://localhost:1234/v1').trim().replace(/\/+$/, '');
  if (!cleaned.endsWith('/v1')) {
    cleaned = `${cleaned}/v1`;
  }
  return cleaned;
}

/**
 * Client for local LM Studio instance (or any OpenAI-compatible local server like Ollama / vLLM).
 * Follows Single Responsibility Principle (SRP) by handling network calls to local model server.
 */
export class LMStudioClient implements ISLMClient {
  public async isAvailable(baseUrl: string = 'http://localhost:1234/v1'): Promise<boolean> {
    try {
      const url = normalizeOpenAIBaseUrl(baseUrl);
      const response = await fetch(`${url}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  public async listModels(baseUrl: string = 'http://localhost:1234/v1'): Promise<string[]> {
    try {
      const url = normalizeOpenAIBaseUrl(baseUrl);
      const response = await fetch(`${url}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });

      if (!response.ok) return [];
      const json = await response.json();
      if (Array.isArray(json.data)) {
        return json.data.map((m: any) => m.id);
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  public async chatWithTools(
    messages: ChatMessage[],
    tools: OpenAITool[],
    config: SLMConfig
  ): Promise<SLMCompletionResponse> {
    const url = normalizeOpenAIBaseUrl(config.baseUrl);
    const endpoint = `${url}/chat/completions`;

    let modelName = config.modelName;
    if (!modelName || modelName === 'local-model') {
      try {
        const models = await this.listModels(url);
        const active = models.find((m) => !m.toLowerCase().includes('embed'));
        if (active) modelName = active;
      } catch (_) {
        // Fallback to local-model if listing fails
      }
    }

    const payload: any = {
      model: modelName || 'local-model',
      messages,
      temperature: config.temperature ?? 0.2
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer lm-studio'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice || !choice.message) {
        throw new Error('LM Studio returned an empty response.');
      }

      return {
        message: {
          role: 'assistant',
          content: choice.message.content || null,
          tool_calls: choice.message.tool_calls || undefined
        },
        finishReason: choice.finish_reason || 'stop'
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('LM Studio request timed out.');
      }
      if (err.message && err.message.includes('Failed to fetch')) {
        throw new Error(
          `Cannot connect to LM Studio at ${config.baseUrl}. Please verify LM Studio Local Server is running and port 1234 is open.`
        );
      }
      throw err;
    }
  }
}
