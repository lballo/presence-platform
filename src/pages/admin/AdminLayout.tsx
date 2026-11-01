import { NavLink, Outlet } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";

const TABS = [
  { to: "/admin", label: "Accueil", end: true },
  { to: "/admin/membres", label: "Membres" },
  { to: "/admin/validations", label: "Validations", count: "pending" },
  { to: "/admin/moderation", label: "Modération", count: "reports" },
  { to: "/admin/ruches", label: "Ruches" },
  { to: "/admin/evenements", label: "Événements" },
  { to: "/admin/forum", label: "Forum et annonces" },
  { to: "/admin/construire", label: "Construire" },
  { to: "/admin/coaching", label: "Coaching", count: "coaching" },
  { to: "/admin/journal", label: "Journal" },
] as const;

/** Panneau d'administration : réservé aux administrateurs. Le serveur refuse de toute façon chaque appel. */
export default function AdminLayout() {
  const me = trpc.members.me.useQuery();
  const allowed = !!me.data?.permissions.adminPanel;
  const overview = trpc.admin.overview.useQuery(undefined, { enabled: allowed });
  if (!me.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (!allowed) return <div className="py-20 text-center p-muted">Cette page est réservée aux administrateurs.</div>;
  const counts = { pending: overview.data?.pending.total ?? 0, reports: overview.data?.openReports ?? 0, coaching: overview.data?.coachingToDiscuss ?? 0 };
  return (
    <>
      <PageHeader eyebrow="Présence" title="Administration" />
      <nav aria-label="Rubriques d’administration" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 mb-6 sm:flex-wrap sm:overflow-visible" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={"end" in t} className={({ isActive }) => `p-chip no-underline flex-none ${isActive ? "p-chip-on" : ""}`} ref={(el) => { if (el?.getAttribute("aria-current") === "page") el.scrollIntoView({ block: "nearest", inline: "center" }); }}>
            {t.label}
            {"count" in t && counts[t.count] > 0 && <span className="ml-1.5 min-w-[20px] h-[20px] px-1 rounded-full text-[11.5px] font-semibold flex items-center justify-center text-white" style={{ background: "var(--p-accent)" }}>{counts[t.count]}</span>}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
