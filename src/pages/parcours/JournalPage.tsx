import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Check, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Layout";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { ago, parisLongDate } from "@/lib/format";

type Journal = RouterOutputs["courses"]["journal"];

/** Mon journal privé : réponses, réflexions, résultats de tests et défis. */
export default function JournalPage() {
  const q = trpc.courses.journal.useQuery();
  const [group, setGroup] = useState("");
  const d = q.data;
  const courses = useMemo(() => [...new Set([...(d?.entries ?? []).map((e) => e.courseTitle), ...(d?.tests ?? []).map((t) => t.courseTitle)])].filter(Boolean), [d]);
  const entries = (d?.entries ?? []).filter((e) => !group || e.courseTitle === group);
  const tests = (d?.tests ?? []).filter((t) => !group || t.courseTitle === group);
  const empty = d && !d.entries.length && !d.tests.length && !d.challenges.length;
  return (
    <>
      <Link to="/parcours" className="p-btn-ghost no-underline mb-3"><ArrowLeft size={15} /> Mes formations</Link>
      <PageHeader eyebrow="Mon parcours" title="Mon journal" intro="Ce que vous écrivez ici est à vous." />
      <p className="m-0 mb-6 flex items-start gap-2 text-[14px] p-muted"><Lock size={15} className="flex-none mt-0.5" /> Personne d’autre ne lit ce journal, ni les autres membres, ni Laura, sauf les réponses que vous choisissez de lui partager.</p>
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {empty && <div className="p-soft p-9 text-center p-muted">Votre journal est encore vide. Vos réponses aux exercices viendront s’y ranger.</div>}
      {courses.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-5" role="group" aria-label="Filtrer par formation">
          <button type="button" aria-pressed={!group} className={`p-chip ${!group ? "p-chip-on" : ""}`} onClick={() => setGroup("")}>Toutes</button>
          {courses.map((c) => <button key={c} type="button" aria-pressed={group === c} className={`p-chip ${group === c ? "p-chip-on" : ""}`} onClick={() => setGroup(c)}>{c}</button>)}
        </div>
      )}
      <div className="flex flex-col gap-3.5">
        {entries.map((e) => <EntryCard key={e.id} e={e} />)}
        {tests.map((t) => <TestCard key={t.id} t={t} />)}
        {!group && d?.challenges.map((c) => (
          <article key={c.moduleId} className="p-card p-4 sm:p-5 flex flex-col gap-1.5">
            <span className="text-[12.5px] p-muted">{c.moduleTitle} · défi</span>
            <span className="flex items-center gap-2 font-medium"><Check size={15} style={{ color: "var(--p-accent-text)" }} /> Défi relevé{c.doneAt ? ` ${parisLongDate(new Date(c.doneAt)).toLowerCase()}` : ""}</span>
            {c.note && <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{c.note}</p>}
          </article>
        ))}
      </div>
    </>
  );
}

function EntryCard({ e }: { e: Journal["entries"][number] }) {
  const utils = trpc.useUtils();
  const share = trpc.courses.shareAnswer.useMutation({ onSuccess: (_r, v) => { utils.courses.journal.invalidate(); toast.success(v.shared ? "Réponse partagée avec Laura" : "Partage repris : cette réponse redevient privée"); }, onError: (x) => toast.error(x.message) });
  return (
    <article className="p-card p-4 sm:p-5 flex flex-col gap-2">
      <span className="text-[12.5px] p-muted">{e.moduleTitle}{e.moduleId ? "" : " · module retiré"} · {ago(new Date(e.updatedAt))}</span>
      <span className="font-medium leading-snug">{e.isNote ? "Mes réflexions" : e.question}</span>
      {e.answer === null ? <p className="m-0 text-[14px] p-muted">Cette réponse ne peut plus être lue.</p> : <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{e.answer}</p>}
      <button type="button" className="p-btn-ghost text-[13px] min-h-0 self-start" disabled={share.isPending} onClick={() => share.mutate({ id: e.id, shared: !e.sharedAt })}><Share2 size={13} /> {e.sharedAt ? "Partagée avec Laura · reprendre" : "Partager avec Laura"}</button>
    </article>
  );
}

function TestCard({ t }: { t: Journal["tests"][number] }) {
  const utils = trpc.useUtils();
  const share = trpc.courses.shareTest.useMutation({ onSuccess: (_r, v) => { utils.courses.journal.invalidate(); toast.success(v.shared ? "Résultat partagé avec Laura" : "Partage repris : ce résultat redevient privé"); }, onError: (x) => toast.error(x.message) });
  return (
    <article className="p-card p-4 sm:p-5 flex flex-col gap-2">
      <span className="text-[12.5px] p-muted">{t.moduleTitle} · test · {ago(new Date(t.passedAt))}</span>
      {t.result?.label && <span className="serif text-[22px] leading-tight">{t.result.label}</span>}
      {t.result?.summary && <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{t.result.summary}</p>}
      <button type="button" className="p-btn-ghost text-[13px] min-h-0 self-start" disabled={share.isPending} onClick={() => share.mutate({ id: t.id, shared: !t.sharedAt })}><Share2 size={13} /> {t.sharedAt ? "Partagé avec Laura · reprendre" : "Partager avec Laura"}</button>
    </article>
  );
}
