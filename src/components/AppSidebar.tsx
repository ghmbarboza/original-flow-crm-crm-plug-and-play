import { NavLink, useLocation } from "react-router-dom";
import {
  Award,
  BarChart2,
  Building2,
  CalendarDays,
  CheckSquare,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  Mic,
  Package,
  Settings,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function getRoleLabel(role?: string | null) {
  if (!role) return "";
  if (role === "admin") return "Administrador";
  if (role === "member") return "Membro";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { signOut, profile, role } = useAuth();

  const groups = [
    {
      label: "CRM",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Contatos", url: "/contacts", icon: Users },
        { title: "Empresas", url: "/companies", icon: Building2 },
        { title: "Negócios", url: "/deals", icon: TrendingUp },
        { title: "Tarefas", url: "/tasks", icon: CheckSquare },
        { title: "Agenda", url: "/agenda", icon: CalendarDays },
        { title: "Produtos/Serviços", url: "/products", icon: Package },
      ],
    },
    {
      // Reorganização final de 2026-07-31: o sidebar ficou só com o dia a dia
      // (CRM, Atendimento, Analytics). Equipe, Automações e Sequências viraram
      // abas de Configurações, e em 17/09/2026 Campanhas e Biblioteca também.
      // As rotas antigas redirecionam.
      label: "Atendimento",
      items: [
        { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
        { title: "Email", url: "/inbox", icon: Mail },
        { title: "Voz", url: "/voz", icon: Mic },
      ],
    },
    {
      label: "Analytics",
      items: [
        { title: "Relatórios", url: "/reports", icon: BarChart2 },
        { title: "Metas", url: "/sales-goals", icon: Target },
        { title: "Lead Scoring", url: "/lead-scoring", icon: Award },
      ],
    },
  ];

  const activeClass =
    "data-[active=true]:bg-via-navy data-[active=true]:text-white data-[active=true]:hover:bg-via-blue data-[active=true]:hover:text-white data-[active=false]:hover:bg-via-navy/10";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div
          className={cn(
            "flex items-center gap-2 py-2",
            collapsed ? "w-full justify-center px-0" : "px-2"
          )}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-via-navy text-white via-wordmark text-sm leading-none"
            style={{ lineHeight: 1, letterSpacing: 0 }}
          >
            V
          </span>
          {!collapsed && (
            <span className="via-wordmark text-sm text-sidebar-foreground">Viver de IA</span>
          )}
        </div>
      </SidebarHeader>
      {/* Região central: único ponto de scroll (fixa header/rodapé). Comprime para
          caber sem barra visível; abaixo de ~768px rola com scrollbar invisível. */}
      <SidebarContent className="gap-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-0.5">
            <SidebarGroupLabel className="h-6">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.url)}
                      className={cn("text-sidebar-foreground h-7", activeClass)}
                      tooltip={item.title}
                    >
                      <NavLink to={item.url} className="flex items-center gap-2 no-underline hover:no-underline">
                        <item.icon className="h-4 w-4" strokeWidth={1.5} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              className={cn("text-sidebar-foreground h-7", activeClass)}
              tooltip="Configurações"
            >
              <NavLink to="/settings" className="flex items-center gap-2 no-underline hover:no-underline">
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                {!collapsed && <span>Configurações</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/help")}
              className={cn("text-sidebar-foreground h-7", activeClass)}
              tooltip="Ajuda"
            >
              <NavLink to="/help" className="flex items-center gap-2 no-underline hover:no-underline">
                <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
                {!collapsed && <span>Ajuda</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {profile && (
          <div
            className={cn(
              "flex items-center gap-2 py-1.5",
              collapsed ? "justify-center px-0" : "px-2"
            )}
          >
            <Avatar
              className="h-8 w-8"
              title={collapsed ? `${profile.full_name}${role ? ` · ${getRoleLabel(role)}` : ""}` : undefined}
            >
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
              <AvatarFallback className="bg-via-navy text-white text-xs">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm text-sidebar-foreground">{profile.full_name}</div>
                  {role && (
                    <div className="truncate text-xs text-sidebar-foreground/60">{getRoleLabel(role)}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sair"
                  aria-label="Sair"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
