import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

const REASONS = ["Propos déplacés", "Harcèlement", "Contenu inapproprié", "Publicité ou démarchage", "Autre"];

type Kind = "post" | "reply" | "message" | "hive_post";

/** « Signaler » : sur chaque message privé, publication et réponse. Le motif part à l'administration, en toute discrétion. */
export function ReportButton({ kind, id, className, children }: { kind: Kind; id: number; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      <ReportDialog kind={kind} id={id} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ReportDialog({ kind, id, open, onOpenChange }: { kind: Kind; id: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const create = trpc.reports.create.useMutation({
    onSuccess: (r) => { onOpenChange(false); setReason(""); setDetail(""); toast.success(r.already ? "Vous aviez déjà signalé ce contenu" : "Merci, votre signalement est transmis"); },
    onError: (e) => toast.error(e.message),
  });
  const text = [reason, detail.trim()].filter(Boolean).join(" : ");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" aria-describedby={undefined}>
        <DialogTitle className="serif text-[26px] font-normal">Signaler ce contenu</DialogTitle>
        <div className="flex flex-col gap-3.5">
          <p className="m-0 text-[14px] p-muted">L’administration examine chaque signalement. La personne concernée ne saura pas qui l’a fait.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motif">
            {REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} className={`p-chip ${reason === r ? "p-chip-on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}
          </div>
          <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Précisions (facultatives)</span><textarea className="p-field text-[14.5px]" rows={3} maxLength={700} value={detail} onChange={(e) => setDetail(e.target.value)} /></label>
          <span className="flex justify-end gap-2">
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => onOpenChange(false)}>Annuler</button>
            <button type="button" className="p-btn-primary p-btn-sm" disabled={text.length < 3 || create.isPending} onClick={() => create.mutate({ kind, id, reason: text })}>Envoyer le signalement</button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
