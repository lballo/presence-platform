import { Link } from "react-router";
import { ArrowRight, Pin, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { ago } from "@/lib/format";

/** En haut du tableau de bord : les annonces épinglées, jusqu'à ce que la personne les ferme. */
export function PinnedAnnouncements() {
  const utils = trpc.useUtils();
  const pinned = trpc.forum.pinned.useQuery();
  const dismiss = trpc.forum.dismiss.useMutation({
    onSuccess: () => { utils.forum.pinned.invalidate(); utils.forum.unread.invalidate(); utils.forum.spaces.invalidate(); utils.forum.posts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  if (!pinned.data?.length) return null;
  return (
    <section aria-label="Annonces épinglées" className="flex flex-col gap-3 mb-6">
      {pinned.data.map((a) => (
        <article key={a.id} className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
          <Avatar m={a.author} size={42} />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--p-accent-text)" }}><Pin size={12} /> {a.origin}</span>
            <Link to={`/forum/publication/${a.id}`} className="serif text-[23px] leading-tight no-underline" style={{ color: "var(--p-ink)" }}>{a.title}</Link>
            {a.excerpt && <p className="m-0 text-[14.5px] leading-relaxed line-clamp-2">{a.excerpt}</p>}
            <span className="flex flex-wrap items-center gap-x-3 text-[13px] p-muted"><span>{a.author.name} · {ago(new Date(a.publishedAt))}</span><Link to={`/forum/publication/${a.id}`} className="p-btn-ghost min-h-0 no-underline text-[13.5px]">Lire l’annonce <ArrowRight size={14} /></Link></span>
          </div>
          <button type="button" aria-label={`Fermer l’annonce ${a.title}`} title="Fermer" className="w-9 h-9 flex-none rounded-full flex items-center justify-center p-muted hover:bg-black/5 dark:hover:bg-white/10" disabled={dismiss.isPending} onClick={() => dismiss.mutate({ postId: a.id })}><X size={18} /></button>
        </article>
      ))}
    </section>
  );
}
