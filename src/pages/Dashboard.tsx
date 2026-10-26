import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Pencil, CalendarPlus, ExternalLink, ChevronLeft, ChevronRight, ArrowRight, Compass, Check, Play, Info } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { longDate, hour, addMin, iso, monthTitle, plural, monthAbr, dayNum } from "@/lib/format";

const PREFS: [string, string][] = [["f", "Une femme"], ["m", "Un homme"], ["all", "Peu importe"]];

export default function Dashboard() {
  const me = trpc.members.me.useQuery();
  const coaching = trpc.dashboard.coaching.useQuery();
  const news = trpc.dashboard.news.useQuery();
  const [editing, setEditing] = useState(false);
  const today = new Date();

  return (
    <>
      <header className="flex flex-col gap-3 mb-8">
        <span className="p-eyebrow">{longDate(today)}</span>
        <h1 className="text-[clamp(38px,5vw,56px)] leading-[1.05] m-0">Bonjour {me.data?.firstName ?? ""}</h1>
        <p className="m-0 text-[17px] p-muted">Votre semaine en un coup d’œil.</p>
      </header>

      {me.data && (editing ? <ProfileEditor me={me.data} onDone={() => setEditing(false)} /> : <ProfileCard me={me.data} onEdit={() => setEditing(true)} />)}

      {me.data && !editing && <OrganizerCard me={me.data} />}

      {coaching.data && <CoachingBand c={coaching.data} />}

      <Agenda />

      <section className="mt-9">
        <span className="p-eyebrow">Cette semaine dans Présence</span>
        <h2 className="text-[clamp(28px,3.4vw,36px)] mt-1 mb-4">Ce qui se passe dans le cercle</h2>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
          {news.data?.map((n, i) => (
            <Link key={i} to={n.href} className="p-card flex gap-4 items-start p-5 no-underline" style={{ color: "var(--p-ink)" }}>
              {n.photoUrl ? <img src={n.photoUrl} alt="" className="p-avatar" style={{ width: 52, height: 52 }} /> : <span className="p-initials" style={{ width: 52, height: 52, fontSize: 18 }}>{n.cat[0]}</span>}
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>{n.cat}</span>
                <span className="text-[16px] font-semibold leading-snug">{n.title}</span>
                <span className="text-[13.5px] p-muted leading-relaxed">{n.sub}</span>
              </span>
              <ArrowRight size={16} className="p-faint mt-1 flex-none" />
            </Link>
          ))}
        </div>
      </section>

      <MiracleRoutine />
    </>
  );
}

// Lien vers l’application (Google Play) : VITE_MIRACLE_ROUTINE_URL dans .env, sinon lien neutre.
const MIRACLE_ROUTINE_URL: string = import.meta.env.VITE_MIRACLE_ROUTINE_URL || "#";

function MiracleRoutine() {
  const steps = [["Respiration carrée", "3 min", true], ["Intention du jour", "2 min", false], ["Ancrage des pieds", "3 min", false]] as const;
  return (
    <section aria-label="Mes rituels avec Miracle Routine" className="mt-9 rounded-3xl border overflow-hidden flex flex-wrap items-stretch gap-x-12" style={{ borderColor: "var(--p-line)", background: "var(--p-surface-2)", padding: "clamp(24px,4vw,44px) clamp(24px,4vw,48px) 0" }}>
      <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-4" style={{ paddingBottom: "clamp(24px,4vw,44px)" }}>
        <span className="p-eyebrow">Mes rituels</span>
        <h2 className="m-0 text-[clamp(30px,3.4vw,40px)] leading-[1.1]">Miracle Routine, vos rituels partout avec vous.</h2>
        <p className="m-0 max-w-[560px] text-[15.5px] leading-relaxed p-muted">Des routines guidées pour le matin, le soir ou juste avant une prise de parole, avec une alarme pour chaque rituel.</p>
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5 text-[15px]">
          {["Une alarme pour chaque rituel", "Un catalogue de routines et d’exercices guidés", "Vos routines favorites et celles que vous créez"].map((t) => <li key={t} className="flex items-center gap-2.5"><Check size={16} className="flex-none" style={{ color: "var(--p-accent-text)" }} /> {t}</li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
          <a href={MIRACLE_ROUTINE_URL} target={MIRACLE_ROUTINE_URL === "#" ? undefined : "_blank"} rel="noopener" className="p-btn-primary no-underline gap-3 pl-5 pr-6"><Play size={18} fill="currentColor" /><span className="flex flex-col leading-[1.15] text-left"><span className="text-[11px] opacity-70">Télécharger sur</span><span className="text-[16px] font-semibold">Google Play</span></span></a>
          <span className="text-[13.5px] p-muted">Application Android</span>
        </div>
        <p className="m-0 flex items-start gap-2 text-[13.5px] p-muted leading-relaxed"><Info size={15} className="flex-none mt-0.5" /><span>Bientôt, les rituels que vous réalisez dans l’application apparaîtront ici et dans Mon parcours.</span></p>
      </div>
      <div aria-hidden="true" className="flex-[0_1_300px] min-w-[240px] flex items-end justify-center">
        <div className="w-[240px] rounded-t-[32px] border border-b-0 p-2 pb-0 shadow-xl" style={{ borderColor: "var(--p-line-2)", background: "var(--p-ink)" }}>
          <div className="rounded-t-[24px] p-4 flex flex-col gap-2 min-h-[280px]" style={{ background: "var(--p-surface)" }}>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--p-gold)" }}>Routine du matin</span>
            <span className="serif text-[22px] leading-tight">Bien démarrer la journée</span>
            <span className="text-[12px] p-muted">12 min · 4 exercices</span>
            <div className="flex flex-col gap-1.5 mt-2">
              {steps.map(([t, d, done]) => (
                <span key={t} className="flex items-center gap-2 text-[12.5px] px-2.5 py-2 rounded-xl" style={{ background: "var(--p-surface-2)" }}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center flex-none" style={done ? { background: "var(--p-accent)", color: "#fff" } : { border: "1.5px solid var(--p-line-2)" }}>{done && <Check size={9} strokeWidth={3.4} />}</span>
                  <span className="flex-1">{t}</span><span className="p-faint">{d}</span>
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
function OrganizerCard({ me }: { me: Me }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [motivation, setMotivation] = useState("");
  const apply = trpc.members.requestOrganizer.useMutation({ onSuccess: () => { utils.members.me.invalidate(); utils.members.organizerRequests.invalidate(); setOpen(false); toast.success("Candidature envoyée à l’équipe Présence"); }, onError: (e) => toast.error(e.message) });
  const cancel = trpc.members.cancelOrganizerRequest.useMutation({ onSuccess: () => utils.members.me.invalidate() });
  if (me.isAdmin) return null;
  if (me.isOrganizer)
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

function ProfileCard({ me, onEdit }: { me: Me; onEdit: () => void }) {
  return (
    <article className="p-card flex flex-wrap overflow-hidden mb-6">
      <div className="flex-[1_1_220px] max-w-full min-h-[280px]" style={{ background: "var(--p-surface-2)" }}>
        {me.photoUrl ? <img src={me.photoUrl} alt="" className="w-full h-full object-cover object-[50%_20%]" /> : <div className="w-full h-full flex items-center justify-center serif text-[90px] italic" style={{ color: "var(--p-accent-text)" }}>{me.initials}</div>}
      </div>
      <div className="flex-[999_1_380px] min-w-0 p-7 flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px] p-muted">{me.role} · {me.city}</span>
          <button type="button" onClick={onEdit} className="p-btn-outline p-btn-sm"><Pencil size={15} /> Modifier mon profil</button>
        </div>
        <p className="m-0 serif italic text-[clamp(26px,3vw,34px)] leading-tight">« {me.intention} »</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] p-muted mr-1">Mes valeurs</span>
          {me.values.map((v) => <span key={v} className="p-chip h-[30px] cursor-default">{v}</span>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] p-muted mr-1">Je cherche ou propose</span>
          {me.intentLabels.length === 0 && <span className="text-[13px] p-faint">Rien d’indiqué pour l’instant</span>}
          {me.intentLabels.map((t) => <span key={t.code} className="p-pill h-[30px]">{t.label}</span>)}
          {me.rencontreEnabled && <span className="p-chip h-[30px] border-dashed cursor-default p-muted text-[12.5px]">Espace Rencontre activé · visible de vous seule</span>}
          {!me.visibleInDirectory && <span className="text-[12.5px] p-faint">· profil masqué dans l’annuaire</span>}
        </div>
        <div className="mt-auto pt-4 border-t flex flex-wrap items-center justify-between gap-4" style={{ borderColor: "var(--p-line)" }}>
          <span className="text-[13.5px] p-muted">Votre parcours individuel arrive bientôt.</span>
          <Link to="/parcours" className="p-btn-outline p-btn-sm no-underline"><Compass size={15} /> Mon parcours</Link>
        </div>
      </div>
    </article>
  );
}

function ProfileEditor({ me, onDone }: { me: Me; onDone: () => void }) {
  const utils = trpc.useUtils();
  const save = trpc.members.updateProfile.useMutation({
    onSuccess: () => { utils.members.me.invalidate(); utils.matching.invalidate(); toast.success("Profil enregistré"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const [f, setF] = useState({
    firstName: me.firstName, lastName: me.lastName, role: me.role, city: me.city, intention: me.intention,
    values: me.values, intents: me.intents, langs: me.langs, visibleInDirectory: me.visibleInDirectory,
    rencontreEnabled: me.rencontreEnabled, rencontrePref: me.rencontrePref as "f" | "m" | "all",
  });
  const [newValue, setNewValue] = useState("");
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const addValue = () => {
    const v = newValue.trim();
    if (!v || f.values.length >= 5 || f.values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set({ values: [...f.values, v[0].toUpperCase() + v.slice(1)] }); setNewValue("");
  };
  const full = f.intents.length >= 3;

  return (
    <article className="p-card p-6 sm:p-8 flex flex-col gap-5 mb-6" style={{ borderColor: "var(--p-accent-line)" }}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><span className="p-eyebrow">Mon profil</span><h2 className="text-[32px] m-0">Modifier mon profil</h2></div>
        <span className="text-[13.5px] p-muted">Ces informations sont visibles par les membres du cercle.</span>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Prénom</span><input className="p-field" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Nom</span><input className="p-field" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Fonction</span><input className="p-field" value={f.role} onChange={(e) => set({ role: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Ville</span><input className="p-field" value={f.city} onChange={(e) => set({ city: e.target.value })} /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Mon intention</span><textarea className="p-field" rows={2} value={f.intention} onChange={(e) => set({ intention: e.target.value })} /></label>

      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] p-muted">Mes valeurs <span className="p-faint">· cinq au maximum</span></span>
        <div className="flex flex-wrap items-center gap-2">
          {f.values.map((v) => (
            <span key={v} className="p-chip h-9 cursor-default">{v}<button type="button" aria-label={`Retirer ${v}`} className="ml-1 p-muted" onClick={() => set({ values: f.values.filter((x) => x !== v) })}>×</button></span>
          ))}
          {f.values.length < 5 && (
            <span className="p-chip h-9 border-dashed">
              <input value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(); } }} placeholder="Ajouter une valeur" className="bg-transparent outline-none w-[130px] text-[14px]" />
              <button type="button" onClick={addValue} className="w-6 h-6 rounded-full text-white text-sm" style={{ background: "var(--p-accent)" }}>+</button>
            </span>
          )}
        </div>
      </div>

      <div className="p-soft p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold">Ce que je cherche ou propose</span>
          <span className="text-[12.5px]" style={{ color: full ? "var(--p-accent-text)" : "var(--p-ink-3)" }}>{full ? "3 sur 3 · retirez-en un pour changer" : `${f.intents.length} sur 3 au maximum`}</span>
        </div>
        <span className="text-[13px] p-muted -mt-1">Ces choix apparaissent dans l’annuaire et règlent les profils que vous propose le Matching.</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(230px, 100%), 1fr))" }}>
          {me.intentGroups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--p-gold)" }}>{g.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map(([code, label]) => {
                  const on = f.intents.includes(code);
                  const dis = !on && full;
                  return (
                    <button key={code} type="button" disabled={dis} aria-pressed={on}
                      className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border text-[13px] font-medium disabled:opacity-40"
                      style={on ? { background: "var(--p-accent-soft)", color: "var(--p-accent-text)", borderColor: "var(--p-accent)" } : { background: "var(--p-surface)", borderColor: "var(--p-line-2)" }}
                      onClick={() => set({ intents: on ? f.intents.filter((x) => x !== code) : [...f.intents, code] })}>
                      {on && "✓ "}{label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-2xl border border-dashed flex flex-col gap-2.5" style={{ borderColor: "var(--p-line-2)" }}>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={f.rencontreEnabled} onChange={(e) => set({ rencontreEnabled: e.target.checked })} className="mt-1 w-[18px] h-[18px]" style={{ accentColor: "var(--p-accent)" }} />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Activer l’espace Rencontre</span>
            <span className="text-[13px] p-muted leading-relaxed">Pour faire aussi une rencontre amoureuse, dans un espace séparé du Matching. Ce choix n’apparaît jamais dans l’annuaire ni sur votre profil, et vous ne voyez que les membres qui l’ont aussi activé.</span>
          </span>
        </label>
        {f.rencontreEnabled && (
          <div className="flex flex-wrap items-center gap-2 pl-7">
            <span className="text-[13px] p-muted">Je souhaite rencontrer</span>
            {PREFS.map(([v, l]) => <button key={v} type="button" className={`p-chip h-[34px] ${f.rencontrePref === v ? "p-chip-on" : ""}`} onClick={() => set({ rencontrePref: v as "f" | "m" | "all" })}>{l}</button>)}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-[13.5px] p-muted"><span>Langues</span><input className="p-field" value={f.langs} onChange={(e) => set({ langs: e.target.value })} /></label>
      <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={f.visibleInDirectory} onChange={(e) => set({ visibleInDirectory: e.target.checked })} className="w-[18px] h-[18px]" style={{ accentColor: "var(--p-accent)" }} /><span>Apparaître dans l’annuaire des membres</span></label>

      <div className="flex flex-wrap justify-end gap-2.5 pt-4 border-t" style={{ borderColor: "var(--p-line)" }}>
        <button type="button" className="p-btn-outline" onClick={onDone}>Annuler</button>
        <button type="button" className="p-btn-primary" disabled={save.isPending || !f.firstName.trim()} onClick={() => save.mutate({ ...f, intents: f.intents as Parameters<typeof save.mutate>[0]["intents"] })}>Enregistrer</button>
      </div>
    </article>
  );
}

function CoachingBand({ c }: { c: RouterOutputs["dashboard"]["coaching"] }) {
  if (!c.isCoached) {
    return (
      <section className="p-band flex flex-wrap items-center gap-6 lg:gap-10 p-6 sm:p-8 mb-6">
        <div className="flex-[1.5_1_380px] min-w-0 flex items-center gap-5">
          <span className="w-[88px] h-[88px] rounded-full flex-none flex items-center justify-center border border-white/20 bg-white/10" style={{ color: "var(--p-gold-bright)" }}><Compass size={34} strokeWidth={1.4} /></span>
          <span className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium uppercase tracking-[0.3em]" style={{ color: "var(--p-gold-bright)" }}>Accompagnement individuel</span>
            <span className="serif text-[clamp(28px,3vw,36px)] leading-[1.08]">Réservez votre session exploratoire</span>
            <span className="text-[14.5px] text-white/80 leading-relaxed">Un premier échange de 30 minutes en visio avec Laura, pour faire le point sur ce que vous vivez et voir si un accompagnement vous correspond.</span>
          </span>
        </div>
        <ul className="flex-[1_1_240px] min-w-0 list-none m-0 p-0 lg:pl-9 lg:border-l border-white/15 flex flex-col gap-2.5 text-[14.5px]">
          {["Faire le point sur votre situation", "Clarifier ce que vous voulez faire évoluer", "Découvrir comment se déroule un accompagnement"].map((t) => <li key={t} className="flex items-center gap-2.5"><span style={{ color: "var(--p-gold-bright)" }}>✓</span>{t}</li>)}
        </ul>
        <div className="flex-[0_1_280px] flex flex-col gap-2">
          <a href={c.calendlyExploUrl || "#"} target="_blank" rel="noopener" className="p-btn-white no-underline"><CalendarPlus size={18} /> Réserver ma session exploratoire</a>
          <span className="text-[12.5px] text-white/65 text-center flex items-center justify-center gap-1.5"><ExternalLink size={12} /> Ouvre l’agenda de Laura sur Calendly</span>
        </div>
      </section>
    );
  }
  const n = c.next;
  return (
    <section className="p-band flex flex-wrap items-center gap-6 lg:gap-10 p-6 sm:p-8 mb-6">
      <div className="flex-[1.5_1_380px] min-w-0 flex items-center gap-5">
        {n && (
          <span className="flex-none w-[88px] flex flex-col items-center py-3 rounded-2xl bg-white/10 border border-white/20 leading-none">
            <span className="text-[11.5px] uppercase tracking-wider text-white/70">{longDate(new Date(n.startsAt)).slice(0, 3)}.</span>
            <span className="serif text-[46px] mt-1">{dayNum(new Date(n.startsAt))}</span>
            <span className="text-[13px] text-white/80 mt-0.5">{monthAbr(new Date(n.startsAt))}</span>
          </span>
        )}
        <span className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[12px] font-medium uppercase tracking-[0.3em]" style={{ color: "var(--p-gold-bright)" }}>Mon prochain coaching</span>
          <span className="serif text-[clamp(28px,3vw,36px)] leading-[1.08]">{n ? n.title : "Aucune séance planifiée"}</span>
          {n && <span className="text-[14.5px] text-white/80">{longDate(new Date(n.startsAt))} · {hour(new Date(n.startsAt))} – {hour(addMin(new Date(n.startsAt), n.durationMin))} · {n.format.toLowerCase()} avec Laura Ballo</span>}
        </span>
      </div>
      <div className="flex-[1_1_240px] min-w-0 lg:pl-9 lg:border-l border-white/15 flex flex-col gap-2.5">
        <span className="flex items-baseline gap-2.5"><span className="serif text-[52px] leading-[0.9]">{c.remaining}</span><span className="text-[15.5px] font-medium">séances restantes</span></span>
        <span className="flex gap-1" role="img" aria-label={`${c.done} séances réalisées sur ${c.total}`}>
          {Array.from({ length: c.total }, (_, i) => <span key={i} className="flex-1 h-2 rounded-full" style={i < c.done ? { background: "var(--p-gold-bright)" } : i === c.done ? { border: "1.5px solid #fff" } : { background: "rgba(255,255,255,0.18)" }} />)}
        </span>
        <span className="text-[13px] text-white/70">{c.done} séances réalisées sur {c.total}{n ? ` · la prochaine sera la ${n.number}e` : ""}</span>
      </div>
      <div className="flex-[0_1_260px] flex flex-col gap-2">
        <a href={c.calendlyUrl || "#"} target="_blank" rel="noopener" className="p-btn-white no-underline"><CalendarPlus size={18} /> Réserver une séance</a>
        <span className="text-[12.5px] text-white/65 text-center flex items-center justify-center gap-1.5"><ExternalLink size={12} /> Ouvre l’agenda de Laura sur Calendly</span>
      </div>
    </section>
  );
}

const TYPES: Record<string, { label: string; bar: string }> = {
  event: { label: "Présence", bar: "var(--p-ink)" },
  salon: { label: "Salon live · Présence", bar: "var(--p-ink)" },
  ruche: { label: "Ruche", bar: "var(--p-gold)" },
  coaching: { label: "Coaching", bar: "var(--p-accent)" },
};

function Agenda() {
  const agenda = trpc.dashboard.agenda.useQuery();
  const items = agenda.data ?? [];
  const today = new Date();
  const [m, setM] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const filtered = items.filter((a) => filter === "all" || (filter === "presence" ? a.type === "event" || a.type === "salon" : a.type === filter));
  const byDay = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const a of filtered) {
      const d0 = new Date(a.startsAt);
      for (let i = 0; i < a.days; i++) { const k = iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i)); (map[k] ??= []).push(a); }
    }
    return map;
  }, [filtered]);

  const first = new Date(m.y, m.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(m.y, m.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + dim) / 7) * 7 }, (_, i) => new Date(m.y, m.m, 1 - offset + i));
  const selDay = sel ?? (filtered.find((a) => new Date(a.startsAt) >= today) ? iso(new Date(filtered.find((a) => new Date(a.startsAt) >= today)!.startsAt)) : iso(today));
  const dayItems = byDay[selDay] ?? [];
  const upcoming = filtered.filter((a) => new Date(a.startsAt) >= today).slice(0, 4);

  return (
    <section className="p-card p-5 sm:p-7 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div><h2 className="text-[28px] m-0">Mon agenda</h2><span className="text-[13.5px] p-muted">{plural(filtered.filter((a) => new Date(a.startsAt) >= today).length, "rendez-vous à venir", "rendez-vous à venir")}</span></div>
        <div className="flex flex-wrap gap-1.5">
          {[["all", "Tout"], ["presence", "Présence"], ["ruche", "Mes ruches"], ["coaching", "Coachings"]].filter(([k]) => k !== "coaching" || items.some((a) => a.type === "coaching")).map(([k, l]) => (
            <button key={k} type="button" className={`p-chip h-8 text-[13px] ${filter === k ? "p-chip-on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[2_1_480px] min-w-0">
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Mois précédent" className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--p-line)" }} onClick={() => setM(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}><ChevronLeft size={16} /></button>
            <h3 className="text-[26px] m-0">{monthTitle(m.y, m.m)}</h3>
            <button type="button" aria-label="Mois suivant" className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--p-line)" }} onClick={() => setM(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 border-t border-l" style={{ borderColor: "var(--p-line)" }}>
            {["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."].map((w) => <span key={w} className="py-2 text-center text-[12px] font-medium p-faint border-r border-b" style={{ borderColor: "var(--p-line)" }}>{w}</span>)}
            {cells.map((d) => {
              const k = iso(d); const inM = d.getMonth() === m.m; const evs = byDay[k] ?? []; const isToday = k === iso(today); const on = k === selDay;
              return (
                <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={on} className="min-h-[88px] p-1.5 border-r border-b text-left flex flex-col gap-1" style={{ borderColor: "var(--p-line)", background: on ? "var(--p-accent-soft)" : inM ? "var(--p-surface)" : "var(--p-surface-2)" }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[13px]" style={isToday ? { background: "var(--p-accent)", color: "#fff", fontWeight: 600 } : { color: inM ? "var(--p-ink)" : "var(--p-ink-3)" }}>{d.getDate()}</span>
                  {evs.slice(0, 2).map((a) => <span key={a.id} className="text-[11px] leading-tight truncate pl-1.5 border-l-2" style={{ borderColor: TYPES[a.type].bar }}>{hour(new Date(a.startsAt), true)} {a.title.split(":")[0]}</span>)}
                  {evs.length > 2 && <span className="text-[11px] p-link">+{evs.length - 2}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="flex-[1_1_260px] min-w-0 flex flex-col gap-4">
          <div className="p-soft p-4 flex flex-col gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>{longDate(new Date(selDay + "T12:00:00"))}</span>
            {dayItems.length === 0 && <span className="text-[14px] p-muted">Rien de prévu ce jour-là.</span>}
            {dayItems.map((a) => (
              <Link key={a.id} to={a.href} className="flex gap-3 no-underline" style={{ color: "var(--p-ink)" }}>
                <span className="w-1 rounded-full flex-none" style={{ background: TYPES[a.type].bar }} />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[12px] p-muted">{hour(new Date(a.startsAt))} · {TYPES[a.type].label}</span>
                  <span className="text-[15px] font-semibold leading-snug">{a.title}</span>
                  <span className="text-[12.5px] p-muted">{a.where}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>À venir</span>
            {upcoming.map((a) => (
              <button key={a.id} type="button" onClick={() => { const d = new Date(a.startsAt); setM({ y: d.getFullYear(), m: d.getMonth() }); setSel(iso(d)); }} className="flex items-center gap-3 text-left py-2 border-b" style={{ borderColor: "var(--p-line)" }}>
                <span className="w-11 flex flex-col items-center leading-none flex-none"><span className="serif text-[26px]">{new Date(a.startsAt).getDate()}</span><span className="text-[11px] p-muted">{monthAbr(new Date(a.startsAt))}</span></span>
                <span className="flex flex-col min-w-0"><span className="text-[14px] font-medium leading-snug truncate">{a.title}</span><span className="text-[12px] p-muted">{hour(new Date(a.startsAt))}</span></span>
              </button>
            ))}
          </div>
        </aside>
      </div>
      <Suggestions />
    </section>
  );
}

/** Propositions d'événements : programme Présence et événements de mes ruches, deux canaux distincts. */
function Suggestions() {
  const utils = trpc.useUtils();
  const sug = trpc.dashboard.suggestions.useQuery();
  const join = trpc.events.toggleRegistration.useMutation({
    onSuccess: (r) => { utils.dashboard.invalidate(); utils.events.invalidate(); utils.hives.invalidate(); toast.success(r.waitlist ? "Vous êtes sur liste d’attente" : "Inscription confirmée, c’est dans votre agenda"); },
    onError: (e) => toast.error(e.message),
  });
  if (!sug.data || (!sug.data.global.length && !sug.data.hive.length)) return null;
  type S = NonNullable<typeof sug.data>["global"][number];
  const Col = ({ title, sub, list, more }: { title: string; sub: string; list: S[]; more: { to: string; label: string } }) => (
    <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2"><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--p-gold)" }}>{title}</span><Link to={more.to} className="p-link text-[13px] no-underline">{more.label} →</Link></div>
      <span className="text-[12.5px] p-faint -mt-1">{sub}</span>
      {list.map((e) => (
        <div key={e.id} className="flex items-center gap-3 p-3 rounded-2xl border" style={{ borderColor: "var(--p-line)" }}>
          <span className="w-11 flex flex-col items-center leading-none flex-none"><span className="serif text-[26px]">{new Date(e.startsAt).getDate()}</span><span className="text-[11px] p-muted">{monthAbr(new Date(e.startsAt))}</span></span>
          <Link to={e.href} className="flex-1 min-w-0 flex flex-col no-underline" style={{ color: "var(--p-ink)" }}><span className="text-[14.5px] font-semibold leading-snug truncate">{e.title}</span><span className="text-[12.5px] p-muted truncate">{hour(new Date(e.startsAt))} · {e.hiveName ? `Ruche ${e.hiveName}` : e.where}</span></Link>
          <button type="button" className="p-btn-outline p-btn-sm flex-none" disabled={join.isPending} onClick={() => join.mutate({ eventId: e.id })}>Je m’inscris</button>
        </div>
      ))}
      {!list.length && <span className="text-[13.5px] p-muted py-2">Vous êtes déjà inscrite à tout ce qui arrive.</span>}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 pt-5 border-t" style={{ borderColor: "var(--p-line)" }}>
      <h3 className="m-0 text-[24px]">Pour compléter votre agenda</h3>
      <div className="flex flex-wrap gap-6">
        <Col title="Programme Présence" sub="Les événements du cercle" list={sug.data.global} more={{ to: "/evenements", label: "Tout le programme" }} />
        <Col title="Dans mes ruches" sub="Les rendez-vous des ruches dont vous êtes membre" list={sug.data.hive} more={{ to: "/ruches", label: "Mes ruches" }} />
      </div>
    </div>
  );
}
