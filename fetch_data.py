# -*- coding: utf-8 -*-
"""
全球经济数据抓取脚本
数据源:
  1. World Bank Open Data API (api.worldbank.org) - 官方开放 API, 无密钥, 支持 CORS
  2. CBOE (Chicago Board Options Exchange) - VIX 官方历史数据 CSV
输出: data/global_data.json 与 data/data.js
"""
import json, os, csv, io, math, statistics, datetime, re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://api.worldbank.org/v2"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GlobalEconDashboard/1.0"}

# 样本口径：按经济体量（现价美元 GDP 最新可得值）排名，仅取前 TOP_N 名。
# 目的是提升抓取效率并让排名聚焦主要经济体（前 50 大经济体合计占全球 GDP 约 90%+）。
TOP_N = 50
# 作为兜底门槛：排除人口不足 100 万的微型经济体（正常情况前 50 大经济体均满足）
MIN_POP = 1_000_000

# ---------------- 指标定义 ----------------
INDICATORS = {
    "SP.POP.TOTL":        ("人口总数", "人", "1990:2025"),
    "SP.POP.GROW":        ("人口增长率", "%", "2014:2025"),
    "SP.DYN.LE00.IN":     ("预期寿命", "岁", "2014:2025"),
    "SP.POP.DPND":        ("抚养比", "%", "2014:2025"),
    "SP.URB.TOTL.IN.ZS":  ("城镇化率", "%", "2014:2025"),
    "NY.GDP.MKTP.CD":     ("GDP(现价美元)", "美元", "2014:2025"),
    "NY.GDP.PCAP.PP.KD":  ("人均GDP(PPP不变价)", "国际元", "2014:2025"),
    "NY.GDP.MKTP.KD.ZG":  ("实际GDP增长率", "%", "2010:2025"),
    "NY.GDP.PCAP.KD.ZG":  ("人均GDP增长率", "%", "2014:2025"),
    "FP.CPI.TOTL.ZG":     ("CPI通胀率", "%", "2014:2025"),
    "SL.UEM.TOTL.ZS":     ("失业率", "%", "2014:2025"),
    "HD.HCI.OVRL":        ("人力资本指数", "0-1", "2015:2025"),
    "GC.DOD.TOTL.GD.ZS":  ("政府债务/GDP", "%", "2014:2025"),
    "BN.CAB.XOKA.GD.ZS":  ("经常账户余额/GDP", "%", "2014:2025"),
    "FI.RES.TOTL.CD":     ("外汇储备(含黄金)", "美元", "2014:2025"),
    "NE.EXP.GNFS.ZS":     ("出口/GDP", "%", "2014:2025"),
    "NE.IMP.GNFS.CD":     ("进口额(现价美元)", "美元", "2014:2025"),
    "DT.DOD.DECT.GN.ZS":  ("外债/GNI", "%", "2014:2025"),
    "IT.NET.USER.ZS":     ("互联网普及率", "%", "2014:2025"),
}

# 世界/全球序列(用于长期趋势图)
WORLD_SERIES = {
    "WLD_GDP_GROWTH": ("NY.GDP.MKTP.KD.ZG", "WLD", "1980:2025"),
    "WLD_POP":        ("SP.POP.TOTL", "WLD", "1960:2025"),
    "WLD_INFL":       ("FP.CPI.TOTL.ZG", "WLD", "1980:2025"),
    "WLD_GDP":        ("NY.GDP.MKTP.CD", "WLD", "1990:2025"),
}


def _curl_fetch(url):
    """部分站点(如 IMF)的 WAF 会拦截 Python 的 TLS 指纹, 用 curl 兜底"""
    import subprocess, shutil
    exe = shutil.which("curl")
    if not exe:
        return None
    # 注意: 部分站点(如 IMF)会拦截伪装成浏览器的 UA, 这里使用 curl 默认 UA
    p = subprocess.run(
        [exe, "-sL", "--compressed", "--max-time", "90", url],
        capture_output=True)
    txt = p.stdout.decode("utf-8", errors="replace")
    return txt or None


def get_json(url, retries=3):
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
    txt = _curl_fetch(url)  # 兜底
    if txt:
        try:
            return json.loads(txt)
        except Exception:
            pass
    raise RuntimeError(f"请求失败: {url} -> {last}")


def get_text(url, retries=3):
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
    txt = _curl_fetch(url)  # 兜底
    if txt:
        return txt
    raise RuntimeError(f"请求失败: {url} -> {last}")


def fetch_countries():
    """拉取中文国名/地区/收入组, 剔除聚合体"""
    j = get_json(f"{BASE}/zh/country?format=json&per_page=500")
    rows = j[1]
    out = {}
    for c in rows:
        if not c.get("region") or c["region"]["value"] in ("", "聚合体"):
            continue
        if c["region"]["id"] == "NA":
            continue
        # 经纬度：世界银行官方国家坐标字段，用于地图气泡定位
        try:
            lat = float(c["latitude"]) if c.get("latitude") else None
            lon = float(c["longitude"]) if c.get("longitude") else None
        except (TypeError, ValueError):
            lat = lon = None
        out[c["id"]] = {
            "iso3": c["id"],
            "iso2": c["iso2Code"],
            "name": c["name"],
            "region": c["region"]["value"],
            "income": c["incomeLevel"]["value"] if c.get("incomeLevel") else "",
            "capital": c.get("capitalCity", ""),
            "lat": round(lat, 4) if lat is not None else None,
            "lon": round(lon, 4) if lon is not None else None,
        }
    return out


def fetch_indicator(code, date_range, isos=None):
    """抓取单个指标。isos 为 ISO3 列表时只抓这些经济体（大幅减少返回体量）"""
    scope = "all" if not isos else ";".join(isos)
    rows, page = [], 1
    while True:
        url = f"{BASE}/country/{scope}/indicator/{code}?format=json&per_page=15000&date={date_range}&page={page}"
        j = get_json(url)
        if len(j) < 2 or not j[1]:
            break
        rows.extend(j[1])
        pages = j[0]["pages"]
        if page >= pages:
            break
        page += 1
    data = {}
    for r in rows:
        iso = r.get("countryiso3code", "")
        if not iso:
            continue
        v = r.get("value")
        if v is None:
            continue
        data.setdefault(iso, {})[int(r["date"])] = float(v)
    return data


def latest(series, years_desc):
    for y in years_desc:
        if y in series:
            return series[y], y
    return None, None


def recent_avg(series, years_desc, n):
    vals = [series[y] for y in years_desc[:n] if y in series]
    if len(vals) < max(1, min(n, 2)):
        return None
    return sum(vals) / len(vals)


# ---------------- 归一化 ----------------
def percentile(sorted_vals, p):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * p / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


class Scaler:
    """winsorized min-max 归一化 -> 0..100"""

    def __init__(self, values, lo_p=5, hi_p=95):
        clean = [v for v in values if v is not None]
        self.arr = sorted(clean)
        if not self.arr:
            self.lo = self.hi = None
        else:
            self.lo = percentile(self.arr, lo_p)
            self.hi = percentile(self.arr, hi_p)
            if self.hi is not None and self.lo is not None and self.hi <= self.lo:
                self.hi = self.arr[-1]
                self.lo = self.arr[0]
            if self.hi is not None and self.hi == self.lo:
                self.hi = self.lo + 1e-9

    def score(self, v):
        if v is None or self.lo is None:
            return None
        s = (v - self.lo) / (self.hi - self.lo) * 100.0
        return max(0.0, min(100.0, s))


# ---------------- 主流程 ----------------
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("[1/6] 抓取国家清单(中文) ...")
    countries = fetch_countries()
    print(f"      国家/地区数: {len(countries)}")

    YEARS = list(range(2025, 2009, -1))  # 2025 -> 2010

    # ---- 阶段一：先抓 GDP，按经济体量排名，锁定前 TOP_N 名 ----
    print(f"[2/6] 抓取 GDP 总量，按经济体量排名并锁定前 {TOP_N} 名 ...")
    gdp_all = fetch_indicator("NY.GDP.MKTP.CD", INDICATORS["NY.GDP.MKTP.CD"][2])
    pops_all = fetch_indicator("SP.POP.TOTL", INDICATORS["SP.POP.TOTL"][2])

    ranked = []
    for iso in countries:
        gv, gy = latest(gdp_all.get(iso, {}), YEARS)
        if gv is None:
            continue
        pv, _ = latest(pops_all.get(iso, {}), YEARS)
        if pv is None or pv < MIN_POP:
            continue
        ranked.append((gv, iso, gy))
    ranked.sort(key=lambda x: -x[0])
    sample = [iso for _, iso, _ in ranked[:TOP_N]]
    gdp_rank = {iso: i for i, (_, iso, _) in enumerate(ranked[:TOP_N], 1)}
    if ranked:
        cut = ranked[TOP_N - 1] if len(ranked) >= TOP_N else ranked[-1]
        print(f"      入选样本: {len(sample)} 个经济体 · 门槛 GDP {cut[0]/1e9:.0f} 十亿美元（{cut[1]}，{cut[2]} 年）")

    # ---- 阶段二：只针对入选经济体抓取其余指标（显著减少请求体量） ----
    print(f"[3/6] 抓取其余世界银行指标（仅前 {len(sample)} 名） ...")
    ind_data = {"NY.GDP.MKTP.CD": gdp_all, "SP.POP.TOTL": pops_all}
    rest = {c: d for c, (_, _, d) in INDICATORS.items() if c not in ind_data}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_indicator, c, d, sample): c for c, d in rest.items()}
        for f in futs:
            code = futs[f]
            ind_data[code] = f.result()
            print(f"      {code} OK ({len(ind_data[code])} 国)")

    print("[4/6] 抓取全球长期序列 ...")
    world = {}
    for key, (code, iso, rng) in WORLD_SERIES.items():
        url = f"{BASE}/country/{iso}/indicator/{code}?format=json&per_page=800&date={rng}"
        j = get_json(url)
        series = {}
        if len(j) > 1 and j[1]:
            for r in j[1]:
                if r.get("value") is not None:
                    series[int(r["date"])] = float(r["value"])
        world[key] = series
        print(f"      {key} OK ({len(series)} 年)")

    print("[5/6] 抓取 IMF 政府债务(补充世界银行覆盖率不足) ...")
    # 旧 DataMapper blob 接口(api/v1)已下线(返回 Blob not found)，改用 SDMX:
    # dataflow = IMF.RES,WEO，维度顺序 = COUNTRY.INDICATOR.FREQUENCY，多国用 "+" 连接
    IMF_CACHE = os.path.join(OUT_DIR, "imf_debt_cache.json")
    imf_debt, imf_note = {}, ""
    try:
        codes = "+".join(sample)
        xml = get_text(f"https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/{codes}.GGXWDG_NGDP.A")
        # 重要: WEO 含未来预测值(至 2031)，必须截断到已实现年份，否则债务数据会被预测值污染
        cap = min(2025, datetime.datetime.now().year)
        for attrs, body in re.findall(r"<Series ([^>]*)>(.*?)</Series>", xml, re.S):
            m = re.search(r'COUNTRY="([A-Z0-9]+)"', attrs)
            if not m:
                continue
            obs = {int(y): float(v) for y, v in
                   re.findall(r'TIME_PERIOD="(\d{4})" OBS_VALUE="([-\d.]+)"', body)}
            years = [y for y in obs if y <= cap]
            if years:
                imf_debt[m.group(1)] = obs[max(years)]
        if not imf_debt:
            raise RuntimeError("SDMX 返回空序列")
        imf_note = f"IMF WEO SDMX，截断至 {cap} 年"
        print(f"      IMF 一般政府总债务/GDP: {len(imf_debt)} 国（{imf_note}）")
        with open(IMF_CACHE, "w", encoding="utf-8") as f:
            json.dump({"cached_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                       "cap": cap, "data": imf_debt}, f, ensure_ascii=False)
    except Exception as e:
        # 接口异常时回落到上次成功的缓存，避免债务维度缺失导致 MFI 不可比
        print(f"      IMF 抓取失败({e})，尝试使用本地缓存 ...")
        try:
            c = json.load(open(IMF_CACHE, encoding="utf-8"))
            imf_debt = c.get("data", {})
            imf_note = f"IMF 缓存（抓取于 {c.get('cached_at', '?')}）"
            print(f"      已加载缓存: {len(imf_debt)} 国（{imf_note}）")
        except Exception as e2:
            print(f"      无可用缓存({e2})，仅使用世界银行债务数据")

    print("[6/6] 抓取 CBOE VIX 官方历史 ...")
    vix_txt = get_text("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv")
    vix_rows = []
    rd = csv.DictReader(io.StringIO(vix_txt))
    for r in rd:
        try:
            d = datetime.datetime.strptime(r["DATE"], "%m/%d/%Y").date()
            vix_rows.append((d.isoformat(), float(r["CLOSE"])))
        except Exception:
            continue
    vix_rows.sort(key=lambda x: x[0])
    print(f"      VIX 记录数: {len(vix_rows)}, 最新: {vix_rows[-1]}")

    # ---------------- 国家记录构建 ----------------
    recs = []
    for iso in sample:
        c = countries[iso]
        g = lambda code: ind_data[code].get(iso, {})
        pop, pop_y = latest(g("SP.POP.TOTL"), YEARS)
        rec = dict(c)
        rec["gdp_rank"] = gdp_rank.get(iso)
        rec["pop"] = pop
        rec["gdp"] = latest(g("NY.GDP.MKTP.CD"), YEARS)[0]
        rec["gdp_pc_ppp"] = latest(g("NY.GDP.PCAP.PP.KD"), YEARS)[0]
        rec["growth"] = recent_avg(g("NY.GDP.MKTP.KD.ZG"), YEARS, 5)
        rec["growth_last"] = latest(g("NY.GDP.MKTP.KD.ZG"), YEARS)[0]
        rec["growth_vol"] = None
        gv = [g("NY.GDP.MKTP.KD.ZG")[y] for y in range(2015, 2025) if y in g("NY.GDP.MKTP.KD.ZG")]
        if len(gv) >= 6:
            rec["growth_vol"] = statistics.pstdev(gv)
        rec["gdp_pc_growth"] = recent_avg(g("NY.GDP.PCAP.KD.ZG"), YEARS, 5)
        rec["infl"] = latest(g("FP.CPI.TOTL.ZG"), YEARS)[0]
        rec["infl_avg5"] = recent_avg(g("FP.CPI.TOTL.ZG"), YEARS, 5)
        rec["unemp"] = latest(g("SL.UEM.TOTL.ZS"), YEARS)[0]
        rec["life"] = latest(g("SP.DYN.LE00.IN"), YEARS)[0]
        rec["hci"] = latest(g("HD.HCI.OVRL"), YEARS)[0]
        wb_debt = latest(g("GC.DOD.TOTL.GD.ZS"), YEARS)[0]
        # 优先 IMF 一般政府总债务(覆盖率更高), 回落到世界银行中央政府债务
        rec["debt"] = imf_debt.get(iso, wb_debt)
        rec["debt_src"] = "IMF" if iso in imf_debt else ("WB" if wb_debt is not None else None)
        rec["cab"] = latest(g("BN.CAB.XOKA.GD.ZS"), YEARS)[0]
        rec["exports_pct"] = latest(g("NE.EXP.GNFS.ZS"), YEARS)[0]
        rec["ext_debt"] = latest(g("DT.DOD.DECT.GN.ZS"), YEARS)[0]
        rec["net_users"] = latest(g("IT.NET.USER.ZS"), YEARS)[0]
        rec["urban"] = latest(g("SP.URB.TOTL.IN.ZS"), YEARS)[0]
        rec["dep_ratio"] = latest(g("SP.POP.DPND"), YEARS)[0]
        rec["pop_grow"] = latest(g("SP.POP.GROW"), YEARS)[0]
        # 外储覆盖进口月数
        res = latest(g("FI.RES.TOTL.CD"), YEARS)[0]
        imp = latest(g("NE.IMP.GNFS.CD"), YEARS)[0]
        rec["reserves"] = res
        rec["reserve_months"] = (res / (imp / 12.0)) if (res and imp and imp > 0) else None
        recs.append(rec)

    # ---------------- 指数计算 ----------------
    print("[计算] EPI 经济繁荣指数 与 MFI 宏观恐慌指数 ...")

    def build_scaler(vals, **kw):
        return Scaler([v for v in vals if v is not None], **kw)

    # --- EPI 维度 ---
    log_ppp = [math.log10(r["gdp_pc_ppp"]) if r["gdp_pc_ppp"] else None for r in recs]
    sc_ppp = build_scaler(log_ppp)
    sc_growth = build_scaler([r["growth"] for r in recs])
    sc_unemp = build_scaler([r["unemp"] for r in recs])
    infl_dev = [abs(r["infl"] - 2.0) if r["infl"] is not None else None for r in recs]
    sc_infl = build_scaler(infl_dev)
    sc_life = build_scaler([r["life"] for r in recs])
    sc_res = build_scaler([r["reserve_months"] for r in recs])
    sc_cab = build_scaler([r["cab"] for r in recs])
    popdev = [abs((r["pop_grow"] or 0) - 0.8) for r in recs]
    sc_pop = build_scaler(popdev)

    EPI_W = {
        "富裕水平": 28, "增长动能": 16, "就业质量": 12, "物价稳定": 12,
        "人力资本": 16, "外部韧性": 10, "人口活力": 6,
    }

    # --- MFI 维度 ---
    sc_m_infl = build_scaler(infl_dev)
    stag = [max(0.0, 3.0 - r["growth"]) if r["growth"] is not None else None for r in recs]
    sc_stag = build_scaler(stag)
    sc_m_unemp = build_scaler([r["unemp"] for r in recs])
    sc_debt = build_scaler([r["debt"] for r in recs])
    ext_vul = []
    for r in recs:
        cab = r["cab"]
        rm = r["reserve_months"]
        if cab is None and rm is None:
            ext_vul.append(None)
        else:
            ext_vul.append((-(cab or 0.0)) + max(0.0, 6.0 - (rm if rm is not None else 6.0)))
    sc_ext = build_scaler(ext_vul)
    sc_vol = build_scaler([r["growth_vol"] for r in recs])

    MFI_W = {
        "通胀压力": 22, "增长失速": 20, "就业压力": 16,
        "债务压力": 14, "外部脆弱": 14, "宏观波动": 14,
    }

    def composite(parts, weights):
        """parts: dict 维度->(分数|None); 缺失维度按比例重分配权重"""
        avail = {k: v for k, v in parts.items() if v is not None and weights.get(k, 0) > 0}
        wtot = sum(weights[k] for k in avail)
        if wtot <= 0:
            return None, {}
        contrib = {k: v * weights[k] / wtot for k, v in avail.items()}
        return sum(contrib.values()), contrib

    def inv(sc, v):
        """反向得分: 值越大越差 -> 分数越低"""
        if v is None:
            return None
        s = sc.score(v)
        return None if s is None else 100 - s

    for r in recs:
        # 人力资本: 预期寿命(50%) + 人力资本指数(50%), 缺一项则用另一项
        life_s = sc_life.score(r["life"])
        hci_s = r["hci"] * 100 if r["hci"] is not None else None
        if life_s is not None and hci_s is not None:
            human = life_s * 0.5 + hci_s * 0.5
        else:
            human = life_s if life_s is not None else hci_s

        # 外部韧性: 外储覆盖月数(60%) + 经常账户顺差(40%)
        res_s = sc_res.score(r["reserve_months"])
        cab_s = inv(sc_cab, r["cab"])  # 顺差越大越好
        if res_s is not None and cab_s is not None:
            resil = res_s * 0.6 + cab_s * 0.4
        else:
            resil = res_s if res_s is not None else cab_s

        epi_parts = {
            "富裕水平": sc_ppp.score(math.log10(r["gdp_pc_ppp"])) if r["gdp_pc_ppp"] else None,
            "增长动能": sc_growth.score(r["growth"]),
            "就业质量": inv(sc_unemp, r["unemp"]),
            "物价稳定": inv(sc_infl, abs(r["infl"] - 2.0) if r["infl"] is not None else None),
            "人力资本": human,
            "外部韧性": resil,
            "人口活力": inv(sc_pop, abs(r["pop_grow"] - 0.8) if r["pop_grow"] is not None else None),
        }

        epi, epi_c = composite(epi_parts, EPI_W)
        r["epi"] = round(epi, 1) if epi is not None else None
        r["epi_parts"] = {k: (round(v, 1) if v is not None else None) for k, v in epi_parts.items()}
        r["epi_contrib"] = {k: round(v, 2) for k, v in epi_c.items()}

        cab = r["cab"]
        ext_v = None
        if cab is not None or r["reserve_months"] is not None:
            ext_v = (-(cab if cab is not None else 0)) + max(0.0, 6.0 - (r["reserve_months"] if r["reserve_months"] is not None else 6.0))
        mfi_parts = {
            "通胀压力": sc_m_infl.score(abs(r["infl"] - 2.0)) if r["infl"] is not None else None,
            "增长失速": sc_stag.score(max(0.0, 3.0 - r["growth"])) if r["growth"] is not None else None,
            "就业压力": sc_m_unemp.score(r["unemp"]),
            "债务压力": sc_debt.score(r["debt"]),
            "外部脆弱": sc_ext.score(ext_v) if ext_v is not None else None,
            "宏观波动": sc_vol.score(r["growth_vol"]),
        }
        mfi, mfi_c = composite(mfi_parts, MFI_W)
        r["mfi"] = round(mfi, 1) if mfi is not None else None
        r["mfi_parts"] = {k: (round(v, 1) if v is not None else None) for k, v in mfi_parts.items()}
        r["mfi_contrib"] = {k: round(v, 2) for k, v in mfi_c.items()}

    recs = [r for r in recs if r["epi"] is not None]
    recs.sort(key=lambda r: -r["epi"])
    for i, r in enumerate(recs, 1):
        r["epi_rank"] = i
    mfi_sorted = sorted([r for r in recs if r["mfi"] is not None], key=lambda r: -r["mfi"])
    for i, r in enumerate(mfi_sorted, 1):
        r["mfi_rank"] = i

    # ---------------- VIX 统计 ----------------
    closes = [v for _, v in vix_rows]
    cur_date, cur = vix_rows[-1]

    def pct_rank(arr, x):
        below = sum(1 for a in arr if a <= x)
        return round(below / len(arr) * 100.0, 1)
    hist_pct = pct_rank(closes, cur)
    recent5 = [v for d, v in vix_rows if int(d[:4]) >= int(cur_date[:4]) - 5]
    pct5 = pct_rank(recent5, cur) if recent5 else None
    y1 = [(d, v) for d, v in vix_rows if d >= f"{int(cur_date[:4]) - 1}{cur_date[4:]}"]
    step = max(1, len(y1) // 300)
    y1_s = y1[::step]
    top_peaks = sorted(vix_rows, key=lambda x: -x[1])[:6]

    vix_obj = {
        "source": "CBOE 官方历史数据 (VIX_History.csv)",
        "latest_date": cur_date,
        "latest": round(cur, 2),
        "hist_percentile": hist_pct,
        "pct_5y": pct5,
        "min_all": round(min(closes), 2),
        "max_all": round(max(closes), 2),
        "median_all": round(statistics.median(closes), 2),
        "y1_high": round(max(v for _, v in y1), 2) if y1 else None,
        "y1_low": round(min(v for _, v in y1), 2) if y1 else None,
        "y1_avg": round(sum(v for _, v in y1) / len(y1), 2) if y1 else None,
        "series_1y": [[d, round(v, 2)] for d, v in y1_s],
        "all_time_peaks": [[d, round(v, 2)] for d, v in top_peaks],
        "annual_avg": [],
    }
    by_year = {}
    for d, v in vix_rows:
        by_year.setdefault(d[:4], []).append(v)
    vix_obj["annual_avg"] = [[y, round(sum(by_year[y]) / len(by_year[y]), 2)] for y in sorted(by_year)]

    # ---------------- 汇总 ----------------
    # total_* 为「入选样本（经济体量前 TOP_N 名）」合计；world_* 为世界银行全球聚合口径(WLD)，用于计算占全球比重
    tot_gdp = sum(r["gdp"] for r in recs if r["gdp"])
    tot_pop = sum(r["pop"] for r in recs if r["pop"])
    world_gdp, _ = latest(world.get("WLD_GDP", {}), YEARS)
    world_pop, _ = latest(world.get("WLD_POP", {}), YEARS)
    def wavg(key, weight="gdp"):
        num = den = 0.0
        for r in recs:
            v = r.get(key)
            w = r.get(weight)
            if v is None or not w:
                continue
            num += v * w
            den += w
        return num / den if den else None
    gmfi = wavg("mfi")
    gmfi_simple = statistics.mean([r["mfi"] for r in recs if r["mfi"] is not None])
    gmfi_median = statistics.median([r["mfi"] for r in recs if r["mfi"] is not None])
    gepi = wavg("epi")

    vix_norm = min(100.0, max(0.0, hist_pct))
    gfi = 0.6 * vix_norm + 0.4 * (gmfi if gmfi is not None else 50)

    out = {
        "meta": {
            "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "country_count": len(recs),
            "sample_rule": "按经济体量（GDP 现价美元最新可得值）排名，取前 %d 名" % TOP_N,
            "top_n": TOP_N,
            "debt_source_note": imf_note or "仅世界银行 GC.DOD.TOTL.GD.ZS",
            "sources": [
                {"name": "World Bank Open Data (世界银行开放数据)", "url": "https://data.worldbank.org/",
                 "usage": "GDP、人口、通胀、失业、预期寿命、外储、债务等 19 项指标"},
                {"name": "CBOE VIX 官方历史", "url": "https://www.cboe.com/tradable_products/vix/",
                 "usage": "市场恐慌指数原始日频数据(1990 至今)"},
                {"name": "IMF WEO / SDMX (国际货币基金组织)", "url": "https://data.imf.org/",
                 "usage": "一般政府总债务/GDP，指标 GGXWDG_NGDP(补充世界银行该项覆盖率不足)"},
            ],
            "indicators": {k: {"name": v[0], "unit": v[1]} for k, v in INDICATORS.items()},
            "epi_weights": EPI_W,
            "mfi_weights": MFI_W,
        },
        "global": {
            "total_gdp": tot_gdp,
            "total_pop": tot_pop,
            "world_gdp": world_gdp,
            "world_pop": world_pop,
            "gdp_weighted_mfi": round(gmfi, 1) if gmfi else None,
            "simple_mfi": round(gmfi_simple, 1),
            "median_mfi": round(gmfi_median, 1),
            "gdp_weighted_epi": round(gepi, 1) if gepi else None,
            "gfi": round(gfi, 1),
            "gfi_vix_component": round(vix_norm, 1),
            "gfi_macro_component": round(gmfi, 1) if gmfi else None,
        },
        "vix": vix_obj,
        "world_series": {k: [[str(y), v] for y, v in sorted(s.items())] for k, s in world.items()},
        "countries": recs,
    }

    with open(os.path.join(OUT_DIR, "global_data.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "data.js"), "w", encoding="utf-8") as f:
        f.write("window.__GLOBAL_DATA__ = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    size = os.path.getsize(os.path.join(OUT_DIR, "global_data.json")) / 1024
    print(f"\n完成! 输出 {OUT_DIR}  ({size:.0f} KB)")
    print(f"样本: {len(recs)} 经济体（经济体量前 {TOP_N} 名）| 合计GDP {tot_gdp/1e12:.1f} 万亿美元 | 人口 {tot_pop/1e9:.2f} 十亿")
    print(f"VIX {cur} ({cur_date}) 历史分位 {hist_pct}% | 样本MFI(GDP加权) {gmfi:.1f} | GFI {gfi:.1f}")
    if recs:
        print("EPI Top5: " + ", ".join(f"{r['name']}{r['epi']}" for r in recs[:5]))
        print("MFI Top5(最恐慌): " + ", ".join(f"{r['name']}{r['mfi']}" for r in mfi_sorted[:5]))


if __name__ == "__main__":
    main()
