import net from 'node:net';

export const CHANNEL_APIS = new Set(['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']);
export const THINKING_LEVELS = new Set(['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export const DEFAULT_CHANNEL_CONTEXT_WINDOW = 128000;
export const DEFAULT_CHANNEL_MAX_TOKENS = 32768;

const SAFE_ERROR_CODES = [
  'authentication_error', 'invalid_api_key', 'permission_error', 'insufficient_quota',
  'model_not_found', 'not_found_error', 'invalid_request_error', 'context_length_exceeded',
  'rate_limit_error', 'rate_limit_exceeded', 'overloaded_error', 'server_error',
  'content_filter', 'network_error', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT',
  'ECONNRESET', 'CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'Unsupported proxy protocol', 'Invalid proxy URL',
];

/**
 * Extract only numeric HTTP status codes and fixed machine error classifiers.
 * Never echo raw provider messages, which could reflect credentials or prompts.
 */
export function formatSafeModelFailure(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const statusMatch = text.match(/\b(?:HTTP\s+|status(?:\s+code)?[:\s]+|^)(4\d\d|5\d\d)\b/i)
    ?? text.match(/\b(400|401|402|403|404|408|409|413|422|429|500|502|503|504|529)\b/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const code = SAFE_ERROR_CODES.find((candidate) => text.includes(candidate));
  const isTimeout = !code && /\b(?:timed?\s*out|TimeoutError|AbortError)\b/i.test(text);
  const isNetwork = !code && /\b(?:connection error|fetch failed|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)\b/i.test(text);

  const tags = [];
  if (status) tags.push(`HTTP ${status}`);
  if (code) tags.push(code);
  else if (isTimeout) tags.push('timeout');
  else if (isNetwork) tags.push('network_error');

  let hint = '';
  if (status === 401 || status === 403 || code === 'authentication_error' || code === 'invalid_api_key' || code === 'permission_error') {
    hint = '请检查 API Key 是否有效及是否有该模型权限';
  } else if (status === 402 || code === 'insufficient_quota') {
    hint = '账户额度不足或计费受限';
  } else if (status === 404 || code === 'model_not_found' || code === 'not_found_error') {
    hint = '请检查 API 基础地址路径（如 /v1）是否与所选协议匹配，以及模型 ID 是否存在';
  } else if (status === 429 || code === 'rate_limit_error' || code === 'rate_limit_exceeded') {
    hint = '请求触发速率或并发限制，请稍后重试';
  } else if (status === 400 || status === 413 || status === 422 || code === 'invalid_request_error' || code === 'context_length_exceeded') {
    hint = '请求参数或上下文长度被网关拒绝，请尝试将「思考强度」切换为「默认（不传参数）」或该模型支持的档位，或检查协议类型与最大输出 tokens';
  } else if ((status && status >= 500) || code === 'overloaded_error' || code === 'server_error') {
    hint = '上游模型网关暂时异常或过载，请稍后重试';
  } else if (code || isTimeout || isNetwork) {
    hint = '网络连接、代理或 TLS 证书失败，请检查网关地址与代理设置';
  }

  if (!tags.length && !hint) {
    return 'Model request failed; check provider, model and credentials';
  }
  const detail = tags.length ? ` (${tags.join(', ')})` : '';
  return `Model request failed${detail}; check provider, model and credentials${hint ? ` — ${hint}` : ''}`;
}

export function normalizeHttpProxyUrl(raw) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\x00-\x1f\x7f]/.test(trimmed)) return undefined;
  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return undefined;
    return url.pathname === '/' && !url.search && !url.hash ? url.href.replace(/\/$/, '') : url.href;
  } catch {
    return undefined;
  }
}

function isLoopbackHost(hostname) {
  const clean = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return clean === '127.0.0.1' || clean === 'localhost' || clean === '::1';
}

export function probeTcpPort(host, port, timeoutMs = 250) {
  return new Promise((resolve) => {
    const cleanHost = String(host || '').replace(/^\[|\]$/g, '');
    const socket = net.createConnection({ host: cleanHost, port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function mergeLoopbackNoProxy(existing) {
  const items = String(existing || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const required of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
    if (!items.some((item) => item.toLowerCase() === required)) items.push(required);
  }
  return items.join(',');
}

/**
 * Normalize HTTP(S) proxy env vars so bare Windows `127.0.0.1:7890` or `socks5://`
 * never crashes Undici's EnvHttpProxyAgent, and drop dead ambient local proxies
 * when Clash/v2rayN is closed and no explicit proxy was configured in AgenTikZ.
 */
export async function sanitizeProxyEnvironment(env = process.env, { probeFn = probeTcpPort } = {}) {
  const mode = env.AGEN_PI_PROXY_MODE === 'explicit' ? 'explicit' : 'ambient';
  let httpProxy = normalizeHttpProxyUrl(env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy);
  let httpsProxy = normalizeHttpProxyUrl(env.HTTPS_PROXY || env.https_proxy || httpProxy);

  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    delete env[key];
  }
  const noProxy = mergeLoopbackNoProxy(env.NO_PROXY || env.no_proxy);
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;

  if (mode !== 'explicit' && probeFn) {
    const cache = new Map();
    const checkAlive = async (proxyStr) => {
      if (!proxyStr) return undefined;
      const url = new URL(proxyStr);
      if (!isLoopbackHost(url.hostname)) return proxyStr;
      const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
      const key = `${url.hostname}:${port}`;
      if (!cache.has(key)) cache.set(key, await probeFn(url.hostname, port));
      return cache.get(key) ? proxyStr : undefined;
    };
    httpProxy = await checkAlive(httpProxy);
    httpsProxy = await checkAlive(httpsProxy);
  }

  if (httpProxy) {
    env.HTTP_PROXY = httpProxy;
    env.http_proxy = httpProxy;
  }
  if (httpsProxy) {
    env.HTTPS_PROXY = httpsProxy;
    env.https_proxy = httpsProxy;
  }
  return { mode, httpProxy, httpsProxy };
}

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

export function registerChannel(runtime, channel, modelId, userAgent, thinkingLevel = 'auto') {
  const baseUrl = validateChannel(channel);
  const ua = validateUserAgent(userAgent);
  const level = THINKING_LEVELS.has(thinkingLevel) ? thinkingLevel : 'auto';
  const model = channel.models?.find((item) => item.id === modelId);
  if (!model || !model.id || model.id.length > 256 || !Number.isInteger(model.contextWindow) ||
      model.contextWindow < 1024 || model.contextWindow > 10000000 || !Number.isInteger(model.maxTokens) ||
      model.maxTokens < 1 || model.maxTokens > model.contextWindow) throw new Error('Invalid Pi channel model');
  // Namespace custom providers so two endpoints using the same model id never collide.
  const provider = `agentikz-${channel.id}`;
  const lowerUrl = baseUrl.toLowerCase();
  const isCustomOpenAiGateway = channel.api === 'openai-completions' && !lowerUrl.includes('api.openai.com');
  const isOfficialDeepSeek = lowerUrl.includes('deepseek.com');
  const isDeepSeek = /deepseek/i.test(model.id) || isOfficialDeepSeek;
  // 'auto' omits outgoing thinking parameters so strict gateways/models never reject unsupported fields,
  // while incoming reasoning_content/thinking deltas are still streamed and replayed across tool turns.
  const effectiveReasoning = level === 'auto'
    ? false
    : level === 'off'
      ? model.reasoning === true
      : true;
  runtime.registerProvider(provider, { baseUrl, api: channel.api,
    authHeader: channel.api.startsWith('openai-'),
    ...(ua ? { headers: { 'User-Agent': escapeConfigLiteral(ua) } } : {}),
    models: [{ id: model.id, name: model.name || model.id,
      reasoning: effectiveReasoning,
      ...(effectiveReasoning ? { thinkingLevelMap: { xhigh: 'xhigh', max: 'max' } } : {}),
      input: model.supportsImages ? ['text', 'image'] : ['text'],
      contextWindow: model.contextWindow, maxTokens: model.maxTokens,
      ...(isCustomOpenAiGateway ? {
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          maxTokensField: 'max_tokens',
          ...(isDeepSeek ? { requiresReasoningContentOnAssistantMessages: true } : {}),
          ...(isOfficialDeepSeek ? { thinkingFormat: 'deepseek', supportsReasoningEffort: false } : {}),
          ...(level === 'auto' ? { supportsReasoningEffort: false } : {}),
        },
      } : {}),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  });
  return provider;
}

/** Fast minimal probe against the actual model completion endpoint. Never echoes raw error bodies. */
export async function testChannelConnection(channel, apiKey, modelId, fetchImpl = fetch, userAgent = undefined, thinkingLevel = 'auto') {
  const base = validateChannel(channel);
  const ua = validateUserAgent(userAgent);
  const level = THINKING_LEVELS.has(thinkingLevel) ? thinkingLevel : 'auto';
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('请先保存该渠道的 API Key。');
  const targetModel = typeof modelId === 'string' && modelId.trim()
    ? modelId.trim()
    : (channel.defaultModelId || channel.models?.[0]?.id || '').trim();
  if (!targetModel || targetModel.length > 256) throw new Error('请先添加或选择至少一个模型 ID 后再测试连通性。');
  const modelMeta = channel.models?.find((item) => item.id === targetModel);

  let url;
  let headers;
  let body;
  if (channel.api === 'anthropic-messages') {
    url = `${base}${/\/v1$/.test(base) ? '/messages' : '/v1/messages'}`;
    headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    body = level !== 'auto' && level !== 'off'
      ? { model: targetModel, max_tokens: 2048, thinking: { type: 'enabled', budget_tokens: 1024 }, messages: [{ role: 'user', content: 'ping' }] }
      : { model: targetModel, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] };
  } else if (channel.api === 'google-generative-ai') {
    url = `${base}/models/${encodeURIComponent(targetModel)}:generateContent`;
    headers = { 'x-goog-api-key': apiKey, 'content-type': 'application/json' };
    const generationConfig = level !== 'auto' && level !== 'off'
      ? { maxOutputTokens: 256, thinkingConfig: { includeThoughts: true, thinkingBudget: level === 'minimal' ? 128 : 512 } }
      : level === 'off' && modelMeta?.reasoning === true
        ? { maxOutputTokens: 32, thinkingConfig: { thinkingBudget: 0 } }
        : { maxOutputTokens: 8 };
    body = { contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig };
  } else if (channel.api === 'openai-responses') {
    url = `${base}/responses`;
    headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
    body = {
      model: targetModel,
      input: 'ping',
      max_output_tokens: level !== 'auto' && level !== 'off' ? 64 : 16,
      store: false,
      ...(level !== 'auto' && level !== 'off'
        ? { reasoning: { effort: level === 'max' ? 'xhigh' : level } }
        : level === 'off' && modelMeta?.reasoning === true
          ? { reasoning: { effort: 'none' } }
          : {}),
    };
  } else {
    url = `${base}/chat/completions`;
    headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
    const lowerUrl = base.toLowerCase();
    const extra = {};
    if (level !== 'auto') {
      if (lowerUrl.includes('deepseek.com')) {
        if (level !== 'off') extra.thinking = { type: 'enabled' };
        else if (modelMeta?.reasoning === true) extra.thinking = { type: 'disabled' };
      } else if (lowerUrl.includes('openrouter.ai')) {
        if (level !== 'off') extra.reasoning = { effort: level };
        else if (modelMeta?.reasoning === true) extra.reasoning = { effort: 'none' };
      } else if (lowerUrl.includes('open.bigmodel.cn') || lowerUrl.includes('api.z.ai')) {
        if (level !== 'off') extra.thinking = { type: 'enabled', clear_thinking: false };
        else if (modelMeta?.reasoning === true) extra.thinking = { type: 'disabled' };
      } else if (level !== 'off') {
        extra.reasoning_effort = level;
      }
    }
    body = {
      model: targetModel,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: level !== 'auto' && level !== 'off' ? 32 : 8,
      stream: false,
      ...extra,
    };
  }
  if (ua) headers['user-agent'] = ua;

  const startedAt = Date.now();
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST', headers, body: JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    const detail = `${error?.name || ''} ${error?.message || ''} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`;
    throw new Error(formatSafeModelFailure(detail));
  }

  let rawText = '';
  try {
    rawText = (await response.text()).slice(0, 65536);
  } catch {}

  if (!response.ok) {
    throw new Error(formatSafeModelFailure(`HTTP ${response.status} ${rawText}`));
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('网关返回了非 JSON 内容（可能是网页或错误的基础地址），请检查协议类型与 API 地址。');
  }
  if (parsed && typeof parsed === 'object' && parsed.error) {
    const errClassifier = typeof parsed.error === 'object'
      ? `${parsed.error.type || ''} ${parsed.error.code || ''}`
      : 'invalid_request_error';
    throw new Error(formatSafeModelFailure(`HTTP 400 ${errClassifier}`));
  }

  return {
    ok: true,
    latencyMs: Math.max(1, Date.now() - startedAt),
    model: targetModel,
    baseUrl: base,
    api: channel.api,
    thinkingLevel: level,
  };
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
