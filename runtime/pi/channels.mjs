export const CHANNEL_APIS = new Set(['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']);
export const DEFAULT_CHANNEL_CONTEXT_WINDOW = 128000;
export const DEFAULT_CHANNEL_MAX_TOKENS = 32768;

export function inferModelReasoning(id) {
  if (typeof id !== 'string') return false;
  return /^(?:deepseek-(?:reasoner|r1|v3\.2|v4|flash)|qwq|o1|o3|o4)(?:$|[-_./])/i.test(id.trim())
    || /(?:^|[-_./])(?:thinking|reasoner|r1)(?:$|[-_./])/i.test(id.trim());
}

export function normalizeChannelBaseUrl(rawUrl, api) {
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

export function validateUserAgent(userAgent) {
  if (userAgent === undefined || userAgent === null || userAgent === '') return undefined;
  if (typeof userAgent !== 'string') throw new Error('Invalid User-Agent header');
  const trimmed = userAgent.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 512 || !/^[\x20-\x7E]+$/.test(trimmed)) {
    throw new Error('Invalid User-Agent header');
  }
  return trimmed;
}

/** Escape literal header values so pi-coding-agent resolveConfigValue never runs `!cmd` or `$ENV`. */
export function escapeConfigLiteral(value) {
  const escaped = value.split('$').join('$$');
  return escaped.startsWith('!') ? `$!${escaped.slice(1)}` : escaped;
}

export function validateChannel(channel) {
  if (!channel || !/^[a-zA-Z0-9_-]{1,80}$/.test(channel.id) || !CHANNEL_APIS.has(channel.api)) {
    throw new Error('Invalid Pi channel');
  }
  return normalizeChannelBaseUrl(channel.baseUrl, channel.api);
}

export function registerChannel(runtime, channel, modelId, userAgent) {
  const baseUrl = validateChannel(channel);
  const ua = validateUserAgent(userAgent);
  const model = channel.models?.find((item) => item.id === modelId);
  if (!model || !model.id || model.id.length > 256 || !Number.isInteger(model.contextWindow) ||
      model.contextWindow < 1024 || model.contextWindow > 10000000 || !Number.isInteger(model.maxTokens) ||
      model.maxTokens < 1 || model.maxTokens > model.contextWindow) throw new Error('Invalid Pi channel model');
  // Namespace custom providers so two endpoints using the same model id never collide.
  const provider = `agentikz-${channel.id}`;
  const isCustomOpenAiGateway = channel.api === 'openai-completions' && !baseUrl.includes('api.openai.com');
  const isDeepSeek = /deepseek/i.test(model.id);
  runtime.registerProvider(provider, { baseUrl, api: channel.api,
    authHeader: channel.api.startsWith('openai-'),
    ...(ua ? { headers: { 'User-Agent': escapeConfigLiteral(ua) } } : {}),
    models: [{ id: model.id, name: model.name || model.id,
      reasoning: model.reasoning === true || (isCustomOpenAiGateway && isDeepSeek),
      input: model.supportsImages ? ['text', 'image'] : ['text'],
      contextWindow: model.contextWindow, maxTokens: model.maxTokens,
      ...(isCustomOpenAiGateway ? {
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          maxTokensField: 'max_tokens',
          ...(isDeepSeek ? {
            requiresReasoningContentOnAssistantMessages: true,
            thinkingFormat: 'deepseek',
            supportsReasoningEffort: false,
          } : {}),
        },
      } : {}),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  });
  return provider;
}

/** Discovery is user-initiated. Never forward credentials through redirects or error bodies. */
export async function fetchChannelModels(channel, apiKey, fetchImpl = fetch, userAgent = undefined) {
  const base = validateChannel(channel);
  const ua = validateUserAgent(userAgent);
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('请先保存该渠道的 API Key。');
  const url = new URL(base + (channel.api === 'anthropic-messages' && !/\/v1$/.test(base) ? '/v1/models' : '/models'));
  const headers = {
    ...(channel.api === 'anthropic-messages'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : channel.api === 'google-generative-ai' ? { 'x-goog-api-key': apiKey } : { authorization: `Bearer ${apiKey}` }),
    ...(ua ? { 'user-agent': ua } : {}),
  };
  const items = [];
  const seenPages = new Set();
  for (let page = 0; page < 20; page++) {
    if (seenPages.has(url.href)) throw new Error('模型列表分页重复，请手动添加模型。');
    seenPages.add(url.href);
    let response;
    try { response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('获取模型失败：请检查渠道地址、网络及 TLS 证书；不会跟随重定向。'); }
    if (!response.ok) throw new Error(`获取模型失败（HTTP ${response.status}），请检查地址和密钥；不支持模型列表的渠道可手动添加。`);
    let data;
    try {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) throw new Error('limit');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new Error('模型列表不是有效 JSON 或超过 2 MiB；请检查 API 基础地址。'); }
    const list = Array.isArray(data) ? data : data.data ?? data.models;
    if (!Array.isArray(list)) throw new Error('渠道未返回可识别的模型列表，可手动添加模型 ID。');
    if (items.length + list.length > 2000) throw new Error('模型列表超过 2000 项，请手动添加所需模型。');
    items.push(...list);
    const cursor = channel.api === 'google-generative-ai' ? data.nextPageToken
      : channel.api === 'anthropic-messages' && data.has_more ? data.last_id : undefined;
    if (!cursor) {
      const models = new Map();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (channel.api === 'google-generative-ai' && Array.isArray(item.supportedGenerationMethods) &&
            !item.supportedGenerationMethods.includes('generateContent')) continue;
        const rawId = item.id ?? item.name;
        if (typeof rawId !== 'string') continue;
        const id = channel.api === 'google-generative-ai' ? rawId.replace(/^models\//, '') : rawId;
        if (!id.trim() || id.length > 256) continue;
        const rawContext = item.context_length ?? item.max_context_length ?? item.inputTokenLimit;
        const contextWindow = Number.isInteger(rawContext)
          ? Math.max(1024, Math.min(10000000, rawContext)) : DEFAULT_CHANNEL_CONTEXT_WINDOW;
        const rawMaxOut = item.max_completion_tokens ?? item.max_output_tokens ?? item.outputTokenLimit;
        models.set(id, { id, name: String(item.display_name ?? item.displayName ?? item.name ?? id).slice(0, 256),
          reasoning: typeof item.reasoning === 'boolean' ? item.reasoning : inferModelReasoning(id),
          supportsImages: item.architecture?.input_modalities?.includes('image') === true,
          contextWindow, maxTokens: Math.min(contextWindow, Number.isInteger(rawMaxOut) ? Math.max(1, rawMaxOut) : DEFAULT_CHANNEL_MAX_TOKENS) });
      }
      return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
    if (typeof cursor !== 'string' || cursor.length > 1024) throw new Error('模型分页参数无效。');
    url.searchParams.set(channel.api === 'google-generative-ai' ? 'pageToken' : 'after_id', cursor);
  }
  throw new Error('模型分页超过上限，请手动添加模型。');
}
