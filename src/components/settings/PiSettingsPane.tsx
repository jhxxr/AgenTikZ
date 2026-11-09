import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePiStore } from '../../store/usePiStore';
import { useAgentStore } from '../../store/useAgentStore';

export const PiSettingsPane: React.FC = () => {
  const { piProvider, piModel, piThinkingLevel, updateSettings } = useSettingsStore(useShallow((s) => ({
    piProvider: s.piProvider, piModel: s.piModel, piThinkingLevel: s.piThinkingLevel, updateSettings: s.updateSettings,
  })));
  const { models, isProbing, error } = usePiStore();
  const isActive = useAgentStore((s) => s.activeAgentId === 'pi');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const providers = [...new Set([piProvider, ...models.map((model) => model.provider)])].sort();
  const choices = models.filter((model) => model.provider === piProvider);
  useEffect(() => {
    let current = true;
    setApiKey(''); setHasKey(null); setNotice('');
    if (desktop) void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke<boolean>('pi_has_api_key', { provider: piProvider }))
      .then((saved) => { if (current) setHasKey(saved); })
      .catch(() => { if (current) setNotice('系统凭据状态读取失败，请检查桌面端。'); });
    return () => { current = false; };
  }, [piProvider, desktop]);
  const credential = async (remove: boolean) => {
    const provider = piProvider;
    setBusy(true); setNotice('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke(remove ? 'pi_delete_api_key' : 'pi_save_api_key', {
        provider, ...(remove ? {} : { apiKey }),
      });
      if (useSettingsStore.getState().piProvider !== provider) return;
      setApiKey(''); setHasKey(!remove);
      setNotice(remove ? '凭据已删除，Pi 运行时已重置。' : '已保存到系统凭据库；下一轮使用新凭据。');
    } catch (error) {
      if (useSettingsStore.getState().piProvider === provider) setNotice(String(error));
    }
    finally { setBusy(false); }
  };
  return (
    <section className="my-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3" aria-label="内置 Pi 设置">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm text-slate-900">内置 Pi · 长驻项目会话</h3>
          <p className="mt-1 text-xs text-slate-600">无需 Pi CLI；需要 Node.js 22.19+。模型 API 单独计费，不复用 ACP CLI 登录。</p>
        </div>
        <button type="button" disabled={!desktop || isProbing || busy}
          onClick={() => void useAgentStore.getState().testAgentHandshake('pi')}
          className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-700 disabled:opacity-50">
          {isProbing ? '检测中…' : '检测运行时 / 加载模型'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-slate-700">Provider
          <select aria-label="Pi provider" disabled={busy} value={piProvider}
            onChange={(event) => updateSettings({ piProvider: event.target.value, piModel: '' })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2">
            {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-700">模型
          <select aria-label="Pi 模型" disabled={busy || !choices.length} value={piModel}
            onChange={(event) => updateSettings({ piModel: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2">
            <option value="">{choices.length ? '请选择模型' : '请先加载内置模型目录'}</option>
            {piModel && !choices.some((model) => model.id === piModel) && <option value={piModel}>{piModel}（尚未核验）</option>}
            {choices.map((model) => <option key={model.id} value={model.id}>{model.name || model.id} · {model.id}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
        <span>推理强度 · 较高强度通常需要更多时间与用量</span>
        <select aria-label="Pi 推理强度" value={piThinkingLevel} disabled={busy}
          onChange={(event) => updateSettings({ piThinkingLevel: event.target.value as typeof piThinkingLevel })}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          <option value="off">关闭</option><option value="low">低</option>
          <option value="medium">中（默认）</option><option value="high">高</option>
        </select>
      </label>
      <label className="block text-xs text-slate-700">API Key · {hasKey === null ? '状态未确认' : hasKey ? '系统凭据库已保存' : '未配置'}
        <input aria-label="Pi API Key" type="password" autoComplete="off" value={apiKey}
          disabled={!desktop || busy} onChange={(event) => setApiKey(event.target.value)}
          placeholder="保存到系统凭据库，不写入项目文件"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!desktop || busy || !hasKey || !choices.some((model) => model.id === piModel)}
          onClick={() => {
            useAgentStore.getState().setActiveAgentId('pi');
            updateSettings({ defaultAgentId: 'pi' });
            setNotice('已启用内置 Pi。请发送任务验证模型连接；加载目录与保存密钥不代表认证成功。');
          }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">
          {isActive ? '当前使用 Pi' : '使用内置 Pi'}
        </button>
        <button type="button" disabled={!desktop || busy || !apiKey.trim()} onClick={() => void credential(false)}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-50">保存密钥</button>
        <button type="button" disabled={!desktop || busy || !hasKey} onClick={() => void credential(true)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs disabled:opacity-50">删除密钥</button>
        <button type="button" disabled={!desktop || busy} onClick={async () => {
          try {
            setBusy(true);
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('pi_reset_runtime');
            setNotice('Pi 运行时已重置。下轮恢复可见聊天，旧工具历史不保留。');
          } catch (error) { setNotice(String(error)); }
          finally { setBusy(false); }
        }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs disabled:opacity-50">重置 Pi 会话</button>
      </div>
      <p className="text-xs text-slate-500">仅开放 AgenTikZ 内置工具；不加载第三方 MCP、个人扩展或原生命令。「完整本机访问」、代理与自定义 User-Agent 设置目前仅适用于 ACP。检测成功只代表 SDK 可用，未调用模型或验证密钥。</p>
      {!desktop && <p className="text-xs text-amber-700">浏览器模式不能运行 Pi，请使用桌面端。</p>}
      {(notice || error) && <p className="text-xs text-slate-700 break-words" role="status">{notice || error}</p>}
    </section>
  );
};
