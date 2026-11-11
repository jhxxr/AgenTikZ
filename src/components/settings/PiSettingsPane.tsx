import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolveEffectiveUserAgent, useSettingsStore } from '../../store/useSettingsStore';
import { usePiStore } from '../../store/usePiStore';
import { useAgentStore } from '../../store/useAgentStore';
import { PI_APIS, newPiModel, normalizePiChannelBaseUrl, type PiApi, type PiChannel, type PiChannelModel } from '../../types/pi';

const PRESETS = [
  { provider: 'openai', name: 'OpenAI / 兼容渠道', api: 'openai-completions', baseUrl: 'https://api.openai.com/v1' },
  { provider: 'anthropic', name: 'Anthropic', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com' },
  { provider: 'google', name: 'Google Gemini', api: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { provider: 'openrouter', name: 'OpenRouter', api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1' },
  { provider: 'deepseek', name: 'DeepSeek', api: 'openai-completions', baseUrl: 'https://api.deepseek.com/v1' },
] as const;
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs';
const buttonClass = 'rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-50';

function tryNormalizeUrl(raw: string, api: PiApi): string | null {
  try {
    return normalizePiChannelBaseUrl(raw, api);
  } catch {
    return null;
  }
}

export const PiSettingsPane: React.FC = () => {
  const { piChannels, piActiveChannelId, piModel, piThinkingLevel, proxyEnabled, proxyUrl, userAgentPreset, customUserAgent, updateSettings } = useSettingsStore(useShallow((s) => ({
    piChannels: s.piChannels, piActiveChannelId: s.piActiveChannelId, piModel: s.piModel,
    piThinkingLevel: s.piThinkingLevel, proxyEnabled: s.proxyEnabled, proxyUrl: s.proxyUrl,
    userAgentPreset: s.userAgentPreset, customUserAgent: s.customUserAgent, updateSettings: s.updateSettings,
  })));
  const { models, isProbing, error } = usePiStore();
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [preset, setPreset] = useState(() => Math.max(0,
    PRESETS.findIndex((item) => item.provider === useSettingsStore.getState().piProvider)));
  const [manualId, setManualId] = useState('');
  const [discovered, setDiscovered] = useState<PiChannelModel[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const channel = piChannels.find((item) => item.id === piActiveChannelId);
  const activeId = useRef(piActiveChannelId);
  activeId.current = piActiveChannelId;
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const disabled = busy || isStreaming;
  useEffect(() => {
    let current = true;
    setApiKey(''); setHasKey(null); setNotice(''); setDiscovered([]); setChecked([]); setManualId(''); setFilter('');
    setUrlDraft(channel?.baseUrl ?? '');
    if (desktop && channel) void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke<boolean>('pi_has_api_key', { provider: channel.id }))
      .then((saved) => { if (current) setHasKey(saved); })
      .catch(() => { if (current) setNotice('系统凭据状态读取失败。'); });
    return () => { current = false; };
  }, [piActiveChannelId, desktop]); // Only channel switches reset drafts and credential state.

  const patchChannel = (patch: Partial<PiChannel>) => {
    if (!channel) return;
    const state = useSettingsStore.getState();
    updateSettings({ piChannels: state.piChannels.map((item) => item.id === channel.id ? { ...item, ...patch } : item) });
  };
  const addModels = (additions: PiChannelModel[]) => {
    if (!channel) return;
    const unique = new Map(channel.models.map((model) => [model.id, model]));
    for (const model of additions) if (!unique.has(model.id)) unique.set(model.id, model);
    const nextModelId = (piModel && unique.has(piModel)) ? piModel : (additions[0]?.id ?? [...unique.keys()][0] ?? '');
    const state = useSettingsStore.getState();
    updateSettings({
      piChannels: state.piChannels.map((item) =>
        item.id === channel.id ? { ...item, models: [...unique.values()], defaultModelId: nextModelId || undefined } : item
      ),
      piProvider: channel.provider,
      piModel: nextModelId,
    });
  };
  const addChannel = () => {
    const selected = PRESETS[preset];
    const state = useSettingsStore.getState();
    // Keep the old provider credential id when migrating a single-provider installation.
    const migrate = !state.piChannels.length && !state.piActiveChannelId && state.piProvider === selected.provider;
    const id = migrate ? selected.provider : `channel-${crypto.randomUUID()}`;
    const oldModel = models.find((model) => model.provider === selected.provider && model.id === state.piModel);
    const item: PiChannel = { ...selected, id, name: `${selected.name} ${state.piChannels.length + 1}`,
      models: migrate && state.piModel ? [{ ...newPiModel(state.piModel), ...oldModel }] : [] };
    updateSettings({ piChannels: [...state.piChannels, item], piActiveChannelId: id,
      piProvider: selected.provider, piModel: item.models[0]?.id ?? '' });
  };
  const credential = async (remove: boolean) => {
    if (!channel) return;
    const id = channel.id;
    setBusy(true); setNotice('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke(remove ? 'pi_delete_api_key' : 'pi_save_api_key', { provider: id, ...(remove ? {} : { apiKey: apiKey.trim() }) });
      if (activeId.current !== id) return;
      setApiKey(''); setHasKey(!remove);
      setNotice(remove ? '该渠道密钥已删除。' : '密钥已保存到系统凭据库，未写入设置文件。');
    } catch (failure) { if (activeId.current === id) setNotice(String(failure)); }
    finally { setBusy(false); }
  };
  const commitDraftAndKey = async (): Promise<PiChannel | null> => {
    if (!channel) return null;
    const normalized = tryNormalizeUrl(urlDraft, channel.api);
    if (!normalized) {
      setNotice('请输入 HTTP(S) 基础 URL；不能包含用户名、密码、查询参数或片段。');
      return null;
    }
    let effective = channel;
    if (normalized !== channel.baseUrl || urlDraft !== normalized) {
      patchChannel({ baseUrl: normalized });
      setUrlDraft(normalized);
      effective = { ...channel, baseUrl: normalized };
    }
    if (desktop && apiKey.trim()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('pi_save_api_key', { provider: channel.id, apiKey: apiKey.trim() });
      if (activeId.current !== channel.id) return null;
      setApiKey('');
      setHasKey(true);
    }
    return effective;
  };
  const discover = async () => {
    if (!channel) return;
    const id = channel.id;
    setBusy(true); setNotice(''); setDiscovered([]); setChecked([]);
    try {
      const effective = await commitDraftAndKey();
      if (!effective || activeId.current !== id) return;
      const { invoke } = await import('@tauri-apps/api/core');
      const effectiveProxy = proxyEnabled && proxyUrl.trim() ? proxyUrl.trim() : undefined;
      const effectiveUa = resolveEffectiveUserAgent(userAgentPreset, customUserAgent)?.trim() || undefined;
      const result = await invoke<PiChannelModel[]>('pi_fetch_models', {
        channel: effective,
        ...(effectiveProxy ? { proxyUrl: effectiveProxy } : {}),
        ...(effectiveUa ? { userAgent: effectiveUa } : {}),
      });
      if (activeId.current !== id) return;
      setDiscovered(result);
      setNotice(`获取到 ${result.length} 个模型，勾选后添加。不支持列举模型的渠道可手动添加。`);
    } catch (failure) { if (activeId.current === id) setNotice(String(failure)); }
    finally { setBusy(false); }
  };
  const removeChannel = async () => {
    if (!channel || !window.confirm(`删除渠道「${channel.name}」及其系统凭据？`)) return;
    setBusy(true); setNotice('');
    try {
      if (desktop) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('pi_delete_api_key', { provider: channel.id });
      }
      const remaining = useSettingsStore.getState().piChannels.filter((item) => item.id !== channel.id);
      const next = remaining[0];
      updateSettings({ piChannels: remaining, piActiveChannelId: next?.id ?? '',
        piProvider: next?.provider ?? 'anthropic', piModel: next?.defaultModelId ?? next?.models[0]?.id ?? '' });
    } catch (failure) { setNotice(String(failure)); }
    finally { setBusy(false); }
  };
  const selectedModel = channel?.models.find((model) => model.id === piModel);
  const updateModel = (patch: Partial<PiChannelModel>) => patchChannel({
    models: channel!.models.map((model) => model.id === piModel ? { ...model, ...patch } : model),
  });
  const normalizedDraft = channel ? tryNormalizeUrl(urlDraft, channel.api) : null;
  const urlSaved = Boolean(channel && normalizedDraft && normalizedDraft === channel.baseUrl);
  const canUseKey = Boolean(hasKey || apiKey.trim());
  const filterTokens = filter.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
  const filteredDiscovered = discovered.filter((model) => {
    if (!filterTokens.length) return true;
    const raw = `${model.id} ${model.name}`.toLowerCase();
    const spaced = raw.replace(/[\s_-]+/g, ' ');
    return filterTokens.every((token) => raw.includes(token) || spaced.includes(token));
  });
  return (
    <section className="my-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4" aria-label="内置 Pi 设置">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-slate-900">内置 Pi · 渠道与模型</h3>
          <p className="mt-1 text-xs text-slate-600">每个渠道独立配置地址、密钥与模型；支持同一协议的多个供应商。</p></div>
        <button type="button" disabled={!desktop || isProbing || disabled} onClick={() => void useAgentStore.getState().testAgentHandshake('pi')} className={buttonClass}>
          {isProbing ? '检测中…' : '检测 Pi 运行时'}
        </button>
      </div>
      <div className="flex gap-2">
        <select aria-label="新增 Pi 渠道预设" value={preset} disabled={disabled} onChange={(event) => setPreset(Number(event.target.value))} className={`${inputClass} flex-1 !mt-0`}>
          {PRESETS.map((item, index) => <option value={index} key={item.provider}>{item.name}</option>)}
        </select>
        <button type="button" disabled={disabled} onClick={addChannel} className={buttonClass}>＋ 添加渠道</button>
      </div>
      {!channel && <p className="text-xs text-slate-500">先添加渠道，再填写实际 API 基础地址和密钥。兼容服务可选择 OpenAI 预设后修改地址。</p>}
      {channel && <>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs">当前渠道
            <select aria-label="Pi 渠道" value={channel.id} disabled={disabled} className={inputClass} onChange={(event) => {
              const next = piChannels.find((item) => item.id === event.target.value)!;
              updateSettings({ piActiveChannelId: next.id, piProvider: next.provider, piModel: next.defaultModelId ?? next.models[0]?.id ?? '' });
            }}>{piChannels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </label>
          <button type="button" disabled={disabled} onClick={() => void removeChannel()} className={buttonClass}>删除渠道</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">渠道名称<input aria-label="Pi 渠道名称" value={channel.name} disabled={disabled} className={inputClass} onChange={(event) => patchChannel({ name: event.target.value })} /></label>
          <label className="text-xs">API 协议<select aria-label="Pi API 协议" value={channel.api} disabled={disabled} className={inputClass}
            onChange={(event) => {
              const nextApi = event.target.value as PiApi;
              const renormalized = tryNormalizeUrl(urlDraft || channel.baseUrl, nextApi);
              patchChannel({ api: nextApi, ...(renormalized ? { baseUrl: renormalized } : {}) });
              if (renormalized) setUrlDraft(renormalized);
              setDiscovered([]); setChecked([]);
            }}>
            {PI_APIS.map((api) => <option value={api.id} key={api.id}>{api.name}</option>)}</select></label>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs">API 基础 URL（自动按协议补全或精简 /v1）
            <input aria-label="Pi API URL" type="url" value={urlDraft} disabled={disabled} className={inputClass} onChange={(event) => setUrlDraft(event.target.value)} /></label>
          <button type="button" disabled={disabled || urlSaved} className={buttonClass} onClick={() => {
            const normalized = tryNormalizeUrl(urlDraft, channel.api);
            if (!normalized) {
              setNotice('请输入 HTTP(S) 基础 URL；不能包含用户名、密码、查询参数或片段。');
              return;
            }
            patchChannel({ baseUrl: normalized }); setUrlDraft(normalized); setDiscovered([]); setChecked([]);
            setNotice(`地址已保存为 ${normalized}；下一轮使用新地址，不复用旧渠道会话。`);
          }}>保存地址</button>
        </div>
        {channel.baseUrl.startsWith('http:') && <p className="text-xs text-amber-700">此地址使用明文 HTTP，密钥和请求不会加密；仅用于可信本地服务。</p>}
        {!urlSaved && normalizedDraft && <p className="text-xs text-slate-600">保存或获取模型时将按协议规范化为：<span className="font-mono">{normalizedDraft}</span></p>}
        {!normalizedDraft && urlDraft.trim() && <p className="text-xs text-amber-700">URL 格式无效：请填写 http(s):// 开头的网关地址（不含查询参数或密钥）。</p>}
        <label className="block text-xs">API Key · {hasKey === null ? '状态未确认' : hasKey ? '该渠道已保存' : '未配置'}
          <input aria-label="Pi API Key" type="password" autoComplete="off" value={apiKey} disabled={!desktop || disabled} onChange={(event) => setApiKey(event.target.value)}
            placeholder="仅保存在系统凭据库，不写入项目或 localStorage" className={inputClass} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!desktop || disabled || !apiKey.trim()} onClick={() => void credential(false)} className={buttonClass}>保存密钥</button>
          <button type="button" disabled={!desktop || disabled || !hasKey} onClick={() => void credential(true)} className={buttonClass}>删除密钥</button>
          <button type="button" disabled={!desktop || disabled || !canUseKey || !normalizedDraft} onClick={() => void discover()} className={buttonClass}>{busy ? '处理中…' : '获取渠道模型'}</button>
          <button type="button" disabled={disabled || !models.some((model) => model.provider === channel.provider)} className={buttonClass}
            onClick={() => { setDiscovered(models.filter((model) => model.provider === channel.provider)); setChecked([]); setNotice('SDK 目录仅供参考，不代表该渠道支持这些模型；请按实际服务选择。'); }}>从 SDK 目录选择</button>
        </div>
        {!!discovered.length && <div className="space-y-2 rounded-lg border border-indigo-100 bg-white p-2">
          <input aria-label="筛选 Pi 模型" placeholder="搜索模型 ID / 名称（支持空格模糊匹配，如 deepseek v4.1 flash）" value={filter} onChange={(event) => setFilter(event.target.value)} className={inputClass} />
          <div className="max-h-44 overflow-y-auto space-y-1">
            {filteredDiscovered.map((model) => {
              const added = channel.models.some((item) => item.id === model.id);
              return <label key={model.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" disabled={disabled || added} checked={added || checked.includes(model.id)} onChange={(event) =>
                  setChecked((current) => event.target.checked ? [...current, model.id] : current.filter((id) => id !== model.id))} />
                <span className="break-all">{model.id}{added ? ' · 已添加' : ''}</span>
              </label>;
            })}
          </div>
          <button type="button" disabled={disabled || !checked.length} className={buttonClass} onClick={() => {
            addModels(discovered.filter((model) => checked.includes(model.id))); setChecked([]);
          }}>添加所选模型（{checked.length}）</button>
        </div>}
        <form className="flex items-end gap-2" onSubmit={(event) => {
          event.preventDefault(); const id = manualId.trim();
          if (!disabled && id && id.length <= 256) { addModels([newPiModel(id)]); setManualId(''); }
        }}>
          <label className="flex-1 text-xs">手动添加模型 ID<input aria-label="Pi 手动模型 ID" value={manualId} maxLength={256} disabled={disabled} onChange={(event) => setManualId(event.target.value)} className={inputClass} placeholder="填写渠道实际提供的模型 ID（如 deepseek-v4.1-flash）" /></label>
          <button type="submit" disabled={disabled || !manualId.trim()} className={buttonClass}>添加模型</button>
        </form>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs">默认模型（{channel.models.length}）
            <select aria-label="Pi 模型" value={piModel} disabled={disabled} className={inputClass} onChange={(event) => {
              patchChannel({ defaultModelId: event.target.value }); updateSettings({ piModel: event.target.value });
            }}>
              <option value="">请选择模型</option>
              {channel.models.map((model) => <option value={model.id} key={model.id}>{model.name === model.id ? model.id : `${model.name} · ${model.id}`}</option>)}
            </select>
          </label>
          <button type="button" disabled={disabled || !selectedModel} className={buttonClass} onClick={() => {
            const remaining = channel.models.filter((model) => model.id !== piModel);
            patchChannel({ models: remaining, defaultModelId: remaining[0]?.id }); updateSettings({ piModel: remaining[0]?.id ?? '' });
          }}>删除模型</button>
        </div>
        {selectedModel && <div className="space-y-2 rounded-lg bg-white/70 p-2">
          <p className="text-[11px] text-slate-500">模型列表通常不包含完整能力，请按渠道实际规格核对。手动添加默认仅文本、无推理。</p>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={selectedModel.supportsImages} disabled={disabled} onChange={(event) => updateModel({ supportsImages: event.target.checked })} />图片输入</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={selectedModel.reasoning} disabled={disabled} onChange={(event) => updateModel({ reasoning: event.target.checked })} />推理模型</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">上下文 tokens<input aria-label="Pi 上下文长度" type="number" min={1024} max={10000000} value={selectedModel.contextWindow} disabled={disabled} className={inputClass}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1024 && value <= 10000000) updateModel({ contextWindow: value, maxTokens: Math.min(value, selectedModel.maxTokens) }); }} /></label>
            <label className="text-xs">最大输出 tokens<input aria-label="Pi 最大输出" type="number" min={1} max={selectedModel.contextWindow} value={selectedModel.maxTokens} disabled={disabled} className={inputClass}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= selectedModel.contextWindow) updateModel({ maxTokens: value }); }} /></label>
          </div>
        </div>}
      </>}
      <label className="flex items-center justify-between text-xs">推理强度
        <select aria-label="Pi 推理强度" value={piThinkingLevel} disabled={disabled} onChange={(event) => updateSettings({ piThinkingLevel: event.target.value as typeof piThinkingLevel })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          <option value="off">关闭</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option>
        </select></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!desktop || disabled || !canUseKey || !selectedModel || !normalizedDraft} onClick={async () => {
          if (!selectedModel) return;
          setBusy(true); setNotice('');
          try {
            const effective = await commitDraftAndKey();
            if (!effective) return;
            useAgentStore.getState().setActiveAgentId('pi');
            updateSettings({ defaultAgentId: 'pi', piProvider: effective.provider, piModel: selectedModel.id });
            setNotice('已使用当前 Pi 渠道与模型。获取列表不代表模型请求验证成功。');
          } catch (failure) { setNotice(String(failure)); }
          finally { setBusy(false); }
        }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">使用此渠道与模型</button>
        <button type="button" disabled={!desktop || disabled} className={buttonClass} onClick={async () => {
          setBusy(true);
          try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('pi_reset_runtime'); setNotice('Pi 会话已重置。'); }
          catch (failure) { setNotice(String(failure)); } finally { setBusy(false); }
        }}>重置 Pi 会话</button>
      </div>
      <p className="text-xs text-slate-500">需要 Node.js 22.19+。仅开放 AgenTikZ 项目工具；API 单独计费，不复用 CLI 登录。渠道 URL 会按协议自动规范化，获取模型不会发送项目上下文。</p>
      {!desktop && <p className="text-xs text-amber-700">浏览器模式可配置渠道，但保存密钥、获取模型与运行 Pi 需要桌面端。</p>}
      {(notice || error) && <p className="break-words text-xs text-slate-700" role="status">{notice || error}</p>}
    </section>
  );
};
