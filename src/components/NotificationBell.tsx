import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ago } from "@/lib/format";
import { HEADER_PANEL, HeaderButton } from "@/components/MessagesBubble";

/** Cloche : ce que l'équipe ou les organisateurs ont à vous dire (annulation, place libérée, décision…). */
export function NotificationBell() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const count = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60000 });
  const list = trpc.notifications.list.useQuery(undefined, { enabled: open });
  const mark = trpc.notifications.markRead.useMutation({ onSuccess: () => { utils.notifications.invalidate(); } });
  const unread = count.data ?? 0;
  return (
    <span className="relative flex-none">
      <HeaderButton label={unread ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"} count={unread} open={open} onClick={() => setOpen(!open)}>
        <Bell size={18} strokeWidth={1.7} />
      </HeaderButton>
      {open && (
        <>
          <button type="button" aria-label="Fermer les notifications" className="fixed inset-0 z-[44] cursor-default" onClick={() => setOpen(false)} />
          <div className={HEADER_PANEL} style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--p-line)" }}>
              <span className="serif text-[20px]">Notifications</span>
              {unread > 0 && <button type="button" className="p-btn-ghost min-h-0 text-[12.5px]" onClick={() => mark.mutate({})}>Tout marquer comme lu</button>}
            </div>
            {list.data?.map((n) => (
              <button key={n.id} type="button" className="w-full flex gap-2.5 px-4 py-3 text-left border-b last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5" style={{ borderColor: "var(--p-line)" }} onClick={() => { if (!n.readAt) mark.mutate({ id: n.id }); setOpen(false); if (n.href) navigate(n.href); }}>
                <span className="w-2 h-2 rounded-full mt-1.5 flex-none" style={{ background: n.readAt ? "transparent" : "var(--p-accent)" }} />
                <span className="flex-1 min-w-0 flex flex-col gap-0.5"><span className="text-[14px] font-medium leading-snug">{n.title}</span>{n.body && <span className="text-[13px] p-muted leading-snug">{n.body}</span>}<span className="text-[12px] p-faint">{ago(new Date(n.createdAt))}</span></span>
              </button>
            ))}
            {list.data?.length === 0 && <p className="m-0 p-6 text-center text-[14px] p-muted">Rien de nouveau.</p>}
          </div>
        </>
      )}
    </span>
  );
}
