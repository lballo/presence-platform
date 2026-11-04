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

type Key = string | number;
/** Des lignes à cocher : l'ensemble choisi, et le nom de chaque ligne pour les lecteurs d'écran. */
export type Selection<T> = { selected: ReadonlySet<Key>; onChange: (next: Set<Key>) => void; labelOf: (row: T) => string };

const box = "w-[18px] h-[18px] flex-none cursor-pointer";
const boxStyle = { accentColor: "var(--p-accent)" };

/** Tout cocher : cochée si toutes les lignes le sont, à moitié si quelques-unes. */
function AllBox<T>({ rows, keyOf, select, label }: { rows: T[]; keyOf: (row: T) => Key; select: Selection<T>; label: string }) {
  const n = rows.filter((r) => select.selected.has(keyOf(r))).length;
  return <input type="checkbox" aria-label={label} className={box} style={boxStyle} checked={n > 0 && n === rows.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < rows.length; }} onChange={() => select.onChange(n === rows.length ? new Set() : new Set(rows.map(keyOf)))} />;
}

function RowBox<T>({ row, keyOf, select }: { row: T; keyOf: (row: T) => Key; select: Selection<T> }) {
  const k = keyOf(row);
  const on = select.selected.has(k);
  return <input type="checkbox" aria-label={`Sélectionner « ${select.labelOf(row)} »`} className={box} style={boxStyle} checked={on} onChange={() => { const next = new Set(select.selected); if (on) next.delete(k); else next.add(k); select.onChange(next); }} />;
}

/**
 * Sur ordinateur, un tableau ; sur téléphone, des cartes empilées.
 * La première colonne sert de titre à la carte, « actions » s'affiche en pied.
 * Avec `select`, chaque ligne se coche, et une case en tête coche toute la liste.
 */
export function Rows<T>({ rows, columns, keyOf, actions, hrefOf, empty, select }: { rows: T[]; columns: Column<T>[]; keyOf: (row: T) => Key; actions?: (row: T) => ReactNode; hrefOf?: (row: T) => string; empty: string; select?: Selection<T> }) {
  if (!rows.length) return <div className="p-soft p-7 text-center text-[14.5px] p-muted">{empty}</div>;
  const [first, ...rest] = columns;
  const on = (r: T) => !!select?.selected.has(keyOf(r));
  const picked = { background: "color-mix(in srgb, var(--p-accent-soft) 55%, transparent)" };
  return (
    <>
      <div className="hidden md:block p-card overflow-x-auto">
        <table className="w-full border-collapse text-[14.5px]">
          <thead>
            <tr>
              {select && <th scope="col" className="pl-4 pr-1 py-3 border-b w-[1%]" style={{ borderColor: "var(--p-line)" }}><AllBox rows={rows} keyOf={keyOf} select={select} label="Tout sélectionner" /></th>}
              {columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] p-muted border-b whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`} style={{ borderColor: "var(--p-line)" }}>{c.short ?? c.label}</th>)}
              {actions && <th scope="col" className="border-b" style={{ borderColor: "var(--p-line)" }}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={keyOf(r)} className="border-b last:border-b-0" style={{ borderColor: "var(--p-line)", ...(on(r) ? picked : {}) }}>
                {select && <td className="pl-4 pr-1 py-3 align-middle"><RowBox row={r} keyOf={keyOf} select={select} /></td>}
                {columns.map((c, i) => <td key={c.key} className={`px-4 py-3 align-middle ${c.align === "right" ? "text-right" : ""}`}>{i === 0 && hrefOf ? <Link to={hrefOf(r)} className="no-underline hover:underline" style={{ color: "var(--p-ink)" }}>{c.cell(r)}</Link> : c.cell(r)}</td>)}
                {actions && <td className="px-4 py-3 align-middle"><span className="flex flex-wrap justify-end gap-1.5 min-w-[150px] [&>a]:whitespace-nowrap [&>button]:whitespace-nowrap [&>[role=group]]:min-w-[300px]">{actions(r)}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {select && <label className="md:hidden flex items-center gap-2.5 px-1 text-[14px] cursor-pointer"><AllBox rows={rows} keyOf={keyOf} select={select} label="Tout sélectionner" /> Tout sélectionner</label>}
      <ul className="md:hidden list-none m-0 p-0 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={keyOf(r)} className="p-card p-4 flex flex-col gap-2.5" style={on(r) ? { ...picked, outline: "1.5px solid var(--p-accent)" } : undefined}>
            <div className="flex items-start gap-3">
              {select && <span className="pt-0.5"><RowBox row={r} keyOf={keyOf} select={select} /></span>}
              {hrefOf ? <Link to={hrefOf(r)} className="flex-1 min-w-0 flex items-center justify-between gap-2 no-underline" style={{ color: "var(--p-ink)" }}><span className="min-w-0 flex-1">{first.cell(r)}</span><ChevronRight size={17} className="flex-none p-faint" /></Link> : <div className="flex-1 min-w-0">{first.cell(r)}</div>}
            </div>
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

/**
 * La barre de la sélection : combien de lignes sont cochées, et l'action groupée.
 * La suppression demande confirmation dans la barre elle-même, sur toute sa largeur.
 */
export function SelectionBar({ count, total, noun, onClear, onSelectAll, question, confirm, onConfirm, busy }: { count: number; total: number; noun: readonly [string, string]; onClear: () => void; onSelectAll: () => void; question: string; confirm: string; onConfirm: () => void; busy?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!count) return null;
  const what = `${count} ${count > 1 ? noun[1] : noun[0]}`;
  return (
    <div role="region" aria-label="Sélection" className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-2xl text-[14px]" style={{ background: "var(--p-accent-soft)" }}>
      {asking ? (
        <>
          <span className="flex-[1_1_260px] min-w-0">{question}</span>
          <span className="flex flex-wrap gap-2">
            <button type="button" className="p-btn-primary p-btn-sm whitespace-nowrap" disabled={busy} onClick={() => { onConfirm(); setAsking(false); }}>{confirm}</button>
            <button type="button" className="p-btn-outline p-btn-sm whitespace-nowrap" onClick={() => setAsking(false)}>Annuler</button>
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold">{count > 1 ? `${what} sélectionnés` : `${what} sélectionné`}</span>
          {count < total && <button type="button" className="text-[13.5px] underline" style={{ color: "var(--p-accent-text)" }} onClick={onSelectAll}>Tout sélectionner ({total})</button>}
          <button type="button" className="text-[13.5px] underline p-muted" onClick={onClear}>Tout désélectionner</button>
          <button type="button" className="p-btn-primary p-btn-sm whitespace-nowrap ml-auto" disabled={busy} onClick={() => setAsking(true)}>Supprimer {count > 1 ? `les ${count}` : ""}</button>
        </>
      )}
    </div>
  );
}

/**
 * Une action qui demande confirmation, affichée à la place du bouton.
 * La question revient à la ligne et les boutons passent dessous s'il le faut : rien ne se superpose.
 */
export function ConfirmButton({ label, question, confirm = label, dismiss = "Annuler", onConfirm, disabled, className = "p-btn-outline p-btn-sm", danger }: { label: ReactNode; question: string; confirm?: ReactNode; dismiss?: string; onConfirm: () => void; disabled?: boolean; className?: string; danger?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={className} style={danger ? { color: "var(--p-accent-text)" } : undefined} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span role="group" aria-label="Confirmation" className="basis-full w-full flex flex-wrap items-center gap-2 p-2.5 rounded-xl text-[13.5px] whitespace-normal" style={{ background: "var(--p-accent-soft)" }}>
      <span className="flex-[1_1_200px] min-w-0 text-left break-words">{question}</span>
      <span className="flex flex-wrap gap-2">
        <button type="button" className="p-btn-primary p-btn-sm whitespace-nowrap" disabled={disabled} onClick={() => { onConfirm(); setAsking(false); }}>{confirm}</button>
        <button type="button" className="p-btn-outline p-btn-sm whitespace-nowrap" onClick={() => setAsking(false)}>{dismiss}</button>
      </span>
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
