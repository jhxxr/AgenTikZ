import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, ArrowRight, Clock, FileText, FolderOpen, Loader2, Plus, Star, Trash2, X } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { PaperTemplatePicker } from './PaperTemplatePicker';
import './ProjectPickerModal.css';

export const ProjectPickerModal: React.FC = () => {
  const {
    isPickerOpen, pickerTab, setPickerOpen, projectDir, projectName, lastProjectDir,
    autoOpenLastProject, setAutoOpenLastProject, recentProjects, pickAndOpenDirectory,
    openProjectDirectory, initPaperWorkspace, togglePinRecentProject, removeRecentProject, errorMessage,
  } = useProjectStore(useShallow((s) => ({
    isPickerOpen: s.isPickerOpen, pickerTab: s.pickerTab, setPickerOpen: s.setPickerOpen,
    projectDir: s.projectDir, projectName: s.projectName, lastProjectDir: s.lastProjectDir,
    autoOpenLastProject: s.autoOpenLastProject, setAutoOpenLastProject: s.setAutoOpenLastProject,
    recentProjects: s.recentProjects, pickAndOpenDirectory: s.pickAndOpenDirectory,
    openProjectDirectory: s.openProjectDirectory, initPaperWorkspace: s.initPaperWorkspace,
    togglePinRecentProject: s.togglePinRecentProject, removeRecentProject: s.removeRecentProject,
    errorMessage: s.errorMessage,
  })));
  const [manualPath, setManualPath] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [folderName, setFolderName] = useState('');
  const [templateId, setTemplateId] = useState('blank');
  const [isOpening, setIsOpening] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const busy = isOpening || templateBusy;
  const creating = pickerTab === 'create_template';

  useEffect(() => {
    if (!isPickerOpen) return;
    setManualPath(creating ? '' : projectDir || lastProjectDir || '');
  }, [isPickerOpen, creating, projectDir, lastProjectDir]);

  useEffect(() => {
    if (!isPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setPickerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isPickerOpen, busy, setPickerOpen]);

  if (!isPickerOpen) return null;

  const openRecent = async (path: string) => {
    setIsOpening(true);
    try { await openProjectDirectory(path); } finally { setIsOpening(false); }
  };
  const browse = async () => {
    if (!creating) {
      setIsOpening(true);
      try { await pickAndOpenDirectory(); } finally { setIsOpening(false); }
      return;
    }
    if ('__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        const path = await invoke<string | null>('project_pick_directory', { initialDir: projectDir || lastProjectDir || null });
        if (path) setManualPath(path);
      } catch (error) { useProjectStore.setState({ errorMessage: String(error) }); }
    } else {
      const path = window.prompt('输入存放论文的父文件夹路径（浏览器预览）', manualPath || 'E:/Papers');
      if (path) setManualPath(path);
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !manualPath.trim()) return;
    setIsOpening(true);
    try {
      if (creating) {
        const name = folderName.trim();
        if (!name || /[\\/:*?"<>|]/.test(name) || name === '.' || name === '..' || /[. ]$/.test(name)) {
          useProjectStore.setState({ errorMessage: '请输入有效的项目文件夹名称，不包含路径分隔符或特殊字符。' });
          return;
        }
        const target = `${manualPath.trim().replace(/[\\/]+$/, '')}/${name}`;
        await initPaperWorkspace(target, templateId, paperTitle.trim() || name);
      } else await openProjectDirectory(manualPath.trim());
    } finally { setIsOpening(false); }
  };
  const recents = [...recentProjects].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.lastOpenedAt - a.lastOpenedAt);

  return (
    <div className="project-picker-overlay" onClick={() => !busy && setPickerOpen(false)}>
      <section className="project-picker" role="dialog" aria-modal="true" aria-labelledby="project-picker-title" onClick={(e) => e.stopPropagation()}>
        <header className="project-picker-heading">
          <div className="project-picker-heading-icon">{creating ? <FileText size={22} /> : <FolderOpen size={22} />}</div>
          <div><h1 id="project-picker-title">{creating ? '新建论文' : '打开项目'}</h1><p>{creating ? '选择论文模板，创建属于你的独立项目。' : '继续最近的工作，或打开本地 LaTeX 项目。'}</p></div>
          <button type="button" className="project-picker-icon" disabled={busy} title="关闭" onClick={() => setPickerOpen(false)}><X size={17} /></button>
        </header>
        <nav className="project-picker-tabs" aria-label="项目操作">
          <button type="button" disabled={busy} aria-pressed={!creating} onClick={() => setPickerOpen(true, 'open')}><FolderOpen size={14} />打开项目</button>
          <button type="button" disabled={busy} aria-pressed={creating} onClick={() => setPickerOpen(true, 'create_template')}><Plus size={14} />新建论文</button>
        </nav>
        <div className="project-picker-body">
          {errorMessage && <p className="project-picker-error" role="alert"><AlertCircle size={15} />{errorMessage}</p>}
          <form id="project-picker-form" onSubmit={submit}>
            {creating && <>
              <div className="project-picker-fields">
                <label>项目名称<input autoFocus required value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="my-research-paper" disabled={busy} /></label>
                <label>论文标题<input value={paperTitle} onChange={(e) => setPaperTitle(e.target.value)} placeholder="空白论文使用此标题；官方模板请在主文件中修改" disabled={busy} /></label>
              </div>
              <PaperTemplatePicker value={templateId} onChange={setTemplateId} disabled={isOpening} onBusyChange={setTemplateBusy} />
            </>}
            <label className="project-picker-path-label" htmlFor="project-path">{creating ? '存放位置（父文件夹）' : '本地项目文件夹'}</label>
            <div className="project-picker-path"><input id="project-path" required value={manualPath} onChange={(e) => setManualPath(e.target.value)} placeholder="例如 E:/Papers" disabled={busy} /><button type="button" onClick={() => void browse()} disabled={busy}><FolderOpen size={14} />浏览</button></div>
            {creating && <p className="project-picker-location">新项目：{manualPath.replace(/[\\/]+$/, '') || '所选文件夹'}/{folderName || '项目名称'}</p>}
          </form>
          {!creating && <div className="project-picker-recents">
            <h2><Clock size={13} />最近项目<span>{recents.length}</span></h2>
            {recents.length === 0 ? <p className="project-picker-no-recents">还没有最近项目，选择文件夹开始。</p> : recents.map((project) => <div className="project-picker-recent" key={project.path}>
              <button type="button" disabled={busy} onClick={() => void openRecent(project.path)}><FileText size={17} /><span><strong>{project.name}</strong><small>{project.path}</small></span>{project.path === projectDir && <em>当前</em>}<ArrowRight size={13} /></button>
              <button type="button" className="project-picker-icon" disabled={busy} title={project.pinned ? '取消置顶' : '置顶项目'} onClick={() => togglePinRecentProject(project.path)}><Star size={13} fill={project.pinned ? 'currentColor' : 'none'} /></button>
              <button type="button" className="project-picker-icon" disabled={busy} title="从最近记录中移除" onClick={() => removeRecentProject(project.path)}><Trash2 size={13} /></button>
            </div>)}
          </div>}
          <label className="project-picker-startup"><input type="checkbox" checked={autoOpenLastProject} onChange={(e) => setAutoOpenLastProject(e.target.checked)} />启动时恢复上次项目</label>
        </div>
        <footer className="project-picker-footer"><span>{projectDir ? `当前：${projectName}` : '文件保存在你选择的本地目录'}</span><button type="button" className="project-picker-cancel" disabled={busy} onClick={() => setPickerOpen(false)}>取消</button><button type="submit" form="project-picker-form" disabled={busy || !manualPath.trim() || (creating && !folderName.trim())} className="project-picker-submit">{isOpening ? <Loader2 size={13} className="animate-spin" /> : creating ? <Plus size={13} /> : <FolderOpen size={13} />}{isOpening ? '请稍候' : creating ? '创建论文' : '打开项目'}</button></footer>
      </section>
    </div>
  );
};
