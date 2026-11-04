// Les morceaux de l'ancien tableau de bord, repris par l'accueil (src/pages/accueil) : bandeau coaching,
// Miracle Routine, candidature organisateur, formulaire du profil.
import { useState } from "react";
import { Link } from "react-router";
import { CalendarPlus, Check, Compass, Lock, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { longDate, hour, addMin, monthAbr, dayNum } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { useUpload } from "@/lib/upload";
import { PROFILE_PROMPT } from "@/content/accueil";

const PREFS: [string, string][] = [["f", "Une femme"], ["m", "Un homme"], ["all", "Peu importe"]];

// Lien vers l’application (Google Play) : VITE_MIRACLE_ROUTINE_URL dans .env, sinon lien neutre.
const MIRACLE_ROUTINE_URL: string = import.meta.env.VITE_MIRACLE_ROUTINE_URL || "#";

export function MiracleRoutine() {
  const steps = [["Respiration carrée", "3 min", true], ["Intention du jour", "2 min", false]] as const;
  return (
    <section aria-label="Mes rituels avec Miracle Routine" className="rounded-[28px] overflow-hidden flex flex-wrap items-stretch gap-x-12" style={{ background: "#1A1A1A", color: "#E8DDD6", padding: "clamp(24px,3.4vw,34px) clamp(22px,3.4vw,40px) 0" }}>
      <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-3.5" style={{ paddingBottom: "clamp(24px,3.4vw,34px)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#AFA098" }}>Mes rituels</span>
        <h2 className="m-0 font-['Newsreader'] font-normal text-[clamp(28px,3vw,34px)] leading-[1.1] tracking-[-0.02em]" style={{ color: "#FFFFFF" }}>Miracle Routine, <em className="font-light" style={{ color: "#E8DDD6" }}>vos rituels partout avec vous</em></h2>
        <p className="m-0 max-w-[520px] text-[14px] leading-relaxed">Des routines guidées pour le matin, le soir ou juste avant une prise de parole, avec une alarme pour chaque rituel.</p>
        <a href={MIRACLE_ROUTINE_URL} target={MIRACLE_ROUTINE_URL === "#" ? undefined : "_blank"} rel="noopener" className="self-start inline-flex items-center gap-2.5 h-11 px-5 rounded-full text-[14px] font-medium no-underline" style={{ background: "#A83932", color: "#FFFFFF" }}><Play size={14} fill="currentColor" /> Télécharger sur Google Play</a>
        <p className="m-0 text-[12px]" style={{ color: "#AFA098" }}>Bientôt, les rituels réalisés dans l’application apparaîtront ici et dans Ma progression.</p>
      </div>
      <div aria-hidden="true" className="flex-[0_1_220px] min-w-[200px] flex items-end justify-center">
        <div className="w-[200px] rounded-t-[26px] border border-b-0 p-2 pb-0" style={{ borderColor: "#4A3B30", background: "#2A211B" }}>
          <div className="rounded-t-[20px] p-4 flex flex-col gap-2 min-h-[190px]" style={{ background: "#F3ECE8", color: "#1A1A1A" }}>
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#A83932" }}>Routine du matin</span>
            <span className="font-['Newsreader'] text-[19px] leading-tight">Bien démarrer la journée</span>
            <div className="flex flex-col gap-1.5 mt-2">
              {steps.map(([t, d, done]) => (
                <span key={t} className="flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-full" style={{ background: "#FFFFFF" }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-none" style={done ? { background: "#A83932" } : { border: "1px solid #AFA098" }} />
                  <span className="flex-1">{t}</span><span style={{ color: "#6E6557" }}>{d}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type Me = RouterOutputs["members"]["me"];

/** Statut organisateur : candidature depuis l'espace membre. */
export function OrganizerCard({ me }: { me: Me }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [motivation, setMotivation] = useState("");
  const apply = trpc.members.requestOrganizer.useMutation({ onSuccess: () => { utils.members.me.invalidate(); setOpen(false); toast.success("Candidature envoyée à l’équipe Présence"); }, onError: (e) => toast.error(e.message) });
  const cancel = trpc.members.cancelOrganizerRequest.useMutation({ onSuccess: () => utils.members.me.invalidate() });
  if (!me.permissions.applyOrganizer && me.memberRole !== "organisateur") return null;
  if (me.memberRole === "organisateur")
    return (
      <section className="p-soft p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="p-pill">Organisatrice·eur</span>
        <span className="flex-1 text-[14px] p-muted">Vous pouvez créer, modifier et supprimer vos événements dans le programme du cercle.</span>
        <Link to="/evenements" className="p-btn-outline p-btn-sm no-underline">Créer un événement</Link>
      </section>
    );
  if (me.organizerRequestedAt)
    return (
      <section className="p-soft p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="flex-1 text-[14px]"><b>Candidature organisateur envoyée</b> <span className="p-muted">· l’équipe Présence vous répond prochainement.</span></span>
        <button type="button" className="p-btn-ghost text-[13.5px]" onClick={() => cancel.mutate()}>Retirer ma candidature</button>
      </section>
    );
  return (
    <section className="p-soft p-4 mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 min-w-[240px] text-[14px]"><b>Envie d’animer des rencontres ?</b> <span className="p-muted">Les organisateurs créent et gèrent leurs propres événements dans le programme du cercle.</span></span>
        {!open && <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setOpen(true)}>Devenir organisateur</button>}
      </div>
      {open && (
        <div className="flex flex-col gap-2.5">
          <textarea className="p-field" rows={3} value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="Quels événements aimeriez-vous organiser, et pour qui ?" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="p-btn-primary p-btn-sm" disabled={motivation.trim().length < 10 || apply.isPending} onClick={() => apply.mutate({ motivation })}>Envoyer ma candidature</button>
            <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProfileEditor({ me, onDone }: { me: Me; onDone: () => void }) {
  const utils = trpc.useUtils();
  const save = trpc.members.updateProfile.useMutation({
    onSuccess: () => { utils.members.me.invalidate(); utils.members.profile.invalidate(); utils.matching.invalidate(); toast.success("Profil enregistré"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const [f, setF] = useState({
    firstName: me.firstName, lastName: me.lastName, jobTitle: me.jobTitle, city: me.city, country: me.country, photoUrl: me.photoUrl, intention: me.intention,
    bio: me.bio, ambition: me.ambition, passions: me.passions, bucketList: me.bucketList, linkedinUrl: me.linkedinUrl,
    values: me.values, intents: me.intents, langs: me.langs, visibleInDirectory: me.visibleInDirectory,
    rencontreEnabled: me.rencontreEnabled, rencontrePref: me.rencontrePref as "f" | "m" | "all",
  });
  const [newValue, setNewValue] = useState("");
  const [newPassion, setNewPassion] = useState("");
  const addPassion = () => {
    const v = newPassion.trim();
    if (!v || f.passions.length >= 8 || f.passions.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set({ passions: [...f.passions, v[0].toUpperCase() + v.slice(1)] }); setNewPassion("");
  };
  const [newWish, setNewWish] = useState("");
  const addWish = () => {
    const v = newWish.trim();
    if (!v || f.bucketList.length >= 8 || f.bucketList.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set({ bucketList: [...f.bucketList, v[0].toUpperCase() + v.slice(1)] }); setNewWish("");
  };
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const addValue = () => {
    const v = newValue.trim();
    if (!v || f.values.length >= 5 || f.values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set({ values: [...f.values, v[0].toUpperCase() + v.slice(1)] }); setNewValue("");
  };
  const avatar = useUpload("avatar");
  const pickPhoto = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1048576) return void toast.error("La photo dépasse 5 Mo.");
    try { set({ photoUrl: (await avatar.upload(file)).publicUrl }); } catch (e) { toast.error(e instanceof Error ? e.message : "Envoi impossible"); }
  };
  const full = f.intents.length >= 3;
  const linkedinOk = !f.linkedinUrl.trim() || /^https?:\/\/([\w-]+\.)?linkedin\.com\/\S+$/i.test(f.linkedinUrl.trim());

  return (
    <article className="p-card p-6 sm:p-8 flex flex-col gap-5 mb-6" style={{ borderColor: "var(--p-accent-line)" }}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><span className="p-eyebrow">Mon profil</span><h2 className="text-[32px] m-0">Modifier mon profil</h2></div>
        <span className="text-[13.5px] p-muted">Ces informations sont visibles par les membres du cercle.</span>
      </div>
      {!(me.photoUrl && me.jobTitle && me.city && me.bio) && <p className="m-0 p-3 rounded-xl text-[14px]" style={{ background: "var(--p-accent-soft)" }}>{PROFILE_PROMPT}</p>}
      <div className="flex flex-wrap items-center gap-3.5">
        <Avatar m={{ initials: me.initials, photoUrl: f.photoUrl }} size={72} />
        <label className="p-btn-outline p-btn-sm cursor-pointer">
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choisir ma photo" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          {avatar.busy ? `Envoi… ${avatar.progress ?? 0} %` : f.photoUrl ? "Changer ma photo" : "Ajouter ma photo"}
        </label>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Prénom</span><input className="p-field" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Nom</span><input className="p-field" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Fonction</span><input className="p-field" value={f.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ville</span><input className="p-field" value={f.city} onChange={(e) => set({ city: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Pays</span><input className="p-field" value={f.country} onChange={(e) => set({ country: e.target.value })} placeholder="Ex. France" /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Mon intention</span><textarea className="p-field" rows={2} value={f.intention} onChange={(e) => set({ intention: e.target.value })} /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ma bio <span className="p-faint">· votre parcours et ce qui vous anime, en quelques lignes</span></span><textarea className="p-field" rows={4} maxLength={1500} value={f.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Ex. Vingt ans dans l’industrie, dont dix à diriger des équipes de production. J’aime faire grandir les gens et les projets qui ont du sens." /><span className="p-faint text-[12px] self-end">{f.bio.length} / 1500</span></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Mon ambition <span className="p-faint">· ce que vous voulez accomplir, pour vous ou votre organisation</span></span><textarea className="p-field" rows={2} value={f.ambition} onChange={(e) => set({ ambition: e.target.value })} placeholder="Ex. Prendre la direction générale d’ici trois ans, en gardant une équipe soudée." /></label>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Mon profil LinkedIn</span><input className="p-field" type="url" value={f.linkedinUrl} onChange={(e) => set({ linkedinUrl: e.target.value })} placeholder="https://www.linkedin.com/in/votre-nom" />{!linkedinOk && <span className="text-[12.5px]" style={{ color: "var(--p-accent-text)" }}>Collez l’adresse de votre profil, par exemple https://www.linkedin.com/in/votre-nom</span>}</label>
      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] p-muted">Mes passions <span className="p-faint">· huit au maximum</span></span>
        <div className="flex flex-wrap items-center gap-2">
          {f.passions.map((v) => (
            <button key={v} type="button" className="p-chip h-[34px] border-dashed" onClick={() => set({ passions: f.passions.filter((x) => x !== v) })} title="Retirer">{v} ×</button>
          ))}
          {f.passions.length < 8 && (
            <span className="flex items-center gap-1.5">
              <input className="p-field h-[34px] w-[180px] py-0" value={newPassion} onChange={(e) => setNewPassion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPassion(); } }} placeholder="Ex. Randonnée, jazz…" />
              <button type="button" className="p-btn-ghost text-[13px]" onClick={addPassion}>Ajouter</button>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] p-muted">Ma bucket list <span className="p-faint">· un désir, un rêve à réaliser, un lieu à découvrir : huit au maximum</span></span>
        <div className="flex flex-wrap items-center gap-2">
          {f.bucketList.map((v) => (
            <button key={v} type="button" className="p-chip h-[34px] border-dashed" onClick={() => set({ bucketList: f.bucketList.filter((x) => x !== v) })} title="Retirer">{v} ×</button>
          ))}
          {f.bucketList.length < 8 && (
            <span className="flex items-center gap-1.5">
              <input className="p-field h-[34px] w-[240px] max-w-full py-0" maxLength={80} value={newWish} onChange={(e) => setNewWish(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWish(); } }} placeholder="Ex. Voir les aurores boréales" aria-label="Ajouter à ma bucket list" />
              <button type="button" className="p-btn-ghost text-[13px]" onClick={addWish}>Ajouter</button>
            </span>
          )}
        </div>
      </div>

      <section className="pf-values flex flex-col gap-3.5" aria-labelledby="pf-values-title">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="pf-values-title" className="pf-h3 text-[17px]" style={{ fontWeight: 600 }}>Mes valeurs</h3>
          <span className="text-[14px] p-muted">{f.values.length} sur 5</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {f.values.map((v) => (
            <span key={v} className="pf-tag">{v}<button type="button" className="pf-tag-x" aria-label={`Retirer ${v}`} onClick={() => set({ values: f.values.filter((x) => x !== v) })}><X size={12} strokeWidth={1.8} aria-hidden="true" /></button></span>
          ))}
          {f.values.length < 5 && (
            <span className="pf-tag pf-tag-add">
              <input className="pf-add-input" value={newValue} aria-label="Nouvelle valeur" onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(); } }} placeholder="Ajouter une valeur" maxLength={40} />
              <button type="button" className="pf-add-btn" aria-label="Ajouter la valeur" onClick={addValue}><Plus size={14} strokeWidth={1.9} aria-hidden="true" /></button>
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="pf-intents-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5 max-w-[520px]">
            <h3 id="pf-intents-title" className="pf-h3 text-[22px]" style={{ fontWeight: 700 }}>Ce que je cherche ou propose</h3>
            <p className="m-0 text-[15px] leading-normal p-muted">Ces choix apparaissent dans l’annuaire et règlent les profils que vous propose le Matching.</p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className="flex gap-1.5" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={`pf-bar ${i < f.intents.length ? "pf-bar-on" : ""}`} />)}</span>
            <span className="text-[14px] font-medium" style={{ color: "var(--p-accent-text)" }} aria-live="polite">{full ? "3 sur 3 · retirez-en un pour changer" : `${f.intents.length} sur 3 · encore ${3 - f.intents.length} choix possible${3 - f.intents.length > 1 ? "s" : ""}`}</span>
          </div>
        </div>
        <div className="pf-intents">
          {me.intentGroups.map((g) => (
            <div key={g.key} className="pf-intent-row" role="group" aria-label={g.label}>
              <span className="pf-intent-label">{g.label}</span>
              <div className="flex flex-wrap gap-2.5">
                {g.options.map(([code, label]) => {
                  const on = f.intents.includes(code);
                  const dis = !on && full;
                  return (
                    <button key={code} type="button" disabled={dis} aria-pressed={on} className={`pf-chip ${on ? "pf-chip-on" : dis ? "pf-chip-off" : ""}`}
                      onClick={() => set({ intents: on ? f.intents.filter((x) => x !== code) : [...f.intents, code] })}>
                      {on && <Check size={14} strokeWidth={2} aria-hidden="true" />}{label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pf-rencontre" aria-labelledby="pf-renc-title">
        <div className="pf-renc-head">
          <button type="button" role="switch" aria-checked={f.rencontreEnabled} aria-labelledby="pf-renc-title" className={`pf-switch ${f.rencontreEnabled ? "pf-switch-on" : ""}`} onClick={() => set({ rencontreEnabled: !f.rencontreEnabled })}><span className="pf-knob" /></button>
          <div className="pf-renc-title flex flex-wrap items-center gap-2.5">
            <h3 id="pf-renc-title" className="pf-h3 text-[18px]" style={{ fontWeight: 700, color: "inherit" }}>Espace Rencontre</h3>
            <span className="pf-private"><Lock size={12} strokeWidth={1.6} aria-hidden="true" />Privé</span>
          </div>
          <p className="pf-renc-text m-0 text-[15px] leading-[1.55]" style={{ color: "#D6CBC2" }}>Pour faire aussi une rencontre amoureuse, dans un espace séparé du Matching. Ce choix n’apparaît jamais dans l’annuaire ni sur votre profil, et vous ne voyez que les membres qui l’ont aussi activé.</p>
          <span aria-hidden="true" className="pf-heart hidden sm:flex">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 30.5C9 26 4.5 21.6 4.5 16.4 4.5 13 7.1 10.5 10.3 10.5c2 0 3.7 1 4.7 2.6 1-1.6 2.7-2.6 4.7-2.6 3.2 0 5.8 2.5 5.8 5.9 0 5.2-4.5 9.6-10.5 14.1z" /><path d="M26.4 13.2c.9-.9 2.1-1.4 3.4-1.4 2.9 0 5.2 2.3 5.2 5.3 0 4.7-4.1 8.6-9.5 12.7-1.2-.9-2.3-1.8-3.4-2.7" stroke="#E0D3BD" /></svg>
          </span>
        </div>
        {f.rencontreEnabled && (
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 sm:pl-[70px]">
            <span id="pf-who" className="text-[15px]" style={{ color: "#E0D3BD" }}>Je souhaite rencontrer</span>
            <div role="radiogroup" aria-labelledby="pf-who" className="pf-seg-group">
              {PREFS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={f.rencontrePref === v} className={`pf-seg ${f.rencontrePref === v ? "pf-seg-on" : ""}`} onClick={() => set({ rencontrePref: v as "f" | "m" | "all" })}>{l}</button>)}
            </div>
          </div>
        )}
      </section>

      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Langues</span><input className="p-field" value={f.langs} onChange={(e) => set({ langs: e.target.value })} /></label>
      <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={f.visibleInDirectory} onChange={(e) => set({ visibleInDirectory: e.target.checked })} className="w-[18px] h-[18px]" style={{ accentColor: "var(--p-accent)" }} /><span>Apparaître dans l’annuaire des membres</span></label>

      <div className="flex flex-wrap justify-end gap-2.5 pt-4 border-t" style={{ borderColor: "var(--p-line)" }}>
        <button type="button" className="p-btn-outline" onClick={onDone}>Annuler</button>
        <button type="button" className="p-btn-primary" disabled={save.isPending || !f.firstName.trim() || !linkedinOk} onClick={() => save.mutate({ ...f, intents: f.intents as Parameters<typeof save.mutate>[0]["intents"] })}>Enregistrer</button>
      </div>
    </article>
  );
}

export function CoachingBand({ c }: { c: RouterOutputs["dashboard"]["coaching"] }) {
  const n = c.isCoached ? c.next : null;
  const url = (c.isCoached ? c.calendlyUrl : c.calendlyExploUrl) || "#";
  const d = n ? new Date(n.startsAt) : null;
  return (
    <section className="p-band rounded-[26px] flex flex-wrap items-center gap-x-8 gap-y-4 px-6 sm:px-7 py-5 mb-6" aria-label={c.isCoached ? "Mon prochain coaching" : "Accompagnement individuel"}>
      {d && (
        <span className="flex-none w-14 flex flex-col items-center leading-none text-white/70">
          <span className="text-[10px] uppercase tracking-[0.18em]">{longDate(d).slice(0, 3)}</span>
          <span className="font-['Newsreader'] text-[34px] text-white mt-1">{dayNum(d)}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] mt-1">{monthAbr(d)}</span>
        </span>
      )}
      {!c.isCoached && <span className="flex-none w-12 h-12 rounded-full flex items-center justify-center border border-white/20" style={{ color: "var(--p-gold-bright)" }}><Compass size={22} strokeWidth={1.4} /></span>}
      <span className="flex-[1_1_280px] min-w-0 flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">{c.isCoached ? "Mon prochain coaching" : "Accompagnement individuel"}</span>
        <span className="font-['Newsreader'] text-[26px] leading-[1.2] text-white">{c.isCoached ? (n ? n.title : "Votre prochaine séance est à réserver") : "Réservez votre session exploratoire"}</span>
        <span className="text-[13px] text-white/75">{n && d ? `${hour(d)} – ${hour(addMin(d, n.durationMin))} · ${n.format.toLowerCase()} avec Laura Ballo` : c.isCoached ? "Avec Laura Ballo" : "Un premier échange de 30 minutes en visio avec Laura, pour voir si un accompagnement vous correspond."}</span>
      </span>
      {c.isCoached && c.total > 0 && <span className="flex-[0_1_200px] text-white/80"><span className="font-['Newsreader'] text-[38px] text-white">{c.remaining}</span> <span className="text-[13px]">séance{c.remaining > 1 ? "s" : ""} restante{c.remaining > 1 ? "s" : ""}</span></span>}
      <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-[14px] font-medium no-underline flex-none" style={{ background: "#F3ECE8", color: "#1A1A1A" }}><CalendarPlus size={16} /> {c.isCoached ? "Réserver une séance" : "Réserver ma session exploratoire"}</a>
    </section>
  );
}
