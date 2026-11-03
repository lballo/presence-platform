import { useState } from "react";
import { Navigate } from "react-router";
import { Check, Feather, Flag, Lock, Pencil, Sparkles, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { ago, parisLongDate } from "@/lib/format";
import { ConfirmButton } from "@/pages/admin/shared";

type Mine = NonNullable<RouterOutputs["coaching"]["mine"]>;

/** Mon accompagnement : jalons, objectifs, comptes rendus partagés, carnet, inspiration et défi. À moi seul, et à Laura. */
export default function AccompagnementPage() {
  const me = trpc.members.me.useQuery();
  const q = trpc.coaching.mine.useQuery(undefined, { enabled: !!me.data?.coachingClient });
  if (!me.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (!me.data.coachingClient) return <Navigate to="/parcours" replace />;
  const c = q.data;
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Mon accompagnement" intro={c ? `« ${c.title} », avec Laura Ballo.` : undefined} />
      <p className="m-0 mb-6 text-[13px] p-muted flex items-center gap-1.5"><Lock size={13} /> Confidentiel : seuls vous et Laura voyez cette page.</p>
      {c && (
        <div className="flex flex-col gap-7">
          <Milestones c={c} />
          <div className="flex flex-wrap gap-5 items-start">
            <Goals c={c} />
            <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
              {c.exercise && <Card icon={<Flag size={15} />} title="Mon exercice ou défi" text={c.exercise} />}
              {c.inspiration && <Card icon={<Sparkles size={15} />} title="Une inspiration" text={c.inspiration} serif />}
            </div>
          </div>
          <Reports c={c} />
          <Notebook c={c} />
        </div>
      )}
    </>
  );
}

function Milestones({ c }: { c: Mine }) {
  const pct = c.planned ? Math.min(100, Math.round((c.done / c.planned) * 100)) : 0;
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-4" aria-label="Mes jalons">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[26px]">Mes jalons</h2>
        {c.planned ? <span className="text-[14px] p-muted">{c.done} séance{c.done > 1 ? "s" : ""} sur {c.planned} · {pct} %</span> : null}
      </div>
      {c.planned ? <span className="h-2 rounded-full overflow-hidden" style={{ background: "var(--p-track)" }} role="img" aria-label={`Progression : ${pct} %`}><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--p-accent)" }} /></span> : null}
      <ol className="list-none m-0 p-0 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
        {c.milestones.map((m, i) => (
          <li key={m.key} className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: m.state === "fait" ? "var(--p-accent-soft)" : "var(--p-surface-2)" }}>
            <span className="w-7 h-7 rounded-full flex items-center justify-center flex-none text-[12px] font-semibold" style={m.state === "fait" ? { background: "var(--p-accent)", color: "#fff" } : m.state === "prevu" ? { border: "2px solid var(--p-accent)", color: "var(--p-accent-text)" } : { border: "1px solid var(--p-line-2)", color: "var(--p-ink-3)" }}>{m.state === "fait" ? <Check size={14} /> : i + 1}</span>
            <span className="flex flex-col min-w-0"><span className="text-[14px] font-medium leading-snug">{m.label}</span><span className="text-[12px] p-muted">{m.state === "fait" ? "Fait" : m.state === "prevu" ? "En cours ou prévu" : "À venir"}{m.date ? ` · ${parisLongDate(new Date(m.date)).toLowerCase()}` : ""}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Goals({ c }: { c: Mine }) {
  return (
    <section className="flex-[2_1_380px] min-w-0 p-card p-5 sm:p-6 flex flex-col gap-3" aria-label="Mes objectifs">
      <h2 className="m-0 text-[26px] flex items-center gap-2"><Target size={18} /> Mes objectifs</h2>
      <ul className="list-none m-0 p-0 flex flex-col gap-2">
        {c.goals.map((g) => <li key={g.id} className="flex items-start gap-2.5 text-[15px] leading-snug"><span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-none" style={g.done ? { background: "var(--p-accent)", color: "#fff" } : { border: "1px solid var(--p-line-2)" }}>{g.done && <Check size={12} />}</span><span className={g.done ? "p-muted line-through" : ""}>{g.text}</span></li>)}
      </ul>
      {c.goals.length === 0 && <p className="m-0 text-[14px] p-muted">Vos objectifs, posés avec Laura, apparaîtront ici.</p>}
    </section>
  );
}

function Card({ icon, title, text, serif }: { icon: React.ReactNode; title: string; text: string; serif?: boolean }) {
  return (
    <section className="p-soft p-5 flex flex-col gap-2" aria-label={title}>
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--p-gold)" }}>{icon} {title}</span>
      <p className={`m-0 whitespace-pre-line ${serif ? "serif italic text-[22px] leading-snug" : "text-[15.5px] leading-relaxed"}`}>{text}</p>
    </section>
  );
}

function Reports({ c }: { c: Mine }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Comptes rendus partagés">
      <h2 className="m-0 text-[26px]">Comptes rendus partagés</h2>
      {c.reports.map((r) => (
        <article key={r.id} className="p-card p-5 flex flex-col gap-3">
          <span className="text-[13px] p-muted">{r.kind || "Séance"}{r.number ? ` n° ${r.number}` : ""}{r.startsAt ? ` · ${parisLongDate(new Date(r.startsAt))}` : ""}</span>
          {r.keyPoints && <div className="flex flex-col gap-1"><span className="text-[11.5px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--p-gold)" }}>Points clés travaillés</span><p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{r.keyPoints}</p></div>}
          {r.actions && <div className="flex flex-col gap-1"><span className="text-[11.5px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--p-gold)" }}>Mes actions</span><p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{r.actions}</p></div>}
        </article>
      ))}
      {c.reports.length === 0 && <div className="p-soft p-7 text-center p-muted">Les comptes rendus que Laura partage après vos séances apparaîtront ici.</div>}
    </section>
  );
}

/** Le carnet d'introspection : écrit par le client, lu par Laura. */
function Notebook({ c }: { c: Mine }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.coaching.mine.invalidate();
  const [draft, setDraft] = useState("");
  const add = trpc.coaching.addJournal.useMutation({ onSuccess: () => { refresh(); setDraft(""); toast.success("Ajouté à votre carnet, partagé avec Laura"); }, onError: (e) => toast.error(e.message) });
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-4" aria-label="Mon carnet d’introspection">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[26px] flex items-center gap-2"><Feather size={18} /> Mon carnet d’introspection</h2>
        <p className="m-0 text-[14px] p-muted">Ce qui vous traverse entre deux séances. Partagé avec Laura Ballo, et avec elle seule.</p>
      </div>
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add.mutate({ text: draft }); }}>
        <textarea className="p-field" rows={4} maxLength={8000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Nouvelle page du carnet" placeholder="Aujourd’hui, j’ai remarqué…" />
        <button type="submit" className="p-btn-primary p-btn-sm self-start" disabled={!draft.trim() || add.isPending}>Ajouter à mon carnet</button>
      </form>
      <ul className="list-none m-0 p-0 flex flex-col gap-3">{c.journal.map((j) => <Page key={j.id} j={j} />)}</ul>
    </section>
  );
}

function Page({ j }: { j: Mine["journal"][number] }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.coaching.mine.invalidate();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(j.text);
  const update = trpc.coaching.updateJournal.useMutation({ onSuccess: () => { refresh(); setEditing(false); toast.success("Page modifiée"); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.coaching.removeJournal.useMutation({ onSuccess: () => { refresh(); toast.success("Page effacée"); }, onError: (e) => toast.error(e.message) });
  return (
    <li className="p-soft p-4 flex flex-col gap-2">
      <span className="text-[12px] p-faint">{ago(new Date(j.createdAt))}</span>
      {editing ? (
        <>
          <textarea className="p-field" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Modifier la page" />
          <span className="flex gap-2"><button type="button" className="p-btn-primary p-btn-sm" disabled={!text.trim() || update.isPending} onClick={() => update.mutate({ id: j.id, text })}>Enregistrer</button><button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setEditing(false); setText(j.text); }}>Annuler</button></span>
        </>
      ) : <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{j.text}</p>}
      {!editing && (
        <span className="flex gap-2">
          <button type="button" className="p-btn-ghost text-[13px]" onClick={() => setEditing(true)}><Pencil size={13} /> Modifier</button>
          <ConfirmButton label={<><Trash2 size={13} /> Effacer</>} className="p-btn-ghost text-[13px]" question="Effacer cette page du carnet ?" confirm="Effacer" danger disabled={remove.isPending} onConfirm={() => remove.mutate({ id: j.id })} />
        </span>
      )}
    </li>
  );
}
