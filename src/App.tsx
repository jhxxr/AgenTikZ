import React from 'react';
import { TopToolbar } from './components/toolbar/TopToolbar';
import { LeftTabbedSidebar } from './components/sidebar/LeftTabbedSidebar';
import { InteractiveCanvas } from './components/canvas/InteractiveCanvas';
import { PropertyPanel } from './components/inspector/PropertyPanel';
import { RightAgentPanel } from './components/agent/RightAgentPanel';

export const App: React.FC = () => {
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
    </div>
  );
};

export default App;
