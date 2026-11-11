import React, { useState } from 'react';
import { Check, ChevronDown, Plug, RefreshCw, Settings, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { agentHasFullAccess, useSettingsStore } from '../../store/useSettingsStore';
import { useProjectStore } from '../../store/useProjectStore';
import type { AcpAgentProvider } from '../../types/acp';
import { AgentModelSelector } from './AgentModelSelector';
import { shortAgentName, useDismiss } from './agent-ui';

const Toggle: React.FC<{ checked: boolean; disabled?: boolean; label: string; hint: string; onChange: (next: boolean) => void }> = ({
  checked, disabled, label, hint, onChange,
}) => (
  <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
    className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
    <span className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}>
      <span className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-3' : ''}`} />
    </span>
    <span className="min-w-0">
      <span className="block text-[12px] font-medium text-slate-800">{label}</span>
      <span className="block text-[11px] leading-snug text-slate-500">{hint}</span>
    </span>
  </button>
);

interface Props {
  providers: AcpAgentProvider[];
  activeProvider: AcpAgentProvider;
  /** The model the next message will use, already resolved for display. */
  modelLabel: string;
  paperMode: boolean;
  probing: boolean;
  onReprobe: () => void;
}

/** One chip in the composer that owns every "who answers, and how" choice. */
export const AgentPicker: React.FC<Props> = ({ providers, activeProvider, modelLabel, paperMode, probing, onReprobe }) => {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const setActiveAgentId = useAgentStore((s) => s.setActiveAgentId);
  const customCommand = useAgentStore((s) => s.customCommand);
  const setCustomCommand = useAgentStore((s) => s.setCustomCommand);
  const autoRepair = useAgentStore((s) => s.autoLayoutRepairEnabled);
  const visualReview = useAgentStore((s) => s.visualReviewEnabled);
  const fullAccess = useSettingsStore(agentHasFullAccess);
  const workingDirectory = useSettingsStore((s) => s.agentWorkingDirectory);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const projectDir = useProjectStore((s) => s.projectDir);
  const isPi = activeProvider.id === 'pi';
  const go = (section: 'agent' | 'mcp') => { setOpen(false); openSettings(section); };

  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}
        title={`${activeProvider.name}${modelLabel ? ` · ${modelLabel}` : ''}`}
        className={`flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] transition-colors cursor-pointer ${
          open ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: activeProvider.detected ? activeProvider.badgeColor : '#cbd5e1' }} />
        <span className="shrink-0 font-medium">{shortAgentName(activeProvider)}</span>
        {modelLabel && <span className="min-w-0 truncate text-slate-400">{modelLabel}</span>}
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div role="dialog" aria-label="选择 Agent 与模型"
          className="absolute bottom-full left-0 z-40 mb-2 flex max-h-[min(70vh,34rem)] w-[19.5rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
              <span className="text-[11px] font-medium text-slate-400">Agent</span>
              <button type="button" onClick={onReprobe} disabled={probing}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 disabled:opacity-50 cursor-pointer">
                <RefreshCw className={`h-3 w-3 ${probing ? 'animate-spin' : ''}`} />重新检测
              </button>
            </div>
            <ul role="listbox" aria-label="Agent" className="px-1.5">
              {providers.map((provider) => {
                const active = provider.id === activeProvider.id;
                return (
                  <li key={provider.id}>
                    <button type="button" role="option" aria-selected={active} onClick={() => setActiveAgentId(provider.id)}
                      title={provider.description}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left cursor-pointer ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: provider.detected ? provider.badgeColor : '#cbd5e1' }} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12.5px] ${active ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{shortAgentName(provider)}</span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {provider.detected ? `已就绪${provider.version ? ` · ${provider.version}` : ''}` : probing ? '检测中…' : '未检测到'}
                        </span>
                      </span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-1.5 border-t border-slate-100 px-3 pb-2.5 pt-2">
              <div className="text-[11px] font-medium text-slate-400">模型与思考强度</div>
              <AgentModelSelector agentId={activeProvider.id} includePi />
              {activeProvider.id === 'custom-acp' && (
                <label className="mt-2 block">
                  <span className="text-[11px] text-slate-500">启动命令</span>
                  <input value={customCommand} onChange={(event) => setCustomCommand(event.target.value)} onBlur={onReprobe}
                    aria-label="Custom ACP command" placeholder={'可执行文件与参数，或 {"command":"...","args":[]}'}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-800 focus:border-blue-400 focus:outline-none" />
                </label>
              )}
              {!activeProvider.detected && !probing && (
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11.5px] leading-relaxed text-amber-900">
                  {activeProvider.diagnostic || activeProvider.installHint || (isPi
                    ? '请在设置中检测 Pi 运行时并配置模型。'
                    : '未找到对应的本地 CLI 或 ACP 适配器，请先安装并登录。')}
                </p>
              )}
            </div>

            {!paperMode && (
              <div className="border-t border-slate-100 px-1.5 py-1.5">
                <Toggle checked={visualReview} disabled={isStreaming} label="视觉复核"
                  hint="让 Agent 渲染提案并查看图片后再修正，需要本地 TeX 和支持图像的模型。"
                  onChange={(next) => useAgentStore.getState().setVisualReviewEnabled(next)} />
                {!isPi && (
                  <Toggle checked={autoRepair} label="自动修复布局"
                    hint="对 Agent 返回的源码自动消除重叠并补全主题配色。"
                    onChange={(next) => useAgentStore.getState().setAutoLayoutRepairEnabled(next)} />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/70 px-2 py-1.5 text-[11.5px]">
            <span className={`flex min-w-0 flex-1 items-center gap-1.5 px-1 ${!isPi && fullAccess ? 'text-amber-700' : 'text-slate-500'}`}
              title={isPi ? '内置 Pi 只能使用 AgenTikZ 提供的项目工具。'
                : fullAccess ? `工作目录：${workingDirectory.trim() || projectDir || '应用工作目录'}`
                : '当前 Agent 不能访问项目以外的文件或执行命令。'}>
              {!isPi && fullAccess ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{isPi ? '仅项目工具' : fullAccess ? '完整本机访问' : '受限模式'}</span>
            </span>
            <button type="button" onClick={() => go('mcp')}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-slate-600 hover:bg-white hover:text-blue-600 cursor-pointer">
              <Plug className="h-3 w-3" />MCP
            </button>
            <button type="button" onClick={() => go('agent')}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-slate-600 hover:bg-white hover:text-blue-600 cursor-pointer">
              <Settings className="h-3 w-3" />设置
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
