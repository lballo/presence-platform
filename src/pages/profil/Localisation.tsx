import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";

// Les mêmes zones que le filtre « Ville » de l'annuaire
const ZONES = [["Paris", "Paris"], ["Lyon", "Lyon"], ["Genève", "Genève"], ["France", "Ailleurs en France"], ["International", "À l’international"]] as const;
type Zone = (typeof ZONES)[number][0];

/** Ma localisation : ma ville, mon pays, et la zone qui me range dans l'annuaire. */
export default function Localisation() {
  const utils = trpc.useUtils();
  const me = trpc.members.me.useQuery().data;
  const [f, setF] = useState<{ city: string; country: string; zone: Zone }>({ city: "", country: "", zone: "France" });
  useEffect(() => { if (me) setF({ city: me.city, country: me.country, zone: (ZONES.some(([z]) => z === me.zone) ? me.zone : "France") as Zone }); }, [me]);
  const save = trpc.account.setLocation.useMutation({ onSuccess: () => { utils.members.invalidate(); utils.honey.invalidate(); toast.success("Localisation enregistrée"); }, onError: (e) => toast.error(e.message) });
  if (!me) return <p className="p-muted py-20 text-center">Chargement…</p>;
  const changed = f.city !== me.city || f.country !== me.country || f.zone !== me.zone;
  return (
    <>
      <PageHeader eyebrow="Mon profil" title="Ma localisation" intro="Votre ville apparaît sur votre profil et sert au filtre de l’annuaire, pour que les membres proches de vous vous trouvent." />
      <form className="p-card p-6 flex flex-col gap-4 max-w-[640px]" onSubmit={(e) => { e.preventDefault(); save.mutate(f); }}>
        <div className="flex flex-wrap gap-4">
          <label className="flex-[1_1_220px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ville</span><input className="p-field" value={f.city} maxLength={80} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Lyon" /></label>
          <label className="flex-[1_1_220px] flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Pays</span><input className="p-field" value={f.country} maxLength={80} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="France" /></label>
        </div>
        <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
          <legend className="text-[13.5px] p-muted mb-2">Dans l’annuaire, je suis à</legend>
          <div className="flex flex-wrap gap-2">{ZONES.map(([z, l]) => <button key={z} type="button" aria-pressed={f.zone === z} className={`p-chip h-10 ${f.zone === z ? "p-chip-on" : ""}`} onClick={() => setF({ ...f, zone: z })}>{l}</button>)}</div>
        </fieldset>
        <p className="m-0 text-[13.5px] p-muted flex items-center gap-1.5"><MapPin size={14} /> {me.visibleInDirectory ? "Votre profil est visible dans l’annuaire." : "Votre profil est masqué dans l’annuaire : seule votre fiche montre votre ville."}</p>
        <button type="submit" className="p-btn-primary self-start" disabled={!changed || save.isPending}>Enregistrer</button>
      </form>
    </>
  );
}
