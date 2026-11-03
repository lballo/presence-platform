import { Link } from "react-router";
import { MailCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { CreatorShell } from "@/pages/admin/construire/CreatorShell";
import { ago, parisLongDate } from "@/lib/format";
import { CoachingNav } from "./CoachingLayout";

/** Tous les clients du coaching individuel, reliés à vos bases Notion. */
export default function CoachingHome() {
  const utils = trpc.useUtils();
  const q = trpc.coaching.overview.useQuery();
  const sync = trpc.coaching.sync.useMutation({ onSuccess: (r) => { utils.coaching.invalidate(); utils.members.invalidate(); (r.ok ? toast.success : toast.error)(r.ok ? `Notion relu : ${r.detail}` : r.detail, { duration: 9000 }); }, onError: (e) => toast.error(e.message) });
  const mid = trpc.coaching.setMidpointEmail.useMutation({ onSuccess: (_r, v) => { utils.coaching.overview.invalidate(); toast.success(v.enabled ? "L’e-mail de mi-parcours partira automatiquement" : "L’e-mail de mi-parcours est coupé"); }, onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <CreatorShell aside={<CoachingNav />} crumbs={[{ label: "Suivi coaching" }]} actions={<button type="button" className="cr-btn cr-btn-primary" disabled={sync.isPending || !d?.notionReady} onClick={() => sync.mutate()}><RefreshCw size={16} className={sync.isPending ? "animate-spin" : ""} /> {sync.isPending ? "Lecture de Notion…" : "Relire Notion"}</button>}>
      <main className="px-4 lg:px-10 py-8 flex flex-col gap-6 max-w-[1100px] w-full">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px]">Suivi coaching</h1>
          <p className="m-0 text-[14.5px] p-muted">Les clients du coaching individuel, d’après vos bases Notion : Inscriptions, CRM People, Sessions et Offres Accompagnements.</p>
        </div>
        {d && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
            <section className="p-card p-4 flex flex-col gap-1.5" aria-label="Lecture de Notion">
              <span className="text-[13px] font-semibold">Lecture de Notion</span>
              <span className="text-[13.5px] p-muted">{d.sync ? `${d.sync.status === "erreur" ? "Échec" : "Dernière lecture"} ${ago(new Date(d.sync.at))} · ${d.sync.detail}` : "Pas encore lu. Cliquez sur « Relire Notion »."}</span>
              <span className="text-[12.5px] p-faint">Relu automatiquement tous les quarts d’heure.</span>
            </section>
            <section className="p-card p-4 flex items-start gap-3" aria-label="E-mail de mi-parcours">
              <MailCheck size={18} className="flex-none mt-0.5" style={{ color: "var(--p-accent)" }} />
              <label className="flex-1 flex flex-col gap-1 cursor-pointer">
                <span className="text-[13px] font-semibold">E-mail de mi-parcours automatique</span>
                <span className="text-[13px] p-muted">Quand la moitié des séances prévues est faite et que la séance de mi-parcours n’est pas planifiée, le client reçoit une invitation à la réserver. Une fois par accompagnement.</span>
              </label>
              <input type="checkbox" className="w-[20px] h-[20px] flex-none mt-0.5" style={{ accentColor: "var(--p-accent)" }} aria-label="E-mail de mi-parcours automatique" checked={d.midpoint.email} disabled={mid.isPending} onChange={(e) => mid.mutate({ enabled: e.target.checked })} />
            </section>
          </div>
        )}
        <section className="flex flex-col gap-2.5" aria-label="Clients">
          {d?.clients.map((c) => (
            <Link key={c.id} to={`/admin/coaching/${c.id}`} className="p-card p-4 flex flex-wrap items-center gap-x-4 gap-y-2 no-underline" style={{ color: "var(--p-ink)" }}>
              <span className="flex-[1_1_260px] min-w-0 flex flex-col"><span className="font-semibold">{c.clientName}</span><span className="text-[13px] p-muted truncate">{c.title}</span></span>
              <span className="p-pill">{c.status || "Sans statut"}</span>
              <span className="text-[13.5px] p-muted">{c.done}{c.planned ? ` / ${c.planned}` : ""} séance{c.done > 1 ? "s" : ""}</span>
              <span className="text-[13.5px] p-muted">{c.next ? `Prochaine : ${parisLongDate(new Date(c.next.startsAt)).toLowerCase()}` : "Aucune séance planifiée"}</span>
              {!c.member && <span className="text-[12.5px]" style={{ color: "var(--p-accent-text)" }}>Pas de compte Présence à cette adresse</span>}
              {c.toDiscuss > 0 && <span className="text-[12.5px] font-medium" style={{ color: "var(--p-accent-text)" }}>{c.toDiscuss} réponse{c.toDiscuss > 1 ? "s" : ""} à aborder</span>}
            </Link>
          ))}
          {d && !d.clients.length && <div className="p-soft p-8 text-center p-muted">Aucun accompagnement individuel lu dans Notion pour l’instant.</div>}
        </section>
      </main>
    </CreatorShell>
  );
}
