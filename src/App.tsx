import React, { useEffect } from 'react';
import { TopToolbar } from './components/toolbar/TopToolbar';
import { LeftTabbedSidebar } from './components/sidebar/LeftTabbedSidebar';
import { InteractiveCanvas } from './components/canvas/InteractiveCanvas';
import { PropertyPanel } from './components/inspector/PropertyPanel';
import { RightAgentPanel } from './components/agent/RightAgentPanel';
import { SettingsModal } from './components/settings/SettingsModal';
import { CanvasTabsBar } from './components/project/CanvasTabsBar';
import { ProjectPickerModal } from './components/project/ProjectPickerModal';
import { useSettingsStore } from './store/useSettingsStore';
import { useProjectStore } from './store/useProjectStore';

export const App: React.FC = () => {
  const { isOpen, openSettings, closeSettings } = useSettingsStore();

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

        <main className="relative flex-1 h-full min-w-0 bg-slate-200/70 flex flex-col overflow-hidden shadow-sm">
          <CanvasTabsBar />
          <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col">
            <InteractiveCanvas />
          </div>
        </main>

        <PropertyPanel />
        <RightAgentPanel />
      </div>

      <SettingsModal />
      <ProjectPickerModal />
    </div>
  );
};

export default App;
