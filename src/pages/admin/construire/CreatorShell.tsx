import { Component, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { ArrowUpRight, BellRing, BookOpen, ChevronRight, ClipboardCheck, Menu, Settings2, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Brand } from "@/components/Layout";
import { trpc } from "@/providers/trpc";

/**
 * L'espace créateur : une pleine page pour écrire, sans le menu du réseau.
 * Elle suit l'apparence choisie (clair, sombre ou douceur), comme le reste du réseau.
 */
export default function CreatorLayout() {
  const me = trpc.members.me.useQuery();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("creator-mode");
    return () => root.classList.remove("creator-mode");
  }, []);
  if (!me.data) return <p className="p-muted py-20 text-center m-0">Chargement…</p>;
  if (!me.data.permissions.buildCourses) return <div className="py-20 text-center p-muted">Cette page est réservée aux administrateurs.</div>;
  return <Boundary><Outlet /></Boundary>;
}

/** Une erreur ne laisse jamais une page blanche : en brouillon, la dernière saisie est partie dans Notion au moment où la page s'est arrêtée. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="m-0 text-[16px] max-w-[460px]">Une erreur a interrompu cette page. Rechargez-la pour reprendre votre écriture : vérifiez ensuite vos dernières lignes.</p>
        <button type="button" className="cr-btn cr-btn-primary" onClick={() => window.location.reload()}>Recharger la page</button>
      </div>
    );
  }
}

export type Crumb = { label: string; to?: string };

/** La page : un bandeau à gauche, le fil d'Ariane et les actions en haut. Sur téléphone, le bandeau s'ouvre avec le bouton de menu. */
export function CreatorShell({ aside, crumbs, actions, children, wide }: { aside?: ReactNode; crumbs: Crumb[]; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setDrawer(false); }, [pathname]);
  const panel = aside ?? <CreatorNav />;
  return (
    <div className="creator flex min-h-screen">
      <aside aria-label="Espace créateur" className={`hidden lg:flex flex-none flex-col sticky top-0 h-screen overflow-y-auto border-r ${wide ? "w-[300px]" : "w-[220px]"}`} style={{ background: "var(--p-surface)", borderColor: "var(--p-line)" }}>{panel}</aside>
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-label="Menu de l’espace créateur">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 w-full h-full cursor-default" style={{ background: "rgba(61, 49, 40, .35)" }} onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[86%] max-w-[320px] overflow-y-auto flex flex-col" style={{ background: "var(--p-surface)" }}>
            <button type="button" aria-label="Fermer le menu" className="cr-icon absolute right-2 top-2 z-10" onClick={() => setDrawer(false)}><X size={17} /></button>
            {panel}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-[68px] px-4 lg:px-10 py-3 border-b" style={{ background: "var(--p-surface)", borderColor: "var(--p-line)" }}>
          <div className="flex items-center gap-2 min-w-0 flex-[1_1_200px]">
            <button type="button" aria-label="Ouvrir le menu" aria-expanded={drawer} className="cr-icon lg:hidden flex-none" onClick={() => setDrawer(true)}><Menu size={18} /></button>
            {/* Sur téléphone, le bandeau est replié : l'initiale du logo ramène à l'accueil */}
            <Link to="/" title="Retour à l’accueil" aria-label="Présence, retour à l’accueil" className="lg:hidden flex-none w-8 h-8 flex items-center justify-center no-underline font-['Newsreader'] text-[24px] leading-none" style={{ color: "var(--p-accent)" }}>P</Link>
            <nav aria-label="Fil d’Ariane" className="flex items-center gap-2 text-[12px] p-muted min-w-0">
              <BookOpen size={16} className="flex-none hidden sm:block" />
              {crumbs.map((c, i) => (
                <span key={c.label + i} className="flex items-center gap-2 min-w-0">
                  {i > 0 && <ChevronRight size={12} className="flex-none" />}
                  {c.to ? <Link to={c.to} className="no-underline truncate hover:underline" style={{ color: "var(--p-ink-2)" }}>{c.label}</Link> : <span className="truncate" aria-current="page" style={{ color: "var(--p-ink)" }}>{c.label}</span>}
                </span>
              ))}
            </nav>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Le bandeau des pages de liste. */
function CreatorNav() {
  const me = trpc.members.me.useQuery();
  const list = trpc.build.courses.useQuery();
  const item = ({ isActive }: { isActive: boolean }) => `flex items-center gap-2.5 px-2.5 py-3 rounded-[14px] text-[14px] no-underline ${isActive ? "font-semibold" : ""}`;
  const colors = ({ isActive }: { isActive: boolean }) => (isActive ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : { color: "var(--p-ink-2)" });
  return (
    <div className="flex flex-col flex-1 px-5 py-7">
      <Link to="/" title="Retour à l’accueil" aria-label="Présence, retour à l’accueil" className="no-underline" style={{ color: "var(--p-ink)" }}><Brand compact /></Link>
      <p className="m-0 mt-10 text-[10px] font-semibold tracking-[0.16em] p-muted">ESPACE CRÉATEUR</p>
      <nav aria-label="Espace créateur" className="mt-4 flex flex-col gap-1">
        <NavLink to="/admin/createur" end className={item} style={colors}><BookOpen size={16} /> Mes formations{!!list.data?.length && <span className="ml-auto text-[12px]">{String(list.data.length).padStart(2, "0")}</span>}</NavLink>
        <NavLink to="/admin/createur/tests" className={item} style={colors}><ClipboardCheck size={16} /> Tests</NavLink>
        <NavLink to="/admin/createur/relances" className={item} style={colors}><BellRing size={16} /> Relances</NavLink>
        <Link to="/admin" className={item({ isActive: false })} style={colors({ isActive: false })}><Settings2 size={16} /> Administration</Link>
        <Link to="/" className={item({ isActive: false })} style={colors({ isActive: false })}><ArrowUpRight size={16} /> Mon espace membre</Link>
      </nav>
      {me.data && <div className="mt-auto pt-5 flex items-center gap-3 border-t" style={{ borderColor: "var(--p-line)" }}><Avatar m={me.data} size={36} /><span className="flex flex-col min-w-0"><span className="text-[14px] font-medium truncate">{me.data.firstName} {me.data.lastName}</span><span className="text-[12px] p-muted">Espace créateur</span></span></div>}
    </div>
  );
}
