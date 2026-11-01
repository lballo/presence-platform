import { Link } from "react-router";
import { AlertTriangle, CalendarClock, ClipboardCheck, Sprout, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";

export default function AdminHome() {
  const o = trpc.admin.overview.useQuery().data;
  const cards = [
    { to: "/admin/membres?vue=actifs", label: "Membres actifs", n: o?.activeMembers, icon: Users },
    { to: "/admin/membres?vue=nouveaux", label: "Nouveaux membres sur 30 jours", n: o?.newMembers, icon: Sprout },
    { to: "/admin/validations", label: "Propositions à valider", n: o?.pending.total, icon: ClipboardCheck, alert: true },
    { to: "/admin/moderation", label: "Signalements ouverts", n: o?.openReports, icon: AlertTriangle, alert: true },
    { to: "/admin/membres?vue=fin", label: "Accès qui se terminent dans les 15 jours", n: o?.endingAccess, icon: CalendarClock, alert: true },
  ];
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ to, label, n, icon: Icon, alert }) => (
        <Link key={to} to={to} className="p-card p-5 flex flex-col gap-3 no-underline transition-transform hover:-translate-y-0.5" style={{ color: "var(--p-ink)" }}>
          <Icon size={20} strokeWidth={1.6} style={{ color: alert && n ? "var(--p-accent-text)" : "var(--p-gold)" }} />
          <span className="serif text-[46px] leading-none" style={alert && n ? { color: "var(--p-accent-text)" } : undefined}>{n ?? "…"}</span>
          <span className="text-[14.5px] p-muted leading-snug">{label}</span>
        </Link>
      ))}
    </div>
  );
}
