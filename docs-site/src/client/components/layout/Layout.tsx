import type { ReactNode } from 'react';
import { SidebarProvider } from './SidebarContext.js';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { MainContent } from './MainContent.js';

// ---------------------------------------------------------------------------
// Layout — warm minimal 3-panel layout (fixed TopBar + fixed Sidebar + Content)
// Mobile: sidebar becomes a slide-out drawer with backdrop overlay
// ---------------------------------------------------------------------------

export function Layout({ children }: { children?: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen bg-bg-primary">
        {/* Fixed Top Bar */}
        <TopBar />

        {/* Main area: Fixed Sidebar + Scrollable Content */}
        <div className="flex pt-[var(--size-topbar-height)] h-screen">
          <Sidebar />
          <MainContent>{children}</MainContent>
        </div>
      </div>
    </SidebarProvider>
  );
}
