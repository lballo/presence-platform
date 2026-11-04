/** Ajouter un événement à son agenda : Google Agenda, Apple (fichier .ics), Outlook ou Yahoo. */
export type CalendarEvent = { title: string; slug: string; startsAt: Date; durationMin: number; days?: number; location: string; details?: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}/, "");
// Un événement sur plusieurs jours finit le dernier jour, à la même heure
const end = (e: CalendarEvent) => new Date(e.startsAt.getTime() + Math.max(0, (e.days ?? 1) - 1) * 86400000 + e.durationMin * 60000);
const pageUrl = (e: CalendarEvent) => `${window.location.origin}/e/${e.slug}`;
const details = (e: CalendarEvent) => [e.details, pageUrl(e)].filter(Boolean).join("\n\n");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function downloadIcs(e: CalendarEvent) {
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Presence//Evenements//FR", "BEGIN:VEVENT",
    `UID:${e.slug}@presence`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(end(e))}`,
    `SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(e.location)}`, `DESCRIPTION:${icsText(details(e))}`, `URL:${pageUrl(e)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${e.slug}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(e: CalendarEvent) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(e.startsAt)}/${stamp(end(e))}`, details: details(e), location: e.location, ctz: "Europe/Paris" });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function outlookCalendarUrl(e: CalendarEvent) {
  const q = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: iso(e.startsAt), enddt: iso(end(e)), body: details(e), location: e.location });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q}`;
}

export function yahooCalendarUrl(e: CalendarEvent) {
  const q = new URLSearchParams({ v: "60", title: e.title, st: stamp(e.startsAt), et: stamp(end(e)), desc: details(e), in_loc: e.location });
  return `https://calendar.yahoo.com/?${q}`;
}

/** S'abonner à tout mon calendrier dans Outlook (le lien https du fichier .ics). */
export const outlookSubscribeUrl = (feedUrl: string) => `https://outlook.live.com/calendar/0/addfromweb?${new URLSearchParams({ url: feedUrl, name: "Présence" })}`;
