import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, CheckCircle2, Clock, Copy, Hexagon, Linkedin, Lock, Mail, MapPin, MessageCircle, PlayCircle, Settings, Sparkles, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { AccessInfo } from "@/components/EventAccess";
import { Brand } from "@/components/Layout";
import { useTheme } from "@/lib/theme";
import { HoneyToast } from "@/components/onboarding/HoneyToast";
import { eventCover } from "@/components/events/cover";
import { membershipUrl } from "@/lib/supabase";
import type { CalendarEvent } from "@/lib/calendar";
import { AddToCalendar, eventOptions } from "@/components/events/AddToCalendar";
import { addMin, parisHour, parisLongDate, plural } from "@/lib/format";
import { VideoEmbed } from "@/components/VideoEmbed";

type Ok = Extract<RouterOutputs["events"]["page"], { state: "ok" }>;
export type Ev = Ok["event"];

/** Page de destination d'un événement : ouverte sans compte si l'événement est public. */
export default function EventPage() {
  useTheme();
  const { slug = "" } = useParams();
  const { pathname } = useLocation();
  const q = trpc.events.page.useQuery({ slug }, { retry: false });
  const track = trpc.events.trackView.useMutation();
  const data = q.data;
  const confirmation = pathname.endsWith("/confirmation");
  const shown = data?.state === "ok";

  useEffect(() => {
    if (!shown) return;
    const key = `presence-vue-${slug}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* stockage indisponible */ }
    track.mutate({ slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, slug]);
  useEffect(() => { document.title = data?.state === "ok" ? `${data.event.title} · Présence` : "Présence"; return () => { document.title = "Présence"; }; }, [data]);

  const retour = `/connexion?retour=${encodeURIComponent(`/e/${slug}`)}`;
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--p-bg)" }}>
      <header className="flex items-center justify-between gap-3 h-14 px-4 sm:px-8 border-b flex-none" style={{ borderColor: "var(--p-line)" }}>
        <Link to="/" className="no-underline" style={{ color: "var(--p-ink)" }} aria-label="Présence"><Brand compact /></Link>
        {data?.connected ? <Link to="/evenements" className="p-btn-ghost no-underline"><ArrowLeft size={15} /> Les événements</Link> : data && <Link to={retour} className="p-btn-ghost no-underline">Me connecter</Link>}
      </header>
      {q.isLoading && <p className="p-muted text-center py-20 m-0">Chargement…</p>}
      {q.isError && <Message title="Page momentanément indisponible" text="Réessayez dans quelques instants." />}
      {data?.state === "introuvable" && <Message title="Cet événement n’existe pas" text="Le lien a peut-être changé. Retrouvez tous les rendez-vous du réseau sur la page Événements."><Link to="/evenements" className="p-btn-primary no-underline">Voir les événements</Link></Message>}
      {data?.state === "connexion" && <Message title="Cet événement est réservé aux membres" text="Connectez-vous pour le découvrir."><MemberLogin to={retour} /></Message>}
      {data?.state === "ruche" && <Message title={`Événement réservé aux membres de la ruche ${data.hiveName}`} text="Rejoignez la ruche pour y participer."><Link to="/ruches" className="p-btn-primary no-underline"><Hexagon size={16} /> Voir les ruches</Link></Message>}
      {data?.connected && <HoneyToast />}
      {data?.state === "ok" && (confirmation ? <Confirmation e={data.event} /> : <EventBody e={data.event} connected={data.connected} retour={retour} />)}
    </div>
  );
}

function Message({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><Lock size={22} /></span>
      <h1 className="m-0 text-[clamp(30px,5vw,42px)] leading-tight max-w-[620px]">{title}</h1>
      <p className="m-0 text-[16px] p-muted max-w-[460px]">{text}</p>
      {children}
    </main>
  );
}

function MemberLogin({ to }: { to: string }) {
  return (
    <div className="flex flex-col items-stretch gap-3 w-full max-w-[420px]">
      <Link to={to} className="p-btn-primary no-underline">Je suis membre, je me connecte</Link>
      <DiscoverBlock />
    </div>
  );
}

function DiscoverBlock() {
  const url = membershipUrl() || "mailto:contact@lauraballo.com";
  return (
    <a href={url} target={url.startsWith("http") ? "_blank" : undefined} rel="noopener" className="flex flex-col gap-1 p-4 rounded-2xl no-underline text-left" style={{ background: "var(--p-surface-2)", color: "var(--p-ink)" }}>
      <span className="flex items-center gap-1.5 text-[14.5px] font-semibold"><Sparkles size={15} style={{ color: "var(--p-accent-text)" }} /> Découvrir le réseau Présence</span>
      <span className="text-[13.5px] p-muted leading-relaxed">Le réseau des dirigeants sensibles et ambitieux. Un lieu sûr pour se retrouver, évoluer et partager ses projets.</span>
    </a>
  );
}

const formatLabel = (e: Pick<Ev, "kind" | "city" | "where">) => (e.kind === "onsite" ? `Présentiel${e.city ? ` · ${e.city}` : ""}` : e.kind === "salon" ? "Salon live en visio" : "En visio");
const location = (e: Ev) => (e.kind === "onsite" ? e.address || e.city || e.where : e.meetingUrl || "En ligne");
/** L'événement pour un agenda : l'adresse ou le lien de visio n'y sont que pour qui y a droit (inscrit, équipe). */
const forCalendar = (e: Ev): CalendarEvent => ({ title: e.title, slug: e.slug, startsAt: new Date(e.startsAt), durationMin: e.durationMin, days: e.days, location: location(e), details: e.kind !== "onsite" && e.meetingUrl ? `Lien de connexion : ${e.meetingUrl}` : undefined });
const addable = (e: Ev) => !e.past && !e.cancelled && e.status === "published";

function When({ e }: { e: Ev }) {
  const start = new Date(e.startsAt);
  return <>{parisLongDate(start)}{e.days > 1 ? ` · ${e.days} jours` : ""} · {parisHour(start)} – {parisHour(addMin(start, e.durationMin))} <span className="p-faint">(heure de Paris)</span></>;
}

function Facts({ e }: { e: Ev }) {
  const Icon = e.kind === "onsite" ? MapPin : Video;
  return (
    <dl className="m-0 grid gap-x-3 gap-y-2.5 text-[15px]" style={{ gridTemplateColumns: "20px 1fr" }}>
      <dt className="p-muted pt-0.5"><Clock size={16} /></dt>
      <dd className="m-0 flex items-start justify-between gap-2"><span className="pt-0.5"><When e={e} /></span>{addable(e) && <span className="-mt-1.5 -mr-1.5"><AddToCalendar options={eventOptions(forCalendar(e))} /></span>}</dd>
      <dt className="p-muted pt-0.5"><Icon size={16} /></dt><dd className="m-0">{formatLabel(e)}</dd>
      {e.seatsLeft !== null && <><dt className="p-muted pt-0.5"><Users size={16} /></dt><dd className="m-0">{e.seatsLeft > 0 ? plural(e.seatsLeft, "place restante", "places restantes") : "Complet · liste d’attente ouverte"}</dd></>}
    </dl>
  );
}

function useRegistration(e: Ev) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const refresh = () => { utils.events.invalidate(); utils.dashboard.invalidate(); utils.hives.invalidate(); };
  const register = trpc.events.register.useMutation({ onSuccess: () => { refresh(); navigate(`/e/${e.slug}/confirmation`); }, onError: (err) => toast.error(err.message) });
  const unregister = trpc.events.unregister.useMutation({ onSuccess: () => { refresh(); toast("Votre inscription est annulée"); }, onError: (err) => toast.error(err.message) });
  return { register, unregister };
}

/** L'appel à s'inscrire, selon la situation de la personne. */
function Action({ e, connected, retour, compact }: { e: Ev; connected: boolean; retour: string; compact?: boolean }) {
  const { register, unregister } = useRegistration(e);
  const full = e.seatsLeft === 0;
  if (e.cancelled) return <p className="m-0 p-3 rounded-xl text-center text-[14.5px] font-medium" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}>Cet événement est annulé.</p>;
  if (e.replay) return <a href="#replay" className="p-btn-primary w-full no-underline" onClick={(ev) => { ev.preventDefault(); document.getElementById("replay")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><PlayCircle size={17} /> Voir le replay</a>;
  if (!connected) return e.past ? <p className="m-0 text-center text-[14px] p-muted">Cet événement est passé.</p> : compact ? <Link to={retour} className="p-btn-primary no-underline w-full">Je suis membre, je me connecte</Link> : <MemberLogin to={retour} />;
  if (e.registered || e.waitlisted) {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 flex items-center justify-center gap-1.5 text-[15px] font-medium" style={{ color: "var(--p-accent-text)" }}><CheckCircle2 size={17} /> {e.registered ? "Vous êtes inscrit·e" : "Vous êtes sur liste d’attente"}</p>
        {addable(e) && <AddToCalendar options={eventOptions(forCalendar(e))} label="Ajouter à mon calendrier" align="left" />}
        {!e.past && <button type="button" className="p-btn-ghost self-center" disabled={unregister.isPending} onClick={() => unregister.mutate({ eventId: e.id })}>{e.registered ? "Me désinscrire" : "Quitter la liste d’attente"}</button>}
      </div>
    );
  }
  if (e.past) return <p className="m-0 text-center text-[14px] p-muted">Cet événement est passé.</p>;
  if (e.status !== "published") return <p className="m-0 text-center text-[14px] p-muted">En attente de validation par l’équipe Présence.</p>;
  return <button type="button" className="p-btn-primary w-full" disabled={!e.canRegister || register.isPending} onClick={() => register.mutate({ eventId: e.id })}>{full ? "Rejoindre la liste d’attente" : "Je m’inscris"}</button>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="flex flex-col gap-3"><h2 className="m-0 text-[28px] leading-tight">{title}</h2>{children}</section>;
}

function PersonCard({ p, connected }: { p: Ev["host"]; connected: boolean }) {
  const inner = <><Avatar m={p} size={56} /><span className="flex flex-col min-w-0"><span className="text-[16px] font-semibold leading-snug">{p.name}</span><span className="text-[13.5px] p-muted">{p.jobTitle}</span></span></>;
  return connected ? <Link to={`/membres/${p.id}`} className="flex items-center gap-3.5 no-underline" style={{ color: "var(--p-ink)" }}>{inner}</Link> : <span className="flex items-center gap-3.5">{inner}</span>;
}

/** Le corps de la page. En aperçu (fenêtre de création), mêmes rubriques, mais rien n'est cliquable : l'événement n'existe pas encore. */
export function EventBody({ e, connected, retour, preview }: { e: Ev; connected: boolean; retour: string; preview?: boolean }) {
  useEffect(() => { if (e.replay && window.location.hash === "#replay") document.getElementById("replay")?.scrollIntoView({ block: "start" }); }, [e.replay]);
  const steps = e.program.split("\n").map((s) => s.trim()).filter(Boolean);
  const speakers = e.speakers.length ? e.speakers : [e.host];
  const action = (compact: boolean) => (preview ? <button type="button" className="p-btn-primary w-full" style={{ opacity: 1, cursor: "default" }} disabled>{e.seatsLeft === 0 ? "Rejoindre la liste d’attente" : "Je m’inscris"}</button> : <Action e={e} connected={connected} retour={retour} compact={compact} />);
  return (
    <main className={`flex-1 ${preview ? "pb-8" : "pb-28 lg:pb-16"}`}>
      {e.photoUrl
        ? <img src={e.photoUrl} alt="" className="w-full aspect-[16/10] sm:aspect-[21/9] max-h-[520px] object-cover" style={{ objectPosition: e.photoPosition }} />
        : <div className="w-full h-[150px] sm:h-[220px]" style={{ background: eventCover(e) }} />}
      <div className="max-w-[1040px] mx-auto px-4 sm:px-8 pt-6 sm:pt-9 flex flex-wrap gap-x-10 gap-y-7 items-start">
        <div className="flex-[2_1_480px] min-w-0 flex flex-col gap-7">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-pill">{e.type === "bienvenue" ? "Réunion de bienvenue" : e.hive ? `Ruche ${e.hive.name}` : "Événement du réseau"}</span>
              {e.series && <span className="p-chip h-7 text-[12.5px] cursor-default p-muted">{e.series.label}</span>}
              {e.visibility === "public" && !e.hive && <span className="p-chip h-7 text-[12.5px] cursor-default p-muted">Public</span>}
              {e.status === "pending" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">En attente de validation</span>}
              {e.status === "rejected" && <span className="p-chip h-7 text-[12.5px] border-dashed cursor-default p-muted">Non retenu</span>}
              {e.cancelled && <span className="p-pill" style={{ background: "var(--p-accent)", color: "#fff" }}>Annulé</span>}
            </div>
            <h1 className="m-0 text-[clamp(36px,6vw,58px)] leading-[1.04]">{e.title}</h1>
            {e.tagline && <p className="m-0 text-[clamp(17px,2.4vw,21px)] leading-snug p-muted">{e.tagline}</p>}
          </header>

          {e.replay && (
            <section id="replay" className="flex flex-col gap-3 scroll-mt-6" aria-label="Le replay">
              <h2 className="m-0 text-[28px] leading-tight flex items-center gap-2"><PlayCircle size={24} style={{ color: "var(--p-accent)" }} /> Le replay</h2>
              <VideoEmbed url={e.replay} title={`Replay : ${e.title}`} />
            </section>
          )}
          <div className="lg:hidden"><Facts e={e} /></div>
          <AccessInfo e={e} />
          {e.description && <p className="m-0 text-[16.5px] leading-relaxed whitespace-pre-line">{e.description}</p>}
          {steps.length > 0 && <Section title="Programme"><ol className="m-0 p-0 list-none flex flex-col gap-2">{steps.map((s, i) => <li key={i} className="flex gap-3 text-[15.5px] leading-relaxed"><span className="w-1.5 h-1.5 rounded-full mt-[11px] flex-none" style={{ background: "var(--p-accent)" }} />{s}</li>)}</ol></Section>}
          <Section title={speakers.length > 1 ? "Intervenants" : e.speakers.length ? "Intervenant" : "Organisé par"}><div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))" }}>{speakers.map((p) => <PersonCard key={p.id} p={p} connected={connected && !preview} />)}</div></Section>
          {e.takeaways.length > 0 && <Section title="Ce que vous repartez avec"><ul className="m-0 p-0 list-none flex flex-col gap-2">{e.takeaways.map((t) => <li key={t} className="flex gap-2.5 text-[15.5px] leading-relaxed"><CheckCircle2 size={18} className="flex-none mt-0.5" style={{ color: "var(--p-accent-text)" }} />{t}</li>)}</ul></Section>}
          {!!e.series?.dates.length && (
            <Section title="Autres dates">
              <p className="m-0 text-[14.5px] p-muted">Cette date ne vous convient pas ? Choisissez-en une autre.</p>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
                {e.series.dates.map((d) => {
                  const label = `${parisLongDate(new Date(d.startsAt))} · ${parisHour(new Date(d.startsAt))}`;
                  return <li key={d.slug}>{preview ? <span className="p-chip h-10 cursor-default">{label}</span> : <Link to={`/e/${d.slug}`} className="p-chip h-10 no-underline" style={{ color: "var(--p-ink)" }}>{label}</Link>}</li>;
                })}
              </ul>
            </Section>
          )}
          {e.faq.length > 0 && <Section title="Questions fréquentes"><div className="flex flex-col gap-2">{e.faq.map((x) => <details key={x.q} className="p-soft px-4 py-3"><summary className="cursor-pointer text-[15.5px] font-medium">{x.q}</summary><p className="m-0 mt-2 text-[15px] leading-relaxed p-muted whitespace-pre-line">{x.a}</p></details>)}</div></Section>}
          {e.canManage && <Link to={`/e/${e.slug}/gerer`} className="p-btn-outline p-btn-sm no-underline self-start lg:hidden"><Settings size={15} /> Gérer</Link>}
          {!connected && <div className="lg:hidden"><DiscoverBlock /></div>}
        </div>

        <aside className="hidden lg:flex flex-[1_1_320px] min-w-0 flex-col gap-4 p-card p-5 sticky top-6">
          <Facts e={e} />
          {action(false)}
          {e.canManage && <Link to={`/e/${e.slug}/gerer`} className="p-btn-outline p-btn-sm no-underline"><Settings size={15} /> Gérer</Link>}
        </aside>
      </div>

      {/* Sur téléphone, l'inscription reste à portée de pouce */}
      <div className={preview ? "lg:hidden px-4 sm:px-8 pt-6" : "lg:hidden fixed bottom-0 inset-x-0 z-30 p-3 border-t"} style={preview ? undefined : { background: "var(--p-surface)", borderColor: "var(--p-line)", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {action(true)}
      </div>
    </main>
  );
}

/** Après l'inscription : confirmation, ajout au calendrier et partage. */
function Confirmation({ e }: { e: Ev }) {
  const url = `${window.location.origin}/e/${e.slug}`;
  const text = `${e.title} : ${url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Lien copié"); } catch { toast.error("Copie impossible"); } };
  return (
    <main className="flex-1 max-w-[640px] w-full mx-auto px-4 sm:px-8 py-8 sm:py-14 flex flex-col gap-6">
      {e.registered || e.waitlisted ? (
        <header className="flex flex-col gap-2.5">
          <CheckCircle2 size={38} style={{ color: "var(--p-accent-text)" }} />
          <h1 className="m-0 text-[clamp(34px,6vw,48px)] leading-[1.05]">{e.registered ? "C’est noté, à très vite !" : "Vous êtes sur liste d’attente"}</h1>
          <p className="m-0 text-[16px] p-muted">{e.registered ? "Votre place est réservée." : "Dès qu’une place se libère, elle est pour vous : nous vous prévenons dans l’application."}</p>
        </header>
      ) : (
        <header className="flex flex-col gap-2.5"><h1 className="m-0 text-[clamp(30px,5vw,42px)] leading-tight">Vous n’êtes pas inscrit·e à cet événement</h1></header>
      )}
      <section className="p-card p-5 flex flex-col gap-3">
        <span className="serif text-[26px] leading-tight">{e.title}</span>
        <Facts e={e} />
        <AccessInfo e={e} />
      </section>
      {e.registered && (
        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[24px]">Ajouter à mon calendrier</h2>
          <div className="self-start"><AddToCalendar options={eventOptions(forCalendar(e))} label="Choisir mon agenda" align="left" /></div>
        </section>
      )}
      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[24px]">Partager</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="p-btn-outline p-btn-sm" onClick={copy}><Copy size={15} /> Copier le lien</button>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener" className="p-btn-outline p-btn-sm no-underline"><Linkedin size={15} /> LinkedIn</a>
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="p-btn-outline p-btn-sm no-underline"><MessageCircle size={15} /> WhatsApp</a>
          <a href={`mailto:?subject=${encodeURIComponent(e.title)}&body=${encodeURIComponent(text)}`} className="p-btn-outline p-btn-sm no-underline"><Mail size={15} /> E-mail</a>
        </div>
      </section>
      <Link to={`/e/${e.slug}`} className="p-btn-ghost no-underline self-start"><ArrowLeft size={15} /> Revenir à la page de l’événement</Link>
    </main>
  );
}
