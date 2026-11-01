import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, Check, Clock, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { VideoEmbed } from "@/components/VideoEmbed";
import { parisLongDate } from "@/lib/format";
import type { TestResult } from "@/lib/courseTest";
import type { CourseBlock } from "../../../server/lib/courseBlocks";
import { BlockList } from "./Blocks";
import { HashtagPanel } from "./HashtagPanel";
import { TestEmbed } from "./TestEmbed";

type Preview = RouterOutputs["build"]["preview"];
type Live = RouterOutputs["courses"]["module"];
type Tag = Live["hashtags"][number];

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-3" aria-label={title}>
      <h2 className="m-0 text-[clamp(25px,3vw,30px)] leading-tight">{title}</h2>
      {children}
    </section>
  );
}

const hasContent = (blocks: CourseBlock[]) => blocks.length > 0;

/** La lecture d'un module. En aperçu : le même affichage, sans rien enregistrer. */
export function ModuleReader({ m }: { m: Live | Preview }) {
  const live = m.preview ? null : (m as Live);
  const [tag, setTag] = useState<Tag | null>(null);
  const intro = m.sections.intention.filter((b) => b.type !== "heading");
  const questions = m.sections.exercice.filter((b) => b.type === "bullet" || b.type === "number");
  const exerciseText = m.sections.exercice.filter((b) => b.type !== "bullet" && b.type !== "number");
  return (
    <article className="max-w-[760px] mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="p-eyebrow">{m.course.emoji ? `${m.course.emoji} ` : ""}{m.course.title}</span>
        <h1 className="text-[clamp(34px,5vw,48px)] leading-[1.08] m-0">{m.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[14px] p-muted">
          <span>Module {m.position}</span>
          {m.durationMin ? <span className="flex items-center gap-1"><Clock size={14} /> {m.durationMin} min</span> : null}
          {m.hashtags.map((t) => <button key={t.id} type="button" className="p-pill h-[26px] text-[12.5px] hover:brightness-95" style={{ color: "var(--p-ink)" }} onClick={() => setTag(t)}>#{t.name}</button>)}
        </div>
      </header>
      <HashtagPanel tag={tag} onClose={() => setTag(null)} />

      {(hasContent(intro) || m.intention) && (
        <div className="serif italic text-[clamp(21px,2.6vw,26px)] leading-snug px-5 py-4 rounded-2xl [&_.p-rich]:text-[length:inherit] [&_.p-rich]:leading-snug" style={{ background: "var(--p-accent-soft)" }}>
          {hasContent(intro) ? <BlockList blocks={intro} /> : m.intention}
        </div>
      )}

      {m.videoUrl && <VideoEmbed url={m.videoUrl} title={m.title} />}
      {hasContent(m.sections.objectifs) && <Section title="Objectifs"><BlockList blocks={m.sections.objectifs} /></Section>}
      {hasContent(m.sections.contenu) && <Section title="Contenu"><BlockList blocks={m.sections.contenu} /></Section>}
      {m.testUrl && <TestSection m={m} live={live} />}

      {(hasContent(m.sections.exercice) || live) && (
        <Section title="Exercice">
          {hasContent(exerciseText) && <BlockList blocks={exerciseText} />}
          <p className="m-0 flex items-start gap-2 text-[13.5px] p-muted"><Lock size={14} className="flex-none mt-0.5" /> Votre journal est privé : personne d’autre ne le lit, sauf si vous partagez une réponse avec Laura.</p>
          {questions.map((q) => <Answer key={q.id} moduleId={m.id} questionId={q.id} label={"html" in q ? q.html : ""} saved={live?.answers.find((a) => a.questionId === q.id)} preview={!live} />)}
          <Answer moduleId={m.id} questionId="note" label="Mes réflexions" saved={live?.answers.find((a) => a.questionId === "note")} preview={!live} />
        </Section>
      )}

      {hasContent(m.sections.defi) && (
        <Section title="Défi dans le réseau">
          <BlockList blocks={m.sections.defi} />
          {live ? <Challenge m={live} /> : <button type="button" className="p-btn-outline p-btn-sm self-start" disabled>J’ai relevé ce défi</button>}
        </Section>
      )}

      {hasContent(m.sections.plusLoin) && <Section title="Pour aller plus loin"><BlockList blocks={m.sections.plusLoin} /></Section>}

      {live && <Finish m={live} />}
    </article>
  );
}

/** Une réponse du journal : enregistrée toute seule, partageable avec Laura. */
function Answer({ moduleId, questionId, label, saved, preview }: { moduleId: number; questionId: string; label: string; saved?: Live["answers"][number]; preview: boolean }) {
  const utils = trpc.useUtils();
  const [text, setText] = useState(saved?.answer ?? "");
  const [id, setId] = useState<number | null>(saved?.id ?? null);
  const [shared, setShared] = useState(!!saved?.sharedAt);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const last = useRef(saved?.answer ?? "");
  const timer = useRef<number | undefined>(undefined);
  const save = trpc.courses.saveAnswer.useMutation({
    onSuccess: (r) => { setId(r.id); if (!r.id) setShared(false); setStatus("saved"); utils.courses.journal.invalidate(); },
    onError: (e) => { setStatus(""); toast.error(e.message); },
  });
  const share = trpc.courses.shareAnswer.useMutation({
    onSuccess: (_r, v) => { setShared(v.shared); toast.success(v.shared ? "Réponse partagée avec Laura" : "Partage repris : cette réponse redevient privée"); },
    onError: (e) => toast.error(e.message),
  });
  const flush = (value = text) => {
    window.clearTimeout(timer.current);
    if (value === last.current || preview) return;
    last.current = value;
    setStatus("saving");
    save.mutate({ moduleId, questionId, answer: value });
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const inputId = `reponse-${questionId}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[15.5px] font-medium leading-snug" dangerouslySetInnerHTML={{ __html: label }} />
      <textarea id={inputId} className="p-field text-[15px] leading-relaxed" rows={4} maxLength={8000} disabled={preview} placeholder={preview ? "Aperçu : rien n’est enregistré" : "Écrivez ici, avec vos mots…"} value={text}
        onChange={(e) => { const v = e.target.value; setText(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => flush(v), 1200); }}
        onBlur={() => flush()} />
      <span className="flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
        <span className="text-[12.5px] p-faint" role="status">{status === "saving" ? "Enregistrement…" : status === "saved" ? "Enregistré dans votre journal" : ""}</span>
        {id && <button type="button" className="p-btn-ghost text-[13px] min-h-0" disabled={share.isPending} onClick={() => share.mutate({ id, shared: !shared })}><Share2 size={13} /> {shared ? "Partagé avec Laura · reprendre" : "Partager avec Laura"}</button>}
      </span>
    </div>
  );
}

function TestSection({ m, live }: { m: Live | Preview; live: Live | null }) {
  const utils = trpc.useUtils();
  const [taking, setTaking] = useState(!live?.testResults.length);
  const save = trpc.courses.saveTestResult.useMutation({
    onSuccess: () => { utils.courses.module.invalidate({ id: m.id }); utils.courses.journal.invalidate(); setTaking(false); toast.success("Votre résultat est dans votre journal"); },
    onError: (e) => toast.error(e.message),
  });
  const share = trpc.courses.shareTest.useMutation({ onSuccess: (_r, v) => { utils.courses.module.invalidate({ id: m.id }); toast.success(v.shared ? "Résultat partagé avec Laura" : "Partage repris : ce résultat redevient privé"); }, onError: (e) => toast.error(e.message) });
  const onResult = (result: TestResult) => {
    if (!live) { toast.info(`Aperçu : résultat reçu (${result.label || result.summary}), rien n’est enregistré`); return; }
    save.mutate({ moduleId: m.id, result });
  };
  const latest = live?.testResults[0];
  return (
    <Section title="Test" id="test">
      {latest?.result && (
        <div className="p-soft p-4 flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--p-gold)" }}>Votre résultat</span>
          {latest.result.label && <span className="serif text-[24px] leading-tight">{latest.result.label}</span>}
          {latest.result.summary && <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line">{latest.result.summary}</p>}
          <span className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <button type="button" className="p-btn-ghost text-[13px] min-h-0" onClick={() => setTaking(!taking)}>{taking ? "Masquer le test" : "Refaire le test"}</button>
            <button type="button" className="p-btn-ghost text-[13px] min-h-0" disabled={share.isPending} onClick={() => share.mutate({ id: latest.id, shared: !latest.sharedAt })}><Share2 size={13} /> {latest.sharedAt ? "Partagé avec Laura · reprendre" : "Partager avec Laura"}</button>
          </span>
        </div>
      )}
      {taking && <TestEmbed url={m.testUrl} title={`Test du module ${m.title}`} onResult={onResult} />}
    </Section>
  );
}

function Challenge({ m }: { m: Live }) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState(m.challengeNote);
  const [open, setOpen] = useState(false);
  const done = !!m.challengeDoneAt;
  const save = trpc.courses.saveChallenge.useMutation({
    onSuccess: (_r, v) => { utils.courses.module.invalidate({ id: m.id }); utils.courses.journal.invalidate(); setOpen(false); if (v.done) toast.success("Bravo, c’est noté dans votre journal"); },
    onError: (e) => toast.error(e.message),
  });
  if (!done && !open) return <button type="button" className="p-btn-outline p-btn-sm self-start" onClick={() => setOpen(true)}>J’ai relevé ce défi</button>;
  return (
    <div className="p-soft p-4 flex flex-col gap-2.5">
      {done && <span className="flex items-center gap-2 font-medium"><Check size={16} style={{ color: "var(--p-accent-text)" }} /> Défi relevé</span>}
      <label className="flex flex-col gap-1 text-[13.5px] p-muted"><span>Une note pour vous (facultative)</span><textarea className="p-field text-[15px]" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <span className="flex flex-wrap gap-2">
        <button type="button" className="p-btn-primary p-btn-sm" disabled={save.isPending} onClick={() => save.mutate({ moduleId: m.id, done: true, note })}>{done ? "Enregistrer ma note" : "C’est relevé"}</button>
        {done ? <button type="button" className="p-btn-ghost" disabled={save.isPending} onClick={() => { setNote(""); save.mutate({ moduleId: m.id, done: false }); }}>Pas encore relevé</button> : <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setOpen(false)}>Annuler</button>}
      </span>
    </div>
  );
}

function Finish({ m }: { m: Live }) {
  const utils = trpc.useUtils();
  const memory = trpc.coachMemory.state.useQuery();
  const complete = trpc.courses.complete.useMutation({
    onSuccess: (r, v) => { utils.courses.invalidate(); utils.coachMemory.invalidate(); if (v.done) toast.success(r.finished ? "Bravo, vous avez terminé cette formation" : "Module terminé"); },
    onError: (e) => toast.error(e.message),
  });
  const done = !!m.completedAt;
  return (
    <footer className="flex flex-col gap-4 pt-6 border-t" style={{ borderColor: "var(--p-line)" }}>
      {done
        ? <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 font-semibold"><Check size={18} style={{ color: "var(--p-accent-text)" }} /> Module terminé</span><button type="button" className="p-btn-ghost" disabled={complete.isPending} onClick={() => complete.mutate({ moduleId: m.id, done: false })}>Marquer comme non terminé</button></div>
        : <button type="button" className="p-btn-primary self-center" disabled={complete.isPending} onClick={() => complete.mutate({ moduleId: m.id, done: true })}><Check size={18} /> J’ai terminé ce module</button>}
      {done && memory.data?.active && <p className="m-0 text-[14px] p-muted text-center">Le coach garde le fil de votre chemin. <Link to="/parcours/coach" className="p-link">Voir ce qu’il retient de vous</Link></p>}
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Modules voisins">
        {m.prev ? <Link to={`/parcours/${m.course.id}/module/${m.prev.id}`} className="p-btn-ghost no-underline"><ArrowLeft size={15} /> {m.prev.title}</Link> : <Link to={`/parcours/${m.course.id}`} className="p-btn-ghost no-underline"><ArrowLeft size={15} /> La formation</Link>}
        {m.next && (m.next.open
          ? <Link to={`/parcours/${m.course.id}/module/${m.next.id}`} className="p-btn-outline p-btn-sm no-underline">{m.next.title} <ArrowRight size={15} /></Link>
          : <span className="text-[14px] p-muted">Prochain module : {m.next.opensAt ? parisLongDate(new Date(m.next.opensAt)).toLowerCase() : "bientôt"}</span>)}
      </nav>
    </footer>
  );
}
