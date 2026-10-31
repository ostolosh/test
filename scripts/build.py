#!/usr/bin/env python3
"""Збирає index.html: вбудовує копії JSON-файлів як запасні дані й додає обгортку документа.
Запуск: python3 scripts/build.py"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
FILES = ["announcement.json", "site.json", "menu.json", "achievements.json", "cabinets.json", "posts.json", "posts-manual.json", "gallery.json", "staff.json", "docs.json", "streets.json", "schedule.json", "events.json", "polls.json"]
blocks = "".join(
    '<script type="application/json" id="data-%s">%s</script>\n' % (f, (root/f).read_text().strip().replace("</", "<\\/"))
    for f in FILES)
src = root/"src/page.html"
en = (root/"i18n/en.json").read_text().strip().replace("</", "<\\/")
i18n = '<!--I18N-->\n<script type="application/json" id="i18n-en">%s</script>\n<!--/I18N-->' % en
page = re.sub(r"<!--DATA-->.*?<!--/DATA-->", lambda m: "<!--DATA-->\n" + blocks + "<!--/DATA-->", src.read_text(), flags=re.S)
page = re.sub(r"<!--I18N-->.*?<!--/I18N-->", lambda m: i18n, page, flags=re.S)
src.write_text(page)
head = ('<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="color-scheme" content="light dark">\n'
        '<meta name="theme-color" content="#f4f6f3" media="(prefers-color-scheme: light)">\n'
        '<meta name="theme-color" content="#0e1613" media="(prefers-color-scheme: dark)">\n'
        '<meta name="description" content="Кушницький ліцей (с. Кушниця, Закарпаття): новини, розклад, події, документи. Kushnytsia Lyceum: news, schedule, events.">\n</head>\n<body>\n')
(root/"index.html").write_text(head + page + "\n</body>\n</html>\n")
print("ok", len(page)//1024, "KB")
