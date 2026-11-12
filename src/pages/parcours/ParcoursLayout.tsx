import { Outlet } from "react-router";
import { BookOpen, GraduationCap, Layers, MessageSquareHeart, Sparkles } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { SubNav, type SubPage } from "@/components/SubNav";

const PAGES: SubPage[] = [
  { to: "/parcours", label: "Mes formations", end: true, icon: <GraduationCap size={16} className="flex-none" /> },
  { to: "/parcours/ressources", label: "Mes ressources", icon: <Layers size={16} className="flex-none" /> },
  { to: "/parcours/journal", label: "Mon journal personnel", icon: <BookOpen size={16} className="flex-none" /> },
  { to: "/parcours/presence-ia", label: "Présence IA", icon: <Sparkles size={16} className="flex-none" /> },
];

// Réservée aux clients du coaching individuel (voir server/lib/coachingClient.ts)
const SHARED: SubPage = { to: "/parcours/accompagnement", label: "Mon accompagnement", icon: <MessageSquareHeart size={16} className="flex-none" /> };

/** Mon parcours : ses sous-pages, en onglets sur ordinateur, en liste sur téléphone. */
export default function ParcoursLayout() {
  const client = !!trpc.members.me.useQuery().data?.coachingClient;
  return (
    <>
      <SubNav label="Mon parcours" pages={client ? [...PAGES, SHARED] : PAGES} />
      <Outlet />
    </>
  );
}
