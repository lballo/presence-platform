import { NavLink, Outlet } from "react-router";
import { Heart, Users } from "lucide-react";

/** Membres : l'annuaire, et « Trouver mon binôme » (le matching) dans la même rubrique. */
export default function MembresLayout() {
  return (
    <>
      <nav aria-label="Membres" className="flex flex-wrap gap-1.5 mb-6">
        <NavLink to="/membres" end className={({ isActive }) => `p-chip no-underline ${isActive ? "p-chip-on" : ""}`}><Users size={16} /> Annuaire</NavLink>
        <NavLink to="/membres/binome" className={({ isActive }) => `p-chip no-underline ${isActive ? "p-chip-on" : ""}`}><Heart size={16} /> Trouver mon binôme</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
