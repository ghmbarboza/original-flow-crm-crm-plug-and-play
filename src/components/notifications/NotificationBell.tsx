import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
  type Notification,
} from "@/hooks/useNotifications";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Rota de destino de uma notificação, quando conhecemos a entidade. */
function targetOf(n: Notification): string | null {
  if (!n.entity_id) return null;
  switch (n.entity_type) {
    case "deal":
      return `/deals/${n.entity_id}`;
    case "contact":
      return "/contacts";
    case "company":
      return "/companies";
    case "activity":
      return "/tasks";
    default:
      return null;
  }
}

export function NotificationBell() {
  useNotificationsRealtime();
  const { data: notifications, isLoading, error } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = notifications ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead.mutate(n.id);
    const target = targetOf(n);
    if (target) {
      setOpen(false);
      navigate(target);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}
        >
          <Bell className="h-5 w-5" strokeWidth={1.5} />
          {unread > 0 && (
            <span
              // coral-deep, não coral: branco em 10px sobre o coral puro dá
              // 3.7:1 e era a única falha de contraste do axe — em 19 telas,
              // porque o sino está em todas. Não usar --via-coral-dark: no tema
              // escuro ele vira rosa-claro (é token de TEXTO) e pioraria tudo.
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
              style={{ backgroundColor: "var(--via-coral-deep, #A14848)" }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Notificações
          </span>
          {unread > 0 && (
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="flex items-center gap-1 text-xs font-medium text-via-blue hover:underline disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              Marcar todas como lidas
            </button>
          )}
        </div>

        {/* O ScrollArea do Radix não funcionava aqui: o Viewport usa h-full e,
            sem altura definida no Root, 100% resolve como auto — a lista crescia
            e o overflow-hidden apenas cortava. Container com max-height + overflow
            próprio resolve e mantém a scrollbar nos tokens VIA. */}
        <div className="via-scroll max-h-[400px]">
          {error ? (
            <p className="px-4 py-6 text-center text-sm text-via-coral">
              Não foi possível carregar as notificações.
            </p>
          ) : isLoading ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
              Carregando…
            </p>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell
                className="mx-auto mb-2 h-6 w-6"
                strokeWidth={1.5}
                style={{ color: "var(--via-text-muted)" }}
              />
              <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                Nenhuma notificação por aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const clickable = !!targetOf(n);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={`flex w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-via-navy/5 ${
                        clickable ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "opacity-0" : ""}`}
                        style={{ backgroundColor: "var(--via-blue, #2563eb)" }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block text-sm font-medium"
                          style={{ color: "var(--via-text-primary)" }}
                        >
                          {n.title}
                        </span>
                        {n.body && (
                          <span
                            className="mt-0.5 block text-xs"
                            style={{ color: "var(--via-text-body)" }}
                          >
                            {n.body}
                          </span>
                        )}
                        <span
                          className="mt-1 block text-[11px]"
                          style={{ color: "var(--via-text-muted)" }}
                        >
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
