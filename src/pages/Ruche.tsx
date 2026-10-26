import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Lock, Unlock, Heart, MessageCircle, Plus, FileText, Link2, Sheet, Presentation, Pin, ExternalLink, Users, CalendarDays, Flag, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { ago, longDate, hour, plural } from "@/lib/format";
import { COVERS, PHASES, endLabel, CreateHive } from "./Ruches";
import { AccessInfo, AccessFields, accessReady } from "@/components/EventAccess";

const RES_ICON = { doc: FileText, pdf: FileText, sheet: Sheet, slides: Presentation, link: Link2 } as const;
const RES_LABEL = { doc: "Document", pdf: "PDF", sheet: "Tableur", slides: "Présentation", link: "Lien" } as const;

export default function Ruche() {
  const { id } = useParams();
  const hiveId = Number(id);
  const utils = trpc.useUtils();
  const [params, setParams] = useSearchParams();
  const h = trpc.hives.byId.useQuery({ id: hiveId }, { enabled: !!hiveId });
  const refresh = () => { utils.hives.byId.invalidate({ id: hiveId }); utils.hives.list.invalidate(); utils.dashboard.invalidate(); };
  const join = trpc.hives.join.useMutation({ onSuccess: (r) => { refresh(); toast.success(r.role === "pending" ? "Demande envoyée aux leaders" : "Bienvenue dans la ruche"); } });
  const leave = trpc.hives.leave.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  if (!h.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  const r = h.data;
  const pj = r.type === "projet";
  const tabs = pj ? [["disc", "Discussions"], ["res", "Ressources"], ["mem", "Contributeurs"], ["ev", "Rendez-vous"]] : [["disc", "Discussions"], ["proj", "Projets"], ["mem", "Membres"], ["ev", "Événements"]];
  const tab = tabs.some((t) => t[0] === params.get("tab")) ? params.get("tab")! : "disc";
  const setTab = (t: string) => setParams({ tab: t });
  const who = pj ? "contributeurs" : "membres";

  return (
    <>
      <nav className="flex flex-wrap items-center gap-2 mb-5 text-[13.5px] p-faint">
        <Link to="/ruches" className="p-btn-outline p-btn-sm no-underline"><ArrowLeft size={15} /> Toutes les ruches</Link>
        {r.parent && <><span>·</span><Link to={`/ruches/${r.parent.id}`} className="p-link no-underline font-medium">{r.parent.name}</Link></>}
        <span>· {r.name}</span>
      </nav>

      <section className="relative overflow-hidden rounded-3xl p-6 sm:p-10 text-white flex flex-col gap-4 mb-6" style={{ background: COVERS[r.cover] ?? COVERS.rouge }}>
        <span className="text-[12px] font-medium uppercase tracking-[0.3em] text-white/80">{pj ? "Ruche projet" : r.theme}</span>
        <h1 className="m-0 text-[clamp(34px,4.4vw,52px)] leading-[1.02]">{r.name}</h1>
        <p className="m-0 max-w-[620px] text-[16px] text-white/85 leading-relaxed">{r.description}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-white/85">
          <span className="flex items-center gap-1.5"><Users size={15} /> {plural(r.memberCount, who.slice(0, -1), who)}{!pj && r.children.length ? ` · ${plural(r.children.length, "projet", "projets")}` : ""}</span>
          <span className="flex items-center gap-1.5">{r.access === "libre" ? <Unlock size={15} /> : <Lock size={15} />} {r.access === "libre" ? (pj ? "Contribution libre" : "Adhésion libre") : "Sur validation"}</span>
          <span className="flex items-center gap-1.5"><Flag size={15} /> {pj ? "Porté par" : r.leaders.length > 1 ? "Leaders :" : "Leader :"} {r.leaders.map((l) => l.name).join(", ")}</span>
          {pj && <span className="flex items-center gap-1.5"><CalendarDays size={15} /> {PHASES[r.phase ?? "idee"]} · {endLabel(r.phase, r.endMonth)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {!r.role && r.phase !== "termine" && <button type="button" className="p-btn-white" onClick={() => join.mutate({ id: hiveId })}>{r.access === "libre" ? (pj ? "Rejoindre le projet" : "Rejoindre la ruche") : pj ? "Demander à contribuer" : "Demander à rejoindre"}</button>}
          {!r.role && r.access !== "libre" && <span className="text-[13.5px] text-white/80">Chaque {pj ? "contribution est validée par les porteurs" : "adhésion est validée par les leaders"}.</span>}
          {r.role === "pending" && <><span className="h-12 px-4 rounded-full border border-white/45 flex items-center text-[14.5px]">Demande envoyée · en attente de validation</span><button type="button" className="underline text-white/85" onClick={() => leave.mutate({ id: hiveId })}>Annuler la demande</button></>}
          {r.role === "member" && <><span className="h-12 px-4 rounded-full bg-white/15 flex items-center text-[14.5px]">✓ {pj ? "Vous contribuez à ce projet" : "Vous êtes membre"}</span><button type="button" className="underline text-white/85" onClick={() => leave.mutate({ id: hiveId })}>{pj ? "Quitter le projet" : "Quitter la ruche"}</button></>}
          {r.canManage && <span className="h-12 px-4 rounded-full bg-white/15 flex items-center text-[14.5px]">{r.role === "founder" ? (pj ? "Vous avez lancé ce projet" : "Vous êtes la leader fondatrice") : pj ? "Vous portez ce projet" : "Vous êtes leader de cette ruche"}</span>}
        </div>
      </section>

      <div className="flex flex-wrap gap-6 items-start">
        <section className="flex-[2_1_560px] min-w-0 p-card overflow-hidden">
          <div className="flex flex-wrap gap-0.5 px-4 border-b" style={{ borderColor: "var(--p-line)" }}>
            {tabs.map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} className="h-[54px] px-3.5 -mb-px border-b-2 text-[14.5px] font-medium" style={{ borderColor: tab === k ? "var(--p-accent)" : "transparent", color: tab === k ? "var(--p-ink)" : "var(--p-ink-2)" }} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <div className="p-5 sm:p-7 flex flex-col gap-4">
            {tab === "disc" && <Discussions r={r} hiveId={hiveId} refresh={refresh} join={() => join.mutate({ id: hiveId })} />}
            {tab === "proj" && <Projects r={r} hiveId={hiveId} />}
            {tab === "res" && <Resources r={r} hiveId={hiveId} refresh={refresh} join={() => join.mutate({ id: hiveId })} />}
            {tab === "mem" && <Members r={r} hiveId={hiveId} refresh={refresh} />}
            {tab === "ev" && <Events r={r} hiveId={hiveId} refresh={refresh} />}
          </div>
        </section>

        <aside className="flex-[1_1_280px] min-w-0 flex flex-col gap-4">
          {pj && (
            <section className="p-card p-5 flex flex-col gap-3" style={{ borderColor: "var(--p-accent-line)" }}>
              <span className="p-eyebrow">Le projet</span>
              <span className="text-[12.5px] p-faint">Objectif</span>
              <span className="serif text-[21px] leading-snug -mt-2">{r.goal}</span>
              <div className="flex flex-wrap items-center gap-2"><span className="p-pill">{PHASES[r.phase ?? "idee"]}</span><span className="text-[13.5px] p-muted flex items-center gap-1.5"><CalendarDays size={14} /> {endLabel(r.phase, r.endMonth)}</span></div>
              {r.needs.length > 0 && r.phase !== "termine" && <div className="flex flex-col gap-2"><span className="text-[12.5px] p-faint">Besoin de</span><div className="flex flex-wrap gap-1.5">{r.needs.map((n) => <span key={n} className="p-chip h-[30px] text-[13px] border-dashed cursor-default">{n}</span>)}</div></div>}
              {r.canManage && <PhasePicker hiveId={hiveId} phase={r.phase ?? "idee"} refresh={refresh} />}
              {r.parent && <Link to={`/ruches/${r.parent.id}?tab=proj`} className="p-btn-ghost no-underline">Né dans la ruche {r.parent.name}</Link>}
            </section>
          )}
          <NextEvent r={r} onSee={() => setTab("ev")} />
          <section className="p-card p-5 flex flex-col gap-3">
            <span className="p-eyebrow">{pj ? "Porteurs" : "Leaders"}</span>
            {r.leaders.map((l) => <div key={l.id} className="flex items-center gap-3"><Avatar m={l} size={40} /><span className="flex flex-col"><span className="text-[14.5px] font-semibold">{l.name}</span><span className="text-[12.5px]" style={{ color: "var(--p-accent-text)" }}>{l.role === "founder" ? (pj ? "À l’initiative du projet" : "Leader fondatrice") : pj ? "Porteur" : "Leader"}</span></span></div>)}
          </section>
          {r.canManage && <AdminCard r={r} hiveId={hiveId} refresh={refresh} />}
          <section className="p-soft p-5 flex flex-col gap-2">
            <span className="p-eyebrow">Fonctionnement</span>
            <span className="text-[14px] p-muted leading-relaxed">{r.access === "libre" ? `${pj ? "Contribution" : "Adhésion"} libre : tout membre de Présence peut rejoindre ${pj ? "le projet" : "la ruche"} en un clic.` : `Sur validation : les ${pj ? "porteurs valident chaque contribution" : "leaders lisent chaque demande d’adhésion"}. Les échanges restent réservés aux ${who}.`}</span>
          </section>
        </aside>
      </div>
    </>
  );
}

type R = RouterOutputs["hives"]["byId"];

function Locked({ r, what }: { r: R; what: string }) {
  return (
    <div className="p-soft p-10 text-center flex flex-col items-center gap-2.5">
      <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><Lock size={22} /></span>
      <span className="serif text-[26px] leading-tight">{what} réservés aux {r.type === "projet" ? "contributeurs" : "membres"}.</span>
      <span className="max-w-[420px] text-[14.5px] p-muted leading-relaxed">{r.role === "pending" ? "Votre demande a bien été transmise. Vous aurez accès dès qu’elle sera acceptée." : `Envoyez une demande : les ${r.type === "projet" ? "porteurs" : "leaders"} valident chaque nouvelle arrivée.`}</span>
    </div>
  );
}

function GuestNote({ text, join }: { text: string; join: () => void }) {
  return <div className="p-soft p-4 flex flex-wrap items-center gap-3 text-[14px] p-muted"><span className="flex-1">{text}</span><button type="button" className="p-btn-outline p-btn-sm" onClick={join}>Rejoindre</button></div>;
}

function Discussions({ r, hiveId, refresh, join }: { r: R; hiveId: number; refresh: () => void; join: () => void }) {
  const me = trpc.members.me.useQuery();
  const post = trpc.hives.post.useMutation({ onSuccess: () => { setText(""); refresh(); }, onError: (e) => toast.error(e.message) });
  const [text, setText] = useState("");
  if (r.locked) return <Locked r={r} what="Les échanges sont" />;
  return (
    <>
      {r.inside ? (
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl" style={{ background: "var(--p-surface-2)" }}>
          {me.data && <Avatar m={me.data} size={40} />}
          <textarea rows={2} className="flex-[1_1_240px] bg-transparent outline-none text-[16px] resize-none" placeholder="Partagez une idée, une question, une victoire…" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="p-btn-primary p-btn-sm" disabled={!text.trim() || post.isPending} onClick={() => post.mutate({ id: hiveId, text })}>Publier</button>
        </div>
      ) : <GuestNote text={r.type === "projet" ? "Vous lisez ce projet en invitée. Rejoignez-le pour écrire et partager des ressources." : "Vous lisez cette ruche en invitée. Rejoignez-la pour écrire et participer à ses événements."} join={join} />}
      {r.posts.map((p) => (
        <article key={p.id} className="p-4 rounded-2xl border flex flex-col gap-3" style={{ borderColor: "var(--p-line)" }}>
          <div className="flex items-center gap-3"><Avatar m={p.author} size={42} /><span className="flex flex-col"><span className="flex items-center gap-2 font-semibold">{p.author.name}{p.isLeader && <span className="h-5 px-2 rounded-full text-[11px] font-semibold" style={{ background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{r.type === "projet" ? (p.author.gender === "m" ? "Porteur" : "Porteuse") : "Leader"}</span>}</span><span className="text-[12.5px] p-muted">{p.author.role} · {ago(new Date(p.createdAt))}</span></span></div>
          <p className="m-0 text-[16px] leading-relaxed">{p.text}</p>
          <div className="flex items-center gap-1 pt-2 border-t text-[14px] p-muted" style={{ borderColor: "var(--p-line)" }}><span className="inline-flex items-center gap-2 h-9 px-2.5"><Heart size={16} /> {p.likes}</span><span className="inline-flex items-center gap-2 h-9 px-2.5"><MessageCircle size={16} /> {p.replies ? plural(p.replies, "réponse", "réponses") : "Répondre"}</span></div>
        </article>
      ))}
      {r.posts.length === 0 && <div className="p-7 rounded-2xl border border-dashed text-center text-[15px] p-muted" style={{ borderColor: "var(--p-line-2)" }}>Aucun message pour l’instant. Lancez la première conversation.</div>}
    </>
  );
}

function Projects({ r, hiveId }: { r: R; hiveId: number }) {
  const [open, setOpen] = useState(false);
  if (r.locked) return <Locked r={r} what="Les projets sont" />;
  const order: Record<string, number> = { en_cours: 0, idee: 1, termine: 2 };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex-[1_1_280px] text-[14.5px] p-muted leading-relaxed">Chaque projet né dans la ruche a son propre espace : ses contributeurs, ses échanges, ses ressources et ses rendez-vous.</span>
        {r.inside && <button type="button" className={open ? "p-btn-outline p-btn-sm" : "p-btn-primary p-btn-sm"} onClick={() => setOpen(!open)}><Plus size={15} /> {open ? "Fermer" : "Proposer un projet"}</button>}
      </div>
      {open && <CreateHive onDone={() => setOpen(false)} parentId={hiveId} forcedType="projet" />}
      {[...r.children].sort((a, b) => (order[a.phase ?? "idee"] ?? 0) - (order[b.phase ?? "idee"] ?? 0)).map((p) => (
        <article key={p.id} className="p-5 rounded-2xl border flex flex-col gap-3" style={{ borderColor: "var(--p-line)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2.5"><span className="p-pill">{PHASES[p.phase ?? "idee"]}</span><span className="text-[13px] p-muted">{endLabel(p.phase, p.endMonth)}</span></span><span className="text-[13px] p-muted flex items-center gap-1.5"><Users size={14} /> {plural(p.memberCount, "contributeur", "contributeurs")}</span></div>
          <h3 className="m-0 text-[25px] leading-tight">{p.name}</h3>
          <p className="m-0 text-[15.5px] leading-relaxed">{p.goal}</p>
          {p.needs.length > 0 && p.phase !== "termine" && <div className="flex flex-wrap items-center gap-1.5"><span className="text-[11.5px] font-semibold uppercase tracking-[0.22em] mr-1" style={{ color: "var(--p-gold)" }}>Besoin de</span>{p.needs.map((n) => <span key={n} className="p-chip h-[30px] text-[13px] border-dashed cursor-default">{n}</span>)}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "var(--p-line)" }}>
            <span className="text-[13.5px] p-muted">{p.myRole === "founder" || p.myRole === "leader" ? "✓ Vous portez ce projet" : p.myRole === "member" ? "✓ Vous contribuez" : p.myRole === "pending" ? "Demande envoyée" : ""}</span>
            <Link to={`/ruches/${p.id}`} className="p-btn-outline p-btn-sm no-underline" style={{ borderColor: "var(--p-accent)", color: "var(--p-accent-text)" }}>Voir le projet →</Link>
          </div>
        </article>
      ))}
      {r.children.length === 0 && !open && <div className="p-7 rounded-2xl border border-dashed text-center text-[15px] p-muted" style={{ borderColor: "var(--p-line-2)" }}>Aucun projet pour l’instant. Une idée à mener ensemble ? Proposez-la à la ruche.</div>}
    </>
  );
}

function Resources({ r, hiveId, refresh, join }: { r: R; hiveId: number; refresh: () => void; join: () => void }) {
  const add = trpc.hives.addResource.useMutation({ onSuccess: () => { setOpen(false); setF({ kind: "doc", title: "", url: "" }); refresh(); toast.success("Ressource ajoutée"); }, onError: (e) => toast.error(e.message) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "doc" as keyof typeof RES_LABEL, title: "", url: "" });
  if (r.locked) return <Locked r={r} what="Les ressources sont" />;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex-[1_1_280px] text-[14.5px] p-muted">Les documents, modèles et liens utiles, rassemblés au même endroit.</span>
        {r.inside && <button type="button" className={open ? "p-btn-outline p-btn-sm" : "p-btn-primary p-btn-sm"} onClick={() => setOpen(!open)}><Plus size={15} /> {open ? "Fermer" : "Ajouter une ressource"}</button>}
      </div>
      {!r.inside && <GuestNote text="Rejoignez la ruche pour partager vos propres ressources." join={join} />}
      {open && (
        <div className="p-soft p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. Planning de collecte des témoignages" /></label>
          <div className="flex flex-wrap gap-2">{(Object.keys(RES_LABEL) as (keyof typeof RES_LABEL)[]).map((k) => <button key={k} type="button" className={`p-chip h-9 ${f.kind === k ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, kind: k })}>{RES_LABEL[k]}</button>)}</div>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Lien <span className="p-faint">· facultatif</span></span><input className="p-field" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></label>
          <div><button type="button" className="p-btn-primary p-btn-sm" disabled={!f.title.trim() || add.isPending} onClick={() => add.mutate({ id: hiveId, ...f })}>Ajouter la ressource</button></div>
        </div>
      )}
      {r.resources.map((res) => { const Icon = RES_ICON[res.kind]; return (
        <div key={res.id} className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl border" style={{ borderColor: "var(--p-line)" }}>
          <span className="w-[46px] h-[46px] rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-pill)", color: "var(--p-accent-text)" }}><Icon size={20} /></span>
          <span className="flex-[1_1_240px] min-w-0 flex flex-col"><span className="flex items-center gap-2 font-semibold text-[15.5px]">{res.title}{res.pinned && <span className="p-pill h-[22px] text-[11px]"><Pin size={10} /> Épinglé</span>}</span><span className="text-[13px] p-muted">{RES_LABEL[res.kind]}{res.meta && !res.meta.startsWith("http") ? ` · ${res.meta}` : ""}</span><span className="text-[12.5px] p-faint">Ajouté par {res.author.name} · {ago(new Date(res.createdAt))}</span></span>
          <a href={res.url || "#"} target={res.url ? "_blank" : undefined} rel="noopener" className="p-btn-outline p-btn-sm no-underline">Ouvrir <ExternalLink size={14} /></a>
        </div>
      ); })}
      {r.resources.length === 0 && !open && <div className="p-7 rounded-2xl border border-dashed text-center text-[15px] p-muted" style={{ borderColor: "var(--p-line-2)" }}>Aucune ressource pour l’instant.</div>}
    </>
  );
}

function Members({ r, hiveId, refresh }: { r: R; hiveId: number; refresh: () => void }) {
  const decide = trpc.hives.decideRequest.useMutation({ onSuccess: refresh });
  const setLeader = trpc.hives.setLeader.useMutation({ onSuccess: refresh });
  const pj = r.type === "projet";
  const Card = ({ m, leader }: { m: R["members"][number] & { role?: string }; leader?: boolean }) => (
    <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border text-center" style={{ borderColor: leader ? "var(--p-accent-line)" : "var(--p-line)" }}>
      <Avatar m={m} size={58} />
      <span className="flex flex-col"><span className="text-[14.5px] font-semibold leading-tight">{m.name}</span><span className="text-[12.5px] p-muted">{m.role}</span></span>
      {leader && <span className="h-6 px-2.5 rounded-full text-[11.5px] font-semibold flex items-center" style={(m as { role?: string }).role === "founder" ? { background: "var(--p-accent)", color: "#fff" } : { background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{(m as { role?: string }).role === "founder" ? (pj ? "À l’initiative" : "Fondatrice") : pj ? "Porteur" : "Leader"}</span>}
      {r.role === "founder" && m.id !== r.founder.id && (leader
        ? <button type="button" className="text-[13px] underline p-muted" onClick={() => setLeader.mutate({ id: hiveId, memberId: m.id, leader: false })}>Retirer le rôle</button>
        : <button type="button" className="h-9 px-3.5 rounded-full border text-[13px] font-medium" style={{ borderColor: "var(--p-accent)", color: "var(--p-accent-text)" }} onClick={() => setLeader.mutate({ id: hiveId, memberId: m.id, leader: true })}>{pj ? "Associer au portage" : "Nommer leader"}</button>)}
    </div>
  );
  return (
    <>
      {r.requests.length > 0 && (
        <div className="flex flex-col gap-2.5 p-4 rounded-2xl" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
          <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-accent-text)" }}>Demandes à valider</span>
          {r.requests.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl" style={{ background: "var(--p-surface)" }}>
              <Avatar m={q} size={44} />
              <span className="flex-[1_1_220px] flex flex-col"><span className="font-semibold">{q.name}</span><span className="text-[13px] p-muted">{q.role} · {q.city}</span>{q.note && <span className="text-[14px] mt-1">{q.note}</span>}</span>
              <span className="flex gap-2"><button type="button" className="p-btn-primary p-btn-sm" onClick={() => decide.mutate({ id: hiveId, memberId: q.id, accept: true })}>Accepter</button><button type="button" className="p-btn-outline p-btn-sm" onClick={() => decide.mutate({ id: hiveId, memberId: q.id, accept: false })}>Refuser</button></span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>{pj ? "Porteurs du projet" : "Leaders de la ruche"}</span>
        <span className="text-[13.5px] p-muted">{pj ? "Les porteurs coordonnent le projet, accueillent les contributeurs et organisent ses rendez-vous." : "Les leaders accueillent les nouveaux membres et organisent les événements de la ruche."}{r.role === "founder" ? ` Vous pouvez ${pj ? "associer d’autres contributeurs au portage" : "nommer d’autres leaders parmi les membres"}.` : ""}</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(160px, 100%), 1fr))" }}>{r.leaders.map((m) => <Card key={m.id} m={m} leader />)}</div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>{pj ? "Contributeurs" : "Membres"}</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(160px, 100%), 1fr))" }}>{r.members.map((m) => <Card key={m.id} m={m} />)}</div>
        {r.members.length === 0 && <span className="text-[14px] p-muted">Pas encore d’autres {pj ? "contributeurs" : "membres"}.</span>}
      </div>
    </>
  );
}

function Events({ r, hiveId, refresh }: { r: R; hiveId: number; refresh: () => void }) {
  const utils = trpc.useUtils();
  const toggle = trpc.events.toggleRegistration.useMutation({ onSuccess: () => { refresh(); utils.events.invalidate(); }, onError: (e) => toast.error(e.message) });
  const create = trpc.hives.createEvent.useMutation({ onSuccess: () => { refresh(); utils.events.invalidate(); setF({ kind: "online", title: "", date: "", time: "12:30", city: "", address: "", meetingUrl: "", inAgenda: true }); toast.success("Événement créé"); }, onError: (e) => toast.error(e.message) });
  const [f, setF] = useState({ kind: "online" as "online" | "onsite" | "salon", title: "", date: "", time: "12:30", city: "", address: "", meetingUrl: "", inAgenda: true });
  const pj = r.type === "projet";
  return (
    <>
      {r.events.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-3.5 p-4 rounded-2xl border" style={{ borderColor: "var(--p-line)" }}>
          <span className="w-14 flex flex-col items-center py-2 rounded-xl leading-none flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><span className="serif text-[28px] font-semibold">{new Date(e.startsAt).getDate()}</span><span className="text-[11.5px] mt-0.5">{longDate(new Date(e.startsAt)).split(" ")[2]}</span></span>
          <span className="flex-[1_1_220px] flex flex-col gap-0.5"><span className="text-[16px] font-semibold leading-snug">{e.title}</span><span className="text-[13.5px] p-muted">{longDate(new Date(e.startsAt))} · {hour(new Date(e.startsAt))} · {e.where}{e.kind === "salon" ? " · Salon live" : ""}</span><span className="text-[12.5px] p-faint">Organisé par {e.host.name}{e.isMine ? " (vous)" : ""} · {plural(e.count, "inscrit", "inscrits")}</span><span className="mt-1.5"><AccessInfo e={e} compact /></span></span>
          {r.inside ? <button type="button" className={e.registered ? "p-btn-outline p-btn-sm" : "p-btn-primary p-btn-sm"} onClick={() => toggle.mutate({ eventId: e.id })}>{e.registered ? "✓ Inscrite" : "Je participe"}</button> : <span className="text-[13px] p-faint">Réservé aux {pj ? "contributeurs" : "membres"}</span>}
        </div>
      ))}
      {r.events.length === 0 && <div className="p-6 rounded-2xl border border-dashed text-center text-[15px] p-muted" style={{ borderColor: "var(--p-line-2)" }}>Aucun {pj ? "rendez-vous" : "événement"} prévu pour l’instant.</div>}
      {r.canManage ? (
        <div className="p-soft p-5 flex flex-col gap-3 mt-2">
          <div><span className="flex items-center gap-2"><span className="serif text-[26px]">{pj ? "Créer un rendez-vous du projet" : "Créer un événement de ruche"}</span><span className="p-pill h-[22px] text-[11.5px]">{pj ? "Porteurs" : "Leaders"}</span></span><span className="text-[14px] p-muted">{pj ? "Atelier, point d’étape, séance de travail." : "Atelier, café, cercle de parole : proposez une rencontre aux membres de la ruche."}</span></div>
          <div className="flex flex-wrap gap-2">{([["online", "En ligne"], ["onsite", "Présentiel"], ["salon", "Salon live"]] as const).map(([k, l]) => <button key={k} type="button" className={`p-chip h-9 ${f.kind === k ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Titre</span><input className="p-field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. Café de ruche" /></label>
          <div className="flex flex-wrap gap-3">
            <label className="flex-[1_1_170px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Date</span><input type="date" className="p-field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="flex-[1_1_130px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Heure</span><input type="time" className="p-field" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
          </div>
          <AccessFields kind={f.kind} city={f.city} address={f.address} meetingUrl={f.meetingUrl} onChange={(p) => setF({ ...f, ...p })} />
          <span className="text-[12.5px] p-faint">Les événements de la ruche sont visibles dans la ruche et dans l’agenda des membres inscrits ; ils restent distincts du programme de Présence.</span>
          <div><button type="button" className="p-btn-primary" disabled={!f.title.trim() || !f.date || !accessReady(f.kind, f.address, f.meetingUrl) || create.isPending} onClick={() => create.mutate({ id: hiveId, kind: f.kind, title: f.title, startsAt: new Date(`${f.date}T${f.time || "12:30"}:00`), durationMin: f.kind === "salon" ? 45 : 60, city: f.kind === "onsite" ? f.city : undefined, where: f.kind === "onsite" ? f.city || "Présentiel" : "En ligne", address: f.kind === "onsite" ? f.address : "", meetingUrl: f.kind === "onsite" ? "" : f.meetingUrl, maxSeats: f.kind === "salon" ? 10 : undefined })}>Créer</button></div>
        </div>
      ) : r.inside ? <div className="p-soft p-4 text-[14px] p-muted">Les {pj ? "porteurs" : "leaders"} organisent les {pj ? "rendez-vous" : "événements"}. Une idée ? Partagez-la dans les discussions.</div> : null}
    </>
  );
}

function PhasePicker({ hiveId, phase, refresh }: { hiveId: number; phase: string; refresh: () => void }) {
  const set = trpc.hives.setPhase.useMutation({ onSuccess: refresh });
  return <div className="flex flex-wrap gap-1.5 pt-2 border-t" style={{ borderColor: "var(--p-line)" }}>{(["idee", "en_cours", "termine"] as const).map((p) => <button key={p} type="button" className={`p-chip h-8 text-[13px] ${phase === p ? "p-chip-on" : ""}`} onClick={() => set.mutate({ id: hiveId, phase: p })}>{PHASES[p]}</button>)}</div>;
}

function NextEvent({ r, onSee }: { r: R; onSee: () => void }) {
  const nx = r.events.find((e) => new Date(e.startsAt) >= new Date());
  return (
    <section className="p-card p-5 flex flex-col gap-3">
      <span className="p-eyebrow">Prochain rendez-vous</span>
      {nx ? <><div className="flex items-center gap-3.5"><span className="w-14 flex flex-col items-center py-2 rounded-xl leading-none flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><span className="serif text-[28px] font-semibold">{new Date(nx.startsAt).getDate()}</span><span className="text-[11.5px] mt-0.5">{longDate(new Date(nx.startsAt)).split(" ")[2]}</span></span><span className="flex flex-col gap-0.5 min-w-0"><span className="text-[15px] font-semibold leading-snug">{nx.title}</span><span className="text-[13px] p-muted">{longDate(new Date(nx.startsAt))} · {hour(new Date(nx.startsAt))}</span></span></div><button type="button" className="p-btn-ghost self-start" onClick={onSee}>Voir tout →</button></> : <span className="text-[14px] p-muted">Aucun rendez-vous prévu.</span>}
    </section>
  );
}

function AdminCard({ r, hiveId, refresh }: { r: R; hiveId: number; refresh: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [asking, setAsking] = useState(false);
  const pj = r.type === "projet";
  const setAccess = trpc.hives.setAccess.useMutation({
    onSuccess: (res, v) => { refresh(); toast.success(v.access === "libre" ? `Accès libre activé${res.accepted ? ` · ${plural(res.accepted, "demande acceptée", "demandes acceptées")}` : ""}` : "Adhésion désormais sur validation"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.hives.remove.useMutation({
    onSuccess: (res) => { utils.hives.invalidate(); utils.events.invalidate(); utils.dashboard.invalidate(); toast.success(`« ${res.name} » a été supprimée`); navigate("/ruches"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="p-card p-5 flex flex-col gap-4" style={{ borderColor: "var(--p-accent-line)" }}>
      <span className="flex items-center gap-2 p-eyebrow"><Settings size={14} /> Administration</span>
      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] font-medium">Confidentialité</span>
        <div className="flex flex-col gap-2">
          {([["libre", Unlock, pj ? "Contribution libre" : "Adhésion libre", "Tout membre rejoint en un clic."], ["validation", Lock, "Sur validation", pj ? "Les porteurs valident chaque contribution ; contenus réservés." : "Les leaders valident chaque demande ; échanges réservés aux membres."]] as const).map(([k, Icon, l, hint]) => (
            <button key={k} type="button" aria-pressed={r.access === k} disabled={setAccess.isPending} onClick={() => r.access !== k && setAccess.mutate({ id: hiveId, access: k })} className="flex items-start gap-2.5 p-3 rounded-xl border text-left" style={r.access === k ? { background: "var(--p-accent-soft)", borderColor: "var(--p-accent)" } : { borderColor: "var(--p-line-2)" }}>
              <Icon size={16} className="mt-0.5 flex-none" style={{ color: "var(--p-accent-text)" }} />
              <span className="flex flex-col"><span className="text-[14px] font-semibold">{l}</span><span className="text-[12.5px] p-muted">{hint}</span></span>
            </button>
          ))}
        </div>
        {r.access === "validation" && r.requests.length > 0 && <span className="text-[12.5px] p-faint">Passer en accès libre acceptera les {plural(r.requests.length, "demande", "demandes")} en attente.</span>}
      </div>
      {r.canDelete && (
        <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: "var(--p-line)" }}>
          {!asking ? (
            <button type="button" className="p-btn-ghost self-start text-[13.5px]" style={{ color: "var(--p-accent-text)" }} onClick={() => setAsking(true)}><Trash2 size={15} /> Supprimer {pj ? "le projet" : "la ruche"}</button>
          ) : (
            <div className="flex flex-col gap-2.5 p-3 rounded-xl" style={{ background: "var(--p-accent-soft)" }}>
              <span className="text-[13.5px] leading-relaxed">Les discussions, ressources, événements et adhésions seront définitivement supprimés{!pj && r.children.length ? (r.children.length > 1 ? ` ; les ${r.children.length} projets nés ici continueront sans ruche parente` : " ; le projet né ici continuera sans ruche parente") : ""}. Tapez <b>{r.name}</b> pour confirmer.</span>
              <input className="p-field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={r.name} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="p-btn-primary p-btn-sm" disabled={confirm.trim() !== r.name.trim() || remove.isPending} onClick={() => remove.mutate({ id: hiveId })}>Supprimer définitivement</button>
                <button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setAsking(false); setConfirm(""); }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
