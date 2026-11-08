import { Link, Navigate } from "react-router";
import { CalendarPlus, Check, ExternalLink, Lock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { parisDateYear, parisHour, parisLongDate } from "@/lib/format";

const STATE: Record<string, string> = { "Terminé": "Réalisée", "Planifié": "Prévue", "Reportée": "Reportée", "Absence": "Absence", "Non planifié": "À planifier" };

/** Coaching : le suivi de mes séances avec Laura. Confidentiel : jamais montré aux autres membres. */
export default function Coaching() {
  const me = trpc.members.me.useQuery();
  const q = trpc.coaching.mine.useQuery(undefined, { enabled: !!me.data?.coachingClient });
  if (!me.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (!me.data.coachingClient) return <Navigate to="/profil" replace />;
  const c = q.data;
  return (
    <section className="p-panel" aria-label="Coaching">
      <div className="p-panel-head"><h2 className="p-panel-title">Coaching</h2><span className="text-[13px] p-muted flex items-center gap-1.5"><Lock size={13} /> Visible de vous seul·e, jamais des autres membres.</span></div>
      <p className="m-0 mb-6 text-[15px]">{c ? `Votre accompagnement « ${c.title} » avec Laura.` : "Votre accompagnement individuel avec Laura."}</p>
      {c && (
        <>
          <div className="grid gap-3 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}>
            <Stat n={c.done} label={`séance${c.done > 1 ? "s" : ""} réalisée${c.done > 1 ? "s" : ""}`} />
            {c.remaining !== null && <Stat n={c.remaining} label={`séance${c.remaining > 1 ? "s" : ""} restante${c.remaining > 1 ? "s" : ""}`} />}
            {c.planned !== null && <Stat n={c.planned} label="séances prévues" />}
          </div>
          <section className="p-band p-6 flex flex-wrap items-center gap-4 mb-7" aria-label="Prochaine séance">
            <span className="flex-[1_1_260px] flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Ma prochaine séance</span>
              <span className="serif text-[26px] leading-tight">{c.next ? `${parisLongDate(new Date(c.next.startsAt))} · ${parisHour(new Date(c.next.startsAt))}` : "À réserver"}</span>
              {c.next && <span className="text-[13.5px] text-white/75">{c.next.kind || "Séance"}{c.next.number ? ` n° ${c.next.number}` : ""} · avec Laura Ballo</span>}
            </span>
            {c.calendlyUrl && (
              <span className="flex flex-col gap-1.5">
                <a href={c.calendlyUrl} target="_blank" rel="noopener" className="p-btn-white no-underline"><CalendarPlus size={18} /> Réserver une séance</a>
                <span className="text-[12px] text-white/65 flex items-center justify-center gap-1.5"><ExternalLink size={12} /> Ouvre l’agenda de Laura sur Calendly</span>
              </span>
            )}
          </section>
          {c.satisfactionUrl && (
            <section className="p-card p-5 mb-7 flex flex-wrap items-center gap-4" aria-label="Votre avis">
              <span className="flex-[1_1_260px] flex flex-col gap-1"><span className="font-semibold">Votre accompagnement est terminé</span><span className="text-[14px] p-muted">Quelques minutes pour dire comment vous l’avez vécu : votre avis aide Laura à faire progresser ses accompagnements.</span></span>
              <a href={c.satisfactionUrl} className="p-btn-primary no-underline">Donner mon avis</a>
            </section>
          )}
          {c.accessEndsAt && <p className="m-0 mb-7 p-4 rounded-xl text-[14.5px]" style={{ background: "var(--p-surface-2)" }}>Votre accès au réseau Présence court jusqu’au <strong>{parisDateYear(new Date(c.accessEndsAt))}</strong>.</p>}
          <section className="flex flex-col gap-2.5" aria-label="Mes séances">
            <h2 className="m-0 text-[28px]">Mes séances</h2>
            {c.meetings.map((s) => (
              <div key={s.id} className="p-card p-4 flex flex-wrap items-center gap-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center flex-none font-semibold text-[14px]" style={s.state === "Terminé" ? { background: "var(--p-accent)", color: "#fff" } : { background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{s.state === "Terminé" ? <Check size={18} /> : s.number ?? "·"}</span>
                <span className="flex-[1_1_220px] min-w-0 flex flex-col"><span className="font-semibold">{s.kind || "Séance"}{s.number ? ` n° ${s.number}` : ""}</span><span className="text-[13px] p-muted">{s.startsAt ? `${parisLongDate(new Date(s.startsAt))} · ${parisHour(new Date(s.startsAt))}` : "Date à fixer"}</span></span>
                <span className="p-pill">{STATE[s.state] ?? s.state}</span>
              </div>
            ))}
            {c.meetings.length === 0 && <div className="p-soft p-7 text-center p-muted">Vos séances apparaîtront ici dès qu’elles seront planifiées.</div>}
          </section>
          <p className="mt-6 text-[14px] p-muted">Vos objectifs, les comptes rendus partagés par Laura et votre carnet sont dans <Link to="/parcours/accompagnement" className="p-link">Mon parcours › Mon accompagnement</Link>.</p>
        </>
      )}
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return <div className="p-card p-5 flex flex-col gap-1"><span className="serif text-[44px] leading-none" style={{ color: "var(--p-accent-text)" }}>{n}</span><span className="text-[14px] p-muted">{label}</span></div>;
}
