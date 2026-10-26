import { Play, Clock, Eye } from "lucide-react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { longDate, hour } from "@/lib/format";

export default function TalkShow() {
  const talks = trpc.talks.list.useQuery();
  const program = trpc.events.program.useQuery();
  const live = program.data?.find((e) => e.title.startsWith("Talk Show live"));
  const [first, ...rest] = talks.data ?? [];

  return (
    <>
      <PageHeader eyebrow="Talk Show" title="Des membres, des idées qui transforment" intro="Chaque mois, des leaders du cercle racontent l’idée qui a changé leur façon de diriger. En vidéo, puis en direct." />

      {first && (
        <article className="p-band flex flex-wrap items-center gap-8 p-7 sm:p-10 mb-8">
          <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-4">
            <span className="text-[12px] font-medium uppercase tracking-[0.3em]" style={{ color: "var(--p-gold-bright)" }}>Le talk de la semaine</span>
            <h2 className="serif text-[clamp(32px,4vw,46px)] leading-[1.08] m-0">{first.title}</h2>
            <p className="m-0 text-[16px] text-white/80 leading-relaxed">{first.summary}</p>
            <div className="flex items-center gap-3"><Avatar m={first.speaker} size={44} /><span className="flex flex-col"><span className="font-semibold">{first.speaker.name}</span><span className="text-[13px] text-white/70">{first.speaker.role} · {first.speaker.city}</span></span></div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="button" className="p-btn-white"><Play size={18} /> Regarder · {first.durationMin} min</button>
              <span className="text-[13px] text-white/65 flex items-center gap-1.5"><Eye size={13} /> {first.views} vues</span>
            </div>
          </div>
          <div className="flex-[0_1_340px] aspect-[4/5] max-w-full rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center">
            {first.speaker.photoUrl ? <img src={first.speaker.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="serif text-[120px] italic" style={{ color: "var(--p-gold-bright)" }}>{first.speaker.initials}</span>}
          </div>
        </article>
      )}

      <div className="flex flex-wrap gap-8 items-start">
        <section className="flex-[2_1_520px] min-w-0">
          <h2 className="text-[30px] mb-4">Les derniers talks</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(250px, 100%), 1fr))" }}>
            {rest.map((t) => (
              <article key={t.id} className="p-card overflow-hidden flex flex-col">
                <div className="aspect-video flex items-center justify-center relative" style={{ background: "var(--p-surface-2)" }}>
                  {t.speaker.photoUrl ? <img src={t.speaker.photoUrl} alt="" className="w-full h-full object-cover object-top" /> : <span className="serif text-[64px] italic" style={{ color: "var(--p-accent-text)" }}>{t.speaker.initials}</span>}
                  <span className="absolute inset-0 flex items-center justify-center"><span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center" style={{ color: "var(--p-ink)" }}><Play size={20} /></span></span>
                </div>
                <div className="p-4 flex flex-col gap-1.5">
                  <h3 className="m-0 text-[22px] leading-tight">{t.title}</h3>
                  <span className="text-[13px] p-muted">{t.speaker.name} · {t.speaker.city}</span>
                  <span className="text-[12.5px] p-faint flex items-center gap-3"><span className="flex items-center gap-1"><Clock size={12} /> {t.durationMin} min</span><span className="flex items-center gap-1"><Eye size={12} /> {t.views}</span></span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <aside className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
          {live && (
            <section className="p-card p-5 flex flex-col gap-3">
              <span className="p-eyebrow">Le live du mois</span>
              <h3 className="m-0 text-[24px] leading-tight">{live.title.replace("Talk Show live : ", "")}</h3>
              <span className="text-[14px] p-muted">{longDate(new Date(live.startsAt))} · {hour(new Date(live.startsAt))} · {live.where}</span>
              {live.withLine && <span className="text-[14px]">{live.withLine}</span>}
              <Link to={`/evenements?e=${live.id}`} className="p-btn-primary p-btn-sm no-underline self-start">{live.registered ? "Place réservée · voir" : "Réserver ma place"}</Link>
            </section>
          )}
          <section className="p-soft p-5 flex flex-col gap-2">
            <span className="p-eyebrow">Proposer un talk</span>
            <p className="m-0 text-[14px] leading-relaxed p-muted">Une idée qui a changé votre façon de diriger ? Dix minutes, face caméra, avec l’aide de Laura pour le préparer.</p>
            <Link to="/presence-ia" className="p-btn-ghost text-[14px] no-underline">Répéter avec Présence IA →</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
