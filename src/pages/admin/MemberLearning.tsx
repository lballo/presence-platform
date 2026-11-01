import { useState } from "react";
import { Link } from "react-router";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Badge, ConfirmButton } from "./shared";
import { dateTime, fullDate } from "./labels";

/** Sur la fiche d'un membre : formations, accès complet, étiquettes, ce qu'il partage et son activité. */
export function MemberLearning({ memberId, name }: { memberId: number; name: string }) {
  const utils = trpc.useUtils();
  const file = trpc.build.memberFile.useQuery({ memberId });
  const shared = trpc.build.memberShared.useQuery({ memberId });
  const tags = trpc.build.tags.useQuery();
  const [newTag, setNewTag] = useState("");
  const refresh = () => { utils.build.memberFile.invalidate({ memberId }); utils.build.tags.invalidate(); };
  const access = trpc.build.setFullAccess.useMutation({ onSuccess: (_r, v) => { refresh(); toast.success(v.on ? "Accès complet donné : toutes les sections sont ouvertes" : "Accès complet retiré : retour au calendrier, ses réponses sont conservées"); }, onError: (e) => toast.error(e.message) });
  const setTag = trpc.build.setMemberTag.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const createTag = trpc.build.createTag.useMutation({ onSuccess: (t) => { setNewTag(""); setTag.mutate({ memberId, tagId: t.id, on: true }); }, onError: (e) => toast.error(e.message) });
  const status = trpc.build.status.useQuery();
  const remind = trpc.build.sendReminders.useMutation({
    onSuccess: (r) => { refresh(); const x = r.results[0]; if (x?.status === "envoye") toast.success("Relance envoyée par e-mail"); else if (x) toast.info(x.reasonLabel, { duration: 7000 }); },
    onError: (e) => toast.error(e.message),
  });
  const d = file.data;
  if (!d) return null;
  const mine = new Set(d.tags.map((t) => t.id));
  const s = shared.data;
  const sharedCount = (s?.entries.length ?? 0) + (s?.tests.length ?? 0) + (s?.memory.length ?? 0);
  return (
    <>
      <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Formations">
        <h3 className="m-0 text-[22px]">Formations</h3>
        {d.courses.length === 0 && <p className="m-0 text-[14px] p-muted">Aucune formation pour l’instant.</p>}
        <ul className="list-none m-0 p-0 flex flex-col">
          {d.courses.map((c) => (
            <li key={c.id} className="py-2.5 border-t first:border-t-0 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderColor: "var(--p-line)" }}>
              <Link to={`/admin/construire/${c.id}`} className="flex-[1_1_220px] min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
                <span className="font-medium leading-snug">{c.title}</span>
                <span className="text-[13px] p-muted">{c.startedAt ? `Commencée le ${fullDate(c.startedAt)} · ${c.done} leçon${c.done > 1 ? "s" : ""} sur ${c.total}` : "Pas commencée"}{c.status !== "publie" ? " · pas encore publiée" : ""}</span>
              </Link>
              {c.finishedAt && <Badge tone="ok">Terminée</Badge>}
              {status.data?.emailReady && c.startedAt && !c.finishedAt && <ConfirmButton label={<><Mail size={14} /> Relancer</>} question={`Envoyer maintenant une relance par e-mail à ${name} pour cette formation ?`} confirm="Envoyer" disabled={remind.isPending} onConfirm={() => remind.mutate({ courseId: c.id, memberIds: [memberId] })} />}
              {c.fullAccess
                ? <ConfirmButton label="Retirer l’accès complet" question={`Revenir au calendrier pour ${name} ? Ses réponses sont conservées.`} confirm="Retirer" disabled={access.isPending} onConfirm={() => access.mutate({ courseId: c.id, memberId, on: false })} />
                : <button type="button" className="p-btn-outline p-btn-sm" disabled={access.isPending} onClick={() => access.mutate({ courseId: c.id, memberId, on: true })}>Donner l’accès complet</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="p-card p-4 sm:p-5 flex flex-col gap-2.5" aria-label="E-mails">
        <h3 className="m-0 text-[22px]">E-mails</h3>
        <div className="flex flex-wrap gap-1.5">{d.emailPrefs.map((p) => <Badge key={p.key} tone={p.enabled ? "ok" : "calm"}>{p.label} : {p.enabled ? "oui" : "non"}</Badge>)}</div>
        <p className="m-0 text-[13.5px] p-muted">C’est le choix de cette personne, depuis son tableau de bord ou le lien de ses e-mails.</p>
        {d.emailSends.length > 0 && (
          <ul className="list-none m-0 p-0 flex flex-col">
            {d.emailSends.map((x) => <li key={x.id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[14px]"><span className="min-w-0 break-words"><span className="font-medium">{x.status === "envoye" ? "Envoyé" : x.status === "echec" ? "Échec" : "Écarté"}</span><span className="p-muted"> · {x.subject}{x.reasonLabel ? ` · ${x.reasonLabel}` : ""}</span></span><span className="text-[12.5px] p-faint flex-none">{dateTime(x.at)}</span></li>)}
          </ul>
        )}
      </section>

      <section className="p-card p-4 sm:p-5 flex flex-col gap-2.5" aria-label="Étiquettes">
        <h3 className="m-0 text-[22px]">Étiquettes</h3>
        <p className="m-0 text-[13.5px] p-muted">Elles servent à attribuer une formation à un groupe.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Étiquettes du membre">
          {tags.data?.map((t) => <button key={t.id} type="button" aria-pressed={mine.has(t.id)} className={`p-chip h-8 text-[13px] ${mine.has(t.id) ? "p-chip-on" : ""}`} onClick={() => setTag.mutate({ memberId, tagId: t.id, on: !mine.has(t.id) })}>{t.name}</button>)}
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) createTag.mutate({ name: newTag.trim() }); }}>
          <input className="p-field h-10 py-0 flex-[1_1_200px] text-[14px]" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nouvelle étiquette" aria-label="Nouvelle étiquette" />
          <button type="submit" className="p-btn-outline p-btn-sm" disabled={!newTag.trim()}>Ajouter</button>
        </form>
      </section>

      <section className="p-card p-4 sm:p-5 flex flex-col gap-3" aria-label="Partagé avec vous">
        <h3 className="m-0 text-[22px]">Partagé avec vous</h3>
        <p className="m-0 text-[13.5px] p-muted">Le journal, les tests et la mémoire du coach sont privés. Vous ne voyez ici que ce que cette personne a choisi de vous montrer.</p>
        {sharedCount === 0 && <p className="m-0 text-[14px] p-muted">Rien de partagé pour l’instant.</p>}
        {s?.entries.map((e) => <div key={`e${e.id}`} className="p-soft p-3.5 flex flex-col gap-1"><span className="text-[12.5px] p-muted">{e.lessonTitle} · journal</span>{e.question && <span className="font-medium">{e.question}</span>}<p className="m-0 text-[15px] whitespace-pre-line">{e.answer}</p></div>)}
        {s?.tests.map((t) => <div key={`t${t.id}`} className="p-soft p-3.5 flex flex-col gap-1"><span className="text-[12.5px] p-muted">{t.lessonTitle} · test</span>{t.result?.label && <span className="font-medium">{t.result.label}</span>}<p className="m-0 text-[15px] whitespace-pre-line">{t.result?.summary}</p></div>)}
        {s?.memory.map((m) => <div key={`m${m.id}`} className="p-soft p-3.5 flex flex-col gap-1"><span className="text-[12.5px] p-muted">{m.sourceLabel} · mémoire du coach</span><p className="m-0 text-[15px] whitespace-pre-line">{m.text}</p></div>)}
      </section>

      <section className="p-card p-4 sm:p-5 flex flex-col gap-2" aria-label="Activité">
        <h3 className="m-0 text-[22px]">Activité</h3>
        {d.activity.length === 0 && <p className="m-0 text-[14px] p-muted">Rien pour l’instant.</p>}
        <ul className="list-none m-0 p-0 flex flex-col">
          {d.activity.map((a) => <li key={a.id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[14px]"><span className="min-w-0"><span className="font-medium">{a.typeLabel}</span>{a.label ? <span className="p-muted"> · {a.label}</span> : null}</span><span className="text-[12.5px] p-faint flex-none">{dateTime(a.at)}</span></li>)}
        </ul>
      </section>
    </>
  );
}
