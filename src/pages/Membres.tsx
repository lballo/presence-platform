import { useState } from "react";
import { Link } from "react-router";
import { Search, MapPin, MessageCircle, Heart, Users, Sparkles } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { plural, ago } from "@/lib/format";

const ZONES = [["Toutes", "Toutes"], ["Paris", "Paris"], ["Lyon", "Lyon"], ["Genève", "Genève"], ["France", "Ailleurs en France"], ["International", "International"]];
const OPENS = [["Tous", "Tout"], ["mentorat", "Mentorat"], ["pairs", "Pairs"], ["associe", "Associé"], ["invest", "Investissement"], ["recrut", "Recrutement"], ["amitie", "Amitié"], ["parole", "Prise de parole"]];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Membres() {
  const dir = trpc.members.directory.useQuery();
  const rels = trpc.members.relations.useQuery();
  const me = trpc.members.me.useQuery();
  const [view, setView] = useState<"all" | "relations">("all");
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("Toutes");
  const [open, setOpen] = useState("Tous");
  const [selId, setSelId] = useState<number | null>(null);

  type Person = NonNullable<typeof dir.data>[number] & { reasons?: string[]; since?: Date; lastMessageAt?: Date | null };
  const relById = new Map((rels.data ?? []).map((r) => [r.id, r]));
  const source: Person[] = view === "relations" ? (rels.data ?? []) : (dir.data ?? []).map((m) => ({ ...m, ...(relById.get(m.id) ? { reasons: relById.get(m.id)!.reasons, since: relById.get(m.id)!.since, lastMessageAt: relById.get(m.id)!.lastMessageAt } : {}) }));
  const list = source.filter((m) =>
    (zone === "Toutes" || m.zone === zone) &&
    (open === "Tous" || m.tags.some((t) => t.key === open)) &&
    (!q || norm(`${m.name} ${m.role} ${m.org} ${m.city}`).includes(norm(q)))
  );
  const sel = source.find((m) => m.id === selId) ?? list[0];

  return (
    <>
      <PageHeader eyebrow="Le cercle" title="Annuaire des membres" intro="Retrouvez les leaders du réseau, leur ville et ce qu’ils cherchent : mentorat, pairs, association, investissement, recrutement, amitié ou prise de parole."
        action={<Link to="/matching" className="p-btn-outline no-underline"><Heart size={16} /> Mes affinités de la semaine</Link>} />
      <div className="flex flex-wrap gap-2 mb-5">
        <button type="button" className={`p-chip h-11 px-5 ${view === "all" ? "p-chip-on" : ""}`} onClick={() => { setView("all"); setSelId(null); }}><Users size={16} /> Tout l’annuaire</button>
        <button type="button" className={`p-chip h-11 px-5 ${view === "relations" ? "p-chip-on" : ""}`} onClick={() => { setView("relations"); setSelId(null); }}><Sparkles size={16} /> Mes relations{rels.data?.length ? ` · ${rels.data.length}` : ""}</button>
      </div>
      <section className="flex flex-col gap-3 mb-7">
        <label className="flex items-center gap-3 h-[52px] px-5 rounded-full border max-w-[620px] p-muted" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)" }}>
          <Search size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, fonction, entreprise ou ville…" className="bg-transparent outline-none w-full text-[15.5px]" style={{ color: "var(--p-ink)" }} />
        </label>
        <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] p-muted mr-1">Ville</span>{ZONES.map(([k, l]) => <button key={k} type="button" className={`p-chip h-9 ${zone === k ? "p-chip-on" : ""}`} onClick={() => setZone(k)}>{l}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] p-muted mr-1">Ouvert à</span>{OPENS.map(([k, l]) => <button key={k} type="button" className={`p-chip h-9 ${open === k ? "p-chip-on" : ""}`} onClick={() => setOpen(k)}>{l}</button>)}</div>
      </section>

      <div className="flex flex-wrap gap-8 items-start">
        <section className="flex-[3_1_520px] min-w-0 flex flex-col gap-3.5">
          <span className="text-[13.5px] p-muted">{view === "relations" ? `${plural(list.length, "relation", "relations")} · vos matchs et les membres avec qui vous échangez` : plural(list.length, "membre", "membres")}</span>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(190px, 100%), 1fr))" }}>
            {list.map((m) => {
              const tags = open !== "Tous" ? [...m.tags.filter((t) => t.key === open), ...m.tags.filter((t) => t.key !== open)] : m.tags;
              return (
                <button key={m.id} type="button" onClick={() => setSelId(m.id)} aria-pressed={sel?.id === m.id} className="p-card overflow-hidden text-left flex flex-col" style={{ borderColor: sel?.id === m.id ? "var(--p-accent)" : undefined, borderWidth: sel?.id === m.id ? 2 : 1 }}>
                  {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full aspect-square object-cover object-[50%_22%]" /> : <span className="w-full aspect-square flex items-center justify-center serif italic text-[60px]" style={{ background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{m.initials}</span>}
                  <span className="p-4 flex flex-col gap-1">
                    <span className="serif text-[23px] leading-tight">{m.name}</span>
                    <span className="text-[13px] p-muted leading-snug">{m.role}</span>
                    <span className="text-[12.5px] p-muted flex items-center gap-1"><MapPin size={12} /> {m.city}</span>
                    {!!m.reasons?.length && <span className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--p-accent-text)" }}><Sparkles size={11} /> {view === "relations" ? m.reasons[0] : "Ma relation"}{view === "relations" && m.reasons.length > 1 ? ` +${m.reasons.length - 1}` : ""}</span>}
                    <span className="flex flex-wrap gap-1 mt-1.5">
                      {tags.slice(0, 2).map((t) => <span key={t.code} className="h-6 px-2 rounded-full text-[11.5px] font-medium flex items-center" style={t.offer ? { background: "var(--p-surface-2)", color: "var(--p-gold)" } : { background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{t.label}</span>)}
                      {tags.length > 2 && <span className="h-6 px-2 rounded-full text-[11.5px] border p-muted flex items-center" style={{ borderColor: "var(--p-line-2)" }}>+{tags.length - 2}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {list.length === 0 && (view === "relations" && !rels.data?.length ? (
            <div className="p-soft p-8 text-center flex flex-col items-center gap-3">
              <span className="serif text-[26px]">Pas encore de relation</span>
              <span className="text-[14.5px] p-muted max-w-[420px]">Les membres avec qui vous avez matché, et ceux avec qui vous échangez des messages, apparaîtront ici.</span>
              <Link to="/matching" className="p-btn-primary p-btn-sm no-underline"><Heart size={15} /> Découvrir mes affinités</Link>
            </div>
          ) : <p className="p-muted text-center py-10">Aucun membre ne correspond.</p>)}
        </section>

        {sel && (
          <aside className="flex-[2_1_320px] min-w-0 p-card overflow-hidden">
            {sel.photoUrl ? <img src={sel.photoUrl} alt="" className="w-full aspect-[4/3] object-cover object-[50%_20%]" /> : <span className="w-full aspect-[4/3] flex items-center justify-center serif italic text-[96px]" style={{ background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{sel.initials}</span>}
            <div className="p-6 flex flex-col gap-3.5">
              <div><span className="p-eyebrow">{sel.city}</span><h2 className="m-0 text-[36px] leading-tight">{sel.name}</h2><span className="text-[14.5px] p-muted">{sel.role} · {sel.org}</span></div>
              <p className="m-0 text-[15px] leading-relaxed">{sel.bio}</p>
              <div className="flex flex-col gap-2"><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>Ouvert à</span><div className="flex flex-wrap gap-1.5">{sel.tags.map((t) => <span key={t.code} className="h-8 px-3 rounded-full text-[13px] font-medium flex items-center" style={t.offer ? { background: "var(--p-surface-2)", color: "var(--p-gold)" } : { background: "var(--p-pill)", color: "var(--p-accent-text)" }}>{t.label}</span>)}</div></div>
              <dl className="m-0 grid gap-2 text-[14px] py-3 border-y" style={{ gridTemplateColumns: "auto 1fr", borderColor: "var(--p-line)" }}>
                <dt className="p-muted">Pôle dominant</dt><dd className="m-0">{sel.pole}</dd>
                <dt className="p-muted">Langues</dt><dd className="m-0">{sel.langs}</dd>
              </dl>
              <div className="flex flex-wrap gap-1.5">{sel.values.map((v) => <span key={v} className="p-chip h-[30px] text-[13px] cursor-default">{v}</span>)}</div>
              {me.data && sel.values.some((v) => me.data!.values.includes(v)) && <div className="p-soft p-3.5 text-[14px]"><b>Ce qui vous rapproche : </b>{sel.values.filter((v) => me.data!.values.includes(v)).join(", ").toLowerCase()}.</div>}
              {!!sel.reasons?.length && (
                <div className="p-4 rounded-2xl flex flex-col gap-2" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--p-accent-text)" }}><Sparkles size={13} /> Votre relation</span>
                  <div className="flex flex-wrap gap-1.5">{sel.reasons.map((r) => <span key={r} className="h-7 px-2.5 rounded-full text-[12.5px] font-medium flex items-center" style={{ background: "var(--p-surface)", color: "var(--p-accent-text)" }}>{r}</span>)}</div>
                  <span className="text-[13px] p-muted">{sel.since ? `En relation depuis ${ago(new Date(sel.since)).replace("il y a ", "")}` : ""}{sel.lastMessageAt ? ` · dernier message ${ago(new Date(sel.lastMessageAt))}` : ""}</span>
                </div>
              )}
              {me.data?.id !== sel.id && <div className="flex gap-2.5 pt-1"><Link to={`/messages?to=${sel.id}`} className="p-btn-primary flex-1 no-underline"><MessageCircle size={16} /> Écrire à {sel.firstName}</Link></div>}
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
