import { Link } from "react-router";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";

/** Pour l'administration : ce qui attend une décision ici se traite dans la file unique. */
export function AdminPendingLink({ kind, one, many }: { kind: "event" | "talk" | "opportunity" | "organizer"; one: string; many: string }) {
  const allowed = !!trpc.members.me.useQuery().data?.permissions.adminPanel;
  const n = trpc.admin.overview.useQuery(undefined, { enabled: allowed }).data?.pending[kind] ?? 0;
  if (!allowed || !n) return null;
  return (
    <Link to="/admin/validations" className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[14.5px] font-medium no-underline" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)", border: "1px solid var(--p-accent-line)" }}>
      <ShieldCheck size={16} className="flex-none" /> {n} {n > 1 ? many : one} à valider →
    </Link>
  );
}
