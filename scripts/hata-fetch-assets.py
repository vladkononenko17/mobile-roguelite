#!/usr/bin/env python3
"""Download CC0 assets from Poly Haven for «Хата з краю».

Runs in GitHub Actions (the dev sandbox cannot reach polyhaven.com).
Reads hata/assets-wanted.json:
  {"textures": {"<id>": "1k"}, "models": {"<id>": "1k"}, "hdris": {"<id>": "1k"}}
Always refreshes hata/assets-index.json (id, type, name, categories, tags)
so assets can be chosen offline. Files land in public/hata/ph/<kind>/<id>/.
All Poly Haven assets are CC0.
"""
import json
import os
import sys
import urllib.request

UA = "hata-z-krayu-asset-fetch/1.0 (github.com/vladkononenko17/mobile-roguelite)"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "hata", "ph")
TYPES = {"textures": "textures", "models": "models", "hdris": "hdris"}
# Texture maps to keep (Poly Haven map name -> our file stem).
TEX_MAPS = {
    "Diffuse": "diff",
    "nor_gl": "nor",
    "arm": "arm",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def get_json(url):
    return json.loads(get(url))


def save(url, path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  {os.path.relpath(path, ROOT)}  {len(data) // 1024} KB")


def pick(res_map, res):
    for r in (res, "1k", "2k", "4k"):
        if r in res_map:
            return res_map[r]
    return next(iter(res_map.values()))


def fetch_texture(aid, res):
    files = get_json(f"https://api.polyhaven.com/files/{aid}")
    for ph_name, stem in TEX_MAPS.items():
        if ph_name not in files:
            continue
        fmt = pick(files[ph_name], res)
        entry = fmt.get("jpg") or fmt.get("png")
        ext = "jpg" if "jpg" in fmt else "png"
        save(entry["url"], os.path.join(OUT, "textures", aid, f"{stem}.{ext}"))


def fetch_model(aid, res):
    files = get_json(f"https://api.polyhaven.com/files/{aid}")
    g = pick(files["gltf"], res)["gltf"]
    base = os.path.join(OUT, "models", aid)
    save(g["url"], os.path.join(base, os.path.basename(g["url"])))
    for rel, inc in g.get("include", {}).items():
        save(inc["url"], os.path.join(base, rel))


def fetch_hdri(aid, res):
    files = get_json(f"https://api.polyhaven.com/files/{aid}")
    h = pick(files["hdri"], res)
    entry = h.get("hdr") or h.get("exr")
    ext = "hdr" if "hdr" in h else "exr"
    save(entry["url"], os.path.join(OUT, "hdris", f"{aid}.{ext}"))


def main():
    index = []
    for t in ("textures", "models", "hdris"):
        data = get_json(f"https://api.polyhaven.com/assets?t={t}")
        for aid, a in data.items():
            index.append({
                "id": aid, "type": t, "name": a.get("name"),
                "cat": a.get("categories", []), "tags": a.get("tags", []),
                "dims": a.get("dimensions"),
            })
    index.sort(key=lambda a: (a["type"], a["id"]))
    with open(os.path.join(ROOT, "hata", "assets-index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print(f"index: {len(index)} assets")

    wanted_path = os.path.join(ROOT, "hata", "assets-wanted.json")
    wanted = json.load(open(wanted_path)) if os.path.exists(wanted_path) else {}
    failed = []
    for kind, fn in (("textures", fetch_texture), ("models", fetch_model), ("hdris", fetch_hdri)):
        for aid, res in wanted.get(kind, {}).items():
            print(f"{kind}/{aid} @ {res}")
            try:
                fn(aid, res)
            except Exception as e:  # keep going, report at the end
                print(f"  FAILED: {e}")
                failed.append(f"{kind}/{aid}: {e}")
    with open(os.path.join(ROOT, "hata", "assets-fetch.log"), "w") as f:
        f.write("\n".join(failed) if failed else "ok\n")
    if failed:
        print("failed:\n" + "\n".join(failed))


if __name__ == "__main__":
    sys.exit(main())
