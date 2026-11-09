export type PiApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai';

export interface PiChannelModel {
  id: string;
  name: string;
  reasoning: boolean;
  supportsImages: boolean;
  contextWindow: number;
  maxTokens: number;
}

/** Credentials are stored separately in the OS keychain, keyed by channel id. */
export interface PiChannel {
  id: string;
  name: string;
  provider: string;
  api: PiApi;
  baseUrl: string;
  defaultModelId?: string;
  models: PiChannelModel[];
}

export const PI_APIS: Array<{ id: PiApi; name: string }> = [
  { id: 'openai-completions', name: 'OpenAI 兼容 · Chat Completions' },
  { id: 'openai-responses', name: 'OpenAI 兼容 · Responses' },
  { id: 'anthropic-messages', name: 'Anthropic · Messages' },
  { id: 'google-generative-ai', name: 'Google · Generative AI' },
];

export function newPiModel(id: string, name = id): PiChannelModel {
  return { id, name, reasoning: false, supportsImages: false, contextWindow: 32768, maxTokens: 4096 };
}

/** Explicit allowlist: pasted/imported objects must never persist a nested API key. */
export function sanitizePiChannels(value: unknown): PiChannel[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id) ||
        !PI_APIS.some((api) => api.id === item.api)) return [];
    // URL credentials, query strings and fragments are not configuration storage.
    let baseUrl = '';
    try {
      const url = new URL(item.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return [];
      baseUrl = url.toString().replace(/\/+$/, '');
    } catch { return []; }
    ids.add(item.id);
    const modelIds = new Set<string>();
    const models: PiChannelModel[] = (Array.isArray(item.models) ? item.models : []).slice(0, 2000).flatMap((model: Partial<PiChannelModel>) => {
      if (!model || typeof model.id !== 'string' || !model.id.trim() || model.id.length > 256 || modelIds.has(model.id.trim())) return [];
      const id = model.id.trim();
      modelIds.add(id);
      const contextWindow = Number.isInteger(model.contextWindow) && model.contextWindow! >= 1024 && model.contextWindow! <= 10000000 ? model.contextWindow! : 32768;
      const maxTokens = Number.isInteger(model.maxTokens) && model.maxTokens! >= 1 ? Math.min(model.maxTokens!, contextWindow) : Math.min(4096, contextWindow);
      return [{ id, name: typeof model.name === 'string' ? model.name.slice(0, 256) : id,
        reasoning: model.reasoning === true, supportsImages: model.supportsImages === true, contextWindow, maxTokens }];
    });
    return [{ id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 100) : item.id,
      provider: typeof item.provider === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item.provider) ? item.provider : 'openai',
      api: item.api, baseUrl, models,
      defaultModelId: typeof item.defaultModelId === 'string' && modelIds.has(item.defaultModelId) ? item.defaultModelId : models[0]?.id }];
  });
}
