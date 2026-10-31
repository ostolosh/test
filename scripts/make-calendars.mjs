// Створює файли календарів calendar/<клас>.ics з schedule.json.
// Календар можна підписати в Google Календарі та Apple Календарі: при зміні розкладу він оновиться сам.
// Запуск: node scripts/make-calendars.mjs

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const data = JSON.parse(await readFile(path.join(root, "schedule.json"), "utf8"));
const outDir = path.join(root, "calendar");
await rm(outDir, { recursive: true, force: true });
if (data.sample) { console.log("Розклад позначено як зразок, календарі не створюються."); process.exit(0); }
await mkdir(outDir, { recursive: true });

const TZ = "Europe/Kyiv";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const hm = (s) => s.replace(":", "") + "00";
const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// рядок iCalendar не довший за 75 байтів
function fold(line) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const parts = []; let i = 0, limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // не різати символ навпіл
    parts.push(dec.decode(bytes.slice(i, end)));
    i = end; limit = 74;
  }
  return parts.join("\r\n ");
}

const holidayDays = new Set();
for (const h of data.holidays || []) {
  const from = parse(h.from), to = parse(h.to || h.from);
  for (let d = from; d <= to; d = new Date(d.getTime() + 86400000)) holidayDays.add(ymd(d));
}

const VTZ = [
  "BEGIN:VTIMEZONE", `TZID:${TZ}`,
  "BEGIN:STANDARD", "DTSTART:19701025T040000", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZNAME:EET", "END:STANDARD",
  "BEGIN:DAYLIGHT", "DTSTART:19700329T030000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZNAME:EEST", "END:DAYLIGHT",
  "END:VTIMEZONE",
];
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const BYDAY = ["", "MO", "TU", "WE", "TH", "FR"];
let files = 0;

for (const cls of data.classes) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Кушницький ліцей//Розклад уроків//UK", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc("Розклад " + cls.name)}`, `X-WR-TIMEZONE:${TZ}`, "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H", ...VTZ];
  (data.terms || []).forEach((term, ti) => {
    const from = parse(term.from), to = parse(term.to);
    for (let day = 1; day <= 5; day++) {
      const lessons = cls.days[String(day)] || [];
      // перша дата періоду з потрібним днем тижня
      let first = new Date(from);
      while (first.getUTCDay() !== day) first = new Date(first.getTime() + 86400000);
      if (first > to) continue;
      // виключаємо дні канікул та святкові
      const ex = [];
      for (let d = new Date(first); d <= to; d = new Date(d.getTime() + 7 * 86400000)) if (holidayDays.has(ymd(d))) ex.push(ymd(d));
      lessons.forEach((l, i) => {
        const bell = data.bells[i];
        if (!l || !bell) return;
        L.push("BEGIN:VEVENT",
          `UID:${cls.id}-t${ti}-d${day}-l${i + 1}@kushnytsia-lyceum`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=${TZ}:${ymd(first)}T${hm(bell[0])}`,
          `DTEND;TZID=${TZ}:${ymd(first)}T${hm(bell[1])}`,
          `RRULE:FREQ=WEEKLY;UNTIL=${ymd(to)}T215959Z;BYDAY=${BYDAY[day]}`);
        ex.forEach((e) => L.push(`EXDATE;TZID=${TZ}:${e}T${hm(bell[0])}`));
        L.push(`SUMMARY:${esc(`${i + 1}. ${l.s}`)}`);
        if (l.r) L.push(`LOCATION:${esc("Кабінет " + l.r)}`);
        if (l.t) L.push(`DESCRIPTION:${esc(l.t)}`);
        L.push("END:VEVENT");
      });
    }
  });
  L.push("END:VCALENDAR");
  await writeFile(path.join(outDir, `${cls.id}.ics`), L.map(fold).join("\r\n") + "\r\n");
  files++;
}
console.log(`Календарів створено: ${files}`);
