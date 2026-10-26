import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { LayoutDashboard, Compass, Sparkles, Mic, MessagesSquare, Heart, Users, Hexagon, CalendarDays, LogOut, Sun, Moon, Mail } from "lucide-react";
import { Toaster } from "sonner";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { CoachBubble } from "@/components/CoachBubble";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/parcours", label: "Mon parcours", icon: Compass },
  { to: "/presence-ia", label: "Présence IA", icon: Sparkles },
  { to: "/talk-show", label: "Talk Show", icon: Mic },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/forum", label: "Forum", icon: MessagesSquare },
  { to: "/matching", label: "Matching", icon: Heart },
  { to: "/membres", label: "Membres", icon: Users },
  { to: "/messages", label: "Messages", icon: Mail },
  { to: "/ruches", label: "Ruches", icon: Hexagon },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("presence-theme") === "sombre"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("presence-theme", dark ? "sombre" : "clair"); } catch { /* ignore */ }
  }, [dark]);
  return { dark, setDark };
}

export default function Layout() {
  const { dark, setDark } = useTheme();
  const me = trpc.members.me.useQuery();
  const unread = trpc.messages.unreadCount.useQuery(undefined, { refetchInterval: 8000 });

  return (
    <div className="min-h-screen flex flex-wrap">
      <aside className="flex-[1_1_236px] max-w-[260px] flex flex-col border-r" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)" }}>
        <NavLink to="/" className="flex flex-col items-start gap-2.5 px-6 py-5 border-b no-underline" style={{ borderColor: "var(--p-menu-line)", color: "var(--p-ink)" }}>
          <span className="text-[13px] tracking-[0.2em] uppercase p-muted">Laura Ballo</span>
          <span className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] rounded-full" style={{ background: "var(--p-accent)" }} />
            <span className="serif text-[29px] leading-none">Présence</span>
          </span>
        </NavLink>
        <nav className="flex flex-col gap-1 px-3.5 py-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3.5 min-h-[46px] px-3.5 rounded-xl text-[15.5px] no-underline transition-colors ${isActive ? "text-white font-medium" : "hover:bg-black/5 dark:hover:bg-white/5"}`
              }
              style={({ isActive }) => (isActive ? { background: "var(--p-accent)" } : { color: "var(--p-menu-ink)" })}
            >
              <Icon size={19} strokeWidth={1.6} />
              <span className="flex-1">{label}</span>
              {to === "/messages" && !!unread.data && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold flex items-center justify-center" style={{ background: "var(--p-ink)", color: "var(--p-surface)" }}>{unread.data > 99 ? "99+" : unread.data}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3.5 pb-3">
          <button
            type="button"
            onClick={() => setDark(!dark)}
            className="w-full flex items-center justify-between h-10 px-3.5 rounded-full border text-[13px] font-medium"
            style={{ borderColor: "var(--p-menu-line)", color: "var(--p-menu-ink)", background: "var(--p-surface)" }}
          >
            <span>{dark ? "Mode sombre" : "Mode clair"}</span>
            {dark ? <Moon size={15} /> : <Sun size={15} />}
          </button>
        </div>
        <div className="flex items-center gap-3 px-5 py-4 border-t" style={{ borderColor: "var(--p-menu-line)" }}>
          {me.data ? <Avatar m={me.data} size={40} /> : <div className="w-10 h-10 rounded-full" style={{ background: "var(--p-track)" }} />}
          <span className="flex flex-col flex-1 min-w-0">
            <span className="text-[14.5px] font-medium truncate" style={{ color: "var(--p-ink)" }}>{me.data?.name ?? "…"}</span>
            <span className="text-[12.5px]" style={{ color: "var(--p-menu-ink)" }}>{me.data?.role ?? ""}</span>
          </span>
          <button type="button" aria-label="Se déconnecter" title="Authentification à venir" className="w-10 h-10 flex items-center justify-center rounded-lg" style={{ color: "var(--p-menu-ink)" }}>
            <LogOut size={18} strokeWidth={1.6} />
          </button>
        </div>
      </aside>

      <main className="flex-[999_1_560px] min-w-0 px-4 sm:px-8 lg:px-14 pt-10 pb-20">
        <div className="max-w-[1100px] mx-auto">
          <Outlet />
        </div>
      </main>
      <CoachBubble />
      <Toaster position="top-center" richColors />
    </div>
  );
}

export function PageHeader({ eyebrow, title, intro, action }: { eyebrow: string; title: string; intro?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 mb-8">
      <div className="flex flex-col gap-3 max-w-[700px]">
        <span className="p-eyebrow">{eyebrow}</span>
        <h1 className="text-[clamp(38px,5vw,56px)] leading-[1.05] m-0">{title}</h1>
        {intro && <p className="m-0 text-[17px] leading-relaxed p-muted">{intro}</p>}
      </div>
      {action}
    </header>
  );
}
