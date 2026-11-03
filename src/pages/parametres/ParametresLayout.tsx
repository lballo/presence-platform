import { Outlet } from "react-router";
import { Bell, CreditCard, FileText, KeyRound, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { SubNav, type SubPage } from "@/components/SubNav";

const PAGES: SubPage[] = [
  { to: "/parametres", label: "Identité et connexion", end: true, icon: <KeyRound size={16} className="flex-none" /> },
  { to: "/parametres/notifications", label: "Notifications", icon: <Bell size={16} className="flex-none" /> },
  { to: "/parametres/abonnement", label: "Abonnement", icon: <CreditCard size={16} className="flex-none" /> },
  { to: "/parametres/confidentialite", label: "Confidentialité", icon: <ShieldCheck size={16} className="flex-none" /> },
  { to: "/parametres/documents", label: "Documents", icon: <FileText size={16} className="flex-none" /> },
];

/** Paramètres du compte : on y arrive en cliquant sur sa photo, en bas du menu. */
export default function ParametresLayout() {
  const me = trpc.members.me.useQuery().data;
  return (
    <>
      <header className="flex flex-wrap items-center gap-4 mb-7">
        {me && <Avatar m={me} size={64} />}
        <div className="flex-[1_1_220px] min-w-0 flex flex-col gap-1">
          <span className="p-eyebrow">Mon compte</span>
          <h1 className="m-0 text-[clamp(34px,4.5vw,48px)] leading-[1.05]">Paramètres</h1>
        </div>
      </header>
      <SubNav label="Paramètres" pages={PAGES} />
      <div className="max-w-[820px] flex flex-col gap-5">
        <Outlet />
      </div>
    </>
  );
}

/** Le titre d'une rubrique des paramètres. */
export function SettingsTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-[30px] leading-tight">{title}</h2>
      {intro && <p className="m-0 text-[15px] p-muted leading-relaxed">{intro}</p>}
    </div>
  );
}
