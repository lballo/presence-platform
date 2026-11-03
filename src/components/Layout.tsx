import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme, type Theme } from "@/lib/theme";
import { NavLink, Outlet, useLocation } from "react-router";
import { Home, Compass, Mic, MessagesSquare, Users, Hexagon, CalendarDays, CalendarCog, ChevronLeft, ChevronRight, Flower2, Handshake, LogOut, Sun, Moon, Menu, PenLine, Settings, ShieldCheck, X } from "lucide-react";
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

// L'accueil regroupe aussi le profil et ses sous-pages (/profil…)
const isHome = (pathname: string) => pathname === "/" || pathname === "/profil" || pathname.startsWith("/profil/");

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

/** En douceur, le logo de Laura (piste E) ; menu réduit, sa seule initiale. */
function MenuBrand({ theme, collapsed }: { theme: Theme; collapsed: boolean }) {
  if (collapsed) return <span aria-label="Présence" className="block text-center font-['Newsreader'] text-[34px] leading-[46px]" style={{ color: "var(--p-accent)" }}>P</span>;
  if (theme === "douceur") return <img src="/logo-presence.png" alt="Présence, prendre votre place, incarner votre présence" className="h-[46px] w-auto ml-2.5" />;
  return <Brand />;
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

// L'entrée active : pleine couleur en clair et en sombre, pastille blanche à texte rouge en douceur. Menu réduit : l'icône seule.
const itemClass = (collapsed: boolean) => ({ isActive }: { isActive: boolean }) => `relative flex items-center ${collapsed ? "justify-center" : "gap-3.5"} min-h-[44px] px-3 rounded-[14px] text-[length:var(--p-nav-size)] no-underline transition-colors ${isActive ? "font-medium" : "hover:bg-[var(--p-hover)]"}`;
const itemStyle = ({ isActive }: { isActive: boolean }): CSSProperties => (isActive ? { background: "var(--p-nav-on-bg)", color: "var(--p-nav-on-ink)" } : { color: "var(--p-menu-ink)" });

const THEMES: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: "clair", label: "Clair", icon: Sun },
  { key: "sombre", label: "Sombre", icon: Moon },
  { key: "douceur", label: "Douceur", icon: Flower2 },
];

/** Le même bouton d'apparence, avec trois modes : clair, sombre, douceur. Menu réduit : les trois icônes l'une sous l'autre. */
function ThemeSwitch({ theme, setTheme, collapsed }: { theme: Theme; setTheme: (t: Theme) => void; collapsed?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Apparence" className={`w-full flex items-center gap-0.5 p-1 rounded-full border text-[12px] font-medium ${collapsed ? "flex-col rounded-[22px]" : "h-10"}`} style={{ borderColor: "var(--p-menu-line)", background: "var(--p-surface)" }}>
      {THEMES.map(({ key, label, icon: Icon }) => {
        const on = theme === key;
        return (
          <button key={key} type="button" role="radio" aria-checked={on} aria-label={collapsed ? `Mode ${label.toLowerCase()}` : undefined} title={`Mode ${label.toLowerCase()}`} onClick={() => setTheme(key)} className={`min-w-0 flex items-center justify-center gap-[3px] rounded-full transition-colors ${collapsed ? "w-9 h-9 flex-none" : "flex-auto h-full px-1.5"}`} style={on ? { background: "var(--p-chip-on-bg)", color: "var(--p-chip-on-ink)" } : { color: "var(--p-menu-ink)" }}>
            <Icon size={12} className="flex-none" />{!collapsed && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Une entrée du menu : libellé, ou icône seule avec son nom en info-bulle quand le menu est réduit. */
function Item({ to, label, icon: Icon, collapsed, end, active, badge, tour }: { to: string; label: string; icon: typeof Sun; collapsed: boolean; end?: boolean; active?: boolean; badge?: ReactNode; tour?: string }) {
  const cls = itemClass(collapsed);
  return (
    <NavLink to={to} end={end} data-tour={tour} aria-label={collapsed ? label : undefined} title={collapsed ? label : undefined}
      className={({ isActive }) => cls({ isActive: active ?? isActive })} style={({ isActive }) => itemStyle({ isActive: active ?? isActive })}>
      <Icon size={19} strokeWidth={1.5} className="flex-none" />
      {!collapsed && <span className="flex-1">{label}</span>}
      {badge && <span className={collapsed ? "absolute top-1.5 right-2 flex" : "flex"}>{badge}</span>}
    </NavLink>
  );
}

/**
 * Gestion : en bas du menu, jamais pour un membre simple.
 * L'administratrice y trouve l'administration et l'espace créateur (pleine page), l'organisateur les événements qu'il organise.
 */
function Gestion({ collapsed }: { collapsed: boolean }) {
  const p = trpc.members.me.useQuery().data?.permissions;
  const o = trpc.admin.overview.useQuery(undefined, { enabled: !!p?.adminPanel }).data;
  if (!p || !(p.adminPanel || p.buildCourses || p.publishEventsDirectly)) return null;
  const pending = o ? o.pending.total + o.openReports : 0;
  return (
    <nav aria-label="Gestion" className={`flex flex-col gap-1 pt-3 pb-3 border-t ${collapsed ? "px-2" : "px-3.5"}`} style={{ borderColor: "var(--p-menu-line)" }}>
      {!collapsed && <span className="px-3.5 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--p-menu-ink)" }}>Gestion</span>}
      {p.adminPanel && <Item to="/admin" label="Administration" icon={ShieldCheck} collapsed={collapsed} badge={pending ? (collapsed ? <span className="p-dot" /> : <UnreadBadge n={pending} />) : null} />}
      {p.adminPanel && <Item to="/admin/coaching" label="Suivi coaching" icon={Handshake} collapsed={collapsed} />}
      {p.buildCourses && <Item to="/admin/createur" label="Espace créateur" icon={PenLine} collapsed={collapsed} />}
      {p.publishEventsDirectly && <Item to="/gestion/evenements" label="Mes événements" icon={CalendarCog} collapsed={collapsed} />}
    </nav>
  );
}

type Signals = { dots: Record<string, boolean>; live: { title: string } | null | undefined };

/** Contenu du menu : utilisé dans la barre latérale (ordinateur, réductible) et dans le tiroir (mobile). */
function MenuContent({ dots, live, theme, setTheme, collapsed = false, onCollapse }: Signals & { theme: Theme; setTheme: (t: Theme) => void; collapsed?: boolean; onCollapse?: () => void }) {
  const me = trpc.members.me.useQuery();
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  return (
    <>
      <nav aria-label="Menu principal" className={`flex flex-col gap-[3px] pt-[34px] pb-4 ${collapsed ? "px-3.5" : "px-5"}`}>
        {NAV.map(({ to, label, icon }) => (
          <Item key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={to === "/"} tour={to} active={to === "/" ? isHome(pathname) : undefined}
            badge={to === "/evenements" && live ? <LiveDot title={live.title} /> : dots[to] ? <UnreadDot label="Annonces non lues" /> : null} />
        ))}
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label={collapsed ? "Déplier le menu" : "Réduire le menu"} title={collapsed ? "Déplier le menu" : undefined} className={`mt-[18px] inline-flex items-center gap-2 rounded-full border text-[12px] py-[7px] ${collapsed ? "self-center px-2" : "self-start px-3"}`} style={{ borderColor: "var(--p-line)", background: "var(--p-surface)", color: "var(--p-menu-ink)" }}>
            {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /> Réduire le menu</>}
          </button>
        )}
      </nav>
      <div className="mt-auto">
        <Gestion collapsed={collapsed} />
        <div className={collapsed ? "px-4 pb-3 flex justify-center" : "px-3.5 pb-3"}>
          <ThemeSwitch theme={theme} setTheme={setTheme} collapsed={collapsed} />
        </div>
      </div>
      <div className={`flex items-center gap-1 py-3 border-t ${collapsed ? "flex-col px-2" : "px-3"}`} style={{ borderColor: "var(--p-menu-line)" }}>
        {/* Un clic sur sa photo ou son nom ouvre les paramètres du compte */}
        <NavLink to="/parametres" aria-label="Mes paramètres" title="Mes paramètres" className={`flex items-center gap-3 min-w-0 rounded-xl no-underline hover:bg-[var(--p-hover)] ${collapsed ? "p-1.5" : "flex-1 px-2 py-1.5"}`} style={({ isActive }) => (isActive ? { background: "var(--p-accent-soft)" } : undefined)}>
          {me.data ? <Avatar m={me.data} size={collapsed ? 36 : 40} /> : <div className="w-10 h-10 rounded-full" style={{ background: "var(--p-track)" }} />}
          {!collapsed && (
            <span className="flex flex-col flex-1 min-w-0">
              <span className="text-[14.5px] font-medium truncate" style={{ color: "var(--p-ink)" }}>{me.data?.name ?? "…"}</span>
              <span className="text-[12.5px] truncate flex items-center gap-1" style={{ color: "var(--p-menu-ink)" }}><Settings size={12} className="flex-none" /> Paramètres</span>
            </span>
          )}
        </NavLink>
        <button type="button" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => signOut()} className="w-10 h-10 flex items-center justify-center rounded-lg" style={{ color: "var(--p-menu-ink)" }}>
          <LogOut size={18} strokeWidth={1.6} />
        </button>
      </div>
    </>
  );
}

/** Mon calendrier, à côté de la bulle des messages et de la cloche : même bouton rond, mais c'est un lien. */
function CalendarButton() {
  return (
    <NavLink to="/profil/calendrier" aria-label="Mon calendrier" title="Mon calendrier" className="relative flex-none w-10 h-10 flex items-center justify-center rounded-full no-underline" style={({ isActive }) => ({ color: "var(--p-ink)", background: isActive ? "var(--p-accent-soft)" : "var(--p-surface-2)" })}>
      <CalendarDays size={18} strokeWidth={1.7} />
    </NavLink>
  );
}

// Le menu réduit reste réduit d'une visite à l'autre
const COLLAPSE_KEY = "presence-menu";
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === "reduit"; } catch { return false; } };

// Barre d'onglets mobile : les rubriques les plus utilisées, le reste dans « Menu »
const TABS = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/parcours", label: "Parcours", icon: Compass },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/forum", label: "Forum", icon: MessagesSquare },
];

export default function Layout() {
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? "deplie" : "reduit"); } catch { /* ignore */ } return !c; });
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
      <aside aria-label="Navigation du réseau" className="hidden lg:flex flex-none flex-col border-r sticky top-0 h-screen overflow-y-auto transition-[width] duration-200" style={{ width: collapsed ? 92 : "var(--p-side-w)", background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)" }}>
        <NavLink to="/" className={`pt-7 no-underline ${collapsed ? "px-3.5" : "px-5"}`} style={{ color: "var(--p-ink)" }}><MenuBrand theme={theme} collapsed={collapsed} /></NavLink>
        <MenuContent dots={dots} live={live} theme={theme} setTheme={setTheme} collapsed={collapsed} onCollapse={toggleCollapsed} />
      </aside>

      {/* Mobile : barre du haut compacte */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b" style={{ background: "var(--p-menu-bg)", borderColor: "var(--p-menu-line)" }}>
        <button type="button" aria-label="Ouvrir le menu" aria-expanded={drawer} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: "var(--p-ink)" }} onClick={() => setDrawer(true)}><Menu size={22} /></button>
        <NavLink to="/" className="no-underline min-w-0" style={{ color: "var(--p-ink)" }}>{theme === "douceur" ? <img src="/logo-presence.png" alt="Présence" className="h-[30px] w-auto" /> : <Brand compact />}</NavLink>
        <span className="flex-1" />
        <CalendarButton />
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
              <MenuBrand theme={theme} collapsed={false} />
              <button type="button" aria-label="Fermer le menu" className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: "var(--p-ink)" }} onClick={() => setDrawer(false)}><X size={22} /></button>
            </div>
            <MenuContent dots={dots} live={live} theme={theme} setTheme={setTheme} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Ordinateur : en haut à droite, la bulle des messages et la cloche, comme sur Facebook */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-end gap-2.5 px-6" style={{ background: "var(--p-bg)" }}>
          <CalendarButton />
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
