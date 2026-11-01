import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { plural } from "@/lib/format";
import { EmojiGrid } from "./EmojiGrid";
import { SPACE_GROUPS, type Space } from "./shared";

type Group = (typeof SPACE_GROUPS)[number][0];

const fixedRule = (s: Space) => (s.kind === "annonces" ? "Réservé à l’équipe : les annonces en partent." : s.kind === "opportunites" ? "Chaque publication est relue avant d’être en ligne." : "Une vidéo est demandée pour publier ici.");

/** Ajouter, modifier ou supprimer un espace du forum. Réservé à l'administration. */
export function SpaceDialog({ space, startDeleting, onClose, onCreated, onDeleted }: { space?: Space; startDeleting?: boolean; onClose: () => void; onCreated?: (slug: string) => void; onDeleted?: () => void }) {
  const utils = trpc.useUtils();
  const spaces = trpc.forum.spaces.useQuery();
  const [f, setF] = useState({ name: space?.name ?? "", emoji: space?.emoji ?? "", description: space?.description ?? "", groupKey: (space?.groupKey ?? "echanger") as Group, adminOnly: space?.adminOnly ?? false });
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(!!startDeleting);
  const [moveTo, setMoveTo] = useState<number | null>(null);
  // Ses publications ne vont que vers un espace ordinaire : elles ne deviennent ni des annonces, ni des opportunités à relire
  const targets = (spaces.data?.spaces ?? []).filter((s) => s.id !== space?.id && s.kind === "libre");
  const target = moveTo ?? targets.find((s) => !s.adminOnly)?.id ?? targets[0]?.id ?? null;
  const posts = space?.posts ?? 0;
  const refresh = () => { utils.forum.invalidate(); utils.admin.invalidate(); };
  const create = trpc.forum.createSpace.useMutation({ onSuccess: (r) => { refresh(); toast.success("Espace ajouté"); onClose(); onCreated?.(r.slug); }, onError: (e) => toast.error(e.message) });
  const save = trpc.forum.updateSpace.useMutation({ onSuccess: () => { refresh(); toast.success("Espace enregistré"); onClose(); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.forum.deleteSpace.useMutation({
    onSuccess: (r) => { refresh(); toast.success(r.moved ? `Espace supprimé : ${plural(r.moved, "publication déplacée", "publications déplacées")}` : "Espace supprimé"); onClose(); onDeleted?.(); },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => (space ? save.mutate({ id: space.id, ...f }) : create.mutate(f));
  const free = !space || space.kind === "libre";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[92dvh] overflow-y-auto" aria-describedby={undefined} style={{ background: "var(--p-surface)", color: "var(--p-ink)" }}>
        <DialogTitle className="serif text-[28px] font-normal">{space ? "Modifier l’espace" : "Ajouter un espace"}</DialogTitle>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) submit(); }}>
          <div className="flex items-end gap-2.5">
            <div className="flex flex-col gap-1 text-[13px] p-muted flex-none"><span>Emoji</span><button type="button" aria-label="Choisir l’emoji" aria-expanded={picking} className="w-[46px] h-[46px] rounded-xl border text-[22px]" style={{ borderColor: "var(--p-line-2)" }} onClick={() => setPicking(!picking)}>{f.emoji || "＋"}</button></div>
            <label className="flex flex-col gap-1 text-[13px] p-muted flex-1 min-w-0"><span>Nom</span><input className="p-field" autoFocus={!space} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          </div>
          {picking && <div className="p-2 rounded-xl max-h-[190px] overflow-y-auto" style={{ background: "var(--p-surface-2)" }}><EmojiGrid onPick={(emoji) => { setF({ ...f, emoji }); setPicking(false); }} /></div>}
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Description <span className="p-faint">· une phrase affichée en tête de l’espace</span></span><textarea className="p-field text-[14.5px]" rows={2} maxLength={400} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Place dans le menu</span>
            <select className="p-field" value={f.groupKey} onChange={(e) => setF({ ...f, groupKey: e.target.value as Group })}>{SPACE_GROUPS.map(([g, label]) => <option key={g} value={g}>{label}</option>)}</select>
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] p-muted">
            <span>Qui peut y publier ?</span>
            {free ? (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!f.adminOnly} className={`p-chip h-9 ${!f.adminOnly ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, adminOnly: false })}>Tous les membres</button>
                <button type="button" aria-pressed={f.adminOnly} className={`p-chip h-9 ${f.adminOnly ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, adminOnly: true })}>L’équipe seulement</button>
              </div>
            ) : <span className="text-[14px]">{fixedRule(space)}</span>}
          </div>

          {space && !deleting && (space.required
            ? <p className="m-0 text-[13px] p-muted">Le site a besoin de cet espace : vous pouvez le renommer, pas le supprimer.</p>
            : <button type="button" className="p-btn-ghost self-start" style={{ color: "var(--p-accent-text)" }} onClick={() => setDeleting(true)}><Trash2 size={15} /> Supprimer cet espace</button>)}
          {space && deleting && !space.required && (
            <div className="flex flex-col gap-2.5 p-3.5 rounded-xl" style={{ background: "var(--p-accent-soft)" }}>
              <span className="text-[14px] font-medium">Supprimer « {space.name} » ?</span>
              {posts > 0 ? (
                <label className="flex flex-col gap-1 text-[13.5px]"><span>{posts > 1 ? `Ses ${posts} publications ne seront pas effacées. Elles rejoindront :` : "Sa publication ne sera pas effacée. Elle rejoindra :"}</span>
                  <select className="p-field" value={target ?? ""} onChange={(e) => setMoveTo(Number(e.target.value))}>{targets.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}</select>
                </label>
              ) : <span className="text-[13.5px]">Il ne contient aucune publication.</span>}
              <span className="flex flex-wrap justify-end gap-2">
                <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setDeleting(false)}>Garder l’espace</button>
                <button type="button" className="p-btn-primary p-btn-sm" disabled={remove.isPending || (posts > 0 && !target)} onClick={() => remove.mutate({ id: space.id, moveTo: posts > 0 ? target : null })}>Supprimer</button>
              </span>
            </div>
          )}

          <span className="flex justify-end gap-2 pt-1">
            <button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="p-btn-primary p-btn-sm" disabled={!f.name.trim() || create.isPending || save.isPending}>{space ? "Enregistrer" : "Ajouter"}</button>
          </span>
        </form>
      </DialogContent>
    </Dialog>
  );
}
