import React, { useEffect } from 'react';
import { TopToolbar } from './components/toolbar/TopToolbar';
import { LeftTabbedSidebar } from './components/sidebar/LeftTabbedSidebar';
import { InteractiveCanvas } from './components/canvas/InteractiveCanvas';
import {
  FloatingSelectionBar,
  PropertyPanel,
} from './components/inspector/PropertyPanel';
import { RightAgentPanel } from './components/agent/RightAgentPanel';
import { SettingsModal } from './components/settings/SettingsModal';
import { CanvasTabsBar } from './components/project/CanvasTabsBar';
import { ProjectPickerModal } from './components/project/ProjectPickerModal';
import { PaperWorkspaceView } from './components/paper/PaperWorkspaceView';
import { InsertFigureModal } from './components/paper/InsertFigureModal';
import { useSettingsStore } from './store/useSettingsStore';
import { useProjectStore } from './store/useProjectStore';

export const App: React.FC = () => {
  const { isOpen, openSettings, closeSettings } = useSettingsStore();
  const workbenchMode = useProjectStore((s) => s.workbenchMode);

  useEffect(() => {
    void useProjectStore.getState().initOnStartup();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        if (isOpen) {
          closeSettings();
        } else {
          openSettings('agent');
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void useProjectStore.getState().saveActiveCanvasNow();
        if (useProjectStore.getState().workbenchMode !== 'figure') {
          void useProjectStore.getState().savePaperFileNow();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        useProjectStore.getState().setPickerOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, openSettings, closeSettings]);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <TopToolbar />

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <LeftTabbedSidebar />

        <main className="relative flex-1 h-full min-w-0 bg-slate-200/70 flex flex-row overflow-hidden shadow-sm">
          {(workbenchMode === 'paper' || workbenchMode === 'split') && (
            <div
              className={
                workbenchMode === 'split'
                  ? 'w-[48%] h-full min-w-[340px] flex flex-col overflow-hidden'
                  : 'flex-1 h-full min-w-0 flex flex-col overflow-hidden'
              }
            >
              <PaperWorkspaceView />
            </div>
          )}

          {(workbenchMode === 'figure' || workbenchMode === 'split') && (
            <div className="relative flex-1 h-full min-w-0 flex flex-col overflow-hidden">
              <CanvasTabsBar />
              <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col">
                <FloatingSelectionBar />
                <InteractiveCanvas />
                <PropertyPanel />
              </div>
            </div>
          )}
        </main>

        <RightAgentPanel />
      </div>

      <SettingsModal />
      <ProjectPickerModal />
      <InsertFigureModal />
    </div>
  );
};

export default App;

