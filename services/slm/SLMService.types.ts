/**
 * SLM (Small Language Model) & Toolset Type Definitions
 * Compatible with OpenAI Local API Spec (LM Studio, Ollama, vLLM, LocalAI).
 * Follows SOLID principles (Interface Segregation and Dependency Inversion).
 */

export interface OpenAIToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OpenAITool {
  type: 'function';
  function: OpenAIToolFunction;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON-encoded arguments
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface SLMCompletionResponse {
  message: ChatMessage;
  finishReason: string;
}

export interface SLMConfig {
  baseUrl: string; // e.g. "http://localhost:1234/v1" or LAN IP "http://192.168.1.X:1234/v1"
  modelName: string; // e.g. "qwen2.5-7b-instruct", "phi-3", "llama-3.2-3b"
  temperature?: number;
}

export interface ISLMClient {
  isAvailable(baseUrl?: string): Promise<boolean>;
  listModels?(baseUrl?: string): Promise<string[]>;
  chatWithTools(
    messages: ChatMessage[],
    tools: OpenAITool[],
    config: SLMConfig
  ): Promise<SLMCompletionResponse>;
}
