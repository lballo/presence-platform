import { useEffect } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { ArrowUpRight, Settings2, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Brand } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";

/**
 * Le suivi coaching : une pleine page, comme l'espace créateur, réservée à l'administratrice.
 * Il suit l'apparence choisie (clair, sombre ou douceur).
 */
export default function CoachingLayout() {
  const me = trpc.members.me.useQuery();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("creator-mode");
    return () => root.classList.remove("creator-mode");
  }, []);
  if (!me.data) return <p className="p-muted py-20 text-center m-0">Chargement…</p>;
  if (!me.data.permissions.adminPanel) return <div className="py-20 text-center p-muted">Cette page est réservée à l’administration.</div>;
  return <Outlet />;
}

/** Le bandeau : les accompagnements, du plus récent au plus ancien. */
export function CoachingNav() {
  const q = trpc.coaching.overview.useQuery();
  const item = ({ isActive }: { isActive: boolean }) => `flex items-center gap-2.5 px-2.5 py-2.5 rounded-[14px] text-[14px] no-underline ${isActive ? "font-semibold" : ""}`;
  const colors = ({ isActive }: { isActive: boolean }) => (isActive ? { background: "var(--p-accent-soft)", color: "var(--p-accent)" } : { color: "var(--p-ink-2)" });
  const order = ["En cours", "En attente", "Terminé"];
  const clients = [...(q.data?.clients ?? [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <div className="flex flex-col flex-1 px-5 py-7">
      <Link to="/admin/coaching" className="no-underline" style={{ color: "var(--p-ink)" }}><Brand compact /></Link>
      <p className="m-0 mt-10 text-[10px] font-semibold tracking-[0.16em] p-muted">SUIVI COACHING</p>
      <nav aria-label="Accompagnements" className="mt-4 flex flex-col gap-1">
        <NavLink to="/admin/coaching" end className={item} style={colors}><Users size={16} /> Tous les clients</NavLink>
        {clients.map((c) => (
          <NavLink key={c.id} to={`/admin/coaching/${c.id}`} className={item} style={colors}>
            {c.member ? <Avatar m={c.member} size={26} /> : <span className="w-[26px] h-[26px] rounded-full flex-none" style={{ background: "var(--p-surface-2)" }} />}
            <span className="flex-1 min-w-0 flex flex-col"><span className="truncate">{c.clientName}</span><span className="text-[11.5px] p-muted truncate">{c.status || "Sans statut"}</span></span>
            {c.toDiscuss > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold text-white flex items-center justify-center" style={{ background: "var(--p-accent)" }}>{c.toDiscuss}</span>}
          </NavLink>
        ))}
      </nav>
      <nav aria-label="Ailleurs" className="mt-6 flex flex-col gap-1">
        <Link to="/admin" className={item({ isActive: false })} style={colors({ isActive: false })}><Settings2 size={16} /> Administration</Link>
        <Link to="/" className={item({ isActive: false })} style={colors({ isActive: false })}><ArrowUpRight size={16} /> Mon espace membre</Link>
      </nav>
    </div>
  );
}
