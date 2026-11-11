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

export const DEFAULT_PI_CONTEXT_WINDOW = 128000;
export const DEFAULT_PI_MAX_TOKENS = 32768;

export function inferPiModelReasoning(id: string): boolean {
  return /^(?:deepseek-(?:reasoner|r1|v3\.2|v4|flash)|qwq|o1|o3|o4)(?:$|[-_./])/i.test(id.trim())
    || /(?:^|[-_./])(?:thinking|reasoner|r1)(?:$|[-_./])/i.test(id.trim());
}

export function normalizePiChannelBaseUrl(rawUrl: string, api: PiApi): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Invalid Pi channel URL');
  }
  const url = new URL(rawUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid Pi channel URL');
  }
  let pathname = url.pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/(chat\/completions|responses|models)$/i, '');
  if (api === 'anthropic-messages') {
    pathname = pathname.replace(/\/v1\/messages$/i, '').replace(/\/messages$/i, '').replace(/\/v1$/i, '');
  } else if (api === 'openai-completions' || api === 'openai-responses') {
    pathname = pathname.replace(/\/v1\/messages$/i, '/v1').replace(/\/messages$/i, '');
    if (!pathname) pathname = '/v1';
  } else if (api === 'google-generative-ai') {
    if (!pathname) pathname = '/v1beta';
  }
  url.pathname = pathname || '/';
  return url.toString().replace(/\/+$/, '');
}

export function newPiModel(id: string, name = id): PiChannelModel {
  return {
    id,
    name,
    reasoning: inferPiModelReasoning(id),
    supportsImages: false,
    contextWindow: DEFAULT_PI_CONTEXT_WINDOW,
    maxTokens: DEFAULT_PI_MAX_TOKENS,
  };
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
      baseUrl = normalizePiChannelBaseUrl(item.baseUrl, item.api);
    } catch { return []; }
    ids.add(item.id);
    const modelIds = new Set<string>();
    const models: PiChannelModel[] = (Array.isArray(item.models) ? item.models : []).slice(0, 2000).flatMap((model: Partial<PiChannelModel>) => {
      if (!model || typeof model.id !== 'string' || !model.id.trim() || model.id.length > 256 || modelIds.has(model.id.trim())) return [];
      const id = model.id.trim();
      modelIds.add(id);
      const contextWindow = Number.isInteger(model.contextWindow) && model.contextWindow! >= 1024 && model.contextWindow! <= 10000000 ? model.contextWindow! : DEFAULT_PI_CONTEXT_WINDOW;
      const maxTokens = Number.isInteger(model.maxTokens) && model.maxTokens! >= 1 ? Math.min(model.maxTokens!, contextWindow) : Math.min(DEFAULT_PI_MAX_TOKENS, contextWindow);
      return [{ id, name: typeof model.name === 'string' ? model.name.slice(0, 256) : id,
        reasoning: model.reasoning === true, supportsImages: model.supportsImages === true, contextWindow, maxTokens }];
    });
    return [{ id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 100) : item.id,
      provider: typeof item.provider === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item.provider) ? item.provider : 'openai',
      api: item.api, baseUrl, models,
      defaultModelId: typeof item.defaultModelId === 'string' && modelIds.has(item.defaultModelId) ? item.defaultModelId : models[0]?.id }];
  });
}
