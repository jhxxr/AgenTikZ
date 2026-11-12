import React, { useState } from 'react';
import { Check, Copy, Loader2, Plug, Unplug } from 'lucide-react';
import { useMcpStore } from '../../store/useMcpStore';
import { useProjectStore } from '../../store/useProjectStore';
import { applyExternalProposal, rejectExternalProposal } from '../../core/mcp/external';
import type { ExternalMcpAccess } from '../../types/mcp';
import { SettingsGroup, SettingsSectionLabel, StatusBadge } from './SettingsLayout';

const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';
const accessLabels: Record<ExternalMcpAccess, string> = {
  read: '只读检查',
  review: '修改需审核',
  direct: '直接修改画布',
};

export const ExternalMcpPane: React.FC = () => {
  const { external, externalBusy, externalProposal: proposal, externalLastCall,
    config, loaded, saving, startExternal, stopExternal } = useMcpStore();
  const canvasName = useProjectStore((state) => state.activeCanvasFileName);
  const [access, setAccess] = useState<ExternalMcpAccess>('review');
  const [copiedRequest, setCopiedRequest] = useState('');
  const clientJson = external?.clientConfig ? JSON.stringify(external.clientConfig, null, 2) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clientJson);
      setCopiedRequest(external!.requestId);
    } catch {
      useMcpStore.setState({ error: '无法写入剪贴板，请展开连接配置后手动复制。' });
    }
  };
  return <>
    <SettingsSectionLabel title="让外部 Agent 操作 AgenTikZ"
      description="外部 Agent → MCP Server → 当前画布。无需在软件内启动 Agent、发送聊天消息或配置模型。" />
    <SettingsGroup>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Plug className="h-4 w-4 text-blue-600" />AgenTikZ MCP Server
          </div>
          <StatusBadge tone={external?.clientConfig ? 'emerald' : 'slate'}>
            {externalBusy ? '正在开启' : external?.clientConfig ? '接入口已开启' : '未开启'}
          </StatusBadge>
        </div>
        <p className="break-all text-[11px] text-slate-500">
          {external ? '已授权画布' : '将授权当前画布'}：{external?.target.canvasId || canvasName || '未命名画布'}
        </p>
        <label className="block space-y-1 text-xs text-slate-600">
          <span>外部 Agent 权限</span>
          <select aria-label="外部 Agent 权限" value={external?.access ?? access}
            disabled={Boolean(external) || externalBusy}
            onChange={(event) => setAccess(event.target.value as ExternalMcpAccess)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-500 disabled:bg-slate-50">
            {Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p className={`text-[11px] leading-relaxed ${(external?.access ?? access) === 'direct' ? 'text-amber-700' : 'text-slate-500'}`}>
          {(external?.access ?? access) === 'direct'
            ? '持有此配置的本机客户端可直接改图；每次修改保留撤销记录，并沿用项目自动保存。此权限不受应用内 Agent 自动模式控制。'
            : (external?.access ?? access) === 'review'
              ? '外部 Agent 可生成或精修图形；修改先显示在下方，点击应用后才写入画布。'
              : '仅允许读取画布、选区、布局与渲染预览，不能提交或应用修改。'}
        </p>
        <div className="flex flex-wrap gap-2">
          {!external && !externalBusy ? <button type="button"
            className={`${buttonClass} !border-blue-600 !bg-blue-600 !text-white`}
            disabled={!loaded || saving || !config.builtinEnabled} onClick={() => void startExternal(access)}>
            <Plug className="h-3.5 w-3.5" />开启外部接入
          </button> : <button type="button" className={buttonClass} onClick={() => void stopExternal()}>
            {externalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}关闭并撤销授权
          </button>}
          {clientJson && <button type="button" className={buttonClass} onClick={() => void copy()}>
            {copiedRequest === external?.requestId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedRequest === external?.requestId ? '已复制连接配置' : '复制连接配置'}
          </button>}
        </div>
        {!config.builtinEnabled && <p className="text-[11px] text-amber-700">请先打开下方的 AgenTikZ MCP 工具总开关。</p>}
        {clientJson && <>
          <ol className="list-inside list-decimal space-y-1 text-[11px] leading-relaxed text-slate-600">
            <li>复制配置，在外部 Agent 工具中添加本地 stdio MCP 服务。</li>
            <li>重新连接该服务，然后让 Agent 读取当前图、生成 TikZ 或修改选中的元素。</li>
            <li>保持 AgenTikZ 打开；不需要在右侧聊天面板发送消息。</li>
          </ol>
          <details className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
            <summary className="cursor-pointer font-medium">查看通用 JSON 配置（含临时访问令牌）</summary>
            <textarea aria-label="外部 MCP 连接配置" readOnly value={clientJson} spellCheck={false}
              className="mt-2 h-52 w-full resize-y rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-700" />
            <p className="mt-1">客户端配置格式不同时，将 command、args、env 填入对应的 stdio 服务字段；不要把这里的 /call 地址当作 HTTP MCP endpoint。</p>
          </details>
          <p className="text-[11px] leading-relaxed text-amber-700">
            此配置仅供受信任的本机客户端使用，请勿公开。关闭接入、切换项目/画布或退出软件后失效；重新开启须更新客户端配置。权限变更需先关闭接入。渲染沿用本机 TeX 的资源访问权限，不是文件系统安全沙盒。
          </p>
        </>}
        {external && <p role="status" className="text-[11px] text-slate-500">
          {externalLastCall || '尚未收到工具调用；接入口开启不代表外部 Agent 已连接。'}
        </p>}
      </div>
      {external && proposal && <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-800">外部 Agent 的最近一次修改</h4>
          <StatusBadge tone={proposal.status === 'applied' ? 'emerald' : proposal.status === 'pending' ? 'amber' : 'slate'}>
            {proposal.status === 'applied' ? '已应用到画布' : proposal.status === 'pending' ? '待审核' : '已拒绝'}
          </StatusBadge>
        </div>
        <p className="text-xs text-slate-700">{proposal.summary}</p>
        <p className="text-[11px] text-slate-500">{proposal.rationale}</p>
        <details className="text-[11px] text-slate-600">
          <summary className="cursor-pointer">查看源码 Diff</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-mono">
            {proposal.diffLines?.map((line, index) => <div key={index}
              className={line.type === 'add' ? 'text-emerald-700' : line.type === 'remove' ? 'text-rose-700' : ''}>
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}{line.text}
            </div>)}
          </pre>
        </details>
        {proposal.renderPreview && <details className="text-[11px] text-slate-600">
          <summary className="cursor-pointer">真实 TeX 预览</summary>
          <img src={proposal.renderPreview.dataUrl} alt="外部 Agent 绘图提案的 TeX 渲染预览" className="mt-2 max-h-80 max-w-full rounded border border-slate-200 object-contain" />
        </details>}
        {proposal.status === 'pending' && <div className="flex gap-2">
          <button type="button" className={`${buttonClass} !bg-blue-600 !text-white`}
            onClick={() => applyExternalProposal(external.requestId)}>应用到画布</button>
          <button type="button" className={buttonClass} onClick={() => rejectExternalProposal(external.requestId)}>拒绝修改</button>
        </div>}
        {proposal.status === 'applied' && <p className="text-[11px] text-slate-500">已进入画布撤销记录。磁盘保存状态以项目保存提示为准。</p>}
      </div>}
    </SettingsGroup>
  </>;
};
