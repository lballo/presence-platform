import { useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, ChevronDown, Megaphone, Newspaper, PenLine, Pencil, Plus, Settings, X } from "lucide-react";
import { AdminPendingLink } from "@/components/AdminPendingLink";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { PostCard } from "@/components/forum/PostCard";
import { ComposerHost, PostList } from "@/components/forum/PostList";
import type { ComposerTarget } from "@/components/forum/Composer";
import { SpaceDialog } from "@/components/forum/SpaceDialog";
import { OPP, SPACE_GROUPS, TagLabel, UnreadDot, type OppType, type Post, type Space } from "@/components/forum/shared";

type Spaces = RouterOutputs["forum"]["spaces"];
const FEED_NAME = "Fil d’actualité";
const FEED_INTRO = "Les dernières publications de tous les espaces.";

export default function Forum() {
  const { slug, id } = useParams();
  const [params] = useSearchParams();
  const spaces = trpc.forum.spaces.useQuery();
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const data = spaces.data;
  const tag = Number(params.get("tag")) || undefined;
  const space = data?.spaces.find((s) => s.slug === slug);
  const tagName = trpc.hashtags.list.useQuery().data?.find((t) => t.id === tag)?.name;
  const editPost = (post: Post) => setComposer({ mode: "edit", post });

  return (
    <div className="flex gap-6 lg:gap-8 items-start">
      <aside className="hidden md:block w-[216px] flex-none sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto lg:top-0 lg:w-[236px] lg:h-screen lg:max-h-none lg:px-3 lg:py-6 lg:border-r" style={{ borderColor: "var(--p-menu-line)" }} aria-label="Espaces du forum">
        {data && <SpaceNav data={data} onAdd={() => setAdding(true)} />}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col gap-4 lg:max-w-[860px] lg:mx-auto lg:pt-10">
        <div className="md:hidden">{data && <SpaceDropdown data={data} onAdd={() => setAdding(true)} label={id ? "Espaces du forum" : space ? `${space.emoji} ${space.name}` : FEED_NAME} />}</div>

        {id ? <SinglePost id={Number(id)} onEdit={editPost} /> : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 mb-1">
              <div className="flex-[1_1_280px] min-w-0 flex flex-col gap-1.5">
                <span className="p-eyebrow">Le forum</span>
                <h1 className="m-0 text-[clamp(32px,4vw,44px)] leading-[1.08]">{slug ? (space ? `${space.emoji} ${space.name}` : "Espace introuvable") : tagName ? `#${tagName}` : FEED_NAME}</h1>
                <p className="m-0 text-[15.5px] leading-relaxed p-muted">{slug ? space?.description : tagName ? "Toutes les publications qui portent ce hashtag." : FEED_INTRO}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setComposer({ mode: "new", spaceSlug: slug })}><PenLine size={15} /> Nouvelle publication</button>
                {data?.canAnnounce && <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setComposer({ mode: "new", announcement: true })}><Megaphone size={15} /> Créer une annonce</button>}
                {data?.canManage && space && <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setEditing(true)}><Pencil size={15} /> Modifier cet espace</button>}
              </div>
            </header>

            {(!slug || space) && <HashtagFilter space={slug} active={tag} />}
            {space?.kind === "opportunites" && <PendingReview />}
            {(!slug || space) && <Posts key={`${slug ?? "fil"}-${tag ?? ""}`} space={space} slug={slug} tag={tag} onEdit={editPost} />}
          </>
        )}
      </div>

      <ComposerHost target={composer} onClose={() => setComposer(null)} onSaved={(postId) => { if (composer?.mode === "new" && !composer.hive) navigate(`/forum/publication/${postId}`); }} />
      {adding && <SpaceDialog onClose={() => setAdding(false)} onCreated={(created) => navigate(`/forum/${created}`)} />}
      {editing && space && <SpaceDialog key={space.id} space={space} onClose={() => setEditing(false)} onDeleted={() => navigate("/forum")} />}
    </div>
  );
}

function Posts({ space, slug, tag, onEdit }: { space?: Space; slug?: string; tag?: number; onEdit: (p: Post) => void }) {
  const [oppType, setOppType] = useState<OppType | undefined>();
  const isOpp = space?.kind === "opportunites";
  return (
    <>
      {isOpp && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`p-chip h-9 ${!oppType ? "p-chip-on" : ""}`} onClick={() => setOppType(undefined)}>Toutes</button>
          {(Object.keys(OPP) as OppType[]).map((k) => <button key={k} type="button" className={`p-chip h-9 ${oppType === k ? "p-chip-on" : ""}`} onClick={() => setOppType(k)}>{OPP[k].label}</button>)}
        </div>
      )}
      <PostList space={slug} hashtagId={tag} oppType={isOpp ? oppType : undefined} showOrigin={!slug} onEdit={onEdit}
        empty={<div className="p-soft p-9 text-center p-muted">{tag ? "Aucune publication ne porte ce hashtag ici." : space?.adminOnly ? "L’équipe n’a encore rien publié ici." : "Rien ici pour l’instant. Lancez la première publication."}</div>} />
    </>
  );
}

function SpaceLink({ to, end, label, icon, unread, pending, onPick }: { to: string; end?: boolean; label: string; icon: React.ReactNode; unread?: number; pending?: number; onPick?: () => void }) {
  return (
    <NavLink to={to} end={end} onClick={onPick} className="flex items-center gap-2.5 min-h-[40px] px-2.5 rounded-xl text-[16.5px] no-underline transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={({ isActive }) => ({ background: isActive ? "var(--p-pill)" : undefined, color: isActive ? "var(--p-accent-text)" : "var(--p-ink)", fontWeight: isActive ? 600 : 400 })}>
      <span className="w-[22px] flex justify-center flex-none text-[16px]">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {!!unread && <UnreadDot label={`${unread} annonce${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}`} />}
      {!!pending && <span title="À relire" className="min-w-[20px] h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center text-white" style={{ background: "var(--p-accent)" }}>{pending}</span>}
    </NavLink>
  );
}

/** Colonne des espaces (ordinateur) et contenu du menu déroulant (téléphone). */
function SpaceNav({ data, onPick, onAdd }: { data: Spaces; onPick?: () => void; onAdd?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      <SpaceLink to="/forum" end label={FEED_NAME} icon={<Newspaper size={17} />} onPick={onPick} />
      {SPACE_GROUPS.map(([g, label]) => (
        <div key={g} className="flex flex-col gap-0.5 mt-3">
          <span className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--p-gold)" }}>{label}</span>
          {data.spaces.filter((s) => s.groupKey === g).map((s) => <SpaceLink key={s.id} to={`/forum/${s.slug}`} label={s.name} icon={s.emoji} unread={s.unread} pending={s.pending} onPick={onPick} />)}
        </div>
      ))}
      {data.canManage && (
        <div className="mt-3 pt-2 border-t flex flex-col gap-0.5" style={{ borderColor: "var(--p-line)" }}>
          <button type="button" className="flex items-center gap-2.5 min-h-[40px] px-2.5 rounded-xl text-[16.5px] text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5" onClick={() => { onPick?.(); onAdd?.(); }}><span className="w-[22px] flex justify-center flex-none"><Plus size={16} /></span>Ajouter un espace</button>
          <SpaceLink to="/admin/forum?rubrique=espaces" label="Gérer le forum" icon={<Settings size={16} />} onPick={onPick} />
        </div>
      )}
    </nav>
  );
}

function SpaceDropdown({ data, label, onAdd }: { data: Spaces; label: string; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const unread = data.spaces.reduce((n, s) => n + s.unread, 0);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" className="w-full flex items-center gap-2.5 h-12 px-3.5 rounded-xl border text-[17px] font-medium text-left" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)" }} onClick={() => setOpen(!open)}>
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {unread > 0 && !open && <UnreadDot label={`${unread} annonce${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}`} />}
        <ChevronDown size={18} className="flex-none transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fermer le menu des espaces" className="fixed inset-0 z-[44] cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-[45] left-0 right-0 top-[54px] p-2 rounded-2xl shadow-xl max-h-[70vh] overflow-y-auto" style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)" }}>
            <SpaceNav data={data} onPick={() => setOpen(false)} onAdd={onAdd} />
          </div>
        </>
      )}
    </div>
  );
}

/** Filtre par hashtag dans l'espace ouvert ; dans le fil, il rassemble toutes les publications. */
function HashtagFilter({ space, active }: { space?: string; active?: number }) {
  const [, setParams] = useSearchParams();
  const facets = trpc.forum.hashtagFacets.useQuery({ space });
  const all = trpc.hashtags.list.useQuery();
  const current = all.data?.find((t) => t.id === active);
  const list = facets.data ?? [];
  if (!list.length && !current) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtrer par hashtag">
      {current && !list.some((t) => t.id === current.id) && <button type="button" aria-pressed className="p-chip p-chip-on h-8 text-[13px]" onClick={() => setParams({})}><TagLabel tag={current} /> <X size={13} /></button>}
      {list.map((t) => {
        const on = t.id === active;
        return <button key={t.id} type="button" aria-pressed={on} className={`p-chip h-8 text-[13px] ${on ? "p-chip-on" : ""}`} onClick={() => setParams(on ? {} : { tag: String(t.id) })}><TagLabel tag={t} /> <span className={on ? "" : "p-faint"}>{t.count}</span>{on && <X size={13} />}</button>;
      })}
    </div>
  );
}

/** Une publication seule : lien d'une annonce du tableau de bord ou d'un titre. */
function SinglePost({ id, onEdit }: { id: number; onEdit: (p: Post) => void }) {
  const q = trpc.forum.post.useQuery({ id }, { retry: false });
  const p = q.data;
  const back = p?.hive ? `/ruches/${p.hive.id}?tab=ann` : p?.space ? `/forum/${p.space.slug}` : "/forum";
  return (
    <>
      <Link to={back} className="p-btn-outline p-btn-sm no-underline self-start"><ArrowLeft size={15} /> {p?.hive ? p.hive.name : p?.space ? `${p.space.emoji} ${p.space.name}` : FEED_NAME}</Link>
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {q.isError && <div className="p-soft p-9 text-center p-muted">Cette publication n’existe pas ou n’est pas visible pour vous.</div>}
      {p && <PostCard key={p.id} p={p} openReplies onEdit={onEdit} />}
    </>
  );
}

/** Équipe : les publications à relire se traitent dans la file unique. */
function PendingReview() {
  return <AdminPendingLink kind="opportunity" one="opportunité" many="opportunités" />;
}
