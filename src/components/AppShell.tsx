import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        {/* min-w-0: item de flex não encolhe abaixo da largura intrínseca do
            conteúdo (min-width: auto). Sem isto, qualquer tabela ou kanban largo
            esticava a coluna inteira e a PÁGINA rolava de lado no celular — os
            overflow-x-auto internos nunca chegavam a ativar. Era o
            overflow-horizontal-mobile da auditoria em 5 telas. */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-12 flex items-center justify-between border-b bg-card">
            <SidebarTrigger className="ml-2" />
            <div className="mr-2">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
