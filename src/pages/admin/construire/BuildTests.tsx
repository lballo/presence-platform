import { useState } from "react";
import { ExternalLink, FileCode2, Play, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { HostedTest, TestEmbed } from "@/components/course/TestEmbed";
import type { TestResult } from "@/lib/courseTest";
import { useUpload } from "@/lib/upload";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Badge } from "../shared";
import { dateTime } from "../labels";
import { NotionBar } from "./BuildHome";
import { CreatorShell } from "./CreatorShell";
import { notionUrl, STATUS_LABEL, statusTone } from "./labels";
import { useFreshNotion } from "./useFreshNotion";

type Test = RouterOutputs["build"]["tests"]["tests"][number];

/** Le catalogue de tests : Notion fait foi pour les fiches, le fichier HTML peut se déposer ici. */
export default function BuildTests() {
  const q = trpc.build.tests.useQuery();
  const status = trpc.build.status.useQuery();
  const [trying, setTrying] = useState<number | null>(null);
  useFreshNotion(status.data);
  const d = q.data;
  return (
    <CreatorShell crumbs={[{ label: "Tests de Mes ressources" }]}>
    <main className="w-full max-w-[1350px] mx-auto px-4 lg:px-10 pt-8 pb-14 flex flex-col gap-6">
      <div><p className="m-0 mb-2 text-[12px] font-medium" style={{ color: "var(--p-accent)" }}>VOTRE ESPACE DE TRANSMISSION</p><h1 className="m-0 text-[30px] leading-9">Vos tests.</h1><p className="m-0 mt-2 text-[14px] p-muted">Déposez un fichier, essayez-le, suivez les passages.</p></div>
      <NotionBar />
      <section className="flex flex-col gap-3" aria-labelledby="themes-tests">
        <div className="flex flex-col gap-1">
          <h2 id="themes-tests" className="m-0 text-[20px]">Thèmes</h2>
          <span className="text-[14px] p-muted">Titres, introductions, ordre et statut se modifient dans la page Notion « Catalogue de tests ». Seul un thème publié apparaît dans Mes ressources.</span>
        </div>
        {d?.themes.length === 0 && <div className="p-soft p-6 text-center p-muted">Aucun thème pour l’instant : synchronisez pour reprendre ceux de Notion.</div>}
        <div className="flex flex-wrap gap-2">
          {d?.themes.map((t) => <span key={t.id} className="p-soft px-3.5 py-2.5 flex flex-col gap-1 min-w-0"><span className="flex items-center gap-2"><span className="font-medium text-[14.5px]">{t.name}</span><Badge tone={statusTone(t.status)}>{STATUS_LABEL[t.status]}</Badge></span><span className="text-[12.5px] p-muted">{t.testCount} test{t.testCount > 1 ? "s" : ""}{t.profileLabel ? ` · profil : ${t.profileLabel}` : ""}</span></span>)}
        </div>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="liste-tests">
        <div className="flex flex-col gap-1">
          <h2 id="liste-tests" className="m-0 text-[20px]">Tests</h2>
          <span className="text-[14px] p-muted">Les chiffres sont des totaux par test : ni nom, ni résultat. Les résultats restent chiffrés et privés.</span>
        </div>
        {d?.tests.length === 0 && <div className="p-soft p-6 text-center p-muted">Aucun test pour l’instant.</div>}
        <div className="grid gap-3 lg:grid-cols-2">
          {d?.tests.map((t) => <TestCard key={t.id} t={t} onTry={() => setTrying(t.id)} />)}
        </div>
      </section>
      {trying !== null && <TryTest id={trying} onClose={() => setTrying(null)} />}
    </main>
    </CreatorShell>
  );
}

function TestCard({ t, onTry }: { t: Test; onTry: () => void }) {
  const utils = trpc.useUtils();
  const file = useUpload("testFile");
  const setFile = trpc.build.setTestFile.useMutation({
    onSuccess: (r) => { utils.build.tests.invalidate(); toast.success(r.sendsResult ? "Fichier déposé : il envoie bien son résultat" : "Fichier déposé : il n’envoie pas de résultat, les passages seront notés sans contenu"); },
    onError: (e) => toast.error(e.message),
  });
  const send = async (picked: File) => {
    try {
      // Certains systèmes n'indiquent pas le type d'un fichier .html
      const html = picked.type === "text/html" || !/\.html?$/i.test(picked.name) ? picked : new File([picked], picked.name, { type: "text/html" });
      const r = await file.upload(html);
      setFile.mutate({ id: t.id, path: r.path, name: picked.name.slice(0, 200) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  const busy = file.busy || setFile.isPending;
  return (
    <article className="p-card p-4 flex flex-col gap-3">
      <span className="flex flex-col gap-1.5 min-w-0">
        <span className="flex flex-wrap items-center gap-1.5"><Badge tone={statusTone(t.status)}>{STATUS_LABEL[t.status]}</Badge>{t.themes.map((n) => <Badge key={n}>{n}</Badge>)}{t.canRetake && <Badge>Peut être refait</Badge>}</span>
        <span className="text-[17px] font-semibold leading-snug">{t.title}</span>
        {t.description && <span className="text-[14px] p-muted leading-snug">{t.description}</span>}
        <span className="text-[13px] p-muted">{[t.durationMin !== null ? `${t.durationMin} min` : "", t.resultType].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="p-soft p-3 flex items-start gap-2 text-[13.5px]">
        <FileCode2 size={15} className="flex-none mt-0.5" />
        {t.file
          ? <span className="min-w-0 break-words"><span className="font-medium">{t.file.name || "Fichier HTML"}</span>{t.file.updatedAt ? ` · déposé le ${dateTime(t.file.updatedAt)}` : ""}<br /><span className="p-muted">{t.file.sendsResult ? "Il envoie son résultat." : "Il n’envoie pas de résultat : les passages sont notés sans contenu."}</span></span>
          : t.linkUrl ? <span className="min-w-0 break-all p-muted">En ligne ailleurs : {t.linkUrl}</span> : <span className="p-muted">Aucun fichier pour l’instant.</span>}
      </span>
      <span className="text-[13.5px]" aria-label="Statistiques"><span className="font-medium">{t.stats.people} personne{t.stats.people > 1 ? "s" : ""} · {t.stats.passages} passage{t.stats.passages > 1 ? "s" : ""}</span>{t.stats.lastAt && <span className="p-muted"> · dernier le {dateTime(t.stats.lastAt)}</span>}</span>
      {t.issues.length > 0 && <ul className="m-0 pl-4 flex flex-col gap-1 text-[13.5px]" style={{ color: "var(--p-accent-text)" }}>{t.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      <span className="flex flex-wrap items-center gap-2 mt-auto">
        <label className={`p-btn-primary p-btn-sm ${busy ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
          <input type="file" accept=".html,.htm,text/html" className="hidden" aria-label={`${t.file ? "Remplacer" : "Déposer"} le fichier HTML de ${t.title}`} disabled={busy} onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ""; if (picked) void send(picked); }} />
          <Upload size={14} /> {file.busy ? `Envoi… ${file.progress ?? 0} %` : setFile.isPending ? "Vérification…" : t.file ? "Remplacer le fichier" : "Déposer le fichier"}
        </label>
        <button type="button" className="p-btn-outline p-btn-sm" disabled={!t.opens} onClick={onTry}><Play size={14} /> Essayer</button>
        <a href={notionUrl(t.notionPageId)} target="_blank" rel="noopener noreferrer" className="p-btn-ghost no-underline text-[13.5px]"><ExternalLink size={13} /> Fiche Notion</a>
      </span>
    </article>
  );
}

/** Essayer un test comme un membre : le résultat s'affiche ici, rien n'est gardé. */
function TryTest({ id, onClose }: { id: number; onClose: () => void }) {
  const q = trpc.build.testPreview.useQuery({ id }, { gcTime: 0 });
  const [result, setResult] = useState<TestResult | null>(null);
  const frame = q.data?.frame;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle className="serif text-[26px] font-normal">Essayer : {q.data?.title ?? "…"}</DialogTitle>
        <p className="m-0 text-[13.5px] p-muted">Aperçu : aucun résultat n’est enregistré, même en brouillon.</p>
        {frame?.kind === "hosted" && (frame.src ? <HostedTest src={frame.src} title={q.data?.title ?? "Test"} onResult={setResult} /> : <p className="m-0 p-muted">La clé de chiffrement (PRIVATE_DATA_KEY) manque : le test ne peut pas s’ouvrir.</p>)}
        {frame?.kind === "link" && <TestEmbed url={frame.url} title={q.data?.title ?? "Test"} onResult={setResult} />}
        {result && <p role="status" className="p-soft m-0 p-3.5 text-[14.5px]"><span className="font-medium">Résultat bien reçu : {result.label || "(sans titre)"}</span>{result.summary ? ` · ${result.summary}` : ""}</p>}
      </DialogContent>
    </Dialog>
  );
}
