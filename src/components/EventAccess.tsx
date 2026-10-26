import { MapPin, Video, Lock, ExternalLink } from "lucide-react";

type Ev = { kind: string; address: string; meetingUrl: string; hasAccessInfo: boolean };

/** Adresse ou lien visio : affichés aux inscrits, masqués pour les autres. */
export function AccessInfo({ e, compact }: { e: Ev; compact?: boolean }) {
  const onsite = e.kind === "onsite";
  if (onsite && e.address)
    return <span className={`flex items-start gap-1.5 ${compact ? "text-[13px]" : "text-[14.5px]"}`}><MapPin size={15} className="flex-none mt-0.5" style={{ color: "var(--p-accent-text)" }} /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`} target="_blank" rel="noopener" className="p-link">{e.address}</a></span>;
  if (!onsite && e.meetingUrl)
    return <a href={e.meetingUrl} target="_blank" rel="noopener" className={`${compact ? "p-btn-outline p-btn-sm" : "p-btn-outline"} no-underline self-start`}><Video size={15} /> Rejoindre la visio <ExternalLink size={13} /></a>;
  if (!e.hasAccessInfo) return null;
  return <span className={`flex items-center gap-1.5 p-muted ${compact ? "text-[12.5px]" : "text-[13.5px]"}`}><Lock size={13} /> {onsite ? "L’adresse exacte est communiquée aux personnes inscrites." : "Le lien de la visio est communiqué aux personnes inscrites."}</span>;
}

/** Champs « adresse » ou « lien visio » des formulaires de création d’événement. */
export function AccessFields({ kind, city, address, meetingUrl, onChange }: { kind: string; city: string; address: string; meetingUrl: string; onChange: (p: { city?: string; address?: string; meetingUrl?: string }) => void }) {
  if (kind === "onsite")
    return (
      <div className="flex flex-wrap gap-3">
        <label className="flex-[1_1_160px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ville</span><input className="p-field" value={city} onChange={(e) => onChange({ city: e.target.value })} placeholder="Ex. Lyon" /></label>
        <label className="flex-[2_1_260px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Adresse exacte <span className="p-faint">· visible des inscrits uniquement</span></span><input className="p-field" value={address} onChange={(e) => onChange({ address: e.target.value })} placeholder="Ex. 12 rue Mercière, 69002 Lyon" /></label>
      </div>
    );
  return (
    <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Lien de la visio <span className="p-faint">· visible des inscrits uniquement</span></span><input className="p-field" type="url" value={meetingUrl} onChange={(e) => onChange({ meetingUrl: e.target.value })} placeholder="https://zoom.us/j/… ou https://meet.google.com/…" /></label>
  );
}

export const accessReady = (kind: string, address: string, meetingUrl: string) => (kind === "onsite" ? !!address.trim() : /^https?:\/\/\S+$/.test(meetingUrl.trim()));
