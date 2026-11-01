import { Navigate, Routes, Route } from "react-router";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Parcours from "@/pages/Parcours";
import ParcoursLayout from "@/pages/parcours/ParcoursLayout";
import Ressources from "@/pages/parcours/Ressources";
import TestPage from "@/pages/parcours/TestPage";
import CoursePage from "@/pages/parcours/CoursePage";
import LessonPage, { LegacyModuleRedirect } from "@/pages/parcours/LessonPage";
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
import AdminCoaching, { AdminCoachingClient } from "@/pages/admin/AdminCoaching";
import CreatorLayout from "@/pages/admin/construire/CreatorShell";
import BuildHome, { BuildWorkflows } from "@/pages/admin/construire/BuildHome";
import BuildTests from "@/pages/admin/construire/BuildTests";
import BuildCourse from "@/pages/admin/construire/BuildCourse";
import BuildSection from "@/pages/admin/construire/BuildSection";
import BuildLesson from "@/pages/admin/construire/BuildLesson";
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
      {/* L'espace créateur : une pleine page pour écrire, sans le menu du réseau */}
      <Route path="/admin/construire" element={<CreatorLayout />}>
        <Route index element={<BuildHome />} />
        <Route path="tests" element={<BuildTests />} />
        <Route path="relances" element={<BuildWorkflows />} />
        <Route path=":id" element={<BuildCourse />} />
        <Route path=":id/section/:sectionId" element={<BuildSection />} />
        <Route path=":id/lecon/:lessonId" element={<BuildLesson />} />
        <Route path=":id/apercu/:lessonId" element={<BuildPreview />} />
      </Route>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parcours" element={<ParcoursLayout />}>
          <Route index element={<Parcours />} />
          <Route path="ressources" element={<Ressources />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="coach" element={<CoachMemoryPage />} />
        </Route>
        <Route path="/parcours/formations" element={<Navigate to="/parcours" replace />} />
        <Route path="/parcours/tests" element={<Navigate to="/parcours/ressources" replace />} />
        <Route path="/parcours/memoire" element={<Navigate to="/parcours/coach" replace />} />
        <Route path="/parcours/ressources/test/:id" element={<TestPage />} />
        <Route path="/parcours/:courseId" element={<CoursePage />} />
        <Route path="/parcours/:courseId/lecon/:lessonId" element={<LessonPage />} />
        <Route path="/parcours/:courseId/module/:moduleId" element={<LegacyModuleRedirect />} />
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
          <Route path="coaching" element={<AdminCoaching />} />
          <Route path="coaching/:id" element={<AdminCoachingClient />} />
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
