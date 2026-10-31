// Перетворює data/schedule.csv (колонки: клас, день, урок, предмет, вчитель, кабінет)
// на schedule.json для сторінки rozklad.html.
// Запуск: node scripts/schedule-from-csv.mjs [шлях до csv]
// Дзвінки (bells) беруться з наявного schedule.json, їх редагують там.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const csvPath = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(root, "data", "schedule.csv");
const outPath = path.join(root, "schedule.json");

const DAYS = ["Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця"];
const LAT = { "А": "a", "Б": "b", "В": "v", "Г": "g", "Д": "d", "Е": "e", "Є": "ye" };

function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === ";") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const raw = (await readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
// рядки, що починаються з #, це коментарі; слово ЗРАЗОК у них позначає тестові дані
const comments = raw.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
const isSample = comments.some((l) => /ЗРАЗОК/i.test(l));
const text = raw.split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("\n");
const [head, ...rows] = parseCSV(text);
if (!head || head.length < 4) throw new Error("Очікуються колонки: клас, день, урок, предмет, вчитель, кабінет");

const classes = new Map();
const problems = [];
rows.forEach((r, n) => {
  const [cls, day, lesson, subject, teacher = "", room = ""] = r.map((x) => x.trim());
  const m = /^(\d{1,2})\s*[-–]?\s*(\S*)$/.exec(cls);
  const di = DAYS.findIndex((d) => d.toLowerCase() === day.toLowerCase());
  const li = Number(lesson);
  if (!m || di < 0 || !(li >= 1 && li <= 12) || !subject) { problems.push(`рядок ${n + 2}: ${r.join(" | ")}`); return; }
  const letter = (m[2] || "").toUpperCase();
  const id = m[1] + (LAT[letter] || letter.toLowerCase());
  const name = m[1] + (letter ? "-" + letter : "");
  if (!classes.has(id)) classes.set(id, { id, name, days: {} });
  const d = classes.get(id).days;
  (d[di + 1] ||= [])[li - 1] = { s: subject, ...(teacher && { t: teacher }), ...(room && { r: room }) };
});

const prev = existsSync(outPath) ? JSON.parse(await readFile(outPath, "utf8")) : {};
const list = [...classes.values()].sort((a, b) => parseInt(a.id) - parseInt(b.id) || a.id.localeCompare(b.id));
// порожні місця між уроками стають null («вікно»)
list.forEach((c) => Object.keys(c.days).forEach((k) => { c.days[k] = Array.from(c.days[k], (x) => x || null); }));

const out = {
  sample: isSample,
  updated: new Date().toISOString().slice(0, 10),
  days: DAYS,
  bells: prev.bells || [],
  // навчальні періоди для календарів (змініть за потреби) і канікули/вихідні, у які уроків немає
  terms: prev.terms || [{ from: "2026-09-01", to: "2026-12-25" }, { from: "2027-01-11", to: "2027-05-28" }],
  holidays: prev.holidays || [],
  calendars: !isSample,
  classes: list,
};
await writeFile(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(`Класів: ${list.length}.` + (problems.length ? `\nПропущено ${problems.length} рядків:\n` + problems.join("\n") : ""));
