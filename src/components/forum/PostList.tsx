import { lazy, Suspense, useState, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { PostCard } from "./PostCard";
import type { ComposerTarget } from "./Composer";
import type { OppType, Post } from "./shared";

const PAGE = 20;
// L'éditeur de texte pèse lourd : il n'est chargé qu'à l'ouverture de la fenêtre.
const Composer = lazy(() => import("./Composer"));

export function ComposerHost({ target, onClose, onSaved }: { target: ComposerTarget | null; onClose: () => void; onSaved?: (id: number) => void }) {
  if (!target) return null;
  return <Suspense fallback={null}><Composer target={target} onClose={onClose} onSaved={onSaved} /></Suspense>;
}

/** Liste de publications : fil d'actualité, espace, hashtag ou annonces d'une ruche. */
export function PostList({ space, hive, hashtagId, oppType, showOrigin, empty, onEdit }: { space?: string; hive?: number; hashtagId?: number; oppType?: OppType; showOrigin?: boolean; empty: ReactNode; onEdit: (p: Post) => void }) {
  const [limit, setLimit] = useState(PAGE);
  const q = trpc.forum.posts.useQuery({ space, hive, hashtagId, oppType, limit }, { placeholderData: keepPreviousData });
  if (q.isLoading) return <p className="p-muted text-center py-10 m-0">Chargement…</p>;
  if (q.isError) return <p className="p-muted text-center py-10 m-0">{q.error.message}</p>;
  const posts = q.data?.posts ?? [];
  return (
    <>
      {posts.map((p) => <PostCard key={p.id} p={p} showOrigin={showOrigin} onEdit={onEdit} />)}
      {posts.length === 0 && empty}
      {q.data?.hasMore && <button type="button" className="p-btn-outline p-btn-sm self-center" disabled={q.isFetching} onClick={() => setLimit(limit + PAGE)}>Voir plus</button>}
    </>
  );
}
