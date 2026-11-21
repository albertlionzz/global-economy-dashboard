# -*- coding: utf-8 -*-
"""补丁：为已有数据快照补充各国经纬度（世界银行官方字段），用于地图气泡定位。
直接读取 data/global_data.json → 合并 → 重写 global_data.json 与 data.js
"""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get_json(url):
    import subprocess, shutil
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        exe = shutil.which("curl")
        if exe:
            p = subprocess.run([exe, "-sL", "--compressed", "--max-time", "60", url], capture_output=True)
            return json.loads(p.stdout.decode("utf-8", errors="replace"))
        raise


def main():
    path = os.path.join(OUT, "global_data.json")
    d = json.load(open(path, encoding="utf-8"))

    j = get_json("https://api.worldbank.org/v2/country?format=json&per_page=500")
    geo = {}
    for c in j[1]:
        try:
            lat = float(c.get("latitude") or 0)
            lon = float(c.get("longitude") or 0)
        except (TypeError, ValueError):
            continue
        if lat or lon:
            geo[c["id"]] = (round(lat, 4), round(lon, 4))
    print(f"世界银行经纬度：{len(geo)} 个国家/地区")

    hit = 0
    for r in d["countries"]:
        if r["iso3"] in geo:
            r["lat"], r["lon"] = geo[r["iso3"]]
            hit += 1
    miss = [r["iso3"] for r in d["countries"] if "lat" not in r]
    print(f"匹配成功 {hit} / {len(d['countries'])}；缺失 {len(miss)}：{miss[:15]}")

    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "data.js"), "w", encoding="utf-8") as f:
        f.write("window.__GLOBAL_DATA__ = ")
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("已更新 global_data.json 与 data.js")


if __name__ == "__main__":
    main()
