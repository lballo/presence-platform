import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Lock, Unlock, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Faces } from "@/components/Avatar";
import { longDate, monthLabel, plural } from "@/lib/format";

export const COVERS: Record<string, string> = {
  rouge: "linear-gradient(135deg, #A92B2A 0%, #4A211C 100%)",
  or: "linear-gradient(135deg, #C4A574 0%, #6E5530 100%)",
  vin: "linear-gradient(135deg, #2E1412 0%, #7A2E28 100%)",
  bronze: "linear-gradient(135deg, #6B5430 0%, #1E1A16 100%)",
  nuit: "linear-gradient(135deg, #141211 0%, #46403C 100%)",
  braise: "linear-gradient(135deg, #A83932 0%, #C4A574 100%)",
};
export const PHASES: Record<string, string> = { idee: "Idée", en_cours: "En cours", termine: "Terminé" };
export const endLabel = (phase: string | null, end: string | null) => (phase === "termine" ? (end ? `Terminé en ${monthLabel(end)}` : "Terminé") : end ? `Jusqu’en ${monthLabel(end)}` : "Au long cours");

type Hive = RouterOutputs["hives"]["list"][number];

export default function Ruches() {
  const hives = trpc.hives.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [tfilter, setTfilter] = useState<"all" | "communaute" | "projet">("all");
  const [afilter, setAfilter] = useState<"all" | "libre" | "validation">("all");
  const all = hives.data ?? [];
  const mine = all.filter((h) => h.role).sort((a, b) => (a.type === "projet" ? 1 : 0) - (b.type === "projet" ? 1 : 0));
  const others = all.filter((h) => !h.role && h.phase !== "termine" && (tfilter === "all" || h.type === tfilter) && (afilter === "all" || h.access === afilter));
  const toValidate = all.filter((h) => (h.role === "founder" || h.role === "leader") && h.pendingCount > 0);

  return (
    <>
      <PageHeader eyebrow="Groupes d’intérêt" title="Les Ruches" intro="Des cercles plus intimes, réunis autour d’un thème commun et animés par un ou plusieurs leaders. Certaines ruches sont des projets : un objectif à atteindre ensemble, des besoins, des ressources partagées."
        action={<button type="button" className="p-btn-primary" onClick={() => setCreating(!creating)}><Plus size={17} /> Créer une ruche</button>} />
      {creating && <CreateHive onDone={() => setCreating(false)} />}
      {toValidate.map((h) => (
        <Link key={h.id} to={`/ruches/${h.id}?tab=mem`} className="flex flex-wrap items-center gap-3 p-4 rounded-2xl mb-5 no-underline" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)", color: "var(--p-ink)" }}>
          <span className="w-10 h-10 rounded-full text-white flex items-center justify-center font-semibold" style={{ background: "var(--p-accent)" }}>{h.pendingCount}</span>
          <span className="flex flex-col flex-1"><span className="font-semibold">{plural(h.pendingCount, "demande d’adhésion à valider", "demandes d’adhésion à valider")}</span><span className="text-[13.5px] p-muted">Vous êtes leader de la ruche « {h.name} ».</span></span>
          <span className="p-link text-[14px] font-medium">Voir les demandes →</span>
        </Link>
      ))}

      <Section title="Mes ruches" count={mine.length} items={mine} empty="Vous n’avez pas encore rejoint de ruche." />
      <Section title="Découvrir d’autres ruches" count={others.length} items={others} empty="Aucune ruche dans cette sélection."
        chips={
          <div className="flex flex-wrap gap-1.5 items-center">
            {([["all", "Toutes"], ["communaute", "Communautés"], ["projet", "Ruches projet"]] as const).map(([k, l]) => <button key={k} type="button" className={`p-chip h-9 ${tfilter === k ? "p-chip-on" : ""}`} onClick={() => setTfilter(k)}>{l}</button>)}
            <span className="w-px h-6 mx-1" style={{ background: "var(--p-line-2)" }} />
            {([["libre", "Accès libre"], ["validation", "Sur validation"]] as const).map(([k, l]) => <button key={k} type="button" className={`p-chip h-9 ${afilter === k ? "p-chip-on" : ""}`} onClick={() => setAfilter(afilter === k ? "all" : k)}>{l}</button>)}
          </div>
        } />
    </>
  );
}

function Section({ title, count, items, empty, chips }: { title: string; count: number; items: Hive[]; empty: string; chips?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 mb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="m-0 text-[32px]">{title} <span className="text-[14px] font-sans p-faint">{count}</span></h2>{chips}</div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(250px, 100%), 1fr))" }}>
        {items.map((h) => <HiveCard key={h.id} h={h} />)}
      </div>
      {items.length === 0 && <div className="p-soft p-7 text-center p-muted">{empty}</div>}
    </section>
  );
}

function HiveCard({ h }: { h: Hive }) {
  const pj = h.type === "projet";
  const pill = h.role === "founder" || h.role === "leader" ? (h.pendingCount ? plural(h.pendingCount, "demande", "demandes") : pj ? "Porteuse" : "Leader") : h.role === "member" ? (pj ? "Contributrice" : "Membre") : h.role === "pending" ? "En attente" : "";
  return (
    <Link to={`/ruches/${h.id}`} className="p-card overflow-hidden flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
      <span className="relative block h-[150px]" style={{ background: COVERS[h.cover] ?? COVERS.rouge }}>
        <span className="absolute left-3.5 top-3.5 flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-white text-[11.5px] font-medium bg-black/35">{h.access === "libre" ? <Unlock size={11} /> : <Lock size={11} />} {h.access === "libre" ? (pj ? "Contribution libre" : "Adhésion libre") : "Sur validation"}</span>
        {pill && <span className="absolute right-3.5 top-3.5 h-[26px] px-2.5 rounded-full text-[11.5px] font-semibold flex items-center" style={h.pendingCount ? { background: "var(--p-accent)", color: "#fff" } : { background: "rgba(255,255,255,0.92)", color: "#141211" }}>{pill}</span>}
      </span>
      <span className="p-4 flex flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--p-gold)" }}>{pj ? `Ruche projet · ${PHASES[h.phase ?? "idee"]}` : h.theme}</span>
        <span className="serif text-[24px] leading-tight">{h.name}</span>
        <span className="flex items-center gap-2.5 mt-1"><Faces list={h.faces} /><span className="text-[13px] p-muted">{pj ? plural(h.memberCount, "contributeur", "contributeurs") : plural(h.memberCount, "membre", "membres") + (h.projectCount ? ` · ${plural(h.projectCount, "projet", "projets")}` : "")}</span></span>
        <span className="flex items-center gap-1.5 mt-1.5 pt-2.5 border-t text-[12.5px] p-muted truncate" style={{ borderColor: "var(--p-line)" }}><CalendarDays size={13} className="flex-none" />{pj ? [endLabel(h.phase, h.endMonth), h.parentName ? `né dans ${h.parentName}` : ""].filter(Boolean).join(" · ") : h.nextEvent ? `Prochain rendez-vous : ${longDate(new Date(h.nextEvent.startsAt)).toLowerCase()}` : "Pas d’événement prévu"}</span>
      </span>
    </Link>
  );
}

export function CreateHive({ onDone, parentId, forcedType }: { onDone: () => void; parentId?: number | null; forcedType?: "projet" }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const myHives = trpc.hives.list.useQuery();
  const create = trpc.hives.create.useMutation({ onSuccess: (h) => { utils.hives.invalidate(); toast.success(h.type === "projet" ? "Ruche projet lancée" : "Ruche créée"); onDone(); navigate(`/ruches/${h.id}`); }, onError: (e) => toast.error(e.message) });
  const [f, setF] = useState({ type: (forcedType ?? "communaute") as "communaute" | "projet", name: "", theme: "", description: "", cover: "rouge", access: "libre" as "libre" | "validation", goal: "", needs: "", hasEnd: false, endMonth: "", parentId: parentId ?? null as number | null });
  const pj = f.type === "projet";
  const comms = (myHives.data ?? []).filter((h) => h.type === "communaute" && h.role && h.role !== "pending");

  return (
    <section className="p-card p-6 sm:p-7 flex flex-col gap-4 mb-7">
      <div><h2 className="m-0 text-[30px]">{pj ? "Lancer une ruche projet" : "Créer une ruche"}</h2><p className="m-0 text-[14.5px] p-muted">{pj ? "Vous en serez la porteuse : vous accueillez les contributeurs, partagez les ressources et pouvez associer d’autres personnes au portage." : "Vous en serez la leader fondatrice : vous accueillez les membres, organisez les événements et pouvez nommer d’autres leaders."}</p></div>
      {!forcedType && (
        <div className="flex flex-wrap gap-2.5">
          {([["communaute", "Communauté", "Un groupe d’intérêt durable, animé par des leaders."], ["projet", "Ruche projet", "Un projet à mener à plusieurs : un objectif, des besoins, des ressources."]] as const).map(([k, l, hint]) => (
            <button key={k} type="button" aria-pressed={f.type === k} className="flex-[1_1_220px] flex flex-col items-start gap-0.5 p-3.5 rounded-2xl border text-left" style={f.type === k ? { background: "var(--p-accent-soft)", borderColor: "var(--p-accent)" } : { borderColor: "var(--p-line-2)" }} onClick={() => setF({ ...f, type: k })}><span className="font-semibold">{l}</span><span className="text-[13px] p-muted">{hint}</span></button>
          ))}
        </div>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>{pj ? "Nom du projet" : "Nom de la ruche"}</span><input className="p-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={pj ? "Ex. Le livret d’accueil des nouveaux membres" : "Ex. Leaders en reconversion"} /></label>
        {!pj && <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Thème</span><input className="p-field" value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} placeholder="Ex. Transition de carrière" /></label>}
        {pj && <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Objectif</span><input className="p-field" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Ce que vous voulez accomplir ensemble" /></label>}
      </div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Description</span><textarea className="p-field" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={pj ? "Le contexte du projet et la manière dont vous souhaitez avancer ensemble." : "À qui s’adresse cette ruche, et ce que vous y ferez ensemble."} /></label>
      {pj && (
        <>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ce dont vous avez besoin <span className="p-faint">· séparé par des virgules</span></span><input className="p-field" value={f.needs} onChange={(e) => setF({ ...f, needs: e.target.value })} placeholder="Ex. Une graphiste, des témoignages, un lieu" /></label>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-2"><span className="text-[13.5px] p-muted">Durée</span><div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`p-chip ${!f.hasEnd ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, hasEnd: false })}>Sans date de fin</button>
              <button type="button" className={`p-chip ${f.hasEnd ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, hasEnd: true })}>Avec une date de fin</button>
              {f.hasEnd && <input type="month" className="p-field w-auto" value={f.endMonth} onChange={(e) => setF({ ...f, endMonth: e.target.value })} />}
            </div></div>
            {!parentId && comms.length > 0 && <div className="flex flex-col gap-2"><span className="text-[13.5px] p-muted">Né dans une ruche <span className="p-faint">· facultatif</span></span><div className="flex flex-wrap gap-2"><button type="button" className={`p-chip ${f.parentId === null ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, parentId: null })}>Aucune</button>{comms.map((c) => <button key={c.id} type="button" className={`p-chip ${f.parentId === c.id ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, parentId: c.id })}>{c.name}</button>)}</div></div>}
          </div>
        </>
      )}
      <div className="flex flex-col gap-2"><span className="text-[13.5px] p-muted">Couverture</span><div className="flex flex-wrap gap-2.5">{Object.keys(COVERS).map((k) => <button key={k} type="button" aria-label={k} aria-pressed={f.cover === k} className="w-[72px] h-12 rounded-xl" style={{ background: COVERS[k], boxShadow: f.cover === k ? "0 0 0 2px var(--p-surface), 0 0 0 4px var(--p-ink)" : "none" }} onClick={() => setF({ ...f, cover: k })} />)}</div></div>
      <div className="flex flex-col gap-2"><span className="text-[13.5px] p-muted">{pj ? "Contribution" : "Adhésion"}</span><div className="flex flex-wrap gap-2.5">
        {([["libre", pj ? "Contribution libre" : "Adhésion libre", pj ? "Chacun peut rejoindre le projet en un clic." : "Chacun peut rejoindre la ruche en un clic."], ["validation", "Sur validation", pj ? "Les porteurs valident chaque contribution." : "Les leaders valident chaque demande d’adhésion."]] as const).map(([k, l, hint]) => (
          <button key={k} type="button" aria-pressed={f.access === k} className="flex-[1_1_220px] flex flex-col items-start gap-0.5 p-3.5 rounded-2xl border text-left" style={f.access === k ? { background: "var(--p-accent-soft)", borderColor: "var(--p-accent)" } : { borderColor: "var(--p-line-2)" }} onClick={() => setF({ ...f, access: k })}><span className="font-semibold">{l}</span><span className="text-[13px] p-muted">{hint}</span></button>
        ))}
      </div></div>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="p-btn-primary" disabled={!f.name.trim() || create.isPending || (f.hasEnd && !f.endMonth)} onClick={() => create.mutate({ type: f.type, name: f.name, theme: f.theme, description: f.description, cover: f.cover, access: f.access, goal: f.goal, needs: f.needs.split(",").map((x) => x.trim()).filter(Boolean), endMonth: f.hasEnd ? f.endMonth : null, parentId: f.parentId })}>{pj ? "Lancer la ruche projet" : "Créer la ruche"}</button>
        <button type="button" className="p-btn-outline" onClick={onDone}>Annuler</button>
      </div>
    </section>
  );
}
