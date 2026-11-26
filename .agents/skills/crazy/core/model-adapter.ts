import crypto from 'node:crypto';
import { redactSecrets } from './security.ts';

export type AdapterKind =
  | 'offline-deterministic'
  | 'local-http'
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'google-compatible'
  | 'env-configured';

export interface ModelAdapterConfig {
  kind: AdapterKind;
  modelName: string;
  baseUrl?: string;
  endpointUrl?: string;
  envApiKeyName?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  enableCache?: boolean;
}

export interface AdapterGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  skipCache?: boolean;
}

export interface AdapterGenerationResponse {
  status: 'VERIFIED_ADAPTER_RESPONSE' | 'OFFLINE_FALLBACK' | 'CACHED_RESPONSE';
  adapterUsed: AdapterKind;
  modelName: string;
  content: string;
  cached: boolean;
  notes: string;
}

export interface AdapterUsageStats {
  aiRequestsAttempted: number;
  aiRequestsExecuted: number;
  cacheHits: number;
  offlineFallbacks: number;
}

export interface ModelProviderAdapter {
  readonly config: ModelAdapterConfig;
  isAvailable(): boolean;
  getUsageStats(): AdapterUsageStats;
  generate(request: AdapterGenerationRequest): Promise<AdapterGenerationResponse>;
}

/**
 * Default zero-dependency adapter requiring no local LLM, no GPU, and no paid API subscription.
 */
export class OfflineDeterministicAdapter implements ModelProviderAdapter {
  public readonly config: ModelAdapterConfig;
  private stats: AdapterUsageStats = {
    aiRequestsAttempted: 0,
    aiRequestsExecuted: 0,
    cacheHits: 0,
    offlineFallbacks: 0,
  };

  constructor(modelName = 'afo-deterministic-v3.1') {
    this.config = {
      kind: 'offline-deterministic',
      modelName,
      temperature: 0,
      enableCache: true,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  getUsageStats(): AdapterUsageStats {
    return { ...this.stats };
  }

  async generate(request: AdapterGenerationRequest): Promise<AdapterGenerationResponse> {
    this.stats.offlineFallbacks += 1;
    return {
      status: 'OFFLINE_FALLBACK',
      adapterUsed: 'offline-deterministic',
      modelName: this.config.modelName,
      content: `Deterministic offline execution policy ready for prompt (${request.userPrompt.length} chars). No remote LLM API invoked.`,
      cached: false,
      notes: 'Zero-cost offline mode active; external LLM calls are optional.',
    };
  }
}

/**
 * Configurable adapter for optional local HTTP (Ollama / llama.cpp) or remote OpenAI/Anthropic/Google-compatible
 * base URLs via env-configured API keys. Includes response caching and credential-safe error handling.
 */
export class ConfigurableModelAdapter implements ModelProviderAdapter {
  public readonly config: ModelAdapterConfig;
  private readonly fallback = new OfflineDeterministicAdapter();
  private readonly cache = new Map<string, AdapterGenerationResponse>();
  private stats: AdapterUsageStats = {
    aiRequestsAttempted: 0,
    aiRequestsExecuted: 0,
    cacheHits: 0,
    offlineFallbacks: 0,
  };

  constructor(config: ModelAdapterConfig) {
    this.config = { enableCache: true, ...config };
  }

  private resolveUrl(): string | undefined {
    const raw = this.config.endpointUrl || this.config.baseUrl;
    if (!raw) return undefined;
    if (this.config.kind === 'openai-compatible' && !raw.endsWith('/chat/completions')) {
      return `${raw.replace(/\/+$/, '')}/chat/completions`;
    }
    if (this.config.kind === 'anthropic-compatible' && !raw.endsWith('/messages')) {
      return `${raw.replace(/\/+$/, '')}/messages`;
    }
    return raw;
  }

  isAvailable(): boolean {
    if (this.config.kind === 'offline-deterministic') return true;
    const url = this.resolveUrl();
    if (!url) return false;
    if (this.config.kind === 'local-http') {
      return /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url);
    }
    const envName = this.config.envApiKeyName;
    return Boolean(envName && process.env[envName]);
  }

  getUsageStats(): AdapterUsageStats {
    return { ...this.stats };
  }

  clearCache(): void {
    this.cache.clear();
  }

  async generate(request: AdapterGenerationRequest): Promise<AdapterGenerationResponse> {
    if (this.config.kind === 'offline-deterministic' || !this.isAvailable()) {
      this.stats.offlineFallbacks += 1;
      return this.fallback.generate(request);
    }

    const cacheKey = crypto
      .createHash('sha256')
      .update(`${this.config.kind}|${this.config.modelName}|${request.systemPrompt}|${request.userPrompt}`)
      .digest('hex');

    if (this.config.enableCache && !request.skipCache) {
      const hit = this.cache.get(cacheKey);
      if (hit) {
        this.stats.cacheHits += 1;
        return { ...hit, status: 'CACHED_RESPONSE', cached: true };
      }
    }

    this.stats.aiRequestsAttempted += 1;
    const targetUrl = this.resolveUrl()!;

    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      const apiKey = this.config.envApiKeyName ? process.env[this.config.envApiKeyName] : undefined;

      let bodyPayload: Record<string, unknown>;
      if (this.config.kind === 'anthropic-compatible') {
        if (apiKey) headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        bodyPayload = {
          model: this.config.modelName,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
          max_tokens: this.config.maxTokens ?? 1024,
          temperature: this.config.temperature ?? 0.2,
        };
      } else {
        if (apiKey) headers.authorization = `Bearer ${apiKey}`;
        bodyPayload = {
          model: this.config.modelName,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: this.config.temperature ?? 0.2,
          max_tokens: this.config.maxTokens ?? 1024,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          content?: Array<{ text?: string }>;
          response?: string;
        };
        const text =
          json.choices?.[0]?.message?.content ??
          json.content?.[0]?.text ??
          json.response ??
          '';

        this.stats.aiRequestsExecuted += 1;
        const responseObj: AdapterGenerationResponse = {
          status: 'VERIFIED_ADAPTER_RESPONSE',
          adapterUsed: this.config.kind,
          modelName: this.config.modelName,
          content: text,
          cached: false,
          notes: `Served by ${this.config.kind} (${this.config.modelName}).`,
        };
        if (this.config.enableCache) {
          this.cache.set(cacheKey, responseObj);
        }
        return responseObj;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      this.stats.offlineFallbacks += 1;
      const fb = await this.fallback.generate(request);
      const safeErr = redactSecrets(err instanceof Error ? err.message : String(err));
      return {
        ...fb,
        notes: `Fallback triggered after provider error (${safeErr}).`,
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
    baseUrl: config.baseUrl,
    endpointUrl: config.endpointUrl,
    envApiKeyName: config.envApiKeyName,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    enableCache: config.enableCache,
  });
}
