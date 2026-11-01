import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { EmojiGrid } from "@/components/forum/EmojiGrid";
import { SPACE_GROUPS, TagLabel, type Space } from "@/components/forum/shared";
import { ComposerHost } from "@/components/forum/PostList";
import type { ComposerTarget } from "@/components/forum/Composer";
import { ago, plural } from "@/lib/format";
import { Badge, Chips, ConfirmButton, Rows, type Column } from "./shared";
import { fullDate } from "./labels";

type Section = "annonces" | "espaces" | "hashtags" | "epingles";
type Post = RouterOutputs["forum"]["announcements"][number];

/** Forum et annonces : toutes les annonces, les espaces, les hashtags et les publications épinglées. */
export default function AdminForum() {
  const [section, setSection] = useState<Section>("annonces");
  return (
    <div className="flex flex-col gap-5">
      <h2 className="m-0 text-[30px]">Forum et annonces</h2>
      <Chips label="Rubriques du forum" value={section} onChange={setSection} options={[["annonces", "Annonces"], ["espaces", "Espaces"], ["hashtags", "Hashtags"], ["epingles", "Épingles"]]} />
      {section === "annonces" && <Announcements />}
      {section === "espaces" && <Spaces />}
      {section === "hashtags" && <Hashtags />}
      {section === "epingles" && <Pins />}
    </div>
  );
}

const STATE: Record<string, string> = { live: "En ligne", scheduled: "Programmée", ended: "Retirée ou terminée", hidden: "Masquée" };
const stateTone = (s: string) => (s === "live" ? "ok" : s === "scheduled" ? "wait" : "calm");

const columns: Column<Post>[] = [
  { key: "title", label: "Annonce", cell: (p) => <span className="flex flex-col min-w-0"><span className="font-semibold break-words">{p.title || p.text.slice(0, 80)}</span><span className="text-[12.5px] p-muted">{p.author.name} · {fullDate(p.publishedAt)}{p.pinned ? " · épinglée" : ""}</span></span> },
  { key: "where", label: "Où", cell: (p) => (p.hive ? p.hive.name : "Réseau") },
  { key: "state", label: "État", cell: (p) => <Badge tone={stateTone(p.state)}>{STATE[p.state] ?? p.state}</Badge> },
  { key: "reads", label: "Lue par", align: "right", cell: (p) => p.readCount ?? 0 },
];

/** Toutes les annonces, du réseau et des ruches : les modifier ou les retirer. */
function Announcements() {
  const utils = trpc.useUtils();
  const q = trpc.forum.announcements.useQuery();
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const live = trpc.admin.setAnnouncementLive.useMutation({ onSuccess: (_r, v) => { utils.forum.invalidate(); toast.success(v.live ? "Annonce remise en ligne" : "Annonce retirée"); }, onError: (e) => toast.error(e.message) });
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  return (
    <section className="flex flex-col gap-3.5" aria-label="Annonces">
      <Rows rows={q.data ?? []} columns={columns} keyOf={(p) => p.id} empty="Aucune annonce pour l’instant." actions={(p) => (
        <>
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setComposer({ mode: "edit", post: p })}><Pencil size={14} /> Modifier</button>
          {p.state === "ended" ? <button type="button" className="p-btn-outline p-btn-sm" disabled={live.isPending} onClick={() => live.mutate({ id: p.id, live: true })}>Remettre en ligne</button>
            : <ConfirmButton label="Retirer" question="Retirer cette annonce ? Elle ne s’affichera plus, vous pourrez la remettre en ligne." confirm="Retirer" danger disabled={live.isPending} onConfirm={() => live.mutate({ id: p.id, live: false })} />}
        </>
      )} />
      <ComposerHost target={composer} onClose={() => setComposer(null)} />
    </section>
  );
}

function Spaces() {
  const spaces = trpc.forum.spaces.useQuery();
  return (
    <section className="flex flex-col gap-4" aria-label="Espaces">
      <h3 className="m-0 text-[24px]">Espaces</h3>
      {SPACE_GROUPS.map(([g, label]) => {
        const list = spaces.data?.spaces.filter((s) => s.groupKey === g) ?? [];
        return (
          <div key={g} className="flex flex-col gap-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--p-gold)" }}>{label}</span>
            {list.map((s, i) => <SpaceRow key={s.id} s={s} first={i === 0} last={i === list.length - 1} />)}
          </div>
        );
      })}
    </section>
  );
}

function SpaceRow({ s, first, last }: { s: Space; first: boolean; last: boolean }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ name: s.name, emoji: s.emoji, description: s.description });
  const [picking, setPicking] = useState(false);
  const save = trpc.forum.updateSpace.useMutation({ onSuccess: () => { utils.forum.spaces.invalidate(); toast.success("Espace enregistré"); }, onError: (e) => toast.error(e.message) });
  const move = trpc.forum.moveSpace.useMutation({ onSuccess: () => utils.forum.spaces.invalidate(), onError: (e) => toast.error(e.message) });
  const dirty = f.name !== s.name || f.emoji !== s.emoji || f.description !== s.description;
  return (
    <article className="p-card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" aria-label={`Changer l’emoji de ${s.name}`} aria-expanded={picking} className="w-[46px] h-[46px] rounded-xl border text-[22px] flex-none" style={{ borderColor: "var(--p-line-2)" }} onClick={() => setPicking(!picking)}>{f.emoji || "＋"}</button>
        <input className="p-field flex-[1_1_180px] min-w-0" value={f.name} maxLength={80} aria-label="Nom de l’espace" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <span className="flex gap-1 flex-none">
          <button type="button" aria-label={`Monter ${s.name}`} disabled={first || move.isPending} className="w-10 h-10 rounded-lg border flex items-center justify-center disabled:opacity-30" style={{ borderColor: "var(--p-line-2)" }} onClick={() => move.mutate({ id: s.id, direction: "up" })}><ArrowUp size={16} /></button>
          <button type="button" aria-label={`Descendre ${s.name}`} disabled={last || move.isPending} className="w-10 h-10 rounded-lg border flex items-center justify-center disabled:opacity-30" style={{ borderColor: "var(--p-line-2)" }} onClick={() => move.mutate({ id: s.id, direction: "down" })}><ArrowDown size={16} /></button>
        </span>
      </div>
      {picking && <div className="p-2 rounded-xl max-h-[190px] overflow-y-auto" style={{ background: "var(--p-surface-2)" }}><EmojiGrid onPick={(emoji) => { setF({ ...f, emoji }); setPicking(false); }} /></div>}
      <textarea className="p-field text-[14.5px]" rows={2} maxLength={400} value={f.description} aria-label="Description de l’espace" placeholder="Une phrase affichée en tête de l’espace" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] p-faint">{s.adminOnly ? "Publication réservée aux administrateurs" : s.kind === "opportunites" ? "Relue avant publication" : s.kind === "video" ? "Une vidéo est demandée" : "Ouvert à tous les membres"}</span>
        <button type="button" className="p-btn-primary p-btn-sm" disabled={!dirty || !f.name.trim() || save.isPending} onClick={() => save.mutate({ id: s.id, ...f })}>Enregistrer</button>
      </div>
    </article>
  );
}

function Hashtags() {
  const utils = trpc.useUtils();
  const tags = trpc.hashtags.list.useQuery();
  const [f, setF] = useState({ name: "", color: "" });
  const create = trpc.hashtags.create.useMutation({ onSuccess: () => { utils.hashtags.invalidate(); setF({ name: "", color: "" }); toast.success("Hashtag ajouté"); }, onError: (e) => toast.error(e.data?.code === "BAD_REQUEST" ? "Lettres, chiffres et tirets uniquement." : e.message) });
  return (
    <section className="flex flex-col gap-3.5" aria-label="Hashtags">
      <div><h3 className="m-0 text-[24px]">Hashtags</h3><p className="m-0 text-[14.5px] p-muted">La liste partagée par la communauté : chaque publication peut en porter cinq au plus. Elle servira aussi aux contenus de formation.</p></div>
      <form className="p-soft p-4 flex flex-wrap items-center gap-2.5" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) create.mutate({ name: f.name, color: f.color || null }); }}>
        <input className="p-field flex-[1_1_200px] min-w-0" value={f.name} maxLength={40} placeholder="Nom du hashtag, par exemple prise-de-parole" aria-label="Nom du nouveau hashtag" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <ColorField value={f.color} onChange={(color) => setF({ ...f, color })} />
        <button type="submit" className="p-btn-primary p-btn-sm" disabled={!f.name.trim() || create.isPending}><Plus size={15} /> Ajouter</button>
      </form>
      {tags.data?.map((t) => <TagRow key={t.id} t={t} />)}
      {tags.data?.length === 0 && <div className="p-soft p-6 text-center text-[14.5px] p-muted">Aucun hashtag pour l’instant.</div>}
    </section>
  );
}

/** Couleur facultative. */
function ColorField({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] p-muted flex-none">
      <input type="color" className="w-10 h-10 rounded-lg border cursor-pointer" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)", opacity: value ? 1 : 0.3 }} value={value || "#a92b2a"} aria-label="Couleur du hashtag" onChange={(e) => onChange(e.target.value)} />
      {value ? <button type="button" className="underline" onClick={() => onChange("")}>Sans couleur</button> : <span>Sans couleur</span>}
    </span>
  );
}

function TagRow({ t }: { t: RouterOutputs["hashtags"]["list"][number] }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ name: t.name, color: t.color ?? "" });
  const [confirm, setConfirm] = useState(false);
  const update = trpc.hashtags.update.useMutation({ onSuccess: () => { utils.hashtags.invalidate(); utils.forum.invalidate(); toast.success("Hashtag enregistré"); }, onError: (e) => toast.error(e.data?.code === "BAD_REQUEST" ? "Lettres, chiffres et tirets uniquement." : e.message) });
  const remove = trpc.hashtags.remove.useMutation({ onSuccess: () => { utils.hashtags.invalidate(); utils.forum.invalidate(); toast.success("Hashtag supprimé"); }, onError: (e) => toast.error(e.message) });
  const dirty = f.name !== t.name || f.color !== (t.color ?? "");
  return (
    <article className="p-card p-3.5 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="p-pill flex-none" style={{ color: "var(--p-ink)" }}><TagLabel tag={{ id: t.id, name: f.name, color: f.color || null }} /></span>
        <input className="p-field flex-[1_1_160px] min-w-0" value={f.name} maxLength={40} aria-label={`Nom du hashtag ${t.name}`} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <ColorField value={f.color} onChange={(color) => setF({ ...f, color })} />
        <span className="text-[12.5px] p-faint flex-none">{plural(t.posts, "publication", "publications")}</span>
        <span className="flex gap-1.5 ml-auto flex-none">
          <button type="button" className="p-btn-primary p-btn-sm" disabled={!dirty || !f.name.trim() || update.isPending} onClick={() => update.mutate({ id: t.id, name: f.name, color: f.color || null })}>Enregistrer</button>
          <button type="button" aria-label={`Supprimer le hashtag ${t.name}`} className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--p-line-2)", color: "var(--p-accent-text)" }} onClick={() => setConfirm(true)}><Trash2 size={15} /></button>
        </span>
      </div>
      {confirm && (
        <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-xl" style={{ background: "var(--p-accent-soft)" }}>
          <span className="flex-1 min-w-[200px] text-[14px]">Supprimer #{t.name} ?{t.posts ? ` Il disparaîtra de ${plural(t.posts, "publication", "publications")}, qui restera${t.posts > 1 ? "ont" : ""} en ligne.` : ""}</span>
          <button type="button" className="p-btn-primary p-btn-sm" disabled={remove.isPending} onClick={() => remove.mutate({ id: t.id })}>Supprimer</button>
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConfirm(false)}>Annuler</button>
        </div>
      )}
    </article>
  );
}

function Pins() {
  const utils = trpc.useUtils();
  const spaces = trpc.forum.spaces.useQuery();
  const [spaceId, setSpaceId] = useState<number | null>(null);
  const current = spaceId ?? spaces.data?.spaces.find((s) => s.groupKey === SPACE_GROUPS[0][0])?.id ?? null;
  const posts = trpc.forum.pinCandidates.useQuery({ spaceId: current ?? 0 }, { enabled: !!current });
  const set = trpc.forum.setPinned.useMutation({ onSuccess: (_r, v) => { utils.forum.invalidate(); toast.success(v.pinned ? "Publication épinglée en tête de l’espace" : "Publication désépinglée"); }, onError: (e) => toast.error(e.message) });
  return (
    <section className="flex flex-col gap-3.5" aria-label="Épingler une publication">
      <div><h3 className="m-0 text-[24px]">Épingler une publication</h3><p className="m-0 text-[14.5px] p-muted">Elle reste en tête de son espace. Une annonce épinglée apparaît aussi en haut du tableau de bord des personnes concernées.</p></div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted max-w-[360px]"><span>Espace</span>
        <select className="p-field" value={current ?? ""} onChange={(e) => setSpaceId(Number(e.target.value))}>
          {SPACE_GROUPS.map(([g, label]) => <optgroup key={g} label={label}>{spaces.data?.spaces.filter((s) => s.groupKey === g).map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}</optgroup>)}
        </select>
      </label>
      {posts.data?.map((p) => (
        <article key={p.id} className="p-card p-3.5 flex flex-wrap items-center gap-3">
          <span className="flex-[1_1_240px] min-w-0 flex flex-col">
            <span className="font-semibold text-[15px] truncate">{p.title || p.excerpt}</span>
            <span className="text-[12.5px] p-muted">{p.author} · {ago(new Date(p.publishedAt))}</span>
          </span>
          <button type="button" aria-pressed={p.pinned} className={p.pinned ? "p-btn-primary p-btn-sm" : "p-btn-outline p-btn-sm"} disabled={set.isPending} onClick={() => set.mutate({ postId: p.id, pinned: !p.pinned })}>{p.pinned ? <><PinOff size={15} /> Retirer</> : <><Pin size={15} /> Épingler</>}</button>
        </article>
      ))}
      {posts.data?.length === 0 && <div className="p-soft p-6 text-center text-[14.5px] p-muted">Aucune publication dans cet espace.</div>}
    </section>
  );
}
