/** Ajouter un événement à son agenda : fichier .ics et lien Google Agenda. */
type CalendarEvent = { title: string; slug: string; startsAt: Date; durationMin: number; location: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const end = (e: CalendarEvent) => new Date(e.startsAt.getTime() + e.durationMin * 60000);
const pageUrl = (e: CalendarEvent) => `${window.location.origin}/e/${e.slug}`;
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function downloadIcs(e: CalendarEvent) {
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Presence//Evenements//FR", "BEGIN:VEVENT",
    `UID:${e.slug}@presence`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(end(e))}`,
    `SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(e.location)}`, `DESCRIPTION:${icsText(pageUrl(e))}`, `URL:${pageUrl(e)}`,
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
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(e.startsAt)}/${stamp(end(e))}`, details: pageUrl(e), location: e.location, ctz: "Europe/Paris" });
  return `https://calendar.google.com/calendar/render?${q}`;
}
