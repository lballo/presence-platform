import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

type Tag = { id: number; name: string };

/** Un clic sur un hashtag : les modules ouverts qui le portent, et les publications du forum. */
export function HashtagPanel({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const modules = trpc.courses.byHashtag.useQuery({ hashtagId: tag?.id ?? 0 }, { enabled: !!tag });
  const posts = trpc.forum.posts.useQuery({ hashtagId: tag?.id, limit: 6 }, { enabled: !!tag });
  return (
    <Dialog open={!!tag} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal">#{tag?.name}</DialogTitle>
        <div className="flex flex-col gap-5">
          {!!modules.data?.length && (
            <section className="flex flex-col gap-2" aria-label="Dans vos formations">
              <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--p-gold)" }}>Dans vos formations</h3>
              {modules.data.map((m) => <Link key={m.id} to={`/parcours/${m.courseId}/module/${m.id}`} onClick={onClose} className="flex items-center justify-between gap-3 py-1.5 no-underline" style={{ color: "var(--p-ink)" }}><span className="min-w-0"><span className="font-medium">{m.title}</span> <span className="text-[13px] p-muted">· {m.courseTitle}</span></span><ArrowRight size={15} className="p-faint flex-none" /></Link>)}
            </section>
          )}
          <section className="flex flex-col gap-2" aria-label="Dans le forum">
            <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--p-gold)" }}>Dans le forum</h3>
            {posts.data?.posts.length === 0 && <p className="m-0 text-[14px] p-muted">Aucune publication ne porte encore ce hashtag.</p>}
            {posts.data?.posts.map((p) => <Link key={p.id} to={`/forum/publication/${p.id}`} onClick={onClose} className="py-1.5 no-underline flex flex-col" style={{ color: "var(--p-ink)" }}><span className="font-medium break-words">{p.title || p.text.slice(0, 80)}</span><span className="text-[13px] p-muted">{p.author?.name}</span></Link>)}
            {!!posts.data?.posts.length && tag && <Link to={`/forum?tag=${tag.id}`} onClick={onClose} className="p-btn-ghost self-start">Tout voir dans le forum <ArrowRight size={14} /></Link>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
