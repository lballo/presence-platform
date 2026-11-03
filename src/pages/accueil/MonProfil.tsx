import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { CalendarPlus, ExternalLink, Linkedin, Lock } from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { ProfileEditor, OrganizerCard } from "@/pages/Dashboard";
import { MyThemeResults } from "@/components/profile/ThemeResults";
import { ReplayTour } from "@/components/onboarding/Tour";

type Me = RouterOutputs["members"]["me"];

/** Mon profil, d'après la piste E : ce que les membres voient de moi, ma personnalité, et de quoi réserver avec Laura. */
export default function MonProfil() {
  const me = trpc.members.me.useQuery();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(params.get("modifier") === "1");
  useEffect(() => { if (editing) window.scrollTo(0, 0); }, [editing]);
  if (!me.data) return <p className="p-muted py-20 text-center">Chargement…</p>;
  if (editing) return <ProfileEditor me={me.data} onDone={() => { setEditing(false); if (params.has("modifier")) setParams({}, { replace: true }); }} />;
  const m = me.data;
  return (
    <div className="flex flex-col gap-6">
      <section className="p-panel" aria-label="Mon profil">
        <div className="p-panel-head"><h2 className="p-panel-title">Mon profil</h2><span className="text-[13px] p-muted">Ce que les membres du cercle voient de vous.</span></div>
        <div className="flex flex-wrap gap-7">
          {m.photoUrl
            ? <img src={m.photoUrl} alt="Ma photo de profil" className="w-[200px] h-[250px] rounded-[20px] object-cover flex-none" style={{ objectPosition: "45% 25%" }} />
            : <span aria-hidden="true" className="w-[200px] h-[250px] rounded-[20px] flex-none flex items-center justify-center font-['Newsreader'] italic text-[72px]" style={{ background: "var(--p-surface-2)", color: "var(--p-accent-text)" }}>{m.initials}</span>}
          <div className="flex-1 min-w-[min(300px,100%)]">
            <p className="m-0 flex flex-wrap items-center gap-2.5 text-[13px]">
              {[m.jobTitle, m.org].filter(Boolean).join(" · ") || <span className="p-muted">Votre fonction</span>}
              {m.linkedinUrl && <a href={m.linkedinUrl} target="_blank" rel="noopener" aria-label="Mon profil LinkedIn" className="w-[26px] h-[26px] rounded-full border inline-flex items-center justify-center" style={{ borderColor: "var(--p-line)", color: "var(--p-ink-2)" }}><Linkedin size={12} /></a>}
            </p>
            {m.intention && <p className="mt-2 mb-0 font-['Newsreader'] italic font-light text-[26px] leading-[1.3]" style={{ color: "var(--p-ink)" }}>« {m.intention} »</p>}
            {m.bio && <p className="mt-2 mb-0 text-[14px] leading-[1.8] whitespace-pre-line">{m.bio}</p>}
            <dl className="mt-4 mb-0">
              <Row label="Mon ambition">{m.ambition ? <span className="text-[15px]">{m.ambition}</span> : <Empty />}</Row>
              <Row label="Mes valeurs"><Pills items={m.values} /></Row>
              <Row label="Mes passions"><Pills items={m.passions} /></Row>
              <Row label="Ma bucket list"><Pills items={m.bucketList} /></Row>
              <Row label="Je cherche"><Pills items={seek(m)} accent /></Row>
              <Row label="Je propose"><Pills items={offer(m)} accent /></Row>
              <Row label="Mes objectifs" note="Visible de vous seul·e"><Pills items={m.goalLabels} /></Row>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button type="button" className="h-[46px] px-6 rounded-full text-[15px] font-medium" style={{ background: "var(--p-accent)", color: "#FFFFFF" }} onClick={() => setEditing(true)}>Modifier mon profil</button>
              <ReplayTour className="p-btn-ghost" />
            </div>
          </div>
        </div>
        <div className="mt-10">
          <div className="p-panel-head mb-4"><h3 className="m-0 font-['Newsreader'] font-normal text-[24px] leading-tight" style={{ color: "var(--p-ink)" }}>Ma personnalité</h3><span className="text-[13px] p-muted">Les tests que j’ai passés, et ce qu’ils disent de moi.</span></div>
          <MyThemeResults />
        </div>
      </section>
      <Book />
      <OrganizerCard me={m} />
    </div>
  );
}

const seek = (m: Me) => m.intentLabels.filter((t) => !t.code.endsWith(":offer")).map((t) => t.label);
const offer = (m: Me) => m.intentLabels.filter((t) => t.code.endsWith(":offer")).map((t) => t.label);

function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 py-[11px]">
      <dt className="w-[190px] flex-none font-['Newsreader'] text-[19px]" style={{ color: "var(--p-ink)" }}>{label}{note && <span className="block font-sans text-[11.5px] p-faint" title={note}><Lock size={10} className="inline -mt-0.5" /> {note}</span>}</dt>
      <dd className="m-0 flex-1 min-w-[200px] flex flex-wrap gap-2">{children}</dd>
    </div>
  );
}

function Pills({ items, accent }: { items: string[]; accent?: boolean }) {
  if (!items.length) return <Empty />;
  return <>{items.map((v) => <span key={v} className="rounded-full px-4 py-[7px] text-[14px] leading-[1.3]" style={accent ? { background: "color-mix(in srgb, var(--p-accent) 8%, transparent)", color: "var(--p-accent-text)" } : { background: "var(--p-surface-2)", color: "var(--p-ink-2)" }}>{v}</span>)}</>;
}

const Empty = () => <span className="text-[14px] p-faint">À compléter</span>;

/** Réserver avec Laura : une séance pour les clients du coaching, la session exploratoire pour les autres. */
function Book() {
  const c = trpc.dashboard.coaching.useQuery().data;
  if (!c) return null;
  const url = c.isCoached ? c.calendlyUrl : c.calendlyExploUrl;
  if (!url) return null;
  return (
    <section className="p-band p-6 flex flex-wrap items-center gap-4" aria-label="Réserver avec Laura">
      <span className="flex-[1_1_260px] flex flex-col gap-1">
        <span className="font-['Newsreader'] text-[26px] leading-tight">{c.isCoached ? "Votre prochaine séance" : "Envie d’aller plus loin ?"}</span>
        <span className="text-[14px] text-white/75">{c.isCoached ? (c.total ? `${c.remaining} séance${c.remaining > 1 ? "s" : ""} restante${c.remaining > 1 ? "s" : ""} sur ${c.total}.` : "Réservez votre prochaine séance avec Laura.") : "Une session exploratoire avec Laura, pour voir si le coaching individuel vous convient."}</span>
      </span>
      <span className="flex flex-col gap-1.5">
        <a href={url} target="_blank" rel="noopener" className="p-btn-white no-underline"><CalendarPlus size={18} /> {c.isCoached ? "Réserver une séance" : "Réserver ma session exploratoire"}</a>
        <span className="text-[12px] text-white/65 flex items-center justify-center gap-1.5"><ExternalLink size={12} /> Ouvre l’agenda de Laura sur Calendly</span>
      </span>
    </section>
  );
}
