import React, { useEffect } from 'react';
import { TopToolbar } from './components/toolbar/TopToolbar';
import { LeftTabbedSidebar } from './components/sidebar/LeftTabbedSidebar';
import { InteractiveCanvas } from './components/canvas/InteractiveCanvas';
import { PropertyPanel } from './components/inspector/PropertyPanel';
import { RightAgentPanel } from './components/agent/RightAgentPanel';
import { SettingsModal } from './components/settings/SettingsModal';
import { useSettingsStore } from './store/useSettingsStore';

export const App: React.FC = () => {
  const { isOpen, openSettings, closeSettings } = useSettingsStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        if (isOpen) {
          closeSettings();
        } else {
          openSettings('agent');
        }
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

        <main className="relative flex-1 h-full min-w-0 bg-white flex flex-col overflow-hidden shadow-sm">
          <InteractiveCanvas />
          <PropertyPanel />
        </main>

        <RightAgentPanel />
      </div>

      <SettingsModal />
    </div>
  );
};

export default App;
