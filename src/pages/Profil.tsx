import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, MapPin, MessageCircle, Linkedin, Sparkles, Mic, CalendarDays, Hexagon, Eye, Clock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ago, longDate, hour, plural } from "@/lib/format";
import { COVERS } from "./Ruches";
import { StatusPicker } from "./Membres";

const KIND = { salon: "Salon live", online: "En ligne", onsite: "Présentiel" } as const;
const ROLE = { founder: "Fondatrice·eur", leader: "Leader", member: "Membre", pending: "" } as const;

export default function Profil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = trpc.members.me.useQuery();
  const p = trpc.members.profile.useQuery({ id: Number(id) }, { enabled: !!Number(id) });

  if (p.error) return <div className="py-20 text-center p-muted">Ce profil est introuvable. <Link to="/membres" className="p-link">Retour à l’annuaire</Link></div>;
  if (!p.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  const m = p.data;
  const gold = { color: "var(--p-gold)" };
  const rel = m.relation;

  return (
    <>
      <button type="button" className="p-btn-outline p-btn-sm mb-5" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/membres"))}><ArrowLeft size={15} /> Retour</button>

      <article className="p-card overflow-hidden flex flex-wrap mb-6">
        <div className="flex-[1_1_280px] max-w-full h-[300px] sm:h-auto sm:min-h-[340px]" style={{ background: "var(--p-surface-2)" }}>
          {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover object-[50%_20%]" /> : <div className="w-full h-full min-h-[340px] flex items-center justify-center serif italic text-[120px]" style={{ color: "var(--p-accent-text)", background: "var(--p-pill)" }}>{m.initials}</div>}
        </div>
        <div className="flex-[999_1_420px] min-w-0 p-7 sm:p-9 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="p-eyebrow flex items-center gap-1.5"><MapPin size={13} /> {m.city}{m.zone && m.zone !== m.city ? ` · ${m.zone}` : ""}</span>
            <h1 className="m-0 text-[clamp(38px,5vw,54px)] leading-[1.02]">{m.name}</h1>
            <span className="text-[16px] p-muted">{m.role}{m.org ? ` · ${m.org}` : ""}</span>
            {m.status !== "member" && <span className="p-pill self-start mt-1">{m.status === "admin" ? "Équipe Présence" : "Organisateur"}</span>}
          </div>
          {m.intention && <p className="m-0 serif italic text-[clamp(24px,2.8vw,32px)] leading-tight">« {m.intention} »</p>}
          {m.bio && <p className="m-0 text-[16px] leading-relaxed">{m.bio}</p>}
          <div className="flex flex-wrap gap-2.5 pt-1">
            {!m.isMe && <Link to={`/messages?to=${m.id}`} className="p-btn-primary no-underline"><MessageCircle size={17} /> Écrire à {m.firstName}</Link>}
            {m.isMe && <Link to="/" className="p-btn-outline no-underline">Modifier mon profil</Link>}
            {m.linkedinUrl && <a href={m.linkedinUrl} target="_blank" rel="noopener" className="p-btn-outline no-underline"><Linkedin size={16} /> LinkedIn</a>}
          </div>
        </div>
      </article>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex-[2_1_520px] min-w-0 flex flex-col gap-6">
          {(m.ambition || m.passions.length > 0 || m.values.length > 0) && (
            <section className="p-card p-6 flex flex-col gap-5">
              {m.ambition && <div className="flex flex-col gap-1.5"><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}>Ambition</span><p className="m-0 text-[16.5px] leading-relaxed">{m.ambition}</p></div>}
              {m.values.length > 0 && <div className="flex flex-col gap-2"><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}>Valeurs</span><div className="flex flex-wrap gap-1.5">{m.values.map((v) => <span key={v} className="p-chip h-[32px] cursor-default">{v}</span>)}</div></div>}
              {m.passions.length > 0 && <div className="flex flex-col gap-2"><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}>Passions</span><div className="flex flex-wrap gap-1.5">{m.passions.map((v) => <span key={v} className="p-chip h-[32px] cursor-default border-dashed">{v}</span>)}</div></div>}
            </section>
          )}

          <section className="p-card p-6 flex flex-col gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}>Cherche ou propose</span>
            <div className="flex flex-wrap gap-1.5">
              {m.tags.map((t) => <span key={t.code} className="h-8 px-3 rounded-full text-[13px] font-medium flex items-center" style={t.offer ? { background: "var(--p-surface-2)", color: "var(--p-gold)" } : { background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{t.label}</span>)}
              {m.tags.length === 0 && <span className="text-[14px] p-muted">Rien d’indiqué pour l’instant.</span>}
            </div>
            <dl className="m-0 grid gap-2 text-[14.5px] pt-3 border-t" style={{ gridTemplateColumns: "auto 1fr", borderColor: "var(--p-line)" }}>
              {m.pole && <><dt className="p-muted">Pôle dominant</dt><dd className="m-0">{m.pole}</dd></>}
              {m.langs && <><dt className="p-muted">Langues</dt><dd className="m-0">{m.langs}</dd></>}
            </dl>
          </section>

          {m.talks.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="m-0 text-[26px] flex items-center gap-2"><Mic size={20} /> Ses talks</h2>
              {m.talks.map((t) => (
                <Link key={t.id} to="/talk-show" className="p-card p-4 flex flex-col gap-1 no-underline" style={{ color: "var(--p-ink)" }}>
                  <span className="serif text-[22px] leading-tight">{t.title}</span>
                  <span className="text-[14px] p-muted leading-relaxed">{t.summary}</span>
                  <span className="text-[12.5px] p-faint flex items-center gap-3"><span className="flex items-center gap-1"><Clock size={12} /> {t.durationMin} min</span><span className="flex items-center gap-1"><Eye size={12} /> {t.views}</span></span>
                </Link>
              ))}
            </section>
          )}
        </div>

        <aside className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
          {!m.isMe && (rel.matchGoals.length > 0 || rel.messageCount > 0) && (
            <section className="p-5 rounded-2xl flex flex-col gap-2" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--p-accent-text)" }}><Sparkles size={13} /> Votre lien</span>
              {rel.matchGoals.length > 0 && <div className="flex flex-wrap gap-1.5">{rel.matchGoals.map((g) => <span key={g} className="h-7 px-2.5 rounded-full text-[12.5px] font-medium flex items-center" style={{ background: "var(--p-surface)", color: "var(--p-accent-text)" }}>Match · {g}</span>)}</div>}
              {rel.messageCount > 0 && <span className="text-[13.5px] p-muted">{plural(rel.messageCount, "message échangé", "messages échangés")}{rel.lastMessageAt ? ` · dernier ${ago(new Date(rel.lastMessageAt))}` : ""}</span>}
            </section>
          )}

          {m.hives.length > 0 && (
            <section className="p-card p-5 flex flex-col gap-3">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}><Hexagon size={13} /> Ses ruches</span>
              {m.hives.map((h) => (
                <Link key={h.id} to={`/ruches/${h.id}`} className="flex items-center gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
                  <span className="w-10 h-10 rounded-xl flex-none" style={{ background: COVERS[h.cover] ?? COVERS.rouge }} />
                  <span className="flex flex-col min-w-0"><span className="text-[14.5px] font-medium truncate">{h.name}</span><span className="text-[12.5px] p-muted">{h.type === "projet" ? "Ruche projet" : "Communauté"} · {ROLE[h.role]}</span></span>
                </Link>
              ))}
            </section>
          )}

          {m.hosting.length > 0 && (
            <section className="p-card p-5 flex flex-col gap-3">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}><CalendarDays size={13} /> Anime prochainement</span>
              {m.hosting.map((e) => (
                <Link key={e.id} to={`/evenements?e=${e.id}`} className="flex flex-col no-underline" style={{ color: "var(--p-ink)" }}>
                  <span className="text-[14.5px] font-medium leading-snug">{e.title}</span>
                  <span className="text-[12.5px] p-muted">{longDate(new Date(e.startsAt))} · {hour(new Date(e.startsAt))} · {KIND[e.kind]}</span>
                </Link>
              ))}
            </section>
          )}

          {me.data?.isAdmin && !m.isMe && <StatusPicker memberId={m.id} status={m.status} />}
        </aside>
      </div>
    </>
  );
}
