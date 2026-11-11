import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Download, FolderOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  importPaperTemplate, isDesktopRuntime, listPaperTemplates, removePaperTemplate,
  setPaperTemplateMain, verifyPaperTemplate,
  type PaperTemplateInfo, type TemplateSourceKind,
} from '../../core/paper/template-library';
import { useSettingsStore } from '../../store/useSettingsStore';

const BROWSER_TEMPLATES: PaperTemplateInfo[] = [{
  id: 'blank', name: '空白论文', description: '基础 article 文档，自由组织论文内容。官方模板与模板导入需使用桌面版。',
  mainFile: 'main.tex', mainCandidates: ['main.tex'], defaultThemeId: 'neurips', columnLayout: 'single',
  source: '', builtin: true, verified: null, note: '', fileCount: 2,
}];

interface Props {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}

/** The same catalogue contains bundled official kits and the user's imported templates. */
export function PaperTemplatePicker({ value, onChange, disabled, onBusyChange }: Props) {
  const desktop = isDesktopRuntime();
  const [templates, setTemplates] = useState<PaperTemplateInfo[]>(desktop ? [] : BROWSER_TEMPLATES);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const importRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (importOpen) importRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [importOpen]);
  const [location, setLocation] = useState('');
  const [name, setName] = useState('');
  const [sourceKind, setSourceKind] = useState<TemplateSourceKind>('auto');
  const [subdirectory, setSubdirectory] = useState('');
  const [trialOnImport, setTrialOnImport] = useState(false);
  const locked = disabled || !!busy;
  const selected = templates.find((template) => template.id === value);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    setBusy('正在加载模板库…');
    onBusyChange(true);
    void listPaperTemplates()
      .then((items) => { if (active) setTemplates(items); })
      .catch((reason) => { if (active) setError(String(reason)); })
      .finally(() => { if (active) { setBusy(''); onBusyChange(false); } });
    return () => { active = false; };
  }, [desktop, onBusyChange]);

  async function perform(message: string, action: () => Promise<void>) {
    setBusy(message); onBusyChange(true); setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); onBusyChange(false); }
  }

  function replaceItem(item: PaperTemplateInfo) {
    setTemplates((previous) => previous.map((template) => template.id === item.id ? item : template));
  }

  async function importTemplate() {
    await perform('正在下载 / 导入模板，请稍候…', async () => {
      const settings = useSettingsStore.getState();
      let item = await importPaperTemplate({
        location, name, sourceKind, subdirectory,
        proxy: settings.proxyEnabled ? settings.proxyUrl : undefined,
      });
      // Keep an imported template even when the optional trial build fails.
      setTemplates((previous) => [...previous.filter((template) => template.id !== item.id), item]);
      onChange(item.id);
      setLocation(''); setName(''); setSubdirectory(''); setImportOpen(false);
      if (trialOnImport) {
        setBusy('已导入，正在用内置引擎试编译（新宏包首次需联网）…');
        item = await verifyPaperTemplate(item.id);
        replaceItem(item);
      }
    });
  }

  async function deleteSelected() {
    if (!selected || selected.builtin) return;
    if (!window.confirm(`从模板库删除「${selected.name}」？已创建的论文项目不会受到影响。`)) return;
    await perform('正在删除模板…', async () => {
      await removePaperTemplate(selected.id);
      setTemplates((previous) => previous.filter((template) => template.id !== selected.id));
      onChange('blank');
    });
  }

  return <div className="paper-template-library">
    <div className="paper-template-library-heading">
      <span>论文模板</span>
      {desktop && <div>
        <button type="button" disabled={locked} title="刷新模板库" onClick={() => void perform('正在加载模板库…', async () => {
          const items = await listPaperTemplates();
          setTemplates(items);
          if (!items.some((item) => item.id === value)) onChange('blank');
        })}><RefreshCw size={12} />刷新</button>
        <button type="button" disabled={locked} aria-expanded={importOpen} onClick={() => setImportOpen(!importOpen)}>
          <Download size={12} />导入模板
        </button>
      </div>}
    </div>
    <fieldset className="project-paper-templates" disabled={locked}>
      <legend className="sr-only">选择论文模板</legend>
      {templates.map((template) => <label key={template.id} className={`project-paper-template ${value === template.id ? 'is-selected' : ''}`}>
        <input type="radio" name="paper-template" value={template.id} checked={value === template.id} onChange={() => onChange(template.id)} />
        <span className={`project-template-page ${template.columnLayout === 'double' ? 'is-double' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        <span className="project-template-name" title={template.name}>{template.name}</span>
        <span className="project-template-description">{template.builtin ? template.id === 'blank' ? '空白起点' : '内置' : '已导入'} · {template.columnLayout === 'double' ? '双栏' : template.columnLayout === 'single' ? '单栏' : '模板布局'}</span>
        {value === template.id && <Check size={13} className="project-template-check" />}
      </label>)}
    </fieldset>
    {selected && <div className="paper-template-details">
      <p>{selected.description || '导入的论文模板，原样复制到新项目。'}</p>
      <div className="paper-template-meta">
        <span>主文件：{selected.mainFile}</span><span>{selected.fileCount} 个文件</span>
        <span className={selected.verified === false ? 'is-warning' : selected.verified ? 'is-verified' : ''}>
          {selected.verified === false ? '试编译未通过' : selected.verified ? '内置引擎可编译' : '尚未试编译'}
        </span>
      </div>
      {selected.source && <p className="paper-template-source">来源：{selected.source}</p>}
      {!selected.builtin && <div className="paper-template-actions">
        {selected.mainCandidates.length > 1 && <label>主文件
          <select value={selected.mainFile} disabled={locked} onChange={(event) => {
            const mainFile = event.target.value;
            void perform('正在更新主文件…', async () => replaceItem(await setPaperTemplateMain(selected.id, mainFile)));
          }}>
            {selected.mainCandidates.map((file) => <option key={file} value={file}>{file}</option>)}
          </select>
        </label>}
        <button type="button" disabled={locked} onClick={() => void perform('正在试编译，首次使用的宏包需要联网下载…', async () => {
          replaceItem(await verifyPaperTemplate(selected.id));
        })}><RefreshCw size={12} />试编译</button>
        <button type="button" disabled={locked} onClick={() => void deleteSelected()}><Trash2 size={12} />删除模板</button>
      </div>}
      {selected.note && <pre className="paper-template-build-note" role="status">{selected.note}</pre>}
      {selected.id !== 'blank' && <p className="paper-template-disclaimer">保留模板原有标题与作者，请在主文件中修改。官方包通常面向 pdfLaTeX；内置引擎可编译不代表与官方工具链版式完全一致。</p>}
    </div>}
    {desktop && !busy && templates.length === 0 && <p className="paper-template-import-error" role="alert">没有找到模板，请重新安装应用或导入模板。</p>}
    {importOpen && <div className="paper-template-import" ref={importRef} onKeyDown={(event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        if (!locked && location.trim()) void importTemplate();
      }
    }}>
      <h3>导入到模板库</h3>
      <p>可用本地文件夹 / 压缩包、压缩包下载链接，或 GitHub / GitLab / Gitee / HTTPS Git 仓库地址。导入后保存在本机，所有新论文都可选择。</p>
      <div className="paper-template-import-row">
        <label>来源类型<select value={sourceKind} disabled={locked} onChange={(event) => setSourceKind(event.target.value as TemplateSourceKind)}>
          <option value="auto">自动识别 / 本地路径</option><option value="url">下载链接（URL）</option><option value="git">Git 仓库</option>
        </select></label>
        <label>模板名称（可选）<input value={name} onChange={(event) => setName(event.target.value)} disabled={locked} placeholder="例如 My Journal 2026" /></label>
      </div>
      <label>链接或本地路径<input value={location} onChange={(event) => setLocation(event.target.value)} disabled={locked}
        placeholder="https://github.com/owner/template 或 E:/Templates/template.zip" /></label>
      <label>仓库 / 压缩包内的子目录（可选）<input value={subdirectory} onChange={(event) => setSubdirectory(event.target.value)} disabled={locked} placeholder="例如 templates/latex；留空自动查找" /></label>
      <label className="paper-template-trial-toggle"><input type="checkbox" checked={trialOnImport} disabled={locked} onChange={(event) => setTrialOnImport(event.target.checked)} />导入后用内置引擎试编译</label>
      <p className="paper-template-security-note">仅导入可信来源。导入只下载、解包和识别文件，不运行仓库脚本；试编译会执行 TeX 源码，可能读取本地资源，请确认来源可信后再启用。</p>
      <div className="paper-template-import-buttons">
        <button type="button" disabled={locked} onClick={() => void perform('请选择模板文件夹…', async () => {
          const { invoke } = await import('@tauri-apps/api/core');
          const dir = await invoke<string | null>('project_pick_directory', { title: '选择 LaTeX 模板文件夹' });
          if (dir) { setLocation(dir); setSourceKind('auto'); }
        })}><FolderOpen size={12} />选择文件夹</button>
        <button type="button" disabled={locked || !location.trim()} onClick={() => void importTemplate()}><Download size={12} />导入模板</button>
      </div>
    </div>}
    {busy && <p className="paper-template-progress" role="status"><Loader2 size={13} className="animate-spin" />{busy}</p>}
    {error && <p className="paper-template-import-error" role="alert"><AlertCircle size={13} />{error}</p>}
  </div>;
}
