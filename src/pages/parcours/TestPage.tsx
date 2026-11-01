import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, Clock, Lock, RotateCcw, Share2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { HostedTest, TestEmbed } from "@/components/course/TestEmbed";
import type { TestResult } from "@/lib/courseTest";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";

type Data = RouterOutputs["resources"]["test"];
type Passage = Data["history"][number];

/** Passer un test : le cadre isolé, puis le résultat, les leçons liées, et l'historique des passages. */
export default function TestPage() {
  const { id } = useParams();
  const testId = Number(id);
  const q = trpc.resources.test.useQuery({ id: testId }, { enabled: !!testId });
  const back = <Link to="/parcours/ressources" className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> Mes ressources</Link>;
  if (q.error) return <div className="flex flex-col gap-4">{back}<p className="p-soft p-8 text-center p-muted m-0">Ce test n’est pas disponible.</p></div>;
  if (!q.data) return <p className="p-muted text-center py-20 m-0">Chargement…</p>;
  return <div className="flex flex-col gap-5 max-w-[860px]">{back}<Test key={q.data.id} t={q.data} /></div>;
}

function Test({ t }: { t: Data }) {
  const utils = trpc.useUtils();
  // auto : pas encore de passage, le test s'ouvre ; sinon, le dernier résultat. taking : un passage en cours. finished : il vient de se terminer.
  const [mode, setMode] = useState<"auto" | "taking" | "finished">("auto");
  const [run, setRun] = useState(0);
  const received = useRef(false);
  // Le résultat s'affiche une fois relu : jamais le précédent, même un instant
  const refresh = async () => { utils.resources.catalog.invalidate(); utils.resources.myProfile.invalidate(); utils.coachMemory.invalidate(); await utils.resources.test.invalidate({ id: t.id }); setMode("finished"); };
  const save = trpc.resources.saveResult.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Résultat enregistré"); },
    onError: (e) => { received.current = false; toast.error(e.message); },
  });
  const done = trpc.resources.markDone.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  // Un test peut envoyer plusieurs fois son résultat : seul le premier de ce passage compte
  const onResult = (result: TestResult) => {
    if (received.current) return;
    received.current = true;
    save.mutate({ testId: t.id, result });
  };
  const retake = () => { received.current = false; setRun((r) => r + 1); setMode("taking"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // À la fin du test, le résultat vient à l'écran : sur téléphone, il serait sinon caché sous le cadre
  const resultAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mode === "finished") resultAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [mode]);
  const latest = t.history[0];
  const showFrame = mode !== "auto" || !latest;
  const showResult = !!latest && mode !== "taking";

  return (
    <>
      <header className="flex flex-col gap-2">
        <span className="p-eyebrow">{t.themes.map((x) => x.name).join(" · ")}</span>
        <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.06]">{t.title}</h1>
        {t.description && <p className="m-0 text-[16px] leading-relaxed p-muted">{t.description}</p>}
        <span className="text-[13.5px] p-muted flex flex-wrap items-center gap-x-4 gap-y-1">
          {t.durationMin !== null && <span className="flex items-center gap-1.5"><Clock size={14} /> {t.durationMin} min</span>}
          <span className="flex items-center gap-1.5"><Lock size={14} /> Votre résultat reste privé</span>
        </span>
      </header>
      {t.medicalNotice && <p role="note" className="p-soft m-0 p-3.5 flex items-start gap-2.5 text-[14.5px] font-medium"><Stethoscope size={17} className="flex-none mt-0.5" /> Ce test n’est pas un outil médical.</p>}

      {showFrame && (t.frame.kind === "hosted"
        ? (t.frame.src ? <HostedTest key={run} src={t.frame.src} title={t.title} onResult={onResult} /> : <p className="p-soft m-0 p-6 text-center p-muted">Ce test ne peut pas s’ouvrir pour l’instant.</p>)
        : <TestEmbed key={run} url={t.frame.url} title={t.title} onResult={onResult} />)}
      {save.isPending && <p className="m-0 text-[14px] p-muted" role="status">Enregistrement de votre résultat…</p>}
      {showFrame && !t.sendsResult && mode !== "finished" && (
        <div className="p-soft p-4 flex flex-wrap items-center justify-between gap-3 text-[14.5px]">
          <span className="flex-[1_1_260px]">Ce test ne transmet pas de résultat à Présence : vous seul·e le voyez. Indiquez simplement quand vous l’avez terminé.</span>
          <button type="button" className="p-btn-primary p-btn-sm" disabled={done.isPending} onClick={() => done.mutate({ testId: t.id })}><Check size={15} /> J’ai terminé ce test</button>
        </div>
      )}

      <div ref={resultAnchor} className="scroll-mt-20 flex flex-col">{showResult && <Result p={latest} canRetake={t.canRetake} onRetake={retake} />}</div>
      {showResult && t.lessons.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-labelledby="plus-loin">
          <h2 id="plus-loin" className="m-0 text-[26px]">Pour aller plus loin</h2>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {t.lessons.map((l) => (
              <li key={l.id}>
                <Link to={l.href} className="p-card p-4 flex items-center gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
                  <span className="flex flex-col min-w-0 flex-1"><span className="font-medium leading-snug">{l.title}</span><span className="text-[13px] p-muted">{l.courseTitle}{l.open ? "" : l.opensAt ? ` · s’ouvre le ${parisLongDate(new Date(l.opensAt)).toLowerCase()}` : " · à découvrir dans la formation"}</span></span>
                  <ArrowRight size={16} className="flex-none p-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {t.history.length > 0 && <History items={t.history} />}
    </>
  );
}

function Result({ p, canRetake, onRetake }: { p: Passage; canRetake: boolean; onRetake: () => void }) {
  const r = p.result;
  const details = Object.entries(r?.details ?? {});
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-3" aria-label="Votre résultat">
      <span className="p-eyebrow">Votre résultat · {parisLongDate(new Date(p.passedAt)).toLowerCase()}</span>
      {r ? (
        <>
          {r.label && <span className="serif text-[28px] leading-tight">{r.label}</span>}
          {r.score !== null && r.score !== undefined && r.score !== "" && <span className="text-[15px] font-medium">Score : {String(r.score)}</span>}
          {r.summary && <p className="m-0 text-[16px] leading-relaxed whitespace-pre-line">{r.summary}</p>}
          {details.length > 0 && <dl className="m-0 grid gap-x-4 gap-y-1 text-[14.5px]" style={{ gridTemplateColumns: "auto 1fr" }}>{details.map(([k, v]) => <div key={k} className="contents"><dt className="p-muted">{k}</dt><dd className="m-0">{String(v)}</dd></div>)}</dl>}
        </>
      ) : <p className="m-0 text-[15px] p-muted">Test terminé. Ce test ne transmet pas de résultat : seul votre passage est noté.</p>}
      {canRetake && <button type="button" className="p-btn-outline p-btn-sm self-start" onClick={onRetake}><RotateCcw size={14} /> Refaire le test</button>}
    </section>
  );
}

function History({ items }: { items: Passage[] }) {
  const utils = trpc.useUtils();
  const share = trpc.courses.shareTest.useMutation({ onSuccess: (_r, v) => { utils.resources.test.invalidate(); toast.success(v.shared ? "Résultat partagé avec Laura" : "Partage repris : ce résultat redevient privé"); }, onError: (e) => toast.error(e.message) });
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="passages">
      <h2 id="passages" className="m-0 text-[26px]">Mes passages</h2>
      <ol className="list-none m-0 p-0 flex flex-col gap-2">
        {items.map((p) => (
          <li key={p.id} className="p-soft p-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="flex flex-col min-w-0 flex-[1_1_240px]"><span className="text-[13px] p-muted">{parisLongDate(new Date(p.passedAt))}</span><span className="text-[15px] font-medium">{p.result?.label || (p.result?.summary ? "Résultat enregistré" : "Sans résultat transmis")}</span></span>
            {p.result && <button type="button" className="p-btn-ghost text-[13px] min-h-0" disabled={share.isPending} onClick={() => share.mutate({ id: p.id, shared: !p.sharedAt })}><Share2 size={13} /> {p.sharedAt ? "Partagé avec Laura · reprendre" : "Partager avec Laura"}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
