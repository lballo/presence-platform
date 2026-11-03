import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { ChevronDown } from "lucide-react";

export type SubPage = { to: string; label: string; end?: boolean; icon: ReactNode };

/** Les sous-pages d'une rubrique : en onglets sur ordinateur, en liste déroulante sur téléphone. */
export function SubNav({ label, pages }: { label: string; pages: SubPage[] }) {
  return (
    <>
      <nav aria-label={label} className="hidden sm:flex flex-wrap gap-1.5 mb-6">
        {pages.map((p) => <NavLink key={p.to} to={p.to} end={p.end} className={({ isActive }) => `p-chip no-underline ${isActive ? "p-chip-on" : ""}`}>{p.icon} {p.label}</NavLink>)}
      </nav>
      <PhoneMenu label={label} pages={pages} />
    </>
  );
}

function PhoneMenu({ label, pages }: { label: string; pages: SubPage[] }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const current = pages.find((p) => (p.end ? pathname === p.to : pathname.startsWith(p.to))) ?? pages[0];
  return (
    <div className="relative sm:hidden mb-5">
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-label={`${label} : ${current.label}`} className="w-full flex items-center gap-2.5 h-12 px-3.5 rounded-xl border text-[15px] font-medium text-left" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)" }} onClick={() => setOpen((o) => !o)}>
        {current.icon}
        <span className="flex-1 min-w-0 truncate">{current.label}</span>
        <ChevronDown size={18} className="flex-none transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fermer la liste" className="fixed inset-0 z-[44] cursor-default" onClick={() => setOpen(false)} />
          <ul className="absolute z-[45] left-0 right-0 top-[54px] m-0 p-2 list-none rounded-2xl shadow-xl flex flex-col gap-0.5" style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)" }}>
            {pages.map((p) => (
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
