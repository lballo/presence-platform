import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { BookOpen, ChevronDown, GraduationCap, Layers } from "lucide-react";
import { CoachMascot } from "@/components/CoachMascot";

const PAGES = [
  { to: "/parcours", label: "Mes formations", end: true, icon: <GraduationCap size={16} className="flex-none" /> },
  { to: "/parcours/ressources", label: "Mes ressources", icon: <Layers size={16} className="flex-none" /> },
  { to: "/parcours/journal", label: "Mon journal personnel", icon: <BookOpen size={16} className="flex-none" /> },
  { to: "/parcours/coach", label: "Ce que le coach retient de moi", icon: <span className="flex-none"><CoachMascot size={18} /></span> },
];

/** Mon parcours : quatre sous-pages, en onglets sur ordinateur, en liste sur téléphone. */
export default function ParcoursLayout() {
  return (
    <>
      <nav aria-label="Mon parcours" className="hidden sm:flex flex-wrap gap-1.5 mb-6">
        {PAGES.map((p) => <NavLink key={p.to} to={p.to} end={p.end} className={({ isActive }) => `p-chip no-underline ${isActive ? "p-chip-on" : ""}`}>{p.icon} {p.label}</NavLink>)}
      </nav>
      <PhoneMenu />
      <Outlet />
    </>
  );
}

function PhoneMenu() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const current = PAGES.find((p) => (p.end ? pathname === p.to : pathname.startsWith(p.to))) ?? PAGES[0];
  return (
    <div className="relative sm:hidden mb-5">
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-label={`Mon parcours : ${current.label}`} className="w-full flex items-center gap-2.5 h-12 px-3.5 rounded-xl border text-[15px] font-medium text-left" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)" }} onClick={() => setOpen((o) => !o)}>
        {current.icon}
        <span className="flex-1 min-w-0 truncate">{current.label}</span>
        <ChevronDown size={18} className="flex-none transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fermer la liste" className="fixed inset-0 z-[44] cursor-default" onClick={() => setOpen(false)} />
          <ul className="absolute z-[45] left-0 right-0 top-[54px] m-0 p-2 list-none rounded-2xl shadow-xl flex flex-col gap-0.5" style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)" }}>
            {PAGES.map((p) => (
              <li key={p.to}>
                <Link to={p.to} aria-current={p === current ? "page" : undefined} className="flex items-center gap-2.5 min-h-[46px] px-3 rounded-xl text-[15px] no-underline" style={p === current ? { background: "var(--p-pill)", color: "var(--p-accent-text)", fontWeight: 600 } : { color: "var(--p-ink)" }} onClick={() => setOpen(false)}>{p.icon} {p.label}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
