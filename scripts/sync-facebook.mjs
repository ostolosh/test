// Синхронізація публікацій зі сторінки Facebook у posts.json.
// Запуск: FB_PAGE_ID=... FB_PAGE_TOKEN=... node scripts/sync-facebook.mjs
// Потрібен Node.js 20+ (вбудований fetch). Залежностей немає.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;
const VERSION = process.env.FB_API_VERSION || "v21.0";
const LIMIT = Number(process.env.FB_LIMIT || 30);   // скільки останніх публікацій брати
const KEEP = Number(process.env.FB_KEEP || 200);    // скільки зберігати в posts.json

if (!PAGE_ID || !TOKEN) {
  console.error("Потрібні змінні FB_PAGE_ID та FB_PAGE_TOKEN.");
  process.exit(1);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const postsFile = path.join(root, "posts.json");
const imagesDir = path.join(root, "images");

async function graph(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error("Graph API: " + (json.error?.message || res.status));
  }
  return json;
}

async function downloadImage(url, id) {
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const type = res.headers.get("content-type") || "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const safeId = id.replace(/[^\w-]/g, "_");
    const file = `${safeId}.${ext}`;
    await writeFile(path.join(imagesDir, file), Buffer.from(await res.arrayBuffer()));
    return `images/${file}`;
  } catch {
    return "";
  }
}

async function main() {
  await mkdir(imagesDir, { recursive: true });

  let existing = { posts: [] };
  if (existsSync(postsFile)) {
    try { existing = JSON.parse(await readFile(postsFile, "utf8")); } catch {}
  }
  // приклади більше не потрібні після першої справжньої синхронізації
  const known = new Map(
    (existing.posts || []).filter((p) => !p.sample).map((p) => [p.id, p])
  );

  const fields = "id,message,created_time,permalink_url,full_picture";
  const url =
    `https://graph.facebook.com/${VERSION}/${PAGE_ID}/posts` +
    `?fields=${fields}&limit=${LIMIT}&access_token=${encodeURIComponent(TOKEN)}`;
  const { data = [] } = await graph(url);

  let added = 0;
  for (const p of data) {
    const text = (p.message || "").trim();
    if (!text && !p.full_picture) continue; // порожні службові події пропускаємо
    const prev = known.get(p.id);
    // зображення тягнемо лише раз: посилання Facebook CDN з часом протухають
    let image = prev?.image || "";
    if (!image && p.full_picture) image = await downloadImage(p.full_picture, p.id);
    if (!prev) added++;
    known.set(p.id, {
      id: p.id,
      date: p.created_time,
      text,
      image,
      url: p.permalink_url || "",
    });
  }

  const posts = [...known.values()]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, KEEP);

  const out = {
    updated: new Date().toISOString(),
    source: "facebook",
    pageUrl: `https://www.facebook.com/${PAGE_ID}`,
    posts,
  };
  await writeFile(postsFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`Готово: ${posts.length} публікацій, нових: ${added}.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
