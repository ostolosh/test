// Надсилає нові новини (з Facebook та написані в адмін-панелі) у Telegram-канал і, за наявності доступу, у Viber-канал.
// Пам'ятає вже надіслане в data/notified.json, тому не дублює повідомлення.
// Перший запуск лише запам'ятовує наявні новини й нічого не надсилає.
//
// Змінні середовища (усі необов'язкові, без них відповідний месенджер пропускається):
//   SITE_URL            адреса сайту, наприклад https://kushnytsia-lyceum.github.io/site
//   TELEGRAM_BOT_TOKEN  токен бота від @BotFather
//   TELEGRAM_CHAT_ID    @назва_каналу або числовий id
//   VIBER_AUTH_TOKEN, VIBER_FROM   Viber (не перевірено, див. README)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN, TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const VB_TOKEN = process.env.VIBER_AUTH_TOKEN, VB_FROM = process.env.VIBER_FROM;

const readJSON = async (f, d) => (existsSync(path.join(root, f)) ? JSON.parse(await readFile(path.join(root, f), "utf8")) : d);

// той самий алгоритм, що й на сайті: id ручної новини з дати й заголовка
function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

const fb = (await readJSON("posts.json", { posts: [] })).posts || [];
const manual = ((await readJSON("posts-manual.json", { posts: [] })).posts || []).filter((m) => m && m.title);

const all = [
  ...fb.filter((p) => !p.legacy && !p.sample).map((p) => {
    const lines = String(p.text || "").trim().split(/\n+/);
    return { id: "fb:" + p.id, date: p.date, title: lines.shift() || "Публікація", body: lines.join("\n"), image: p.image, link: p.url || SITE };
  }),
  ...manual.map((m) => {
    const id = "m" + hash((m.date || "") + "|" + m.title);
    return { id: "man:" + id, date: m.date, title: m.title, body: (m.text || "").trim(), image: m.image || (m.gallery && m.gallery[0]) || "", link: SITE ? `${SITE}/#post-${id}` : "" };
  }),
];

const notifiedPath = path.join(root, "data", "notified.json");
await mkdir(path.dirname(notifiedPath), { recursive: true });
let notified = existsSync(notifiedPath) ? JSON.parse(await readFile(notifiedPath, "utf8")) : null;
if (!notified) {
  await writeFile(notifiedPath, JSON.stringify({ ids: all.map((p) => p.id) }, null, 1) + "\n");
  console.log(`Перший запуск: запам'ятовано ${all.length} наявних новин, нічого не надіслано.`);
  process.exit(0);
}
const done = new Set(notified.ids);
// надсилаємо лише свіжі новини: старі (наприклад, перше завантаження історії з Facebook) тільки позначаємо як опрацьовані
const MAX_AGE_MS = Number(process.env.NOTIFY_MAX_AGE_DAYS || 3) * 86400000;
const unseen = all.filter((p) => !done.has(p.id));
const fresh = unseen.filter((p) => Date.now() - new Date(p.date) <= MAX_AGE_MS).sort((a, b) => new Date(a.date) - new Date(b.date));
unseen.filter((p) => !fresh.includes(p)).forEach((p) => done.add(p.id));
if (!fresh.length) { await writeFile(notifiedPath, JSON.stringify({ ids: [...done] }, null, 1) + "\n"); console.log("Нових свіжих новин немає."); process.exit(0); }
if (!TG_TOKEN && !VB_TOKEN) console.log("Жоден месенджер не налаштовано; новини лише позначаються як опрацьовані.");

const abs = (u) => (!u ? "" : /^https?:/.test(u) ? u : SITE ? `${SITE}/${u.replace(/^\//, "")}` : "");
const short = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);

async function telegram(p) {
  const text = [p.title, "", short(p.body, 700), p.link ? "\nЧитати: " + p.link : ""].join("\n").trim();
  const photo = abs(p.image);
  const call = (method, body) => fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  let res = photo && text.length <= 1024 ? await call("sendPhoto", { chat_id: TG_CHAT, photo, caption: text }) : null;
  if (!res || !res.ok) res = await call("sendMessage", { chat_id: TG_CHAT, text: text.slice(0, 4096), disable_web_page_preview: false });
  if (!res.ok) throw new Error("Telegram: " + res.description);
}

// Viber: публікація в канал через Post API. Цей блок написано за пам'яттю документації й НЕ перевірений на практиці.
// Помилка тут не зупиняє роботу: вона лише виводиться в журнал.
async function viber(p) {
  const text = [p.title, "", short(p.body, 800), p.link ? "\n" + p.link : ""].join("\n").trim();
  const res = await fetch("https://chatapi.viber.com/pa/post", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Viber-Auth-Token": VB_TOKEN },
    body: JSON.stringify({ from: VB_FROM, type: "text", text }),
  }).then((r) => r.json());
  if (res.status !== 0) throw new Error("Viber: " + JSON.stringify(res));
}

for (const p of fresh) {
  let sentAny = false;
  if (TG_TOKEN && TG_CHAT) { try { await telegram(p); sentAny = true; console.log("Telegram ✓", p.title); } catch (e) { console.error(e.message); process.exitCode = 1; continue; } }
  if (VB_TOKEN && VB_FROM) { try { await viber(p); console.log("Viber ✓", p.title); } catch (e) { console.error(e.message); } }
  done.add(p.id);
}
await writeFile(notifiedPath, JSON.stringify({ ids: [...done] }, null, 1) + "\n");
