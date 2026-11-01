import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CoachMascot } from "@/components/CoachMascot";
import { trpc } from "@/providers/trpc";

/** L'accord pour la mémoire du coach : demandé au début de la formation, sans jamais bloquer celle-ci. */
export function ConsentDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const utils = trpc.useUtils();
  const state = trpc.coachMemory.state.useQuery(undefined, { enabled: open });
  const answer = trpc.coachMemory.answerConsent.useMutation({
    onSuccess: (_r, v) => { utils.coachMemory.invalidate(); utils.courses.invalidate(); toast.success(v.accept ? "C’est noté : le coach gardera le fil de votre chemin" : "C’est noté : le coach ne gardera rien en mémoire"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const c = state.data?.consent;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="sm:max-w-[520px]" aria-describedby={undefined}>
        <DialogTitle className="serif text-[28px] font-normal leading-tight flex items-center gap-3"><span className="flex-none"><CoachMascot size={44} /></span>{c?.title ?? "La mémoire du coach"}</DialogTitle>
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
          {c?.paragraphs.map((p) => <p key={p} className="m-0">{p}</p>)}
          <span className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
            <button type="button" className="p-btn-outline p-btn-sm" disabled={answer.isPending} onClick={() => answer.mutate({ accept: false })}>Continuer sans la mémoire</button>
            <button type="button" className="p-btn-primary p-btn-sm" disabled={answer.isPending} onClick={() => answer.mutate({ accept: true })}>J’accepte</button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
