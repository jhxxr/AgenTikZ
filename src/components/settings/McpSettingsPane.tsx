import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, FlaskConical, Loader2, Plug, Plus, Trash2, Upload, X } from 'lucide-react';
import { useMcpStore, newMcpServer } from '../../store/useMcpStore';
import { useAgentStore } from '../../store/useAgentStore';
import { parseMcpImport, exportMcpConfig } from '../../core/mcp/config';
import type { McpServerConfig, McpValue } from '../../types/mcp';
import { SettingsGroup, SettingsPageTitle, SettingsRow, SettingsSectionLabel, SettingsToggle, StatusBadge } from './SettingsLayout';

const inputClass = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-500';
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';
type ValueRow = { key: string; value: McpValue };
const rowsFrom = (values: Record<string, McpValue>): ValueRow[] => Object.entries(values).map(([key, value]) => ({ key, value: { ...value } }));
const rowsTo = (rows: ValueRow[]) => {
  if (rows.some((row) => !row.key.trim()) || new Set(rows.map((row) => row.key)).size !== rows.length) {
    throw new Error('环境变量或请求头名称不能为空或重复。');
  }
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

function ValueEditor({ label, rows, onChange }: { label: string; rows: ValueRow[]; onChange: (rows: ValueRow[]) => void }) {
  return <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <button type="button" className={buttonClass} onClick={() => onChange([...rows, { key: '', value: { value: '', secret: true, stored: false, sessionOnly: false } }])}>
        <Plus className="h-3 w-3" />添加
      </button>
    </div>
    {rows.map((row, index) => <div key={index} className="space-y-1 rounded-lg border border-slate-200 p-2">
      <div className="flex gap-2">
        <input aria-label={`${label}名称 ${index + 1}`} value={row.key} placeholder="名称" className={inputClass}
          onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} />
        <input aria-label={`${label}值 ${index + 1}`} type={row.value.secret ? 'password' : 'text'} value={row.value.value || ''}
          placeholder={row.value.stored ? '已保存，留空保留' : '值'} className={inputClass} autoComplete="off"
          onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, value: { ...item.value, value: event.target.value } } : item))} />
        <button type="button" className={buttonClass} aria-label={`删除${label} ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 className="h-3 w-3" /></button>
      </div>
      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
        <label className="flex items-center gap-1"><input type="checkbox" checked={row.value.secret}
          onChange={(e) => onChange(rows.map((item, i) => i === index ? { ...item, value: { ...item.value, secret: e.target.checked, stored: false } } : item))} />敏感值 · 系统凭据存储</label>
        {row.value.secret && <label className="flex items-center gap-1"><input type="checkbox" checked={row.value.sessionOnly}
          onChange={(e) => onChange(rows.map((item, i) => i === index ? { ...item, value: { ...item.value, sessionOnly: e.target.checked } } : item))} />仅本次运行有效</label>}
      </div>
    </div>)}
  </div>;
}

export const McpSettingsPane: React.FC = () => {
  const { config, loading, saving, loaded, error, tests, load, save, test, testBuiltin, lastBuiltinCall, sessionStatus } = useMcpStore();
  const providers = useAgentStore((s) => s.providers);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [args, setArgs] = useState('[]');
  const [env, setEnv] = useState<ValueRow[]>([]);
  const [headers, setHeaders] = useState<ValueRow[]>([]);
  const [formError, setFormError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseMcpImport> | null>(null);
  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  const edit = (server: McpServerConfig) => {
    setEditing({ ...server, agentIds: [...server.agentIds] });
    setArgs(JSON.stringify(server.args, null, 2)); setEnv(rowsFrom(server.env)); setHeaders(rowsFrom(server.headers)); setFormError('');
  };
  const saveEditor = async () => {
    if (!editing) return;
    setFormError('');
    try {
      const parsedArgs = JSON.parse(args);
      if (!Array.isArray(parsedArgs) || parsedArgs.some((item) => typeof item !== 'string')) throw new Error('参数必须是字符串 JSON 数组。');
      const server = { ...editing, name: editing.name.trim(), command: editing.command.trim(), url: editing.url.trim(),
        args: parsedArgs, env: rowsTo(env), headers: rowsTo(headers) };
      const exists = config.servers.some((item) => item.id === server.id);
      if (await save({ ...config, servers: exists ? config.servers.map((item) => item.id === server.id ? server : item) : [...config.servers, server] })) setEditing(null);
      else setFormError(useMcpStore.getState().error);
    } catch (error) { setFormError(String(error)); }
  };
  return <div>
    <SettingsPageTitle title="MCP 服务" subtitle="为 Agent 挂载画布工具与第三方服务。服务配置从下一次发送消息起生效，无需新建聊天。"
      action={<button type="button" className={buttonClass} onClick={() => void load()} disabled={loading || saving}>刷新配置</button>} />
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {loading && <p className="mb-4 text-xs text-slate-500">正在读取配置…</p>}
    <SettingsSectionLabel title="AgenTikZ 内置工具" description="读取实际画布、选区和布局；修改生成待审核提案。" />
    <SettingsGroup>
      <SettingsRow label="允许 Agent 使用 AgenTikZ 工具" description="关闭后当前轮内置工具授权也会撤销。画布修改需要点击应用。">
        <SettingsToggle label="启用内置 MCP" checked={config.builtinEnabled} disabled={saving || loading}
          onChange={(checked) => void save({ ...config, builtinEnabled: checked })} />
      </SettingsRow>
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-medium">9 个画布工具</span>
            <p role={tests.builtin?.phase === 'error' ? 'alert' : undefined}
              className={`mt-1 text-[11px] ${tests.builtin?.phase === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
              {tests.builtin?.message || '尚未测试；连接随每轮 Agent 请求建立。'}</p>
          </div>
          <button type="button" className={buttonClass} disabled={!config.builtinEnabled || tests.builtin?.phase === 'testing' || saving}
            onClick={() => void testBuiltin()}>{tests.builtin?.phase === 'testing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}测试内置工具</button>
        </div>
        {lastBuiltinCall && <p className="text-[11px] text-slate-500">最近调用：{lastBuiltinCall}</p>}
      </div>
    </SettingsGroup>
    <SettingsSectionLabel title="外部 MCP 服务" description="启用即允许 Agent 使用该服务的工具。外部服务按自身权限运行，完整本机访问开关不会将其限制为只读。"
      right={<button type="button" className={buttonClass} disabled={saving} onClick={() => edit(newMcpServer())}><Plus className="h-3 w-3" />添加服务</button>} />
    <div className="mb-3 flex gap-2">
      <button type="button" className={buttonClass} onClick={() => { setImportOpen(!importOpen); setPreview(null); setFormError(''); }}><Upload className="h-3 w-3" />导入 JSON</button>
      <button type="button" className={buttonClass} onClick={() => {
        const url = URL.createObjectURL(new Blob([exportMcpConfig(config)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'mcp-servers-without-secrets.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Download className="h-3 w-3" />导出（排除密钥）</button>
    </div>
    {importOpen && <SettingsGroup><div className="space-y-3 p-4">
      <label htmlFor="mcp-import" className="text-xs font-medium">粘贴包含 mcpServers 的 JSON</label>
      <textarea id="mcp-import" className={`${inputClass} h-36 font-mono`} value={importText}
        onChange={(e) => { setImportText(e.target.value); setPreview(null); }} />
      <button type="button" className={buttonClass} onClick={() => {
        try { setPreview(parseMcpImport(importText)); setFormError(''); } catch (error) { setFormError(String(error)); }
      }}>预览导入</button>
      {preview && <div className="space-y-2 text-xs text-slate-600">
        <p>将导入 {preview.servers.map((s) => `${s.name} (${s.transport})`).join('、')}；全部默认关闭，变量和请求头默认按敏感值保存。</p>
        {preview.warnings.map((warning, i) => <p key={i} className="text-amber-700">{warning}</p>)}
        <button type="button" className={buttonClass} disabled={saving} onClick={async () => {
          if (await save({ ...config, servers: [...config.servers, ...preview.servers] })) {
            setImportOpen(false); setImportText(''); setPreview(null);
          }
        }}>确认导入</button>
      </div>}
      {formError && <p role="alert" className="text-xs text-rose-600">{formError}</p>}
    </div></SettingsGroup>}
    {editing && <SettingsGroup><div className="space-y-4 p-4">
      <div className="flex justify-between"><h3 className="text-sm font-semibold">配置 MCP 服务</h3><button type="button" className={buttonClass} aria-label="关闭服务编辑" onClick={() => setEditing(null)}><X className="h-3 w-3" /></button></div>
      <label className="block space-y-1 text-xs text-slate-600"><span>服务标识（英文、数字、短横线、下划线）</span><input className={inputClass} value={editing.name}
        placeholder="例如 filesystem、research-notes" onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
      <label className="block space-y-1 text-xs text-slate-600"><span>连接类型</span><select className={inputClass} value={editing.transport}
        onChange={(e) => setEditing({ ...editing, transport: e.target.value as 'stdio' | 'http' })}>
        <option value="stdio">stdio · 本地程序</option><option value="http">Streamable HTTP</option>
      </select></label>
      {editing.transport === 'stdio' ? <>
        <label className="block space-y-1 text-xs text-slate-600"><span>启动命令</span><input className={inputClass} value={editing.command}
          placeholder="可执行文件路径，或已安装的命令" onChange={(e) => setEditing({ ...editing, command: e.target.value })} /></label>
        <label className="block space-y-1 text-xs text-slate-600"><span>参数（JSON 字符串数组）</span>
          <textarea className={`${inputClass} h-20 font-mono`} value={args} onChange={(e) => setArgs(e.target.value)} /></label>
        <ValueEditor label="环境变量" rows={env} onChange={setEnv} />
      </> : <>
        <label className="block space-y-1 text-xs text-slate-600"><span>MCP 服务地址</span><input className={inputClass} value={editing.url}
          placeholder="https://example.com/mcp" onChange={(e) => setEditing({ ...editing, url: e.target.value })} /></label>
        <ValueEditor label="请求头" rows={headers} onChange={setHeaders} />
      </>}
      <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium text-slate-700">适用 Agent（不勾选表示全部）</legend>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">{providers.map((p) => <label key={p.id} className="flex items-center gap-1.5">
          <input type="checkbox" checked={editing.agentIds.includes(p.id)} onChange={(e) => setEditing({ ...editing,
            agentIds: e.target.checked ? [...editing.agentIds, p.id] : editing.agentIds.filter((id) => id !== p.id) })} />{p.name}</label>)}</div>
      </fieldset>
      {formError && <p role="alert" className="text-xs text-rose-600">{formError}</p>}
      <button type="button" className={`${buttonClass} !bg-blue-600 !text-white`} disabled={saving} onClick={() => void saveEditor()}>{saving ? '保存中…' : '保存配置'}</button>
    </div></SettingsGroup>}
    <SettingsGroup>
      {!config.servers.length && <div className="px-4 py-6 text-center text-xs text-slate-500"><Plug className="mx-auto mb-2 h-5 w-5 text-slate-400" />尚未添加外部服务。添加后可先测试，再启用。</div>}
      {config.servers.map((server) => <div key={server.id} className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-800">{server.name}
              <StatusBadge tone="slate">{server.transport === 'http' ? 'HTTP' : 'stdio'}</StatusBadge>
              {tests[server.id]?.phase === 'ready' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            </div>
            <p role={tests[server.id]?.phase === 'error' ? 'alert' : undefined}
              className={`mt-1 text-[11px] ${tests[server.id]?.phase === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{tests[server.id]?.message || '尚未测试'}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{server.agentIds.length ? server.agentIds.map((id) => providers.find((p) => p.id === id)?.name || id).join('、') : '所有 Agent'}</p>
          </div>
          <SettingsToggle label={`启用 ${server.name}`} checked={server.enabled} disabled={saving}
            onChange={(enabled) => void save({ ...config, servers: config.servers.map((s) => s.id === server.id ? { ...s, enabled } : s) })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={saving || tests[server.id]?.phase === 'testing'} onClick={() => void test(server.id)}>
            {tests[server.id]?.phase === 'testing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}测试连接</button>
          <button type="button" className={buttonClass} onClick={() => edit(server)}>编辑</button>
          <button type="button" className={buttonClass} disabled={!tests[server.id]?.tools} onClick={() => setExpanded(expanded === server.id ? null : server.id)}>查看工具</button>
          <button type="button" className={buttonClass} disabled={saving} onClick={() => void save({ ...config, servers: config.servers.filter((s) => s.id !== server.id) })}><Trash2 className="h-3 w-3" />删除</button>
        </div>
        {expanded === server.id && <div className="space-y-2 rounded-lg bg-slate-50 p-3">{tests[server.id]?.tools?.map((tool) => <div key={tool.name}>
          <p className="font-mono text-xs text-slate-800">{tool.name}</p><p className="text-[11px] text-slate-500">{tool.description}</p>
          <details className="mt-1 text-[11px] text-slate-500"><summary className="cursor-pointer">参数 schema</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          </details>
        </div>)}</div>}
      </div>)}
    </SettingsGroup>
    {(sessionStatus || isStreaming) && <div className="rounded-lg bg-slate-100 p-3 text-[11px] leading-relaxed text-slate-600">
      {sessionStatus || '等待当前 Agent 会话提交 MCP 配置。'}
      {isStreaming && <p className="mt-1">外部服务的变更从下一轮生效；当前轮继续使用发送时的配置。</p>}
    </div>}
  </div>;
};
