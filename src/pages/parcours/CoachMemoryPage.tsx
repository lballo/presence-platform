import { useState } from "react";
import { Pause, Pencil, Play, Share2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Layout";
import { CoachMascot } from "@/components/CoachMascot";
import { ConsentDialog } from "@/components/course/ConsentDialog";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { ago } from "@/lib/format";
import { ConfirmButton } from "@/pages/admin/shared";

type State = RouterOutputs["coachMemory"]["state"];
const RETRACE = "Retrace mon chemin depuis le début de ma formation.";
const SOURCE = { exercice: "Réponse à un exercice", reflexion: "Réflexion", module: "Ce que vous avez écrit", test: "Résultat de test", defi: "Défi" } as Record<string, string>;

/** « Ce que le coach retient de moi » : tout lire, corriger, effacer ou mettre en pause. L'administration n'y a pas accès. */
export default function CoachMemoryPage() {
  const q = trpc.coachMemory.state.useQuery();
  const [asking, setAsking] = useState(false);
  const s = q.data;
  return (
    <>
      <PageHeader eyebrow="Mon parcours" title="Ce que le coach retient de moi" intro="Tout est ici : lisez, corrigez, effacez, ou mettez en pause. Laura n’y a pas accès, sauf si vous partagez un élément." />
      <ConsentDialog open={asking} onDone={() => setAsking(false)} />
      {q.isLoading && <p className="p-muted text-center py-10 m-0">Chargement…</p>}
      {s && (
        <div className="flex flex-col gap-5 max-w-[800px]">
          <Status s={s} onAsk={() => setAsking(true)} />
          {s.active && <Retrace />}
          {s.items.length === 0 && (s.accepted || s.paused) && <div className="p-soft p-7 text-center p-muted">Le coach n’a encore rien retenu. Vos réponses, vos tests et vos défis viendront s’y ranger au fil de l’eau.</div>}
          <ul className="list-none m-0 p-0 flex flex-col gap-3">
            {s.items.map((i) => <Item key={i.id} i={i} />)}
          </ul>
          {(s.items.length > 0 || s.accepted) && <Danger s={s} />}
          <p className="m-0 text-[13.5px] p-muted leading-relaxed">Effacer un élément ne retire pas ce qui figure déjà dans une conversation passée avec le coach. Pour cela, démarrez une <ResetChat />.</p>
        </div>
      )}
    </>
  );
}

export function Status({ s, onAsk }: { s: State; onAsk: () => void }) {
  const utils = trpc.useUtils();
  const pause = trpc.coachMemory.setPaused.useMutation({ onSuccess: (_r, v) => { utils.coachMemory.invalidate(); toast.success(v.paused ? "Mémoire en pause" : "Mémoire reprise"); }, onError: (e) => toast.error(e.message) });
  const text = s.active ? "La mémoire est active. Vos réponses, vos réflexions, vos tests et vos défis y entrent au fil de l’eau, et le coach s’en sert dans vos conversations."
    : s.paused ? "La mémoire est en pause. Le coach ne retient plus rien et ne s’appuie plus sur ce qu’il sait de vous."
    : s.refused ? "Vous avez choisi de ne pas activer la mémoire. Le coach ne garde rien de votre parcours."
    : "La mémoire n’est pas activée. Le coach ne garde rien de votre parcours.";
  return (
    <section className="p-card p-4 sm:p-5 flex flex-wrap items-center gap-4" aria-label="État de la mémoire">
      <span className="flex-none"><CoachMascot size={48} /></span>
      <p className="m-0 flex-[1_1_260px] text-[15px] leading-relaxed">{text}</p>
      {s.active && <button type="button" className="p-btn-outline p-btn-sm" disabled={pause.isPending} onClick={() => pause.mutate({ paused: true })}><Pause size={15} /> Mettre en pause</button>}
      {s.paused && <button type="button" className="p-btn-primary p-btn-sm" disabled={pause.isPending} onClick={() => pause.mutate({ paused: false })}><Play size={15} /> Reprendre</button>}
      {!s.accepted && <button type="button" className="p-btn-primary p-btn-sm" onClick={onAsk}>Activer la mémoire</button>}
    </section>
  );
}

/** Demander au coach de retracer le chemin parcouru. */
function Retrace() {
  const utils = trpc.useUtils();
  const send = trpc.coach.send.useMutation({ onSuccess: () => utils.coach.history.invalidate(), onError: (e) => toast.error(e.message) });
  return (
    <section className="p-soft p-4 sm:p-5 flex flex-col gap-3" aria-label="Retracer mon chemin">
      <button type="button" id="chemin" className="p-btn-outline p-btn-sm self-start" disabled={send.isPending} onClick={() => send.mutate({ text: RETRACE })}><Sparkles size={15} /> {send.isPending ? "Le coach réfléchit…" : "Demander au coach de retracer mon chemin"}</button>
      {send.data && <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">{send.data.text}</p>}
    </section>
  );
}

function Item({ i }: { i: State["items"][number] }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.coachMemory.invalidate();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(i.text ?? "");
  const update = trpc.coachMemory.update.useMutation({ onSuccess: () => { refresh(); setEditing(false); toast.success("Correction enregistrée"); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.coachMemory.remove.useMutation({ onSuccess: () => { refresh(); toast.success("Élément effacé"); }, onError: (e) => toast.error(e.message) });
  const share = trpc.coachMemory.share.useMutation({ onSuccess: (_r, v) => { refresh(); toast.success(v.shared ? "Élément partagé avec Laura" : "Partage repris : cet élément redevient privé"); }, onError: (e) => toast.error(e.message) });
  return (
    <li className="p-card p-4 sm:p-5 flex flex-col gap-2">
      <span className="text-[12.5px] p-muted">{i.sourceLabel} · {SOURCE[i.source] ?? i.source} · {ago(new Date(i.createdAt))}{i.correctedAt ? " · corrigé par vous" : ""}</span>
      {editing ? (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ id: i.id, text }); }}>
          <label className="sr-only" htmlFor={`souvenir-${i.id}`}>Corriger cet élément</label>
          <textarea id={`souvenir-${i.id}`} className="p-field text-[15px]" rows={3} maxLength={9000} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="flex flex-wrap gap-2"><button type="submit" className="p-btn-primary p-btn-sm" disabled={update.isPending || !text.trim()}>Enregistrer</button><button type="button" className="p-btn-outline p-btn-sm" onClick={() => { setEditing(false); setText(i.text ?? ""); }}>Annuler</button></span>
        </form>
      ) : i.text === null ? <p className="m-0 text-[14px] p-muted">Cet élément ne peut plus être lu.</p> : <p className="m-0 text-[15.5px] leading-relaxed whitespace-pre-line">{i.text}</p>}
      {!editing && (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" className="p-btn-ghost text-[13px] min-h-0" onClick={() => setEditing(true)}><Pencil size={13} /> Corriger</button>
          <button type="button" className="p-btn-ghost text-[13px] min-h-0" disabled={remove.isPending} onClick={() => remove.mutate({ id: i.id })}><Trash2 size={13} /> Effacer</button>
          <button type="button" className="p-btn-ghost text-[13px] min-h-0" disabled={share.isPending} onClick={() => share.mutate({ id: i.id, shared: !i.sharedAt })}><Share2 size={13} /> {i.sharedAt ? "Partagé avec Laura · reprendre" : "Partager avec Laura"}</button>
        </span>
      )}
    </li>
  );
}

export function Danger({ s }: { s: State }) {
  const utils = trpc.useUtils();
  const removeAll = trpc.coachMemory.removeAll.useMutation({ onSuccess: () => { utils.coachMemory.invalidate(); toast.success("Tout est effacé"); }, onError: (e) => toast.error(e.message) });
  const withdraw = trpc.coachMemory.withdraw.useMutation({ onSuccess: () => { utils.coachMemory.invalidate(); toast.success("Accord retiré, tout est effacé"); }, onError: (e) => toast.error(e.message) });
  return (
    <section className="flex flex-wrap gap-2" aria-label="Effacer">
      {s.items.length > 0 && <ConfirmButton label="Tout effacer" question="Effacer tout ce que le coach retient de vous ? Cela ne s’annule pas." confirm="Tout effacer" danger disabled={removeAll.isPending} onConfirm={() => removeAll.mutate()} />}
      {s.accepted && <ConfirmButton label="Retirer mon accord" question="Retirer votre accord ? Tout sera effacé et le coach ne retiendra plus rien." confirm="Retirer mon accord" danger disabled={withdraw.isPending} onConfirm={() => withdraw.mutate()} />}
    </section>
  );
}

function ResetChat() {
  const utils = trpc.useUtils();
  const reset = trpc.coach.reset.useMutation({ onSuccess: () => { utils.coach.history.invalidate(); toast.success("Conversation effacée"); }, onError: (e) => toast.error(e.message) });
  return <button type="button" className="p-link underline" disabled={reset.isPending} onClick={() => reset.mutate()}>nouvelle conversation</button>;
}
