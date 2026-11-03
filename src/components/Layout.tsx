import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme, type Theme } from "@/lib/theme";
import { NavLink, Outlet, useLocation } from "react-router";
import { Home, Compass, Mic, MessagesSquare, Users, Hexagon, CalendarDays, CalendarCog, Flower2, Handshake, LogOut, Sun, Moon, Menu, PenLine, Settings, ShieldCheck, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/providers/auth";
import { Avatar } from "@/components/Avatar";
import { CoachBubble } from "@/components/CoachBubble";
import { UnreadDot } from "@/components/forum/shared";
import { NotificationBell } from "@/components/NotificationBell";
import { MessagesBubble } from "@/components/MessagesBubble";
import { Tour } from "@/components/onboarding/Tour";
import { HoneyToast } from "@/components/onboarding/HoneyToast";

// Le menu d'un membre. Présence IA est dans Mon parcours, le matching dans Membres, les messages en haut à droite.
const NAV = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/parcours", label: "Mon parcours", icon: Compass },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/talk-show", label: "Talk Show", icon: Mic },
  { to: "/forum", label: "Forum", icon: MessagesSquare },
  { to: "/membres", label: "Membres", icon: Users },
  { to: "/ruches", label: "Ruches", icon: Hexagon },
];

export function Brand({ compact }: { compact?: boolean }) {
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

function UnreadBadge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="min-w-[22px] h-[22px] text-[12px] px-1.5 rounded-full font-semibold flex items-center justify-center" style={{ background: "var(--p-accent)", color: "#fff" }}>{n > 99 ? "99+" : n}</span>;
}

/** Pastille rouge : un salon est en cours. */
function LiveDot({ title }: { title?: string }) {
  const label = title ? `En direct : ${title}` : "Un salon est en direct";
  return (
    <span role="img" aria-label={label} title={label} className="relative flex w-[11px] h-[11px] flex-none">
      <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: "#E0352B" }} />
      <span className="relative w-[11px] h-[11px] rounded-full" style={{ background: "#E0352B", boxShadow: "0 0 0 2px var(--p-menu-bg)" }} />
    </span>
  );
}

// L'entrée active : pleine couleur en clair et en sombre, pastille blanche à texte rouge en douceur
const itemClass = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3.5 min-h-[46px] px-3.5 rounded-xl text-[15.5px] no-underline transition-colors ${isActive ? "font-medium" : "hover:bg-[var(--p-hover)]"}`;
const itemStyle = ({ isActive }: { isActive: boolean }): CSSProperties => (isActive ? { background: "var(--p-nav-on-bg)", color: "var(--p-nav-on-ink)" } : { color: "var(--p-menu-ink)" });

const THEMES: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: "clair", label: "Clair", icon: Sun },
  { key: "sombre", label: "Sombre", icon: Moon },
  { key: "douceur", label: "Douceur", icon: Flower2 },
];

/** Le même bouton d'apparence, avec trois modes : clair, sombre, douceur. */
function ThemeSwitch({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <div role="radiogroup" aria-label="Apparence" className="w-full flex items-center gap-0.5 h-10 p-1 rounded-full border text-[12.5px] font-medium" style={{ borderColor: "var(--p-menu-line)", background: "var(--p-surface)" }}>
      {THEMES.map(({ key, label, icon: Icon }) => {
        const on = theme === key;
        return (
          <button key={key} type="button" role="radio" aria-checked={on} title={`Mode ${label.toLowerCase()}`} onClick={() => setTheme(key)} className="flex-1 min-w-0 h-full flex items-center justify-center gap-1 rounded-full transition-colors" style={on ? { background: "var(--p-chip-on-bg)", color: "var(--p-chip-on-ink)" } : { color: "var(--p-menu-ink)" }}>
            <Icon size={13} className="flex-none" /><span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Entrée réservée aux administrateurs, avec ce qui attend une décision. */
function AdminEntry() {
  const o = trpc.admin.overview.useQuery().data;
  return (
    <NavLink to="/admin" className={itemClass} style={itemStyle}>
      <ShieldCheck size={19} strokeWidth={1.6} />
      <span className="flex-1">Administration</span>
      <UnreadBadge n={o ? o.pending.total + o.openReports : 0} />
    </NavLink>
  );
}

/**
 * Gestion : en bas du menu, jamais pour un membre simple.
 * L'administratrice y trouve l'administration et l'espace créateur (pleine page), l'organisateur les événements qu'il organise.
 */
function Gestion() {
  const p = trpc.members.me.useQuery().data?.permissions;
  if (!p || !(p.adminPanel || p.buildCourses || p.publishEventsDirectly)) return null;
  return (
    <nav aria-label="Gestion" className="flex flex-col gap-1 px-3.5 pt-3 pb-3 border-t" style={{ borderColor: "var(--p-menu-line)" }}>
      <span className="px-3.5 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--p-menu-ink)" }}>Gestion</span>
      {p.adminPanel && <AdminEntry />}
      {p.adminPanel && <NavLink to="/admin/coaching" className={itemClass} style={itemStyle}><Handshake size={19} strokeWidth={1.6} /><span className="flex-1">Suivi coaching</span></NavLink>}
      {p.buildCourses && <NavLink to="/admin/createur" className={itemClass} style={itemStyle}><PenLine size={19} strokeWidth={1.6} /><span className="flex-1">Espace créateur</span></NavLink>}
      {p.publishEventsDirectly && <NavLink to="/gestion/evenements" className={itemClass} style={itemStyle}><CalendarCog size={19} strokeWidth={1.6} /><span className="flex-1">Mes événements</span></NavLink>}
    </nav>
  );
}

type Signals = { dots: Record<string, boolean>; live: { title: string } | null | undefined };

/** Contenu du menu : utilisé dans la barre latérale (ordinateur) et dans le tiroir (mobile). */
function MenuContent({ dots, live, theme, setTheme }: Signals & { theme: Theme; setTheme: (t: Theme) => void }) {
  const me = trpc.members.me.useQuery();
  const { signOut } = useAuth();
  return (
    <>
      <nav aria-label="Menu principal" className="flex flex-col gap-1 px-3.5 py-5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} data-tour={to} className={itemClass} style={itemStyle}>
            {({ isActive }) => (
              <>
                <Icon size={19} strokeWidth={1.6} />
                <span className="flex-1">{label}</span>
                {to === "/evenements" && live && <LiveDot title={live.title} />}
                {dots[to] && <UnreadDot label="Annonces non lues" light={isActive} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <Gestion />
        <div className="px-3.5 pb-3">
          <ThemeSwitch theme={theme} setTheme={setTheme} />
        </div>
      </div>
      <div className="flex items-center gap-1 px-3 py-3 border-t" style={{ borderColor: "var(--p-menu-line)" }}>
        {/* Un clic sur sa photo ou son nom ouvre les paramètres du compte */}
        <NavLink to="/parametres" aria-label="Mes paramètres" title="Mes paramètres" className="flex items-center gap-3 flex-1 min-w-0 px-2 py-1.5 rounded-xl no-underline hover:bg-[var(--p-hover)]" style={({ isActive }) => (isActive ? { background: "var(--p-accent-soft)" } : undefined)}>
          {me.data ? <Avatar m={me.data} size={40} /> : <div className="w-10 h-10 rounded-full" style={{ background: "var(--p-track)" }} />}
          <span className="flex flex-col flex-1 min-w-0">
            <span className="text-[14.5px] font-medium truncate" style={{ color: "var(--p-ink)" }}>{me.data?.name ?? "…"}</span>
            <span className="text-[12.5px] truncate flex items-center gap-1" style={{ color: "var(--p-menu-ink)" }}><Settings size={12} className="flex-none" /> Paramètres</span>
          </span>
        </NavLink>
        <button type="button" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => signOut()} className="w-10 h-10 flex items-center justify-center rounded-lg" style={{ color: "var(--p-menu-ink)" }}>
          <LogOut size={18} strokeWidth={1.6} />
        </button>
      </div>
    </>
  );
}

// Barre d'onglets mobile : les rubriques les plus utilisées, le reste dans « Menu »
const TABS = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/parcours", label: "Parcours", icon: Compass },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/forum", label: "Forum", icon: MessagesSquare },
];

export default function Layout() {
  const { theme, setTheme } = useTheme();
  const me = trpc.members.me.useQuery();
  const unread = trpc.messages.unreadCount.useQuery(undefined, { refetchInterval: 8000 });
  const announcements = trpc.forum.unread.useQuery(undefined, { refetchInterval: 60000 });
  const live = trpc.events.liveNow.useQuery(undefined, { refetchInterval: 60000 }).data;
  const dots = { "/forum": !!announcements.data?.annonces, "/ruches": Object.keys(announcements.data?.hives ?? {}).length > 0 };
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  const forum = pathname.startsWith("/forum");

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
        <MenuContent dots={dots} live={live} theme={theme} setTheme={setTheme} />
      </aside>

      {/* Mobile : barre du haut compacte */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)" }}>
        <button type="button" aria-label="Ouvrir le menu" aria-expanded={drawer} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: "var(--p-ink)" }} onClick={() => setDrawer(true)}><Menu size={22} /></button>
        <NavLink to="/" className="no-underline" style={{ color: "var(--p-ink)" }}><Brand compact /></NavLink>
        <span className="flex-1" />
        <MessagesBubble unread={unread.data ?? 0} />
        <NotificationBell />
        {me.data && <NavLink to="/profil" aria-label="Mon profil" className="ml-1"><Avatar m={me.data} size={34} /></NavLink>}
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
            <MenuContent dots={dots} live={live} theme={theme} setTheme={setTheme} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Ordinateur : en haut à droite, la bulle des messages et la cloche, comme sur Facebook */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-end gap-2.5 px-6" style={{ background: "var(--p-bg)" }}>
          <MessagesBubble unread={unread.data ?? 0} />
          <NotificationBell />
        </header>

        {/* Sur ordinateur, le menu du forum vient juste après celui de l'application : pas de marge ni de centrage à gauche. */}
        <main className={`flex-1 min-w-0 px-4 sm:px-8 pt-6 pb-28 lg:pb-20 ${forum ? "lg:pl-0 lg:pr-14 lg:pt-0" : "lg:px-14 lg:pt-4"}`}>
          <div className={`max-w-[1100px] mx-auto ${forum ? "lg:max-w-none lg:mx-0" : ""}`}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile : barre d'onglets en bas */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex border-t" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)", paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Navigation principale">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} data-tour={to} className="flex-1 flex flex-col items-center justify-center gap-0.5 h-16 no-underline text-[11px] relative" style={({ isActive }) => ({ color: isActive ? "var(--p-accent-text)" : "var(--p-menu-ink)", fontWeight: isActive ? 600 : 400 })}>
            <span className="relative"><Icon size={21} strokeWidth={1.7} />{to === "/evenements" && live && <span className="absolute -top-1 -right-1.5 flex"><LiveDot title={live.title} /></span>}{to === "/forum" && dots["/forum"] && <span className="absolute -top-0.5 -right-1 flex"><UnreadDot label="Annonces non lues" /></span>}</span>
            {label}
          </NavLink>
        ))}
        <button type="button" data-tour="menu" onClick={() => setDrawer(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 h-16 text-[11px]" style={{ color: "var(--p-menu-ink)" }}><Menu size={21} strokeWidth={1.7} />Menu</button>
      </nav>

      <CoachBubble />
      <Tour />
      <HoneyToast />
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
