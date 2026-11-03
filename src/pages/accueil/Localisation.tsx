import { useState } from "react";
import { Link } from "react-router";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";

// Les mêmes zones que le filtre « Ville » de l'annuaire
const ZONES = [["Paris", "Paris"], ["Lyon", "Lyon"], ["Genève", "Genève"], ["France", "Ailleurs en France"], ["International", "À l’international"]] as const;
type Zone = (typeof ZONES)[number][0];
const DOW = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Ma localisation, d'après la piste E : ma ville, puis les événements et les membres près de chez moi.
 * Sans coordonnées, « près de chez moi » veut dire la même ville, puis la même zone de l'annuaire.
 */
export default function Localisation() {
  const me = trpc.members.me.useQuery().data;
  const [editing, setEditing] = useState(false);
  if (!me) return <p className="p-muted py-20 text-center">Chargement…</p>;
  return (
    <section className="p-panel" aria-label="Ma localisation">
      <div className="p-panel-head"><h2 className="p-panel-title">Ma localisation</h2><span className="text-[13px] p-muted">Les événements et les membres près de chez vous.</span></div>
      <div className="rounded-[22px] overflow-hidden flex flex-wrap" style={{ background: "var(--p-surface-2)" }}>
        <MapArt />
        <div className="flex-[1_1_320px] min-w-0 p-6 flex flex-col gap-3 justify-center">
          <div className="flex items-start gap-3.5">
            <span className="w-11 h-11 rounded-full flex-none flex items-center justify-center" style={{ background: "var(--p-surface)", color: "var(--p-accent)" }}><MapPin size={18} /></span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="font-['Newsreader'] text-[22px] leading-tight" style={{ color: "var(--p-ink)" }}>{[me.city, me.country].filter(Boolean).join(", ") || "Votre ville n’est pas encore indiquée"}</span>
              <button type="button" className="self-start text-[12.5px] font-medium" style={{ color: "var(--p-accent-text)" }} aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Fermer" : "Modifier ma localisation"}</button>
            </span>
          </div>
          {editing && <LocationForm onDone={() => setEditing(false)} />}
          <p className="m-0 text-[12px] p-muted">Seules la ville et la zone sont visibles par les autres membres, jamais votre adresse.</p>
        </div>
      </div>
      <div className="mt-7 flex flex-wrap gap-7 items-start">
        <NearEvents city={me.city} />
        <NearMembers city={me.city} zone={me.zone} myId={me.id} />
      </div>
    </section>
  );
}

/** Une carte dessinée, sans service de cartographie : le repère au centre, les membres autour. */
function MapArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 520 230" preserveAspectRatio="xMidYMid slice" className="flex-[1_1_320px] min-h-[200px] max-h-[240px] block" style={{ background: "color-mix(in srgb, var(--p-line) 70%, var(--p-surface-2))" }}>
      <path d="M150 0 C 165 80, 140 150, 175 230" fill="none" stroke="var(--p-surface-2)" strokeWidth="10" />
      <path d="M0 175 C 140 150, 300 210, 520 120" fill="none" stroke="var(--p-surface-2)" strokeWidth="14" />
      <path d="M370 0 C 360 90, 390 160, 380 230" fill="none" stroke="var(--p-surface-2)" strokeWidth="6" />
      <circle cx="255" cy="115" r="100" fill="color-mix(in srgb, var(--p-surface) 35%, transparent)" stroke="var(--p-ink-3)" strokeDasharray="4 5" />
      {[[112, 32], [217, 84], [302, 84], [168, 152], [317, 156], [392, 204]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="11" fill="var(--p-surface)" stroke="var(--p-ink-3)" strokeWidth="1.2" />)}
      <path d="M255 60 c -14 0 -25 11 -25 25 c 0 19 25 45 25 45 s 25 -26 25 -45 c 0 -14 -11 -25 -25 -25 z" fill="var(--p-accent)" />
      <circle cx="255" cy="85" r="8" fill="var(--p-surface)" />
    </svg>
  );
}

function LocationForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery().data!;
  // Rempli une fois à l'ouverture : un rechargement du profil en arrière-plan n'efface pas la saisie
  const [f, setF] = useState<{ city: string; country: string; zone: Zone }>(() => ({ city: me.city, country: me.country, zone: (ZONES.some(([z]) => z === me.zone) ? me.zone : "France") as Zone }));
  const save = trpc.account.setLocation.useMutation({ onSuccess: () => { utils.members.invalidate(); utils.honey.invalidate(); toast.success("Localisation enregistrée"); onDone(); }, onError: (e) => toast.error(e.message) });
  const changed = f.city !== me.city || f.country !== me.country || f.zone !== me.zone;
  return (
    <form className="flex flex-col gap-3 pt-1" onSubmit={(e) => { e.preventDefault(); save.mutate(f); }}>
      <div className="flex flex-wrap gap-3">
        <label className="flex-[1_1_160px] flex flex-col gap-1.5 text-[13px] p-muted"><span>Ville</span><input className="p-field" value={f.city} maxLength={80} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Lyon" /></label>
        <label className="flex-[1_1_160px] flex flex-col gap-1.5 text-[13px] p-muted"><span>Pays</span><input className="p-field" value={f.country} maxLength={80} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="France" /></label>
      </div>
      <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
        <legend className="text-[13px] p-muted mb-2">Dans l’annuaire, je suis à</legend>
        <div className="flex flex-wrap gap-1.5">{ZONES.map(([z, l]) => <button key={z} type="button" aria-pressed={f.zone === z} className={`p-chip h-9 ${f.zone === z ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, zone: z })}>{l}</button>)}</div>
      </fieldset>
      <button type="submit" className="p-btn-primary p-btn-sm self-start" disabled={!changed || save.isPending}>Enregistrer</button>
    </form>
  );
}

/** Les événements en présentiel dans ma ville. */
function NearEvents({ city }: { city: string }) {
  const program = trpc.events.program.useQuery().data ?? [];
  const now = Date.now();
  const mine = city ? program.filter((e) => !e.cancelled && e.kind === "onsite" && new Date(e.startsAt).getTime() >= now && e.city && norm(e.city) === norm(city)).slice(0, 4) : [];
  return (
    <div className="flex-[1_1_320px] min-w-0">
      <p className="m-0 p-kicker">Près de chez vous</p>
      <p className="mt-2 mb-3 font-['Newsreader'] text-[22px]" style={{ color: "var(--p-ink)" }}>Les événements</p>
      <div className="border-t" style={{ borderColor: "var(--p-line)" }}>
        {mine.map((e) => {
          const d = new Date(e.startsAt);
          return (
            <div key={e.id} className="flex items-center gap-4 py-3 border-b" style={{ borderColor: "var(--p-line)" }}>
              <span className="w-10 flex-none flex flex-col items-center leading-none"><span className="text-[10px] uppercase tracking-[0.18em] p-muted">{DOW[d.getDay()]}</span><span className="font-['Newsreader'] text-[24px] mt-1">{d.getDate()}</span></span>
              <span className="flex-1 min-w-0"><span className="block font-['Newsreader'] text-[16px] leading-snug truncate">{e.title}</span><span className="block text-[12px] p-muted truncate">{e.where || e.city}</span></span>
              <Link to={`/e/${e.slug}`} className="h-8 px-3.5 rounded-full border text-[12.5px] flex items-center no-underline" style={{ borderColor: "var(--p-accent)", color: "var(--p-accent-text)" }}>Voir</Link>
            </div>
          );
        })}
        {!mine.length && <p className="m-0 py-4 text-[14px] p-muted">{city ? `Aucun événement en présentiel à ${city} pour l’instant.` : "Indiquez votre ville pour voir les événements près de chez vous."}</p>}
      </div>
      <Link to="/evenements" className="inline-block mt-3 text-[13px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>Tous les événements →</Link>
    </div>
  );
}

/** Les membres de ma ville, puis de ma zone de l'annuaire. */
function NearMembers({ city, zone, myId }: { city: string; zone: string; myId: number }) {
  const dir = trpc.members.directory.useQuery().data ?? [];
  const others = dir.filter((m) => m.id !== myId);
  const sameCity = city ? others.filter((m) => m.city && norm(m.city) === norm(city)) : [];
  const sameZone = others.filter((m) => m.zone === zone && !sameCity.includes(m));
  const near = [...sameCity.map((m) => ({ m, where: m.city })), ...sameZone.map((m) => ({ m, where: m.city || ZONES.find(([z]) => z === zone)?.[1] || zone }))].slice(0, 4);
  return (
    <div className="flex-[1_1_320px] min-w-0">
      <p className="m-0 p-kicker">Près de chez vous</p>
      <p className="mt-2 mb-3 font-['Newsreader'] text-[22px]" style={{ color: "var(--p-ink)" }}>Les membres</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(200px, 100%), 1fr))" }}>
        {near.map(({ m, where }) => (
          <div key={m.id} className="rounded-[18px] border p-3.5 flex flex-col gap-1.5" style={{ borderColor: "var(--p-line)" }}>
            <span className="flex items-center gap-2.5 min-w-0"><Avatar m={m} size={34} /><span className="flex flex-col min-w-0"><span className="text-[13.5px] font-medium truncate">{m.name}</span><span className="text-[11.5px] p-muted truncate">{m.jobTitle}</span></span></span>
            <span className="text-[12px] p-muted flex items-center gap-1"><MapPin size={11} /> {where}</span>
            <Link to={`/membres/${m.id}`} className="text-[12.5px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>Faire connaissance →</Link>
          </div>
        ))}
      </div>
      {!near.length && <p className="m-0 py-4 text-[14px] p-muted">Aucun membre près de chez vous pour l’instant.</p>}
      <Link to="/membres" className="inline-block mt-3 text-[13px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>Voir tous les membres →</Link>
    </div>
  );
}
