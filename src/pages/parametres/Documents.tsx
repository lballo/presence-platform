import { Link } from "react-router";
import { ArrowRight, FileText } from "lucide-react";
import { DOCUMENTS } from "@/pages/documents/DocumentPage";
import { SettingsTitle } from "./ParametresLayout";

/** Documents : CGV, CGU (règles de la communauté) et politique de confidentialité, trois textes distincts. */
export default function Documents() {
  return (
    <>
      <SettingsTitle title="Documents" intro="Les conditions et la politique qui encadrent le réseau Présence." />
      <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
        {Object.entries(DOCUMENTS).map(([slug, d]) => (
          <li key={slug}>
            <Link to={`/documents/${slug}`} className="p-card p-4 sm:p-5 flex items-center gap-4 no-underline" style={{ color: "var(--p-ink)" }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><FileText size={18} /></span>
              <span className="flex-1 min-w-0 flex flex-col"><span className="font-medium">{d.title}</span><span className="text-[13.5px] p-muted">{d.summary}</span></span>
              <ArrowRight size={16} className="p-faint flex-none" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
