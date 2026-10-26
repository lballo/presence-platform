import { useState } from "react";
import { Heart, MessageCircle, ShieldCheck, Briefcase, TrendingUp, Link2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { ago, plural } from "@/lib/format";

const KINDS = { victoire: "Victoire", video: "Retour vidéo", question: "Question" } as const;
const TABS = [["all", "Tout"], ["victoire", "Victoires"], ["video", "Retours vidéo"], ["question", "Questions"], ["opp", "Opportunités"]] as const;
const OPP = {
  recrut: { label: "Recrutement", icon: Briefcase, ph: "Ex. Responsable marketing (H/F)" },
  fin: { label: "Financement", icon: TrendingUp, ph: "Ex. Levée d’amorçage pour une jeune entreprise" },
  assoc: { label: "Recherche d’associé", icon: Link2, ph: "Ex. Un associé pour développer mon cabinet" },
} as const;

export default function Forum() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  return (
    <>
      <PageHeader eyebrow="Le forum" title="Partager avec le cercle" intro="Racontez vos victoires, grandes ou discrètes, demandez des retours sur vos vidéos et partagez vos opportunités : recrutement, financement, recherche d’associé." />
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(([k, l]) => <button key={k} type="button" className={`p-chip h-10 ${tab === k ? "p-chip-on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "opp" ? <Opportunities /> : <Posts filter={tab} />}
    </>
  );
}

function Posts({ filter }: { filter: string }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const posts = trpc.forum.posts.useQuery();
  const create = trpc.forum.createPost.useMutation({ onSuccess: () => { utils.forum.posts.invalidate(); setText(""); toast.success("Publié dans le cercle"); } });
  const like = trpc.forum.toggleLike.useMutation({ onSuccess: () => utils.forum.posts.invalidate() });
  const [text, setText] = useState("");
  const [kind, setKind] = useState<keyof typeof KINDS>("victoire");
  const list = (posts.data ?? []).filter((p) => filter === "all" || p.kind === filter);

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <div className="flex-[2_1_540px] min-w-0 flex flex-col gap-4">
        <section className="p-card p-5 flex flex-col gap-3">
          <div className="flex gap-3">
            {me.data && <Avatar m={me.data} size={44} />}
            <textarea className="p-field" rows={3} placeholder="Racontez une victoire, posez une question, demandez un retour…" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5">{(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => <button key={k} type="button" className={`p-chip h-8 text-[13px] ${kind === k ? "p-chip-on" : ""}`} onClick={() => setKind(k)}>{KINDS[k]}</button>)}</div>
            <button type="button" className="p-btn-primary p-btn-sm" disabled={!text.trim() || create.isPending} onClick={() => create.mutate({ kind, text, askFeedback: kind === "video" })}>Publier</button>
          </div>
        </section>
        {list.map((p) => (
          <article key={p.id} className="p-card p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar m={p.author} size={44} />
              <span className="flex flex-col"><span className="font-semibold">{p.author.name}</span><span className="text-[12.5px] p-muted">{p.author.role} · {p.author.city} · {ago(new Date(p.createdAt))}</span></span>
              <span className="p-pill ml-auto">{KINDS[p.kind]}</span>
            </div>
            <p className="m-0 text-[16px] leading-relaxed">{p.text}</p>
            {p.askFeedback && <span className="text-[13px] p-muted">Demande un retour bienveillant et précis.</span>}
            <div className="flex items-center gap-1 pt-2 border-t" style={{ borderColor: "var(--p-line)" }}>
              <button type="button" aria-pressed={p.liked} className="inline-flex items-center gap-2 h-10 px-3 rounded-full text-[14px]" style={{ color: p.liked ? "var(--p-accent-text)" : "var(--p-ink-2)" }} onClick={() => like.mutate({ postId: p.id })}><Heart size={16} fill={p.liked ? "currentColor" : "none"} /> {p.likes}</button>
              <span className="inline-flex items-center gap-2 h-10 px-3 text-[14px] p-muted"><MessageCircle size={16} /> {p.replies ? plural(p.replies, "réponse", "réponses") : "Répondre"}</span>
            </div>
          </article>
        ))}
        {list.length === 0 && <p className="p-muted text-center py-10">Rien ici pour l’instant.</p>}
      </div>
      <aside className="flex-[1_1_300px] min-w-0">
        <section className="p-band p-6 flex flex-col gap-2">
          <span className="text-[12px] font-medium uppercase tracking-[0.3em]" style={{ color: "var(--p-gold-bright)" }}>L’esprit du cercle</span>
          <p className="m-0 serif text-[28px] leading-tight">Bienveillance, précision, confidentialité.</p>
          <p className="m-0 text-[14px] text-white/75 leading-relaxed">Ce qui se partage ici reste ici. Un retour commence par ce qui fonctionne, puis propose un axe concret.</p>
        </section>
      </aside>
    </div>
  );
}

function Opportunities() {
  const utils = trpc.useUtils();
  const opps = trpc.forum.opportunities.useQuery();
  const interest = trpc.forum.toggleInterest.useMutation({ onSuccess: () => utils.forum.opportunities.invalidate() });
  const create = trpc.forum.createOpportunity.useMutation({ onSuccess: () => { utils.forum.opportunities.invalidate(); setF({ type: "recrut", title: "", text: "", facts: "" }); toast.success("Annonce envoyée à l’équipe pour relecture"); } });
  const [filter, setFilter] = useState<"all" | keyof typeof OPP>("all");
  const [f, setF] = useState({ type: "recrut" as keyof typeof OPP, title: "", text: "", facts: "" });
  const list = (opps.data ?? []).filter((o) => filter === "all" || o.type === filter);

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <div className="flex-[2_1_540px] min-w-0 flex flex-col gap-4">
        <div className="p-soft p-4 flex gap-3 text-[14px] leading-relaxed p-muted"><ShieldCheck size={20} className="flex-none mt-0.5" style={{ color: "var(--p-accent-text)" }} /><span><b style={{ color: "var(--p-ink)" }}>Un espace d’entraide.</b> Chaque annonce est relue par l’équipe Présence avant d’être publiée, et la prospection commerciale n’y a pas sa place.</span></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`p-chip h-9 ${filter === "all" ? "p-chip-on" : ""}`} onClick={() => setFilter("all")}>Toutes</button>
          {(Object.keys(OPP) as (keyof typeof OPP)[]).map((k) => <button key={k} type="button" className={`p-chip h-9 ${filter === k ? "p-chip-on" : ""}`} onClick={() => setFilter(k)}>{OPP[k].label}</button>)}
        </div>
        {list.map((o) => { const Icon = OPP[o.type].icon; return (
          <article key={o.id} className="p-card p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2"><span className="p-pill"><Icon size={13} /> {OPP[o.type].label}</span>{o.status === "pending" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">En cours de relecture</span>}</span>
              <span className="text-[12.5px] p-muted">{ago(new Date(o.createdAt))}</span>
            </div>
            <h3 className="m-0 text-[26px] leading-tight">{o.title}</h3>
            <p className="m-0 text-[15.5px] leading-relaxed">{o.text}</p>
            <div className="flex flex-wrap gap-1.5">{o.facts.map((x) => <span key={x} className="p-chip h-[30px] text-[13px] cursor-default">{x}</span>)}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "var(--p-line)" }}>
              <span className="flex items-center gap-2.5"><Avatar m={o.author} size={40} /><span className="flex flex-col"><span className="text-[14.5px] font-semibold">{o.author.name}</span><span className="text-[12.5px] p-muted">{o.author.role} · {o.author.city}</span></span></span>
              <span className="flex items-center gap-2.5">
                <span className="text-[13px] p-muted">{o.isMine ? "Votre annonce" : o.interestedCount ? plural(o.interestedCount, "membre intéressé", "membres intéressés") : "Personne pour l’instant"}</span>
                {!o.isMine && <button type="button" className={o.interested ? "p-btn-outline p-btn-sm" : "p-btn-primary p-btn-sm"} onClick={() => interest.mutate({ opportunityId: o.id })}>{o.interested ? "✓ Intérêt envoyé" : "Ça m’intéresse"}</button>}
              </span>
            </div>
          </article>
        ); })}
        {list.length === 0 && <p className="p-muted text-center py-10">Aucune annonce dans cette catégorie.</p>}
      </div>
      <aside className="flex-[1_1_300px] min-w-0">
        <section className="p-card p-5 flex flex-col gap-3">
          <span className="p-eyebrow">Opportunités</span>
          <h2 className="m-0 text-[28px]">Publier une annonce</h2>
          <div className="flex flex-wrap gap-1.5">{(Object.keys(OPP) as (keyof typeof OPP)[]).map((k) => <button key={k} type="button" className={`p-chip h-8 text-[13px] ${f.type === k ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, type: k })}>{OPP[k].label}</button>)}</div>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Titre</span><input className="p-field" value={f.title} placeholder={OPP[f.type].ph} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Votre annonce</span><textarea className="p-field" rows={4} value={f.text} placeholder="Le contexte, ce que vous cherchez, ce que vous proposez en retour." onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Lieu et format <span className="p-faint">· séparés par des virgules</span></span><input className="p-field" value={f.facts} placeholder="Ex. Lyon, CDI, dès janvier" onChange={(e) => setF({ ...f, facts: e.target.value })} /></label>
          <button type="button" className="p-btn-primary" disabled={!f.title.trim() || !f.text.trim() || create.isPending} onClick={() => create.mutate({ type: f.type, title: f.title, text: f.text, facts: f.facts.split(",").map((x) => x.trim()).filter(Boolean) })}>Soumettre l’annonce</button>
          <span className="text-[12.5px] p-muted leading-relaxed">Chaque annonce est relue par l’équipe Présence avant d’être visible par tous les membres.</span>
        </section>
      </aside>
    </div>
  );
}
