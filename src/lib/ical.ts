/**
 * A calendar feed (iCalendar, RFC 5545) that Google Calendar, Outlook and
 * phone calendars subscribe to (pure). Dates are "YYYY-MM-DD" all-day events.
 */

export type CalendarEvent = {
  /** Stable id, so an event moves instead of duplicating when its date changes. */
  uid: string;
  title: string;
  description?: string;
  url?: string;
  /** First day (inclusive). */
  start: string;
  /** Last day (inclusive); same as start for a one-day event. */
  end: string;
};

/** Escape text values: backslash, semicolon, comma and newlines. */
export function escapeText(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Lines longer than 75 bytes are folded (CRLF + space). Counted in UTF-8 bytes
 * and never splitting a character, so Arabic text arrives intact.
 */
export function foldLine(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    // The first line may hold 75 bytes; continuation lines start with a space, so 74.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const ymd = (iso: string) => iso.replaceAll("-", "");
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildCalendar({ name, events, now = new Date() }: { name: string; events: CalendarEvent[]; now?: Date }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PMS//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    // Ask calendar apps to check for changes every hour.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const end = e.end < e.start ? e.start : e.end;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(e.start)}`,
      // All-day events end the morning after their last day.
      `DTEND;VALUE=DATE:${ymd(nextDay(end))}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
