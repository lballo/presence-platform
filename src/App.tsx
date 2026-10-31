import { Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Parcours from "@/pages/Parcours";
import PresenceIA from "@/pages/PresenceIA";
import Analysis from "@/pages/Analysis";
import TalkShow from "@/pages/TalkShow";
import Forum from "@/pages/Forum";
import Matching from "@/pages/Matching";
import Membres from "@/pages/Membres";
import Ruches from "@/pages/Ruches";
import Ruche from "@/pages/Ruche";
import Evenements from "@/pages/Evenements";
import Messages from "@/pages/Messages";
import Profil from "@/pages/Profil";
import RequireAuth from "@/components/RequireAuth";
import Connexion from "@/pages/auth/Connexion";
import MotDePasseOublie from "@/pages/auth/MotDePasseOublie";
import ChoisirMotDePasse from "@/pages/auth/ChoisirMotDePasse";
import Invitation from "@/pages/auth/Invitation";
import AccesTermine from "@/pages/auth/AccesTermine";

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
      <Route path="/choisir-mot-de-passe" element={<ChoisirMotDePasse />} />
      <Route path="/invitation/:token" element={<Invitation />} />
      <Route path="/acces-termine" element={<AccesTermine />} />
      <Route element={<RequireAuth />}>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parcours" element={<Parcours />} />
        <Route path="/presence-ia" element={<PresenceIA />} />
        <Route path="/presence-ia/analyse/:id" element={<Analysis />} />
        <Route path="/talk-show" element={<TalkShow />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/matching" element={<Matching />} />
        <Route path="/membres" element={<Membres />} />
        <Route path="/membres/:id" element={<Profil />} />
        <Route path="/ruches" element={<Ruches />} />
        <Route path="/ruches/:id" element={<Ruche />} />
        <Route path="/evenements" element={<Evenements />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="*" element={<div className="py-20 text-center p-muted">Cette page n’existe pas.</div>} />
      </Route>
      </Route>
    </Routes>
  );
}
