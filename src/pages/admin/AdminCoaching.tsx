import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisHour, parisLongDate } from "@/lib/format";
import { Badge } from "./shared";

const followLabel = (followed: boolean) => (followed ? "Accompagnement individuel" : "Sans accompagnement individuel");

function Portrait({ photoUrl, initials }: { photoUrl: string | null; initials: string }) {
  return photoUrl
    ? <img src={photoUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-none" />
    : <span aria-hidden="true" className="w-11 h-11 rounded-full flex items-center justify-center flex-none serif italic text-[18px]" style={{ background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{initials}</span>;
}

/** /admin › Coaching : les clients suivis, et ce qu'ils ont choisi de travailler en séance. */
export default function AdminCoaching() {
  const q = trpc.coaching.clients.useQuery();
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 flex items-start gap-2 text-[14px] p-muted max-w-[760px]"><Lock size={15} className="flex-none mt-0.5" /> Vous ne voyez ici que les réponses qu’un membre a marquées « À travailler en coaching avec Laura ». Le reste de son journal ne vous est jamais accessible.</p>
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {q.data?.length === 0 && <div className="p-soft p-9 text-center p-muted">Aucun client suivi et aucune réponse marquée pour l’instant.</div>}
      <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link to={`/admin/coaching/${c.id}`} className="p-card p-4 flex flex-wrap items-center gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
              <Portrait photoUrl={c.photoUrl} initials={c.initials} />
              <span className="flex flex-col min-w-0 flex-[1_1_220px]">
                <span className="font-medium">{c.name}</span>
                <span className="text-[13px] p-muted truncate">{followLabel(c.followed)}{c.next ? ` · prochaine séance le ${parisLongDate(new Date(c.next.startsAt)).toLowerCase()}` : ""}</span>
              </span>
              <span className="flex items-center gap-1.5">
                {c.toDiscuss > 0 && <Badge tone="ok">{c.toDiscuss} à aborder</Badge>}
                {c.discussed > 0 && <Badge>{c.discussed} abordée{c.discussed > 1 ? "s" : ""}</Badge>}
              </span>
              <ArrowRight size={16} className="flex-none p-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Client = RouterOutputs["coaching"]["client"];

/** La fiche d'un client : la préparation de sa prochaine séance. */
export function AdminCoachingClient() {
  const { id } = useParams();
  const q = trpc.coaching.client.useQuery({ id: Number(id) }, { enabled: !!Number(id) });
  const back = <Link to="/admin/coaching" className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> Tous les clients</Link>;
  if (q.error) return <div className="flex flex-col gap-4">{back}<p className="p-soft p-8 text-center p-muted m-0">Cette fiche n’existe pas.</p></div>;
  const c = q.data;
  if (!c) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  const todo = c.entries.filter((e) => !e.discussedAt);
  const done = c.entries.filter((e) => e.discussedAt);
  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex flex-wrap items-center gap-3">
        <Portrait photoUrl={c.photoUrl} initials={c.initials} />
        <span className="flex flex-col min-w-0 flex-[1_1_220px]"><h2 className="m-0 text-[28px] leading-tight">{c.name}</h2><span className="text-[14px] p-muted">{c.jobTitle ? `${c.jobTitle} · ` : ""}{followLabel(c.followed)}</span></span>
        <Link to={`/admin/membres/${c.id}`} className="p-btn-outline p-btn-sm no-underline">Fiche du membre</Link>
      </header>
      <section className="p-soft p-4 flex items-start gap-2.5 text-[14.5px]" aria-label="Prochaine séance">
        <CalendarDays size={17} className="flex-none mt-0.5" />
        {c.next
          ? <span><span className="font-medium">Prochaine séance{c.next.number ? ` (${c.next.number}/${c.next.total})` : ""} : {parisLongDate(new Date(c.next.startsAt)).toLowerCase()} à {parisHour(new Date(c.next.startsAt))}</span>{c.next.title ? ` · ${c.next.title}` : ""} · {c.next.durationMin} min · {c.next.format}</span>
          : <span className="p-muted">Aucune séance programmée pour {c.firstName}.</span>}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="a-aborder">
        <h3 id="a-aborder" className="m-0 text-[24px]">À aborder ({todo.length})</h3>
        {todo.length === 0 && <p className="m-0 p-soft p-6 text-center p-muted">Rien à préparer pour l’instant.</p>}
        {todo.map((e) => <EntryCard key={e.id} e={e} memberId={c.id} />)}
      </section>
      {done.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="abordees">
          <h3 id="abordees" className="m-0 text-[24px]">Abordées en séance ({done.length})</h3>
          {done.map((e) => <EntryCard key={e.id} e={e} memberId={c.id} />)}
        </section>
      )}
    </div>
  );
}

function EntryCard({ e, memberId }: { e: Client["entries"][number]; memberId: number }) {
  const utils = trpc.useUtils();
  const set = trpc.coaching.setDiscussed.useMutation({
    onSuccess: () => { utils.coaching.client.invalidate({ id: memberId }); utils.coaching.clients.invalidate(); utils.admin.overview.invalidate(); },
    onError: (x) => { toast.error(x.message); utils.coaching.client.invalidate({ id: memberId }); },
  });
  return (
    <article className="p-card p-4 sm:p-5 flex flex-col gap-2">
      <span className="text-[12.5px] p-muted">{[e.courseTitle, e.sectionTitle, e.lessonTitle].filter(Boolean).join(" · ")}</span>
      <span className="font-medium leading-snug">{e.isNote ? "Ses réflexions" : e.question}</span>
      {e.answer === null ? <p className="m-0 text-[14px] p-muted">Cette réponse ne peut plus être lue.</p> : <p className="m-0 text-[15.5px] leading-relaxed whitespace-pre-line">{e.answer}</p>}
      <span className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[12.5px] p-faint">Marquée le {parisLongDate(new Date(e.markedAt!)).toLowerCase()}{e.discussedAt ? ` · abordée le ${parisLongDate(new Date(e.discussedAt)).toLowerCase()}` : ""}</span>
        {e.discussedAt
          ? <button type="button" className="p-btn-ghost text-[13px] min-h-0" disabled={set.isPending} onClick={() => set.mutate({ id: e.id, discussed: false })}><RotateCcw size={13} /> Remettre à aborder</button>
          : <button type="button" className="p-btn-outline p-btn-sm" disabled={set.isPending} onClick={() => set.mutate({ id: e.id, discussed: true })}><Check size={14} /> Abordée en séance</button>}
      </span>
    </article>
  );
}
