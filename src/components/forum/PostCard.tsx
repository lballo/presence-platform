import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Eye, Heart, MessageCircle, Mic, MoreHorizontal, Paperclip, Pencil, Pin, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { VideoEmbed } from "@/components/VideoEmbed";
import { ago, hour, longDate, plural } from "@/lib/format";
import { fileSize } from "@/lib/upload";
import { AUDIENCES, HashtagChip, OPP, UnreadDot, type Post } from "./shared";

const isVoice = (a: { type: string }) => a.type.startsWith("audio/");
const when = (d: Date) => `${longDate(d).toLowerCase()} à ${hour(d)}`;

/** Une annonce compte comme lue quand elle reste une seconde à l'écran. */
function useMarkRead(post: Post) {
  const ref = useRef<HTMLElement>(null);
  const utils = trpc.useUtils();
  const mark = trpc.forum.markRead.useMutation({ onSuccess: () => utils.forum.invalidate() });
  const unread = post.unread;
  useEffect(() => {
    const el = ref.current;
    if (!unread || !el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (entry.isIntersecting) timer = setTimeout(() => mark.mutate({ postId: post.id }), 1000);
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => { clearTimeout(timer); observer.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, post.id]);
  return ref;
}

/** Une publication : couverture, texte mis en forme, médias, hashtags, réactions et réponses. */
export function PostCard({ p, showOrigin, openReplies, onEdit }: { p: Post; showOrigin?: boolean; openReplies?: boolean; onEdit: (p: Post) => void }) {
  const utils = trpc.useUtils();
  const ref = useMarkRead(p);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showReplies, setShowReplies] = useState(!!openReplies);
  const refresh = () => utils.forum.invalidate();
  const like = trpc.forum.toggleLike.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const interest = trpc.forum.toggleInterest.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = trpc.forum.deletePost.useMutation({ onSuccess: () => { refresh(); toast.success("Publication supprimée"); }, onError: (e) => toast.error(e.message) });
  const live = p.state === "live" || p.state === "ended";
  const OppIcon = p.oppType ? OPP[p.oppType].icon : null;
  return (
    <article ref={ref} id={`post-${p.id}`} className="p-card flex flex-col">
      {p.coverUrl && <img src={p.coverUrl} alt="" className="w-full max-h-[300px] object-cover rounded-t-[17px]" />}
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar m={p.author} size={44} />
          <span className="flex flex-col min-w-0 flex-1">
            <span className="font-semibold truncate">{p.author.name}</span>
            <span className="text-[12.5px] p-muted">{[p.author.jobTitle, p.author.city, p.state === "scheduled" ? "" : ago(new Date(p.publishedAt))].filter(Boolean).join(" · ")}{p.editedAt ? " · modifié" : ""}</span>
          </span>
          {p.unread && <UnreadDot />}
          {(p.canEdit || p.canDelete) && (
            <span className="relative flex-none">
              <button type="button" aria-label="Options de la publication" aria-expanded={menu} className="w-9 h-9 rounded-full flex items-center justify-center p-muted hover:bg-black/5 dark:hover:bg-white/5" onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>
              {menu && (
                <>
                  <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                  <span className="absolute right-0 top-10 z-20 min-w-[170px] p-1.5 rounded-xl shadow-lg flex flex-col" style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)" }}>
                    {p.canEdit && <button type="button" className="flex items-center gap-2 h-9 px-3 rounded-lg text-[14px] text-left hover:bg-black/5 dark:hover:bg-white/5" onClick={() => { setMenu(false); onEdit(p); }}><Pencil size={14} /> Modifier</button>}
                    {p.canDelete && <button type="button" className="flex items-center gap-2 h-9 px-3 rounded-lg text-[14px] text-left hover:bg-black/5 dark:hover:bg-white/5" style={{ color: "var(--p-accent-text)" }} onClick={() => { setMenu(false); setConfirm(true); }}><Trash2 size={14} /> Supprimer{!p.isMine ? " (modération)" : ""}</button>}
                  </span>
                </>
              )}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
          {showOrigin && p.space && <Link to={`/forum/${p.space.slug}`} className="p-pill no-underline">{p.space.emoji} {p.space.name}</Link>}
          {showOrigin && p.hive && <Link to={`/ruches/${p.hive.id}?tab=ann`} className="p-pill no-underline">🐝 {p.hive.name}</Link>}
          {p.pinned && <span className="p-pill"><Pin size={12} /> Épinglée</span>}
          {OppIcon && p.oppType && <span className="p-pill"><OppIcon size={13} /> {OPP[p.oppType].label}</span>}
          {p.state === "pending" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">En cours de relecture</span>}
          {p.state === "rejected" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">Non retenue par l’équipe</span>}
          {p.state === "scheduled" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted"><CalendarClock size={13} /> Programmée : {when(new Date(p.publishedAt))}</span>}
          {p.state === "ended" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">Affichage terminé</span>}
          {p.state === "live" && p.endsAt && p.readCount !== null && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">Jusqu’au {when(new Date(p.endsAt))}</span>}
          {p.audience !== "tous" && <span className="p-chip h-7 text-[12.5px] cursor-default p-muted"><Users size={13} /> {AUDIENCES[p.audience]}</span>}
        </div>

        {p.title && <Link to={`/forum/publication/${p.id}`} className="no-underline" style={{ color: "var(--p-ink)" }}><h3 className="m-0 text-[26px] leading-tight">{p.title}</h3></Link>}
        {p.html ? <div className="p-rich" dangerouslySetInnerHTML={{ __html: p.html }} /> : p.text && <p className="m-0 text-[16px] leading-relaxed whitespace-pre-line">{p.text}</p>}
        {p.videoUrl && <VideoEmbed url={p.videoUrl} title={`Vidéo de ${p.author.name}`} />}
        {p.askFeedback && <span className="text-[13px] p-muted">Demande un retour bienveillant et précis.</span>}
        {p.attachments.filter(isVoice).map((a) => (
          <div key={a.name + a.size} className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl" style={{ background: "var(--p-surface-2)" }}>
            <Mic size={16} className="flex-none" style={{ color: "var(--p-accent-text)" }} />
            <audio controls preload="metadata" src={a.url ?? undefined} className="flex-1 min-w-0 h-10" aria-label={`Note vocale de ${p.author.name}`} />
          </div>
        ))}
        {p.attachments.some((a) => !isVoice(a)) && (
          <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
            {p.attachments.filter((a) => !isVoice(a)).map((a) => (
              <li key={a.name + a.size}><a href={a.url ?? undefined} className="flex items-center gap-2 min-h-10 px-3 py-1.5 rounded-xl text-[13.5px] no-underline" style={{ background: "var(--p-surface-2)", color: "var(--p-ink)" }}><Paperclip size={15} className="flex-none" style={{ color: "var(--p-accent-text)" }} /><span className="flex-1 min-w-0 truncate">{a.name}</span><span className="text-[12px] p-faint flex-none">{fileSize(a.size)}</span></a></li>
            ))}
          </ul>
        )}
        {p.facts.length > 0 && <div className="flex flex-wrap gap-1.5">{p.facts.map((x) => <span key={x} className="p-chip h-[30px] text-[13px] cursor-default">{x}</span>)}</div>}
        {p.hashtags.length > 0 && <div className="flex flex-wrap gap-1.5">{p.hashtags.map((t) => <HashtagChip key={t.id} tag={t} />)}</div>}

        {confirm && (
          <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-xl" style={{ background: "var(--p-accent-soft)" }}>
            <span className="flex-1 min-w-[200px] text-[14px]">{p.isMine ? "Supprimer définitivement cette publication ?" : `Supprimer la publication de ${p.author.firstName} ?`}</span>
            <button type="button" className="p-btn-primary p-btn-sm" disabled={remove.isPending} onClick={() => remove.mutate({ id: p.id })}>Supprimer</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConfirm(false)}>Annuler</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 pt-2 border-t" style={{ borderColor: "var(--p-line)" }}>
          {live && <button type="button" aria-pressed={p.liked} className="inline-flex items-center gap-2 h-10 px-3 rounded-full text-[14px]" style={{ color: p.liked ? "var(--p-accent-text)" : "var(--p-ink-2)" }} onClick={() => like.mutate({ postId: p.id })}><Heart size={16} fill={p.liked ? "currentColor" : "none"} /> {p.likes}</button>}
          {live && <button type="button" aria-expanded={showReplies} className="inline-flex items-center gap-2 h-10 px-3 rounded-full text-[14px]" style={{ color: showReplies ? "var(--p-accent-text)" : "var(--p-ink-2)" }} onClick={() => setShowReplies(!showReplies)}><MessageCircle size={16} /> {p.replies ? plural(p.replies, "réponse", "réponses") : "Répondre"}</button>}
          {p.readCount !== null && <span className="inline-flex items-center gap-1.5 h-10 px-2 text-[13px] p-muted"><Eye size={15} /> {plural(p.readCount, "lecture", "lectures")}</span>}
          {p.oppType && live && (
            <span className="flex items-center gap-2.5 ml-auto">
              <span className="text-[13px] p-muted">{p.isMine ? "Votre annonce" : p.interestedCount ? plural(p.interestedCount, "membre intéressé", "membres intéressés") : "Personne pour l’instant"}</span>
              {!p.isMine && <button type="button" className={p.interested ? "p-btn-outline p-btn-sm" : "p-btn-primary p-btn-sm"} disabled={interest.isPending} onClick={() => interest.mutate({ postId: p.id })}>{p.interested ? "✓ Intérêt envoyé" : "Ça m’intéresse"}</button>}
            </span>
          )}
        </div>
        {showReplies && live && <Replies post={p} />}
      </div>
    </article>
  );
}

/** Fil de réponses d'une publication. */
function Replies({ post }: { post: Post }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery();
  const [text, setText] = useState("");
  const send = trpc.forum.reply.useMutation({ onSuccess: () => { utils.forum.invalidate(); setText(""); }, onError: (e) => toast.error(e.message) });
  return (
    <div className="flex flex-col gap-3 pt-1">
      {post.replyList.map((r) => <ReplyItem key={r.id} r={r} />)}
      <form className="flex items-end gap-2.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate({ postId: post.id, text }); }}>
        {me.data && <Avatar m={me.data} size={34} />}
        <textarea rows={1} className="p-field flex-1 min-w-0 resize-none text-[14.5px]" style={{ minHeight: 42 }} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate({ postId: post.id, text }); } }}
          placeholder={post.isMine ? "Ajouter une précision…" : `Répondre à ${post.author.firstName}…`} />
        <button type="submit" className="p-btn-primary p-btn-sm" disabled={!text.trim() || send.isPending}>Répondre</button>
      </form>
    </div>
  );
}

function ReplyItem({ r }: { r: Post["replyList"][number] }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.text);
  const [confirm, setConfirm] = useState(false);
  const update = trpc.forum.updateReply.useMutation({ onSuccess: () => { utils.forum.invalidate(); setEditing(false); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.forum.deleteReply.useMutation({ onSuccess: () => utils.forum.invalidate(), onError: (e) => toast.error(e.message) });
  return (
    <div className="group flex gap-2.5">
      <Avatar m={r.author} size={34} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-md" style={{ background: "var(--p-surface-2)" }}>
          <span className="flex items-baseline gap-2 flex-wrap"><span className="text-[13.5px] font-semibold">{r.author.name}</span><span className="text-[12px] p-faint">{ago(new Date(r.createdAt))}{r.editedAt ? " · modifié" : ""}</span></span>
          {editing ? (
            <div className="flex flex-col gap-2 mt-1.5">
              <textarea className="p-field text-[14.5px]" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              <span className="flex gap-2"><button type="button" className="p-btn-primary p-btn-sm" disabled={!text.trim() || update.isPending} onClick={() => update.mutate({ id: r.id, text })}>Enregistrer</button><button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setEditing(false); setText(r.text); }}>Annuler</button></span>
            </div>
          ) : <p className="m-0 text-[14.5px] leading-relaxed whitespace-pre-line">{r.text}</p>}
        </div>
        {!editing && (r.isMine || r.canDelete) && (
          <span className="flex items-center gap-3 pl-2 text-[12.5px] p-muted">
            {confirm ? (
              <>
                <span>Supprimer cette réponse ?</span>
                <button type="button" className="font-semibold" style={{ color: "var(--p-accent-text)" }} disabled={remove.isPending} onClick={() => remove.mutate({ id: r.id })}>Oui, supprimer</button>
                <button type="button" onClick={() => setConfirm(false)}>Annuler</button>
              </>
            ) : (
              <>
                {r.isMine && <button type="button" className="hover:underline" onClick={() => setEditing(true)}>Modifier</button>}
                {r.canDelete && <button type="button" className="hover:underline" onClick={() => setConfirm(true)}>Supprimer{!r.isMine ? " (modération)" : ""}</button>}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
