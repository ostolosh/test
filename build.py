#!/usr/bin/env python3
"""Збирає index.html: вбудовує копії JSON-файлів як запасні дані й додає обгортку документа.
Запуск: python3 scripts/build.py"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
FILES = ["posts.json", "posts-manual.json", "gallery.json", "staff.json", "docs.json", "streets.json", "schedule.json"]
blocks = "".join(
    '<script type="application/json" id="data-%s">%s</script>\n' % (f, (root/f).read_text().strip().replace("</", "<\\/"))
    for f in FILES)
src = root/"src/page.html"
page = re.sub(r"<!--DATA-->.*?<!--/DATA-->", lambda m: "<!--DATA-->\n" + blocks + "<!--/DATA-->", src.read_text(), flags=re.S)
src.write_text(page)
head = ('<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n')
(root/"index.html").write_text(head + page + "\n</body>\n</html>\n")
print("ok", len(page)//1024, "KB")
