import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { LayoutDashboard, Compass, Sparkles, Mic, MessagesSquare, Heart, Users, Hexagon, CalendarDays, LogOut, Sun, Moon, Mail, Menu, X } from "lucide-react";
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

function Brand({ compact }: { compact?: boolean }) {
  return (
    <span className="flex flex-col items-start gap-2.5">
      {!compact && <span className="text-[13px] tracking-[0.2em] uppercase p-muted">Laura Ballo</span>}
      <span className="flex items-center gap-2.5">
        <span className="w-[9px] h-[9px] rounded-full" style={{ background: "var(--p-accent)" }} />
        <span className={`serif leading-none ${compact ? "text-[25px]" : "text-[29px]"}`}>Présence</span>
      </span>
    </span>
  );
}

function UnreadBadge({ n, small }: { n?: number; small?: boolean }) {
  if (!n) return null;
  return <span className={`${small ? "min-w-[18px] h-[18px] text-[10.5px] px-1" : "min-w-[22px] h-[22px] text-[12px] px-1.5"} rounded-full font-semibold flex items-center justify-center`} style={{ background: "var(--p-accent)", color: "#fff" }}>{n > 99 ? "99+" : n}</span>;
}

/** Contenu du menu : utilisé dans la barre latérale (ordinateur) et dans le tiroir (mobile). */
function MenuContent({ unread, dark, setDark }: { unread?: number; dark: boolean; setDark: (v: boolean) => void }) {
  const me = trpc.members.me.useQuery();
  return (
    <>
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
            {to === "/messages" && <UnreadBadge n={unread} />}
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
        {me.data ? <NavLink to={`/membres/${me.data.id}`} aria-label="Mon profil"><Avatar m={me.data} size={40} /></NavLink> : <div className="w-10 h-10 rounded-full" style={{ background: "var(--p-track)" }} />}
        <span className="flex flex-col flex-1 min-w-0">
          <span className="text-[14.5px] font-medium truncate" style={{ color: "var(--p-ink)" }}>{me.data?.name ?? "…"}</span>
          <span className="text-[12.5px] truncate" style={{ color: "var(--p-menu-ink)" }}>{me.data?.role ?? ""}</span>
        </span>
        <button type="button" aria-label="Se déconnecter" title="Authentification à venir" className="w-10 h-10 flex items-center justify-center rounded-lg" style={{ color: "var(--p-menu-ink)" }}>
          <LogOut size={18} strokeWidth={1.6} />
        </button>
      </div>
    </>
  );
}

// Barre d'onglets mobile : les rubriques les plus utilisées, le reste dans « Menu »
const TABS = [
  { to: "/", label: "Accueil", icon: LayoutDashboard },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/forum", label: "Forum", icon: MessagesSquare },
  { to: "/messages", label: "Messages", icon: Mail },
];

export default function Layout() {
  const { dark, setDark } = useTheme();
  const me = trpc.members.me.useQuery();
  const unread = trpc.messages.unreadCount.useQuery(undefined, { refetchInterval: 8000 });
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Ordinateur : barre latérale fixe */}
      <aside className="hidden lg:flex w-[256px] flex-none flex-col border-r sticky top-0 h-screen overflow-y-auto" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)" }}>
        <NavLink to="/" className="px-6 py-5 border-b no-underline" style={{ borderColor: "var(--p-menu-line)", color: "var(--p-ink)" }}><Brand /></NavLink>
        <MenuContent unread={unread.data} dark={dark} setDark={setDark} />
      </aside>

      {/* Mobile : barre du haut compacte */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)" }}>
        <button type="button" aria-label="Ouvrir le menu" aria-expanded={drawer} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: "var(--p-ink)" }} onClick={() => setDrawer(true)}><Menu size={22} /></button>
        <NavLink to="/" className="no-underline" style={{ color: "var(--p-ink)" }}><Brand compact /></NavLink>
        <span className="flex-1" />
        {me.data && <NavLink to={`/membres/${me.data.id}`} aria-label="Mon profil"><Avatar m={me.data} size={34} /></NavLink>}
      </header>

      {/* Mobile : tiroir de navigation */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="p-drawer absolute left-0 top-0 bottom-0 w-[min(300px,85vw)] flex flex-col overflow-y-auto shadow-2xl" style={{ background: "var(--p-menu-bg)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--p-menu-line)" }}>
              <Brand />
              <button type="button" aria-label="Fermer le menu" className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: "var(--p-ink)" }} onClick={() => setDrawer(false)}><X size={22} /></button>
            </div>
            <MenuContent unread={unread.data} dark={dark} setDark={setDark} />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-14 pt-6 lg:pt-10 pb-28 lg:pb-20">
        <div className="max-w-[1100px] mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile : barre d'onglets en bas */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex border-t" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)", paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Navigation principale">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="flex-1 flex flex-col items-center justify-center gap-0.5 h-16 no-underline text-[11px] relative" style={({ isActive }) => ({ color: isActive ? "var(--p-accent-text)" : "var(--p-menu-ink)", fontWeight: isActive ? 600 : 400 })}>
            <span className="relative"><Icon size={21} strokeWidth={1.7} />{to === "/messages" && <span className="absolute -top-1.5 -right-2.5"><UnreadBadge n={unread.data} small /></span>}</span>
            {label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setDrawer(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 h-16 text-[11px]" style={{ color: "var(--p-menu-ink)" }}><Menu size={21} strokeWidth={1.7} />Menu</button>
      </nav>

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
