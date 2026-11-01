import { Routes, Route } from "react-router";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Parcours from "@/pages/Parcours";
import CoursePage from "@/pages/parcours/CoursePage";
import ModulePage from "@/pages/parcours/ModulePage";
import JournalPage from "@/pages/parcours/JournalPage";
import CoachMemoryPage from "@/pages/parcours/CoachMemoryPage";
import PresenceIA from "@/pages/PresenceIA";
import Analysis from "@/pages/Analysis";
import TalkShow from "@/pages/TalkShow";
import Forum from "@/pages/Forum";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminHome from "@/pages/admin/AdminHome";
import AdminMembers from "@/pages/admin/AdminMembers";
import AdminMember from "@/pages/admin/AdminMember";
import AdminValidations from "@/pages/admin/AdminValidations";
import AdminModeration from "@/pages/admin/AdminModeration";
import AdminHives from "@/pages/admin/AdminHives";
import AdminEvents from "@/pages/admin/AdminEvents";
import AdminForum from "@/pages/admin/AdminForum";
import AdminLog from "@/pages/admin/AdminLog";
import BuildHome from "@/pages/admin/construire/BuildHome";
import BuildCourse from "@/pages/admin/construire/BuildCourse";
import BuildModule from "@/pages/admin/construire/BuildModule";
import BuildPreview from "@/pages/admin/construire/BuildPreview";
import Matching from "@/pages/Matching";
import Membres from "@/pages/Membres";
import Ruches from "@/pages/Ruches";
import Ruche from "@/pages/Ruche";
import Evenements from "@/pages/Evenements";
import EventPage from "@/pages/EventPage";
import EventManage from "@/pages/EventManage";
import Messages from "@/pages/Messages";
import Profil from "@/pages/Profil";
import RequireAuth, { OnboardingGate } from "@/components/RequireAuth";
import Connexion from "@/pages/auth/Connexion";
import MotDePasseOublie from "@/pages/auth/MotDePasseOublie";
import ChoisirMotDePasse from "@/pages/auth/ChoisirMotDePasse";
import Invitation from "@/pages/auth/Invitation";
import AccesTermine from "@/pages/auth/AccesTermine";
import Desinscription from "@/pages/auth/Desinscription";

export default function App() {
  return (
    <>
    <Toaster position="top-center" richColors />
    <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
      <Route path="/choisir-mot-de-passe" element={<ChoisirMotDePasse />} />
      <Route path="/invitation/:token" element={<Invitation />} />
      <Route path="/acces-termine" element={<AccesTermine />} />
      <Route path="/desinscription" element={<Desinscription />} />
      <Route element={<OnboardingGate />}>
        <Route path="/e/:slug" element={<EventPage />} />
        <Route path="/e/:slug/confirmation" element={<EventPage />} />
      </Route>
      <Route element={<RequireAuth />}>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parcours" element={<Parcours />} />
        <Route path="/parcours/journal" element={<JournalPage />} />
        <Route path="/parcours/coach" element={<CoachMemoryPage />} />
        <Route path="/parcours/:courseId" element={<CoursePage />} />
        <Route path="/parcours/:courseId/module/:moduleId" element={<ModulePage />} />
        <Route path="/presence-ia" element={<PresenceIA />} />
        <Route path="/presence-ia/analyse/:id" element={<Analysis />} />
        <Route path="/talk-show" element={<TalkShow />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/forum/publication/:id" element={<Forum />} />
        <Route path="/forum/:slug" element={<Forum />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="membres" element={<AdminMembers />} />
          <Route path="membres/:id" element={<AdminMember />} />
          <Route path="validations" element={<AdminValidations />} />
          <Route path="moderation" element={<AdminModeration />} />
          <Route path="ruches" element={<AdminHives />} />
          <Route path="evenements" element={<AdminEvents />} />
          <Route path="forum" element={<AdminForum />} />
          <Route path="journal" element={<AdminLog />} />
          <Route path="construire" element={<BuildHome />} />
          <Route path="construire/:id" element={<BuildCourse />} />
          <Route path="construire/:id/module/:moduleId" element={<BuildModule />} />
          <Route path="construire/:id/apercu/:moduleId" element={<BuildPreview />} />
        </Route>
        <Route path="/matching" element={<Matching />} />
        <Route path="/membres" element={<Membres />} />
        <Route path="/membres/:id" element={<Profil />} />
        <Route path="/ruches" element={<Ruches />} />
        <Route path="/ruches/:id" element={<Ruche />} />
        <Route path="/evenements" element={<Evenements />} />
        <Route path="/e/:slug/gerer" element={<EventManage />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="*" element={<div className="py-20 text-center p-muted">Cette page n’existe pas.</div>} />
      </Route>
      </Route>
    </Routes>
    </>
  );
}
