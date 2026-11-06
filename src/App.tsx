import React from 'react';
import { TopToolbar } from './components/toolbar/TopToolbar';
import { LeftTabbedSidebar } from './components/sidebar/LeftTabbedSidebar';
import { InteractiveCanvas } from './components/canvas/InteractiveCanvas';
import { PropertyPanel } from './components/inspector/PropertyPanel';
import { RightAgentPanel } from './components/agent/RightAgentPanel';

export const App: React.FC = () => {
  return (
    <div className="flex flex-col w-screen h-screen bg-white text-slate-900 overflow-hidden">
      {/* Top Toolbar */}
      <TopToolbar />

      {/* Main 3-Column Workspace (Pure White Theme):
          1. Left Tabbed Sidebar ([组件与模板库] | [TikZ 代码面板])
          2. Center Full-Height Pure White Visual Canvas + Floating Inspector
          3. Right Docked BYOA / ACP Agent Chat Window */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden bg-white">
        <LeftTabbedSidebar />

        <main className="relative flex-1 h-full min-w-0 bg-white flex flex-col overflow-hidden">
          <InteractiveCanvas />
          <PropertyPanel />
        </main>

        <RightAgentPanel />
      </div>
    </div>
  );
};

export default App;
