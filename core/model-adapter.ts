export type AdapterKind = 'offline-deterministic' | 'local-http' | 'env-configured';

export interface ModelAdapterConfig {
  kind: AdapterKind;
  modelName: string;
  endpointUrl?: string;
  envApiKeyName?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AdapterGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface AdapterGenerationResponse {
  status: 'VERIFIED_ADAPTER_RESPONSE' | 'OFFLINE_FALLBACK';
  adapterUsed: AdapterKind;
  modelName: string;
  content: string;
  notes: string;
}

export interface ModelProviderAdapter {
  readonly config: ModelAdapterConfig;
  isAvailable(): boolean;
  generate(request: AdapterGenerationRequest): Promise<AdapterGenerationResponse>;
}

/**
 * Default zero-dependency adapter requiring no local LLM, no GPU, and no paid API subscription.
 */
export class OfflineDeterministicAdapter implements ModelProviderAdapter {
  public readonly config: ModelAdapterConfig;

  constructor(modelName = 'afo-deterministic-v3') {
    this.config = {
      kind: 'offline-deterministic',
      modelName,
      temperature: 0,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async generate(request: AdapterGenerationRequest): Promise<AdapterGenerationResponse> {
    return {
      status: 'OFFLINE_FALLBACK',
      adapterUsed: 'offline-deterministic',
      modelName: this.config.modelName,
      content: `Deterministic offline execution policy ready for prompt (${request.userPrompt.length} chars). No remote LLM API invoked.`,
      notes: 'Zero-cost offline mode active; external LLM calls are optional.',
    };
  }
}

/**
 * Configurable adapter for optional local HTTP (e.g., Ollama / llama.cpp) or env-configured endpoints.
 * Falls back gracefully to OfflineDeterministicAdapter when unconfigured or unreachable.
 */
export class ConfigurableModelAdapter implements ModelProviderAdapter {
  public readonly config: ModelAdapterConfig;
  private readonly fallback = new OfflineDeterministicAdapter();

  constructor(config: ModelAdapterConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    if (this.config.kind === 'offline-deterministic') return true;
    if (this.config.kind === 'local-http') {
      return Boolean(this.config.endpointUrl && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(this.config.endpointUrl));
    }
    if (this.config.kind === 'env-configured') {
      const envName = this.config.envApiKeyName;
      return Boolean(envName && process.env[envName] && this.config.endpointUrl);
    }
    return false;
  }

  async generate(request: AdapterGenerationRequest): Promise<AdapterGenerationResponse> {
    if (!this.isAvailable() || this.config.kind === 'offline-deterministic') {
      return this.fallback.generate(request);
    }

    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.config.kind === 'env-configured' && this.config.envApiKeyName) {
        const key = process.env[this.config.envApiKeyName];
        if (key) headers.authorization = `Bearer ${key}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
      try {
        const res = await fetch(this.config.endpointUrl!, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.modelName,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            temperature: this.config.temperature ?? 0.2,
            max_tokens: this.config.maxTokens ?? 1024,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          response?: string;
        };
        const text = json.choices?.[0]?.message?.content ?? json.response ?? '';
        return {
          status: 'VERIFIED_ADAPTER_RESPONSE',
          adapterUsed: this.config.kind,
          modelName: this.config.modelName,
          content: text,
          notes: `Served by ${this.config.kind} (${this.config.modelName}).`,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const fb = await this.fallback.generate(request);
      return {
        ...fb,
        notes: `Fallback triggered after provider error (${err instanceof Error ? err.message : String(err)}).`,
      };
    }
  }
}

export function createModelAdapter(config?: Partial<ModelAdapterConfig>): ModelProviderAdapter {
  if (!config || !config.kind || config.kind === 'offline-deterministic') {
    return new OfflineDeterministicAdapter(config?.modelName);
  }
  return new ConfigurableModelAdapter({
    kind: config.kind,
    modelName: config.modelName ?? 'custom-model',
    endpointUrl: config.endpointUrl,
    envApiKeyName: config.envApiKeyName,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
  });
}
