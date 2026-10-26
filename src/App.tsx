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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parcours" element={<Parcours />} />
        <Route path="/presence-ia" element={<PresenceIA />} />
        <Route path="/presence-ia/analyse/:id" element={<Analysis />} />
        <Route path="/talk-show" element={<TalkShow />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/matching" element={<Matching />} />
        <Route path="/membres" element={<Membres />} />
        <Route path="/ruches" element={<Ruches />} />
        <Route path="/ruches/:id" element={<Ruche />} />
        <Route path="/evenements" element={<Evenements />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="*" element={<div className="py-20 text-center p-muted">Cette page n’existe pas.</div>} />
      </Route>
    </Routes>
  );
}
