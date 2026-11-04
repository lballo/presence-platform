import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Apple, CalendarPlus, Copy, Download, MailOpen } from "lucide-react";
import { toast } from "sonner";
import { downloadIcs, googleCalendarUrl, outlookCalendarUrl, outlookSubscribeUrl, yahooCalendarUrl, type CalendarEvent } from "@/lib/calendar";

type Option = { key: string; label: string; icon: ReactNode; href?: string; newTab?: boolean; run?: () => void };

// Les logos, en une couleur, comme dans les agendas
const Letter = ({ c }: { c: string }) => <span aria-hidden="true" className="w-[18px] text-center font-bold text-[16px] leading-none">{c}</span>;
const ICONS = {
  google: <Letter c="G" />,
  apple: <Apple size={17} aria-hidden="true" />,
  outlook: <MailOpen size={17} aria-hidden="true" />,
  yahoo: <Letter c="!" />,
};

/** Un événement : Google Agenda, iCal (fichier .ics, pour Apple), Outlook, Yahoo. */
export function eventOptions(e: CalendarEvent): Option[] {
  return [
    { key: "google", label: "Google Agenda", icon: ICONS.google, href: googleCalendarUrl(e), newTab: true },
    { key: "ical", label: "iCal (Apple)", icon: ICONS.apple, run: () => downloadIcs(e) },
    { key: "outlook", label: "Outlook", icon: ICONS.outlook, href: outlookCalendarUrl(e), newTab: true },
    { key: "yahoo", label: "Yahoo Agenda", icon: ICONS.yahoo, href: yahooCalendarUrl(e), newTab: true },
  ];
}

/** Tout mon calendrier, en abonnement qui se met à jour seul ; le fichier et le lien pour les autres agendas. */
export function feedOptions(l: { feedUrl: string; webcalUrl: string; googleUrl: string }): Option[] {
  const copy = async () => {
    try { await navigator.clipboard.writeText(l.feedUrl); toast.success("Lien copié"); }
    catch { toast.error("La copie n’a pas fonctionné."); }
  };
  return [
    { key: "google", label: "Google Agenda", icon: ICONS.google, href: l.googleUrl, newTab: true },
    { key: "ical", label: "iCal (Apple)", icon: ICONS.apple, href: l.webcalUrl },
    { key: "outlook", label: "Outlook", icon: ICONS.outlook, href: outlookSubscribeUrl(l.feedUrl), newTab: true },
    { key: "fichier", label: "Télécharger le fichier .ics", icon: <Download size={17} aria-hidden="true" />, href: `${l.feedUrl}?telecharger` },
    { key: "lien", label: "Copier le lien", icon: <Copy size={17} aria-hidden="true" />, run: copy },
  ];
}

/**
 * Le petit logo calendrier : au clic, le choix de l'agenda. Sans nouvelle page.
 * `label` en fait un bouton avec texte ; sinon, une icône ronde.
 */
export function AddToCalendar({ options, label, title = "Ajouter à mon calendrier", note, align = "right" }: { options: Option[]; label?: string; title?: string; note?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (ev: PointerEvent) => { if (!box.current?.contains(ev.target as Node)) setOpen(false); };
    const key = (ev: KeyboardEvent) => {
      const items = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (ev.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); items[(at + 1) % items.length]?.focus(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const item = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14.5px] text-left no-underline hover:bg-[var(--p-hover)] focus:bg-[var(--p-hover)] outline-none";
  return (
    <div ref={box} className={`relative ${label ? "" : "flex-none"}`}>
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} title={label ? undefined : title} aria-label={label ? undefined : title}
        className={label ? "p-btn-outline p-btn-sm w-full" : "w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--p-hover)]"} style={label ? undefined : { color: "var(--p-ink)" }}
        onClick={() => setOpen(!open)}>
        <CalendarPlus size={label ? 15 : 19} strokeWidth={1.7} />{label}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={title} className={`absolute z-40 top-[calc(100%+6px)] ${align === "right" ? "right-0" : "left-0"} w-[min(260px,calc(100vw-32px))] p-1.5 rounded-2xl border shadow-xl flex flex-col`} style={{ background: "var(--p-surface)", borderColor: "var(--p-line)", color: "var(--p-ink)" }}>
          {options.map((o) => o.href
            ? <a key={o.key} role="menuitem" href={o.href} target={o.newTab ? "_blank" : undefined} rel={o.newTab ? "noopener" : undefined} className={item} style={{ color: "var(--p-ink)" }} onClick={() => setOpen(false)}>{o.icon}{o.label}</a>
            : <button key={o.key} role="menuitem" type="button" className={item} onClick={() => { o.run?.(); setOpen(false); }}>{o.icon}{o.label}</button>)}
          {note && <p className="m-0 px-3.5 pt-1.5 pb-2 text-[12px] leading-snug p-muted border-t mt-1" style={{ borderColor: "var(--p-line)" }}>{note}</p>}
        </div>
      )}
    </div>
  );
}
