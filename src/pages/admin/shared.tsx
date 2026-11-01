import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

/** Une pastille d'état : l'alerte ressort, le reste reste calme. */
export function Badge({ tone = "calm", children }: { tone?: "calm" | "ok" | "alert" | "wait"; children: ReactNode }) {
  const style = tone === "alert" ? { background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }
    : tone === "ok" ? { background: "rgba(46, 125, 80, .12)", color: "#2b7a4b" }
    : tone === "wait" ? { background: "rgba(176, 134, 60, .14)", color: "var(--p-gold)" }
    : { background: "var(--p-surface-2)", color: "var(--p-ink-2)" };
  return <span className="inline-flex items-center h-[24px] px-2.5 rounded-full text-[12.5px] font-medium whitespace-nowrap" style={style}>{children}</span>;
}

export type Column<T> = { key: string; label: string; short?: string; cell: (row: T) => ReactNode; phoneHide?: boolean; align?: "right" };

/**
 * Sur ordinateur, un tableau ; sur téléphone, des cartes empilées.
 * La première colonne sert de titre à la carte, « actions » s'affiche en pied.
 */
export function Rows<T>({ rows, columns, keyOf, actions, hrefOf, empty }: { rows: T[]; columns: Column<T>[]; keyOf: (row: T) => string | number; actions?: (row: T) => ReactNode; hrefOf?: (row: T) => string; empty: string }) {
  if (!rows.length) return <div className="p-soft p-7 text-center text-[14.5px] p-muted">{empty}</div>;
  const [first, ...rest] = columns;
  return (
    <>
      <div className="hidden md:block p-card overflow-x-auto">
        <table className="w-full border-collapse text-[14.5px]">
          <thead>
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] p-muted border-b whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`} style={{ borderColor: "var(--p-line)" }}>{c.short ?? c.label}</th>)}{actions && <th scope="col" className="border-b" style={{ borderColor: "var(--p-line)" }}><span className="sr-only">Actions</span></th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={keyOf(r)} className="border-b last:border-b-0" style={{ borderColor: "var(--p-line)" }}>
                {columns.map((c, i) => <td key={c.key} className={`px-4 py-3 align-middle ${c.align === "right" ? "text-right" : ""}`}>{i === 0 && hrefOf ? <Link to={hrefOf(r)} className="no-underline hover:underline" style={{ color: "var(--p-ink)" }}>{c.cell(r)}</Link> : c.cell(r)}</td>)}
                {actions && <td className="px-4 py-3 align-middle"><span className="flex flex-wrap justify-end gap-1.5 min-w-[150px] [&>*]:whitespace-nowrap">{actions(r)}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden list-none m-0 p-0 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={keyOf(r)} className="p-card p-4 flex flex-col gap-2.5">
            {hrefOf ? <Link to={hrefOf(r)} className="flex items-center justify-between gap-2 no-underline" style={{ color: "var(--p-ink)" }}><span className="min-w-0 flex-1">{first.cell(r)}</span><ChevronRight size={17} className="flex-none p-faint" /></Link> : <div>{first.cell(r)}</div>}
            <dl className="m-0 flex flex-col gap-1.5">
              {rest.filter((c) => !c.phoneHide).map((c) => <div key={c.key} className="flex items-center justify-between gap-3 text-[13.5px]"><dt className="p-muted flex-none">{c.label}</dt><dd className="m-0 text-right min-w-0">{c.cell(r)}</dd></div>)}
            </dl>
            {actions && <div className="flex flex-wrap gap-1.5 pt-1">{actions(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Une action qui demande confirmation, affichée à la place du bouton. */
export function ConfirmButton({ label, question, confirm = label, onConfirm, disabled, className = "p-btn-outline p-btn-sm", danger }: { label: ReactNode; question: string; confirm?: ReactNode; onConfirm: () => void; disabled?: boolean; className?: string; danger?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={className} style={danger ? { color: "var(--p-accent-text)" } : undefined} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="basis-full flex flex-wrap items-center gap-2 p-2.5 rounded-xl text-[13.5px]" style={{ background: "var(--p-accent-soft)" }}>
      <span className="flex-[1_1_200px] min-w-0 text-left">{question}</span>
      <button type="button" className="p-btn-primary p-btn-sm" disabled={disabled} onClick={() => { onConfirm(); setAsking(false); }}>{confirm}</button>
      <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setAsking(false)}>Annuler</button>
    </span>
  );
}

/** Filtres en pastilles : plusieurs états, un seul actif. */
export function Chips<K extends string>({ value, options, onChange, label }: { value: K; options: readonly (readonly [K, string, number?])[]; onChange: (k: K) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([k, l, n]) => <button key={k} type="button" aria-pressed={value === k} className={`p-chip ${value === k ? "p-chip-on" : ""}`} onClick={() => onChange(k)}>{l}{n ? ` · ${n}` : ""}</button>)}
    </div>
  );
}

export function Select<K extends string>({ label, value, options, onChange }: { label: string; value: K; options: readonly (readonly [K, string])[]; onChange: (k: K) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] p-muted min-w-0">
      <span>{label}</span>
      <select className="p-field" value={value} onChange={(e) => onChange(e.target.value as K)}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </label>
  );
}
