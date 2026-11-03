import { Outlet } from "react-router";
import { CalendarDays, Handshake, MapPin, TrendingUp, UserRound } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { SubNav, type SubPage } from "@/components/SubNav";
import { longDate } from "@/lib/format";

const PAGES: SubPage[] = [
  { to: "/profil", label: "Mon profil", end: true, icon: <UserRound size={16} className="flex-none" /> },
  { to: "/profil/progression", label: "Ma progression", icon: <TrendingUp size={16} className="flex-none" /> },
  { to: "/profil/calendrier", label: "Mon calendrier", icon: <CalendarDays size={16} className="flex-none" /> },
  { to: "/profil/localisation", label: "Ma localisation", icon: <MapPin size={16} className="flex-none" /> },
];

// Le suivi des séances : pour les seuls clients du coaching individuel (voir server/lib/coachingClient.ts)
const COACHING: SubPage = { to: "/profil/coaching", label: "Coaching", icon: <Handshake size={16} className="flex-none" /> };

/** Mon profil : la fiche que voient les autres, et ce qui ne regarde que moi, en sous-onglets. */
export default function ProfilLayout() {
  const me = trpc.members.me.useQuery().data;
  const client = !!me?.coachingClient;
  return (
    <>
      {/* L'accueil voulu par Laura : Newsreader, « Bonjour » en expresso, la suite en italique */}
      <header className="flex flex-col gap-4 mb-7">
        <span className="text-[11px] font-medium uppercase tracking-[0.24em] p-muted">{longDate(new Date())}</span>
        <p className="p-greeting">Bonjour {me?.firstName ?? ""},<br /><em>heureuse de vous retrouver.</em></p>
      </header>
      <SubNav label="Mon profil" pages={client ? [...PAGES, COACHING] : PAGES} />
      <Outlet />
    </>
  );
}
