import React from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { AcpAgentId } from '../../types/acp';

/** Shared by settings and chat; preferences are applied to each new ACP session. */
export const AgentModelSelector: React.FC<{ agentId: AcpAgentId; includePi?: boolean; showConnectButton?: boolean }> = ({
  agentId, includePi, showConnectButton = true,
}) => {
  const provider = useAgentStore((s) => s.providers.find((item) => item.id === agentId));
  const streaming = useAgentStore((s) => s.isStreaming);
  const selected = useSettingsStore((s) => s.acpModelSelections[agentId] ?? '');
  if (agentId === 'pi') return includePi ? <PiQuickModelSelector /> : null;
  if (!provider) return null;
  const models = provider.models ?? [];
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <label className="min-w-0 flex-1">
        <span className="sr-only">{provider.name} 模型</span>
        <select aria-label={`${provider.name} 模型`} value={selected} disabled={streaming || provider.handshakeStatus === 'testing'}
          title={provider.currentModelId ? `Agent 最近确认的模型：${provider.currentModelId}` : '模型选择从下一轮消息起生效'}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
          onChange={(event) => {
            const settings = useSettingsStore.getState();
            settings.updateSettings({ acpModelSelections: { ...settings.acpModelSelections, [agentId]: event.target.value } });
          }}>
          <option value="">{models.length ? '跟随 Agent 默认模型' : '连接后获取模型（未提供时使用 Agent 默认）'}</option>
          {selected && !models.some((model) => model.id === selected) && <option value={selected}>{selected} · 待连接核验</option>}
          {models.map((model) => <option value={model.id} key={model.id}>{model.name === model.id ? model.id : `${model.name} · ${model.id}`}</option>)}
        </select>
      </label>
      {showConnectButton && <button type="button" disabled={!desktop || streaming || provider.handshakeStatus === 'testing'}
        onClick={() => void useAgentStore.getState().testAgentHandshake(agentId)}
        className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-blue-600 disabled:opacity-50">
        {provider.handshakeStatus === 'testing' ? '连接中…' : models.length ? '刷新模型' : '连接 / 获取模型'}
      </button>}
    </div>
  );
};

const PiQuickModelSelector: React.FC = () => {
  const channels = useSettingsStore((s) => s.piChannels);
  const channelId = useSettingsStore((s) => s.piActiveChannelId);
  const modelId = useSettingsStore((s) => s.piModel);
  const streaming = useAgentStore((s) => s.isStreaming);
  const channel = channels.find((item) => item.id === channelId);
  const className = 'min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs';
  if (!channel) return <button type="button" onClick={() => useSettingsStore.getState().openSettings('agent')}
    className="text-left text-xs text-blue-600">配置 Pi 渠道与模型 →</button>;
  return <div className="mt-2 flex gap-2">
    <select aria-label="聊天 Pi 渠道" value={channelId} disabled={streaming} className={className} onChange={(event) => {
      const next = channels.find((item) => item.id === event.target.value)!;
      useSettingsStore.getState().updateSettings({ piActiveChannelId: next.id, piProvider: next.provider,
        piModel: next.defaultModelId ?? next.models[0]?.id ?? '' });
    }}>{channels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
    <select aria-label="聊天 Pi 模型" value={modelId} disabled={streaming} className={className} onChange={(event) =>
      useSettingsStore.getState().updateSettings({ piModel: event.target.value,
        piChannels: channels.map((item) => item.id === channel.id ? { ...item, defaultModelId: event.target.value } : item) })}>
      <option value="">请选择模型</option>
      {channel.models.map((model) => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
    </select>
  </div>;
};
