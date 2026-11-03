import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarPlus, ExternalLink, Target } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ProfileView } from "@/pages/Profil";
import { ProfileEditor } from "@/pages/Dashboard";

/** Mon profil : ma fiche telle que les membres la voient, mes objectifs, et de quoi réserver avec Laura. */
export default function MonProfil() {
  const me = trpc.members.me.useQuery();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(params.get("modifier") === "1");
  useEffect(() => { window.scrollTo(0, 0); }, [editing]);
  if (!me.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (editing) return <ProfileEditor me={me.data} onDone={() => { setEditing(false); if (params.has("modifier")) setParams({}, { replace: true }); }} />;
  return <ProfileView id={me.data.id} onEdit={() => setEditing(true)} extra={<><Goals labels={me.data.goalLabels} /><Book /></>} />;
}

function Goals({ labels }: { labels: string[] }) {
  return (
    <section className="p-card p-6 flex flex-col gap-3" aria-label="Mes objectifs">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}><Target size={13} /> Mes objectifs</span>
      {labels.length ? <div className="flex flex-wrap gap-1.5">{labels.map((g) => <span key={g} className="p-pill h-8">{g}</span>)}</div> : <span className="text-[14px] p-muted">Vous n’avez pas encore indiqué ce qui vous amène.</span>}
      <span className="text-[12.5px] p-faint">Visible de vous seul·e. Le matching et le coach s’en servent pour vous guider.</span>
    </section>
  );
}

/** Réserver avec Laura : une séance pour les clients du coaching, la session exploratoire pour les autres. */
function Book() {
  const c = trpc.dashboard.coaching.useQuery().data;
  if (!c) return null;
  const url = c.isCoached ? c.calendlyUrl : c.calendlyExploUrl;
  if (!url) return null;
  return (
    <section className="p-band p-6 flex flex-wrap items-center gap-4" aria-label="Réserver avec Laura">
      <span className="flex-[1_1_260px] flex flex-col gap-1">
        <span className="serif text-[26px] leading-tight">{c.isCoached ? "Votre prochaine séance" : "Envie d’aller plus loin ?"}</span>
        <span className="text-[14px] text-white/75">{c.isCoached ? `${c.remaining} séance${c.remaining > 1 ? "s" : ""} restante${c.remaining > 1 ? "s" : ""} sur ${c.total}.` : "Une session exploratoire avec Laura, pour voir si le coaching individuel vous convient."}</span>
      </span>
      <span className="flex flex-col gap-1.5">
        <a href={url} target="_blank" rel="noopener" className="p-btn-white no-underline"><CalendarPlus size={18} /> {c.isCoached ? "Réserver une séance" : "Réserver ma session exploratoire"}</a>
        <span className="text-[12px] text-white/65 flex items-center justify-center gap-1.5"><ExternalLink size={12} /> Ouvre l’agenda de Laura sur Calendly</span>
      </span>
    </section>
  );
}
