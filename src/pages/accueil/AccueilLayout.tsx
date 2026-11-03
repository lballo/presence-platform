import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { CalendarDays, Handshake, LineChart, MapPin, Newspaper, UserRound } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { longDate } from "@/lib/format";

/**
 * L'accueil, d'après la piste E de Laura : la date, « Bonjour …, heureuse de vous retrouver. », puis des onglets
 * en pilules qui ouvrent chaque sous-page (Actualité, Mon profil, Ma progression, Mon calendrier, Ma localisation,
 * Coaching pour les clients). À droite, la photo du membre avec son ambition.
 */
export default function AccueilLayout() {
  const me = trpc.members.me.useQuery().data;
  const client = !!me?.coachingClient;
  const counts = useCounts();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  // Anciens liens : « ?profil=1 » ouvrait le formulaire du profil, « #mes-emails » les choix d'e-mails
  useEffect(() => {
    if (pathname === "/" && params.get("profil") === "1") navigate("/profil?modifier=1", { replace: true });
    else if (window.location.hash === "#mes-emails") navigate("/parametres/notifications", { replace: true });
  }, [pathname, params, navigate]);

  const tabs = [
    { to: "/", label: "Actualité", icon: Newspaper, end: true },
    { to: "/profil", label: "Mon profil", icon: UserRound, end: true },
    { to: "/profil/progression", label: "Ma progression", icon: LineChart, count: counts.steps },
    { to: "/profil/calendrier", label: "Mon calendrier", icon: CalendarDays, count: counts.month },
    { to: "/profil/localisation", label: "Ma localisation", icon: MapPin },
    ...(client ? [{ to: "/profil/coaching", label: "Coaching", icon: Handshake }] : []),
  ];

  return (
    <>
      <section className="flex flex-wrap gap-10 items-stretch">
        <div className="flex-[1.7_1_460px] min-w-0 flex flex-col justify-center">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[0.24em] p-muted">{longDate(new Date())}</p>
          <h1 className="p-greeting mt-4">Bonjour {me?.firstName ?? ""},<br /><em>heureuse de vous retrouver.</em></h1>
          <nav aria-label="Mon accueil" className="mt-8 flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible" style={{ scrollbarWidth: "none" }}>
            {tabs.map(({ to, label, icon: Icon, end, count }) => (
              <NavLink key={to} to={to} end={end} className="p-tab-pill" ref={(el) => { if (el?.getAttribute("aria-current") === "page") el.scrollIntoView({ block: "nearest", inline: "center" }); }}>
                <Icon size={17} strokeWidth={1.5} className="flex-none" />{label}{!!count && <span className="p-tab-count">{count}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
        {me && <Ambition me={me} />}
      </section>
      <div className="mt-9">
        <Outlet />
      </div>
    </>
  );
}

/** Ma photo, avec mon ambition par-dessus (sur grand écran). */
function Ambition({ me }: { me: { photoUrl: string | null; initials: string; ambition: string } }) {
  return (
    <figure className="hidden lg:block relative flex-[0_1_300px] m-0 min-h-[400px] rounded-[28px] overflow-hidden" style={{ background: "var(--p-surface-2)" }}>
      {me.photoUrl
        ? <img src={me.photoUrl} alt="Ma photo de profil" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "45% 25%" }} />
        : <span aria-hidden="true" className="absolute inset-0 flex items-start justify-center pt-16 font-['Newsreader'] italic text-[96px]" style={{ color: "var(--p-accent-text)" }}>{me.initials}</span>}
      <figcaption className="absolute left-4 right-4 bottom-4 rounded-[20px] px-5 py-[18px]" style={{ background: "color-mix(in srgb, var(--p-surface) 96%, transparent)" }}>
        <span className="block p-kicker">Mon ambition</span>
        <span className="block mt-1.5 font-['Newsreader'] italic font-light text-[20px] leading-[1.4]" style={{ color: "var(--p-ink)" }}>{me.ambition ? `« ${me.ambition} »` : "Votre ambition, ou votre philosophie de vie, en une phrase."}</span>
        <Link to="/profil?modifier=1" className="inline-block mt-2 text-[12px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>{me.ambition ? "Modifier" : "L’écrire"} →</Link>
      </figcaption>
    </figure>
  );
}

/** Les petits compteurs des onglets : premiers pas restants, rendez-vous à venir ce mois-ci. */
function useCounts() {
  const steps = trpc.honey.firstSteps.useQuery().data;
  const agenda = trpc.events.agenda.useQuery().data;
  const now = new Date();
  const month = (agenda ?? []).filter((e) => (e.registered || e.waitlisted) && new Date(e.startsAt) >= now && new Date(e.startsAt).getMonth() === now.getMonth() && new Date(e.startsAt).getFullYear() === now.getFullYear()).length;
  return { steps: steps && !steps.allDone ? steps.steps.filter((s) => !s.done).length : 0, month };
}
