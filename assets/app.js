/* ============================================================
   全球经济繁荣与恐慌指数仪表盘
   数据快照由 fetch_data.py 生成（世界银行 / IMF / CBOE 官方数据）
   本文件只做渲染与交互，不生成任何估算数据
   ============================================================ */
(function () {
  'use strict';

  var D = window.__GLOBAL_DATA__;
  if (!D) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="padding:20px;color:#dc2626">数据文件 data/data.js 未加载，请先运行 fetch_data.py 生成数据。</div>');
    return;
  }

  var C = D.countries, V = D.vix, G = D.global, M = D.meta, WS = D.world_series;

  /* ---------------- 工具函数 ---------------- */
  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function isNum(v) { return v !== null && v !== undefined && !isNaN(v); }
  function f1(v) { return isNum(v) ? v.toFixed(1) : '—'; }
  function f2(v) { return isNum(v) ? v.toFixed(2) : '—'; }
  function int(v) { return isNum(v) ? Math.round(v).toLocaleString('en-US') : '—'; }
  function pct(v) { return isNum(v) ? v.toFixed(1) + '%' : '—'; }
  function tril(v) { return isNum(v) ? (v / 1e12).toFixed(2) : '—'; }
  function mil(v) { return isNum(v) ? (v / 1e6).toFixed(1) : '—'; }
  function bil(v) { return isNum(v) ? (v / 1e9).toFixed(2) : '—'; }
  function cell(v, fmt) {
    return '<span class="' + (isNum(v) ? '' : 'na') + '">' + (isNum(v) ? fmt(v) : '—') + '</span>';
  }
  function colorScore(s) {
    if (!isNum(s)) return '#c3cbd8';
    if (s >= 75) return '#16a34a';
    if (s >= 60) return '#4d94d0';
    if (s >= 45) return '#d97706';
    return '#dc2626';
  }
  /* ---- 动画工具 ---- */
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function raf(fn) {
    return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16);
  }
  // 条形统一用 data-w 记录目标宽度，渲染后再赋值以触发 CSS 过渡（错峰）
  function animateFills(scope) {
    var els = (scope || document).querySelectorAll('[data-w]');
    Array.prototype.forEach.call(els, function (el, i) {
      var w = el.getAttribute('data-w');
      if (REDUCED) { el.style.width = w + '%'; return; }
      setTimeout(function () { el.style.width = w + '%'; }, Math.min(i * 14, 700));
    });
  }
  function countUp(el, target, dec) {
    if (!isNum(target)) { el.textContent = '—'; return; }
    if (REDUCED) { el.textContent = target.toFixed(dec); return; }
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var dur = 900;
    (function tick() {
      var p = Math.min(1, ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * e).toFixed(dec);
      if (p < 1) raf(tick);
    })();
  }
  function initReveal() {
    var secs = document.querySelectorAll('.sec');
    if (!secs.length) return;
    var showAll = function () {
      Array.prototype.forEach.call(secs, function (s) { s.classList.add('in'); });
    };
    if (typeof IntersectionObserver === 'undefined') { showAll(); return; }
    Array.prototype.forEach.call(secs, function (s) { s.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.05 });
    Array.prototype.forEach.call(secs, function (s) { io.observe(s); });
    setTimeout(showAll, 2600); // 兜底：任何原因未触发时强制显示
  }

  function colorFear(s) {
    if (!isNum(s)) return '#c3cbd8';
    if (s >= 60) return '#991b1b';
    if (s >= 45) return '#dc2626';
    if (s >= 32) return '#ea580c';
    if (s >= 22) return '#d97706';
    return '#16a34a';
  }

  /* ---------------- 1. 经济体分组 ---------------- */
  // G20 主权成员国（按世界银行 ISO3 代码）。
  // 注：G20 另含欧盟(EU)与非洲联盟(AU)两个区域组织成员，二者非主权国家，故本表不计入。
  var G20 = ['ARG', 'AUS', 'BRA', 'CAN', 'CHN', 'FRA', 'DEU', 'IND', 'IDN', 'ITA',
    'JPN', 'KOR', 'MEX', 'RUS', 'SAU', 'ZAF', 'TUR', 'GBR', 'USA'];
  // 主要经济体 / 地区：G20 之外，按 GDP 规模与区域代表性补充（含中国香港、中国澳门特别行政区）
  var MAJOR_EXTRA = ['ESP', 'NLD', 'CHE', 'SWE', 'POL', 'BEL', 'AUT', 'NOR', 'DNK', 'IRL',
    'FIN', 'PRT', 'GRC', 'CZE', 'ROU', 'NZL', 'CHL', 'COL', 'PER', 'THA',
    'MYS', 'SGP', 'VNM', 'PHL', 'EGY', 'NGA', 'IRN', 'ISR', 'ARE', 'QAT',
    'KAZ', 'UKR', 'BGD', 'PAK', 'ETH', 'KEN', 'MAR', 'DZA', 'VEN', 'HKG', 'MAC'];

  var S_G20 = {}, S_MAJOR = {};
  G20.forEach(function (c) { S_G20[c] = 1; });
  G20.concat(MAJOR_EXTRA).forEach(function (c) { S_MAJOR[c] = 1; });
  C.forEach(function (r) {
    r.isG20 = !!S_G20[r.iso3];
    r.grp = r.isG20 ? 'G20' : (S_MAJOR[r.iso3] ? '主要经济体' : '其他');
  });

  var TOPN = M.top_n || M.country_count;
  var nG20in = C.filter(function (r) { return r.isG20; }).length;
  var nMajorExtra = C.filter(function (r) { return !r.isG20 && r.grp !== '其他'; }).length;
  var VIEWS = [
    { k: 'G20', n: 'G20', d: nG20in + ' 个主权成员国' },
    { k: 'MAJOR', n: '主要经济体 / 地区', d: 'G20 + ' + nMajorExtra + ' 个重要经济体' },
    { k: 'ALL', n: '全部样本', d: M.country_count + ' 个经济体（经济体量前 ' + TOPN + ' 名）' }
  ];
  var curView = 'G20';

  function viewMeta() {
    return VIEWS.filter(function (v) { return v.k === curView; })[0];
  }
  function viewRows() {
    return C.filter(function (r) {
      if (curView === 'ALL') return true;
      if (curView === 'G20') return r.isG20;
      return r.grp !== '其他';
    });
  }
  function wavg(rows, key) {
    var num = 0, den = 0;
    rows.forEach(function (r) {
      if (isNum(r[key]) && isNum(r.gdp)) { num += r[key] * r.gdp; den += r.gdp; }
    });
    return den ? num / den : null;
  }
  function sumBy(rows, key) {
    return rows.reduce(function (s, r) { return s + (isNum(r[key]) ? r[key] : 0); }, 0);
  }

  /* ---------------- 2. 头部与 KPI ---------------- */
  $('#stamp-time').textContent = M.generated_at;
  $('#foot-time').textContent = M.generated_at;
  $('#foot-count').textContent = M.country_count;

  // 样本口径相关文案（随 TOP_N 动态变化，避免写死数字）
  var _n = M.country_count, _t = M.top_n || _n;
  if ($('#mfi-w-note')) $('#mfi-w-note').textContent = _n + ' 个样本经济体加权';
  if ($('#th-gdp-rank')) $('#th-gdp-rank').title = '按经济体量（GDP）在样本内的排名，不随视图切换改变';
  if ($('#th-epi-rank')) $('#th-epi-rank').title = '按繁荣指数 EPI 在样本 ' + _n + ' 个经济体中的排名，不随视图切换改变';
  if ($('#norm-note')) {
    $('#norm-note').innerHTML = '对每个指标在样本内（经济体量前 <b>' + _t + '</b> 名，共 ' + _n +
      ' 个经济体）做 <code>5%–95% 缩尾最小-最大归一化</code>，映射到 0–100 分，以剔除离群值干扰。' +
      '人均 GDP 先取 <code>log10</code> 再归一化。负向指标（失业率、通胀偏离、波动率等）取 <code>100 − 得分</code>。';
  }
  if ($('#sample-note')) {
    $('#sample-note').innerHTML = '<b>样本口径：</b>按经济体量（GDP 现价美元最新可得值）对全部经济体排名，' +
      '取前 <b>' + _t + '</b> 名进入样本。前 ' + _n + ' 名经济体合计约占全球 GDP 的九成，' +
      '聚焦主要经济体可显著提升抓取效率与横向可比性。数据缺失时按权重重分配处理（见右）。';
  }

  function renderKPI() {
    var rows = viewRows();
    var gdp = sumBy(rows, 'gdp'), pop = sumBy(rows, 'pop');
    var epi = wavg(rows, 'epi'), mfi = wavg(rows, 'mfi');
    var vs = vixLevel(V.latest);
    var kpis = [
      {
        l: 'GDP 合计', n: gdp / 1e12, d: 2, u: '万亿美元',
        f: '占全球 ' + (gdp / (G.world_gdp || G.total_gdp) * 100).toFixed(1) + '%（全球 ' + tril(G.world_gdp || G.total_gdp) + ' 万亿）', c: ''
      },
      {
        l: '人口合计', n: pop / 1e9, d: 2, u: '十亿人',
        f: '占全球 ' + (pop / (G.world_pop || G.total_pop) * 100).toFixed(1) + '%（全球 ' + bil(G.world_pop || G.total_pop) + ' 十亿）', c: ''
      },
      { l: 'GDP 加权繁荣指数 EPI', n: epi, d: 1, u: '/ 100', f: rows.length + ' 个经济体按规模加权', c: 'k-green' },
      {
        l: 'GDP 加权恐慌指数 MFI', n: mfi, d: 1, u: '/ 100', f: '宏观基本面压力',
        c: mfi >= 35 ? 'k-red' : (mfi >= 25 ? 'k-amber' : 'k-green')
      },
      {
        l: 'VIX 市场恐慌指数', n: V.latest, d: 2, u: vs.label,
        f: V.latest_date + ' · 历史分位 ' + V.hist_percentile + '%（全球市场指标）', c: vs.kpi
      }
    ];
    $('#kpi-grid').innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.c + '">' +
        '<div class="kpi-label">' + k.l + '</div>' +
        '<div class="kpi-value"><span class="kpi-num">0</span><small>' + k.u + '</small></div>' +
        '<div class="kpi-foot">' + k.f + '</div></div>';
    }).join('');
    // 数字滚动动画
    var nums = $('#kpi-grid').querySelectorAll('.kpi-num');
    Array.prototype.forEach.call(nums, function (el, i) {
      var k = kpis[i];
      setTimeout(function () { countUp(el, k.n, k.d); }, REDUCED ? 0 : i * 90);
    });

    var vm = viewMeta();
    $('#overview-sub').textContent = '当前视图：' + vm.n + '（' + rows.length + ' 个）· 全部数字取自世界银行 / IMF / CBOE 官方 API';
    $('#view-note').innerHTML = curView === 'G20'
      ? 'G20 = ' + nG20in + ' 个主权成员国 + 欧盟 + 非洲联盟。欧盟与非盟为区域组织、非主权国家，世行无对应单一实体数据，故未计入排名；本页样本口径为「按经济体量（GDP）排名前 ' + TOPN + ' 名」。'
      : (curView === 'MAJOR'
        ? '主要经济体 / 地区 = G20 全部 ' + nG20in + ' 个成员 + 按 GDP 规模与区域代表性补充的 ' + nMajorExtra + ' 个经济体（含中国香港特别行政区）。'
        : '全部样本 = 按经济体量（GDP 现价美元，最新可得年份）排名前 ' + TOPN + ' 名的国家或地区。');
  }

  $('#view-switch').innerHTML = VIEWS.map(function (v) {
    return '<button data-view="' + v.k + '" class="' + (v.k === curView ? 'on' : '') + '">' +
      v.n + '<small>' + v.d + '</small></button>';
  }).join('');
  $('#view-switch').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-view]') : null;
    if (!b) return;
    curView = b.getAttribute('data-view');
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x.getAttribute('data-view') === curView);
    });
    renderView();
  });

  function vixLevel(v) {
    if (v < 12) return { label: '极低波动', kpi: 'k-green', color: '#16a34a', bg: '#e7f6ec' };
    if (v < 18) return { label: '平静', kpi: 'k-green', color: '#16a34a', bg: '#e7f6ec' };
    if (v < 25) return { label: '警戒', kpi: 'k-amber', color: '#d97706', bg: '#fdf3e3' };
    if (v < 30) return { label: '恐慌', kpi: 'k-amber', color: '#ea580c', bg: '#ffeadb' };
    return { label: '极度恐慌', kpi: 'k-red', color: '#dc2626', bg: '#fdecec' };
  }

  /* ---------------- 3. VIX 恐慌面板 ---------------- */
  var vixState = vixLevel(V.latest);
  $('#vix-date').textContent = V.latest_date;
  $('#vix-value').textContent = f2(V.latest);
  $('#vix-value').style.color = vixState.color;
  var st = $('#vix-state');
  st.textContent = vixState.label;
  st.style.background = vixState.bg;
  st.style.color = vixState.color;

  // 量表
  var GMAX = 80;
  var marks = [12, 18, 25, 30];
  $('#vix-gauge').innerHTML =
    '<div class="gauge-bar">' +
    marks.map(function (m) {
      return '<div class="gauge-mark" style="left:' + (m / GMAX * 100) + '%"><span>' + m + '</span></div>';
    }).join('') +
    '<div class="gauge-pointer" style="left:' + Math.min(100, V.latest / GMAX * 100) + '%"></div>' +
    '</div>' +
    '<div class="gauge-scale"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span></div>';

  var vstats = [
    ['历史分位（1990 至今）', V.hist_percentile + '%'],
    ['近 5 年分位', V.pct_5y == null ? '—' : V.pct_5y + '%'],
    ['近一年区间', V.y1_low + ' – ' + V.y1_high],
    ['近一年均值', f2(V.y1_avg)],
    ['历史中位数', f2(V.median_all)],
    ['历史峰值', f2(V.max_all)]
  ];
  $('#vix-stats').innerHTML = vstats.map(function (r) {
    return '<div><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
  }).join('');

  $('#vix-median').textContent = f2(V.median_all);
  lineChart('#vix-chart', [{
    name: 'VIX', color: '#dc2626', fill: 'rgba(220,38,38,.10)',
    data: V.series_1y.map(function (p) { return [p[0], p[1]]; })
  }], { h: 236, ref: V.median_all, refLabel: '历史中位数 ' + f2(V.median_all), yMin: 0 });

  $('#vix-peaks').innerHTML = V.all_time_peaks.map(function (p, i) {
    return '<div class="peak-row"><div class="peak-rank">' + (i + 1) + '</div>' +
      '<div class="peak-date">' + p[0] + '</div>' +
      '<div class="peak-bar" style="width:' + (p[1] / V.max_all * 100) + '%"></div>' +
      '<div class="peak-val">' + f2(p[1]) + '</div></div>';
  }).join('');

  /* ---------------- 3. GFI 与全球 MFI ---------------- */
  $('#gfi-value').textContent = f1(G.gfi);
  $('#gfi-value').style.color = colorFear(G.gfi);
  var gfiRows = [
    { n: 'VIX 历史分位（权重 60%）', v: G.gfi_vix_component, w: 0.6, c: '#dc2626' },
    { n: '全球宏观恐慌 MFI（权重 40%）', v: G.gfi_macro_component, w: 0.4, c: '#ea580c' }
  ];
  $('#gfi-bars').innerHTML = gfiRows.map(function (r) {
    return '<div class="gfi-row"><div class="l"><span>' + r.n + '</span>' +
      '<span>贡献 ' + (r.v * r.w).toFixed(1) + ' 分</span></div>' +
      '<div class="gfi-track"><div class="gfi-fill" data-w="' + r.v + '" style="width:0;background:' + r.c + '"></div></div></div>';
  }).join('');

  var mfiRows = [
    ['GDP 加权 MFI', f1(G.gdp_weighted_mfi), colorFear(G.gdp_weighted_mfi)],
    ['算术平均 MFI', f1(G.simple_mfi), colorFear(G.simple_mfi)],
    ['中位数 MFI', f1(G.median_mfi), colorFear(G.median_mfi)]
  ];
  var mfiMax = Math.max.apply(null, C.filter(function (r) { return isNum(r.mfi); }).map(function (r) { return r.mfi; }));
  var mfiMin = Math.min.apply(null, C.filter(function (r) { return isNum(r.mfi); }).map(function (r) { return r.mfi; }));
  mfiRows.push(['最恐慌经济体', (C.slice().sort(function (a, b) { return b.mfi - a.mfi; })[0] || {}).name + ' ' + f1(mfiMax), colorFear(mfiMax)]);
  mfiRows.push(['最稳健经济体', (C.slice().filter(function (r) { return isNum(r.mfi); }).sort(function (a, b) { return a.mfi - b.mfi; })[0] || {}).name + ' ' + f1(mfiMin), colorFear(mfiMin)]);
  $('#mfi-global-stats').innerHTML = mfiRows.map(function (r) {
    return '<div class="stat-row"><span>' + r[0] + '</span><span class="v" style="color:' + r[2] + '">' + r[1] + '</span></div>';
  }).join('');

  /* ---------------- 4. 排行 ---------------- */
  function barsHTML(rows, key, colorFn) {
    var globalRank = key === 'epi' ? 'epi_rank' : 'mfi_rank';
    return rows.map(function (r, i) {
      return '<div class="bar-row" data-iso="' + r.iso3 + '">' +
        '<div class="bar-rank">' + (i + 1) + '</div>' +
        '<div class="bar-name">' + (r.isG20 ? '<span class="g20-tag">G20</span>' : '') +
        '<span class="cn">' + esc(r.name) + '</span>' +
        '<span class="iso">全球 #' + r[globalRank] + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<div class="bar-track"><div class="bar-fill" data-w="' + r[key] + '" style="width:0;background:' + colorFn(r[key]) + '"></div></div>' +
        '<div class="bar-val">' + f1(r[key]) + '</div></div></div>';
    }).join('');
  }

  function renderRanks() {
    var rows = viewRows().slice().sort(function (a, b) { return b.epi - a.epi; });
    var vm = viewMeta();
    var g = $('#rank-grid');
    if (rows.length <= 26) {
      g.style.gridTemplateColumns = '1fr';
      g.innerHTML = '<div class="card"><div class="card-head"><h3>' + esc(vm.n) +
        ' 繁荣指数完整排名（' + rows.length + ' 个）</h3><span class="src">分数越高越繁荣 · 灰字为全球排名</span></div>' +
        '<div class="bar-list">' + barsHTML(rows, 'epi', colorScore) + '</div></div>';
    } else {
      g.style.gridTemplateColumns = '';
      g.innerHTML =
        '<div class="card"><div class="card-head"><h3>繁荣指数 TOP 20</h3><span class="src">分数越高越繁荣 · 灰字为全球排名</span></div>' +
        '<div class="bar-list">' + barsHTML(rows.slice(0, 20), 'epi', colorScore) + '</div></div>' +
        '<div class="card"><div class="card-head"><h3>繁荣指数 BOTTOM 20</h3><span class="src">分数越低越落后</span></div>' +
        '<div class="bar-list">' + barsHTML(rows.slice(-20).reverse(), 'epi', colorScore) + '</div></div>';
    }
  }

  function renderMFIRanks() {
    var rows = viewRows().filter(function (r) { return isNum(r.mfi); })
      .sort(function (a, b) { return b.mfi - a.mfi; });
    var vm = viewMeta();
    var show = rows.length <= 26 ? rows : rows.slice(0, 20);
    $('#mfi-top-title').textContent = rows.length <= 26
      ? vm.n + ' 宏观恐慌完整排名（' + rows.length + ' 个）'
      : '宏观基本面压力最高 20 国';
    $('#mfi-top').innerHTML = barsHTML(show, 'mfi', colorFear);
  }

  /* ---------------- 5. 数据表格 ---------------- */
  var sortKey = 'gdp_rank', sortDir = 1;  // 默认按经济体量排名
  function filtered() {
    var q = $('#q').value.trim().toLowerCase();
    var rg = $('#f-region').value, ic = $('#f-income').value;
    return viewRows().filter(function (r) {
      if (rg && r.region !== rg) return false;
      if (ic && r.income !== ic) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.iso3.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    }).sort(function (a, b) {
      var va = a[sortKey], vb = b[sortKey];
      if (!isNum(va) && !isNum(vb)) return String(va).localeCompare(String(vb), 'zh') * sortDir;
      if (!isNum(va)) return 1;
      if (!isNum(vb)) return -1;
      return (va - vb) * sortDir;
    });
  }
  function renderTable() {
    var rows = filtered();
    $('#table-count').textContent = rows.length;
    $('#table-body').innerHTML = rows.map(function (r) {
      return '<tr data-iso="' + r.iso3 + '">' +
        '<td class="num">' + cell(r.gdp_rank, String) + '</td>' +
        '<td class="num">' + r.epi_rank + '</td>' +
        '<td><div class="country-cell">' + (r.isG20 ? '<span class="g20-tag">G20</span>' : '') +
        '<span>' + esc(r.name) + '</span><span class="iso">' + r.iso3 + '</span></div></td>' +
        '<td>' + esc(r.region) + '</td>' +
        '<td class="num"><b style="color:' + colorScore(r.epi) + '">' + f1(r.epi) + '</b></td>' +
        '<td class="num" style="color:' + colorFear(r.mfi) + '">' + f1(r.mfi) + '</td>' +
        '<td class="num">' + cell(r.gdp, tril) + '</td>' +
        '<td class="num">' + cell(r.gdp_pc_ppp, int) + '</td>' +
        '<td class="num">' + cell(r.growth, f1) + '</td>' +
        '<td class="num">' + cell(r.infl, f1) + '</td>' +
        '<td class="num">' + cell(r.unemp, f1) + '</td>' +
        '<td class="num">' + cell(r.debt, f1) + '</td>' +
        '<td class="num">' + cell(r.pop, mil) + '</td>' +
        '</tr>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#main-table tbody tr.sel'), function (e) { e.classList.remove('sel'); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#main-table th[data-sort]'), function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (k === sortKey) sortDir = -sortDir;
      else { sortKey = k; sortDir = (k === 'name' || k === 'region') ? 1 : -1; }
      renderTable();
    });
  });
  $('#q').addEventListener('input', renderTable);
  $('#f-region').addEventListener('change', renderTable);
  $('#f-income').addEventListener('change', renderTable);

  var regions = Array.from(new Set(C.map(function (r) { return r.region; }))).sort();
  var incomes = Array.from(new Set(C.map(function (r) { return r.income; }))).sort();
  $('#f-region').innerHTML += regions.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');
  $('#f-income').innerHTML += incomes.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');

  function bindRowClick(sel) {
    var host = $(sel);
    if (!host) return;
    host.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('[data-iso]') : null;
      if (!row) return;
      selectCountry(row.getAttribute('data-iso'));
      document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  // 事件委托绑定到常驻容器上（内部 innerHTML 会随视图重建）
  bindRowClick('#table-body');
  bindRowClick('#rank-grid');
  bindRowClick('#mfi-top');

  $('#btn-csv').addEventListener('click', function () {
    var head = ['排名(全球)', 'ISO3', '国家', '分组', '地区', '收入组', 'EPI', 'MFI', 'GDP美元', '人均GDP_PPP',
      '近5年增速%', '通胀%', '失业%', '政府债务%GDP', '人口', '预期寿命', '人力资本指数'];
    var lines = [head.join(',')];
    filtered().forEach(function (r) {
      lines.push([r.epi_rank, r.iso3, '"' + r.name + '"', r.grp, '"' + r.region + '"', '"' + r.income + '"',
        r.epi, r.mfi, r.gdp, r.gdp_pc_ppp, r.growth, r.infl, r.unemp, r.debt, r.pop, r.life, r.hci].join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'global_economic_index_' + M.generated_at.slice(0, 10) + '.csv';
    a.click();
  });

  /* ---------------- 6. 国家详情 ---------------- */
  var EPI_DESC = {
    '富裕水平': '人均 GDP（PPP，不变价国际元，取对数后归一化）',
    '增长动能': '近 5 年实际 GDP 增速均值',
    '就业质量': '失业率（越低越好）',
    '物价稳定': 'CPI 通胀偏离 2% 目标的程度（越低越好）',
    '人力资本': '预期寿命 × 50% + 人力资本指数(HCI) × 50%',
    '外部韧性': '外汇储备覆盖进口月数 × 60% + 经常账户顺差 × 40%',
    '人口活力': '人口增速接近 0.8% 的程度'
  };
  var MFI_DESC = {
    '通胀压力': 'CPI 通胀偏离 2% 目标的幅度',
    '增长失速': '实际增速低于 3% 的缺口（负增长拉满）',
    '就业压力': '失业率水平',
    '债务压力': '一般政府总债务 / GDP',
    '外部脆弱': '经常账户逆差 + 外储覆盖不足 6 个月的缺口',
    '宏观波动': '2015–2024 年 GDP 增速标准差'
  };

  function renderSelect() {
    var rows = viewRows().slice().sort(function (a, b) { return b.epi - a.epi; });
    var rest = C.filter(function (r) { return rows.indexOf(r) < 0; }).sort(function (a, b) { return b.epi - a.epi; });
    var opt = function (r) {
      return '<option value="' + r.iso3 + '">' + esc(r.name) + '（EPI ' + f1(r.epi) + '）</option>';
    };
    var html = '<optgroup label="' + esc(viewMeta().n) + '（' + rows.length + '）">' + rows.map(opt).join('') + '</optgroup>';
    if (curView !== 'ALL') {
      html += '<optgroup label="其他经济体（' + rest.length + '）">' + rest.map(opt).join('') + '</optgroup>';
    }
    $('#country-select').innerHTML = html;
  }
  $('#country-select').addEventListener('change', function () { selectCountry(this.value); });

  var current = null;
  function selectCountry(iso) {
    var r = C.filter(function (x) { return x.iso3 === iso; })[0];
    if (!r) return;
    current = r;
    $('#country-select').value = iso;
    $('#live-status').textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('#table-body tr'), function (e) {
      e.classList.toggle('sel', e.getAttribute('data-iso') === iso);
    });
    renderDetail(r);
  }

  function dimRows(parts, weights, desc, colorFn) {
    return Object.keys(weights).map(function (k) {
      var v = parts[k];
      var w = weights[k];
      return '<div class="dim-row" title="' + esc(desc[k] || '') + '">' +
        '<div class="dim-name">' + k + '</div>' +
        '<div class="dim-track"><div class="dim-fill" data-w="' + (isNum(v) ? v : 0) + '" style="width:0;background:' + colorFn(v) + '"></div></div>' +
        '<div class="dim-val">' + (isNum(v) ? f1(v) : '<span class="na">无数据</span>') + '</div>' +
        '<div class="dim-w">权重 ' + w + '%</div></div>';
    }).join('');
  }

  function metric(l, v, fmt, unit) {
    // 注意：必须传原始数值 + 格式化函数，不能传已格式化的字符串
    var shown = isNum(v) ? (fmt ? fmt(v) : String(v)) : null;
    return '<div class="metric"><div class="m-l">' + l + '</div><div class="m-v">' +
      (shown === null ? '<span class="na">—</span>' : shown + (unit ? '<small> ' + unit + '</small>' : '')) + '</div></div>';
  }

  function renderDetail(r) {
    $('#detail-sub').textContent = '当前：' + r.name + ' · ' + r.region + ' · ' + r.income;
    var m = [
      ['GDP 总量', r.gdp, tril, '万亿美元'],
      ['人均 GDP (PPP)', r.gdp_pc_ppp, int, '国际元'],
      ['人口', r.pop, mil, '百万'],
      ['人口增速', r.pop_grow, f1, '%'],
      ['近 5 年实际增速', r.growth, f1, '%'],
      ['CPI 通胀', r.infl, f1, '%'],
      ['失业率', r.unemp, f1, '%'],
      ['预期寿命', r.life, f1, '岁'],
      ['人力资本指数', r.hci, function (v) { return v.toFixed(2); }, '/ 1'],
      ['政府债务/GDP', r.debt, f1, '%'],
      ['经常账户/GDP', r.cab, f1, '%'],
      ['外储覆盖进口', r.reserve_months, f1, '个月'],
      ['外债/GNI', r.ext_debt, f1, '%'],
      ['出口/GDP', r.exports_pct, f1, '%'],
      ['城镇化率', r.urban, f1, '%'],
      ['抚养比', r.dep_ratio, f1, '%'],
      ['互联网普及率', r.net_users, f1, '%'],
      ['增速波动率(10年)', r.growth_vol, f2, '']
    ];
    $('#detail-body').innerHTML =
      '<div class="dt-title"><h3>' + esc(r.name) + ' <span style="color:#7d8ca3;font-size:14px">' + r.iso3 + '</span></h3>' +
      '<div class="ranks">繁荣指数排名 <b>#' + r.epi_rank + '</b> / ' + M.country_count +
      ' · 宏观恐慌排名 <b>#' + (r.mfi_rank || '—') + '</b> · ' + esc(r.region) + ' · ' + esc(r.income) + '</div></div>' +

      '<div class="dt-grid">' +
      '<div><h4 style="margin:0 0 10px;font-size:13.5px">经济繁荣指数 EPI <b style="color:' + colorScore(r.epi) + '">' + f1(r.epi) + '</b> / 100</h4>' +
      '<div class="dim-list">' + dimRows(r.epi_parts, M.epi_weights, EPI_DESC, colorScore) + '</div></div>' +
      '<div><h4 style="margin:0 0 10px;font-size:13.5px">宏观恐慌指数 MFI <b style="color:' + colorFear(r.mfi) + '">' + f1(r.mfi) + '</b> / 100</h4>' +
      '<div class="dim-list">' + dimRows(r.mfi_parts, M.mfi_weights, MFI_DESC, colorFear) + '</div></div>' +
      '</div>' +

      '<h4 style="margin:0 0 10px;font-size:13.5px">原始指标（世界银行 / IMF 官方数值）</h4>' +
      '<div class="metric-grid">' + m.map(function (x) { return metric(x[0], x[1], x[2], x[3]); }).join('') + '</div>' +
      '<div id="live-box"></div>';

    // 缺失维度提示
    var miss = Object.keys(M.epi_weights).filter(function (k) { return !isNum(r.epi_parts[k]); })
      .concat(Object.keys(M.mfi_weights).filter(function (k) { return !isNum(r.mfi_parts[k]); }).map(function (k) { return 'MFI·' + k; }));
    if (miss.length) {
      $('#detail-body').insertAdjacentHTML('beforeend',
        '<div class="note"><b>数据缺失维度（已按比例重新分配权重，不计零分）：</b>' + esc(miss.join('、')) + '</div>');
    }
    animateFills($('#detail-body'));
  }

  /* ---------------- 7. 实时校验 ---------------- */
  var LIVE_MAP = [
    { code: 'SP.POP.TOTL', label: '人口', snap: function (r) { return r.pop; }, fmt: function (v) { return (v / 1e6).toFixed(1) + ' 百万'; } },
    { code: 'NY.GDP.MKTP.CD', label: 'GDP（现价美元）', snap: function (r) { return r.gdp; }, fmt: function (v) { return (v / 1e12).toFixed(2) + ' 万亿美元'; } },
    { code: 'FP.CPI.TOTL.ZG', label: 'CPI 通胀率', snap: function (r) { return r.infl; }, fmt: function (v) { return v.toFixed(2) + '%'; } },
    { code: 'NY.GDP.MKTP.KD.ZG', label: '实际 GDP 增速', snap: function (r) { return r.growth_last; }, fmt: function (v) { return v.toFixed(2) + '%'; } }
  ];

  $('#btn-live').addEventListener('click', async function () {
    if (!current) return;
    var box = $('#live-box');
    var stat = $('#live-status');
    stat.textContent = '正在向世界银行 API 请求…';
    box.innerHTML = '<div class="note">正在实时请求 api.worldbank.org …</div>';
    var out = ['<div class="live-table"><table class="data-table"><thead><tr>' +
      '<th>指标</th><th>本页快照</th><th class="num">实时 API</th><th class="num">数据年份</th><th>校验</th>' +
      '</tr></thead><tbody>'];
    var ok = 0, n = 0;
    for (var i = 0; i < LIVE_MAP.length; i++) {
      var it = LIVE_MAP[i];
      var live = null;
      try {
        var resp = await fetch('https://api.worldbank.org/v2/country/' + current.iso3 +
          '/indicator/' + it.code + '?format=json&per_page=30&date=2018:2026');
        var j = await resp.json();
        if (Array.isArray(j) && j[1]) {
          var rows = j[1].filter(function (x) { return x.value != null; })
            .sort(function (a, b) { return Number(b.date) - Number(a.date); });
          if (rows.length) live = { year: rows[0].date, value: rows[0].value };
        }
      } catch (e) { /* 忽略单项失败 */ }
      var snapV = it.snap(current);
      var same = '—';
      if (live && isNum(snapV)) {
        n++;
        var diff = Math.abs(live.value - snapV) / Math.abs(snapV || 1);
        if (diff < 0.005) { same = '<span class="live-ok">一致</span>'; ok++; }
        else { same = '<span class="live-diff">差异 ' + (diff * 100).toFixed(2) + '%</span>'; }
      }
      out.push('<tr><td>' + it.label + '</td><td>' + (isNum(snapV) ? it.fmt(snapV) : '—') + '</td>' +
        '<td class="num">' + (live ? it.fmt(live.value) : '<span class="na">无返回</span>') + '</td>' +
        '<td class="num">' + (live ? live.year : '—') + '</td><td>' + same + '</td></tr>');
    }
    out.push('</tbody></table></div>');
    box.innerHTML = out.join('');
    stat.textContent = n ? ('校验完成：' + ok + '/' + n + ' 项与快照一致') : '未能获取实时数据（可能为离线环境）';
  });

  /* ---------------- 8. 长期趋势图 ---------------- */
  lineChart('#chart-growth', [
    { name: '全球实际 GDP 增速', color: '#2563eb', data: WS.WLD_GDP_GROWTH },
    { name: '全球 CPI 通胀', color: '#dc2626', data: WS.WLD_INFL }
  ], { h: 250, legend: true, unit: '%' });

  lineChart('#chart-pop', [
    { name: '全球人口', color: '#16a34a', fill: 'rgba(22,163,74,.12)', data: WS.WLD_POP.map(function (p) { return [p[0], p[1] / 1e9]; }) }
  ], { h: 250, legend: true, unit: '十亿人' });

  /* ---------------- 9. 散点图 ---------------- */
  function renderScatter() {
    var REGION_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
    var regs = Array.from(new Set(C.map(function (r) { return r.region; }))).sort();
    var pts = viewRows().filter(function (r) { return isNum(r.gdp_pc_ppp) && isNum(r.epi) && r.gdp_pc_ppp > 0; });
    var maxPop = Math.max.apply(null, pts.map(function (r) { return r.pop; }));
    var series = pts.map(function (r) {
      return {
        x: Math.log10(r.gdp_pc_ppp), y: r.epi,
        r: 3.5 + 9 * Math.sqrt(r.pop / maxPop),
        c: REGION_COLORS[regs.indexOf(r.region) % REGION_COLORS.length],
        name: r.name, iso: r.iso3,
        pop: (r.pop / 1e6).toFixed(0), ppp: int(r.gdp_pc_ppp), epi: f1(r.epi), mfi: f1(r.mfi)
      };
    });
    scatterChart('#chart-scatter', series, {
      h: 420, xLabel: '人均 GDP（PPP，不变价国际元，对数轴）', yLabel: '经济繁荣指数 EPI'
    });
    $('#scatter-title').textContent = viewMeta().n + ' 结构分布（' + series.length + ' 个）';
    $('#scatter-legend').innerHTML = regs.map(function (rg, i) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px">' +
        '<i style="width:9px;height:9px;border-radius:50%;background:' + REGION_COLORS[i % REGION_COLORS.length] + ';display:inline-block"></i>' + esc(rg) + '</span>';
    }).join('');
  }

  /* ---------------- 9.5 世界地图（腾讯地图 GL JS） ---------------- */
  var SCALES = {
    epi: {
      stops: [35, 50, 60, 68, 76, 999], colors: ['#dc2626', '#ea580c', '#f59e0b', '#84cc16', '#22c55e', '#0d9488'],
      title: '经济繁荣指数 EPI', labels: ['< 35 落后', '35 – 50', '50 – 60', '60 – 68', '68 – 76', '≥ 76 繁荣']
    },
    mfi: {
      stops: [12, 20, 26, 33, 42, 999], colors: ['#0d9488', '#22c55e', '#84cc16', '#f59e0b', '#ea580c', '#dc2626'],
      title: '宏观恐慌指数 MFI', labels: ['< 12 稳健', '12 – 20', '20 – 26', '26 – 33', '33 – 42', '≥ 42 高危']
    },
    growth: {
      stops: [0, 1.5, 2.5, 4, 6, 999], colors: ['#dc2626', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#0d9488'],
      title: '近 5 年实际 GDP 增速', labels: ['< 0% 收缩', '0 – 1.5%', '1.5 – 2.5%', '2.5 – 4%', '4 – 6%', '≥ 6%']
    }
  };

  function scaleColor(key, v) {
    var s = SCALES[key] || SCALES.epi;
    for (var i = 0; i < s.stops.length; i++) { if (v < s.stops[i]) return s.colors[i]; }
    return s.colors[s.colors.length - 1];
  }
  function bubbleSrc(r, color) {
    var d = Math.round(r * 2);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + d + '" height="' + d + '">' +
      '<circle cx="' + r + '" cy="' + r + '" r="' + (r - 1.2).toFixed(1) + '" fill="' + color +
      '" fill-opacity="0.68" stroke="#ffffff" stroke-width="1.3"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var MAP = { map: null, marker: null, ready: false, geos: [], growTimer: null };

  function mapGeos() {
    var cKey = $('#map-color').value || 'epi';
    var sKey = $('#map-size').value || 'pop';
    var rows = viewRows().filter(function (r) {
      return isNum(r.lat) && isNum(r.lon) && isNum(r[cKey]) && isNum(r[sKey]) && r[sKey] > 0;
    });
    var maxV = Math.max.apply(null, rows.map(function (r) { return r[sKey]; }).concat([1]));
    return rows.map(function (r) {
      var px = 8 + 30 * Math.sqrt(r[sKey] / maxV);
      return { id: r.iso3, d: Math.round(px * 2), color: scaleColor(cKey, r[cKey]), lat: r.lat, lon: r.lon };
    }).sort(function (a, b) { return b.d - a.d; }); // 大气泡先画在下层
  }

  function renderMapLegend() {
    var cKey = $('#map-color').value || 'epi';
    var s = SCALES[cKey];
    $('#map-legend').innerHTML = '<div class="lg-t">' + s.title + '</div>' +
      s.labels.map(function (l, i) {
        return '<div class="lg-row"><span class="lg-dot" style="background:' + s.colors[i] + '"></span>' + l + '</div>';
      }).join('') +
      '<div class="lg-t" style="margin-top:9px">气泡大小：' +
      ($('#map-size').value === 'gdp' ? 'GDP 总量' : '人口') + '</div>';
  }

  function renderMap() {
    var geos = mapGeos();
    MAP.geos = geos;
    renderMapLegend();
    $('#map-title').textContent = viewMeta().n + ' · ' + geos.length + ' 个经济体';
    if (!MAP.ready || !window.TMap) { renderBubbleFallback(); return; } // 无底图时降级为分组气泡矩阵
    var TMap = window.TMap;
    var styles = {};
    geos.forEach(function (g) {
      styles['s_' + g.id] = new TMap.MarkerStyle({
        width: g.d, height: g.d, src: bubbleSrc(g.d / 2, g.color),
        anchor: { x: g.d / 2, y: g.d / 2 }
      });
    });
    var geometries = geos.map(function (g) {
      return { id: g.id, styleId: 's_' + g.id, position: new TMap.LatLng(g.lat, g.lon) };
    });

    if (MAP.growTimer) { clearInterval(MAP.growTimer); MAP.growTimer = null; }
    if (MAP.marker) { MAP.marker.setMap(null); MAP.marker = null; }

    MAP.marker = new TMap.MultiMarker({ map: MAP.map, styles: styles, geometries: [] });
    MAP.marker.on('click', function (evt) {
      var id = evt && evt.geometry && evt.geometry.id;
      if (!id) return;
      selectCountry(id);
      document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 气泡错峰出现
    if (REDUCED) {
      MAP.marker.setGeometries(geometries);
    } else {
      var k = 0, step = Math.max(1, Math.ceil(geometries.length / 45));
      MAP.growTimer = setInterval(function () {
        k += step;
        if (k >= geometries.length) {
          MAP.marker.setGeometries(geometries);
          clearInterval(MAP.growTimer); MAP.growTimer = null;
        } else {
          MAP.marker.setGeometries(geometries.slice(0, k));
        }
      }, 38);
    }
  }

  /* 地图不可用时的降级视图：按地区分组的气泡矩阵。
     刻意不含任何经纬度/国界渲染（纯分组布局），因此不涉及地图合规要求，
     访客无需自备腾讯地图密钥也能看到「规模 + 指数」的分布全貌。 */
  function renderBubbleFallback() {
    var box = $('#map-container');
    if (!box) return;
    var cKey = $('#map-color').value || 'epi';
    var sKey = $('#map-size').value || 'pop';
    var rows = viewRows().filter(function (r) { return isNum(r[cKey]) && isNum(r[sKey]) && r[sKey] > 0; });
    if (!rows.length) { box.innerHTML = '<div class="bf-empty">当前视图无可用数据</div>'; return; }
    var maxV = Math.max.apply(null, rows.map(function (r) { return r[sKey]; }).concat([1]));
    var byRegion = {}, order = [];
    rows.forEach(function (r) {
      var rg = r.region || '未分类';
      if (!byRegion[rg]) { byRegion[rg] = []; order.push(rg); }
      byRegion[rg].push(r);
    });
    order.sort(function (a, b) {
      var sa = byRegion[a].reduce(function (s, r) { return s + r[sKey]; }, 0);
      var sb = byRegion[b].reduce(function (s, r) { return s + r[sKey]; }, 0);
      return sb - sa;
    });
    var valTxt = function (r) {
      return cKey === 'epi' ? 'EPI ' + f1(r.epi)
        : cKey === 'mfi' ? 'MFI ' + f1(r.mfi)
          : '增速 ' + f1(r.growth) + '%';
    };
    var out = ['<div class="bf-wrap">'];
    order.forEach(function (rg) {
      var list = byRegion[rg].slice().sort(function (a, b) { return b[sKey] - a[sKey]; });
      out.push('<div class="bf-reg"><div class="bf-reg-t">' + esc(rg) +
        '<span class="bf-reg-n">' + list.length + '</span></div><div class="bf-bubbles">');
      list.forEach(function (r) {
        var px = Math.round(16 + 42 * Math.sqrt(r[sKey] / maxV));
        var tip = r.name + ' · ' + valTxt(r) + ' · GDP ' + tril(r.gdp) + ' 万亿';
        out.push('<button type="button" class="bf-b" data-iso="' + r.iso3 + '" title="' + esc(tip) + '"' +
          ' style="width:' + px + 'px;height:' + px + 'px;background:' + scaleColor(cKey, r[cKey]) +
          ';font-size:' + (px >= 36 ? 10 : 0) + 'px">' + (px >= 36 ? esc(r.iso3) : '') + '</button>');
      });
      out.push('</div></div>');
    });
    out.push('</div>');
    box.innerHTML = out.join('');
  }

  if (document.querySelector('#map-container')) {
    document.querySelector('#map-container').addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.bf-b') : null;
      if (!b) return;
      var iso = b.getAttribute('data-iso');
      if (!iso) return;
      selectCountry(iso);
      var d = document.getElementById('detail');
      if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function loadTMap(cb) {
    if (window.TMap) { cb(); return; }
    var key = '';
    try { key = localStorage.getItem('tmap_key') || ''; } catch (e) { key = ''; }
    var url = 'https://map.qq.com/api/gljs?v=1.exp';
    if (key) {
      // 用户自备密钥：移除密钥代理配置，改用标准 key 模式
      try { delete window._TMapSecurityConfig; } catch (e) { window._TMapSecurityConfig = undefined; }
      url += '&key=' + encodeURIComponent(key);
    }
    var s = document.createElement('script');
    s.src = url;
    s.onload = function () { cb(); };
    s.onerror = function () { cb(new Error('SDK 加载失败')); };
    (document.head || document.body).appendChild(s);
  }

  function initMap() {
    var notice = $('#map-notice');
    loadTMap(function (err) {
      if (err || !window.TMap) {
        notice.innerHTML = '<b>已切换为「分组气泡」视图。</b>腾讯地图底图需要密钥（密钥与账号绑定、无法公共共享）。' +
          '下方气泡按地区分组、面积代表规模、颜色代表指数，数据与地图模式完全一致。' +
          '如需地理底图，请在页面底部填入你自己的腾讯位置服务密钥（个人开发者可免费申请，日额度 1 万次）。';
        renderBubbleFallback();
        return;
      }
      try {
        var TMap = window.TMap;
        // 按官方示例使用容器 id 初始化；世界视野用低缩放级别
        MAP.map = new TMap.Map('map-container', {
          zoom: 2, center: new TMap.LatLng(22, 30), pitch: 0, rotation: 0
        });
        MAP.ready = true;
        notice.innerHTML = '底图：<b>腾讯地图</b>（合规地图服务商）。国界、行政区划与领土表达以底图为准，' +
          '本页仅叠加数据气泡、不自行绘制行政边界；气泡经纬度取自世界银行官方国家坐标字段。' +
          '因涉及境外地理范围渲染，独立部署时需使用你自己的密钥。';
        renderMap();
      } catch (e) {
        notice.innerHTML = '<b>地图初始化失败：</b>' + esc((e && e.message) || e);
      }
    });
  }

  $('#map-color').addEventListener('change', renderMap);
  $('#map-size').addEventListener('change', renderMap);
  $('#map-replay').addEventListener('click', renderMap);
  $('#tmap-key-save').addEventListener('click', function () {
    var v = ($('#tmap-key').value || '').trim();
    try { if (v) localStorage.setItem('tmap_key', v); else localStorage.removeItem('tmap_key'); } catch (e) {}
    location.reload();
  });
  try {
    var savedKey = localStorage.getItem('tmap_key');
    if (savedKey) $('#tmap-key').value = savedKey;
  } catch (e) { /* localStorage 不可用时忽略 */ }

  /* ---------------- 10. 方法论 ---------------- */
  function weightList(el, weights, red) {
    var max = Math.max.apply(null, Object.keys(weights).map(function (k) { return weights[k]; }));
    $(el).innerHTML = Object.keys(weights).sort(function (a, b) { return weights[b] - weights[a]; }).map(function (k) {
      return '<div class="weight-row' + (red ? ' w-red' : '') + '"><div>' + k + '</div>' +
        '<div class="weight-track"><div class="weight-fill" data-w="' + (weights[k] / max * 100).toFixed(1) + '" style="width:0"></div></div>' +
        '<div class="weight-pct">' + weights[k] + '%</div></div>';
    }).join('');
  }
  weightList('#epi-weights', M.epi_weights, false);
  weightList('#mfi-weights', M.mfi_weights, true);

  var USAGE = {
    'SP.POP.TOTL': '样本筛选（人口 ≥ 100 万）与全球汇总、加权',
    'SP.POP.GROW': 'EPI · 人口活力维度',
    'SP.DYN.LE00.IN': 'EPI · 人力资本维度（50%）',
    'SP.POP.DPND': '国家详情展示（抚养比）',
    'SP.URB.TOTL.IN.ZS': '国家详情展示（城镇化率）',
    'NY.GDP.MKTP.CD': 'GDP 规模、全球汇总、MFI/EPI 的经济规模加权',
    'NY.GDP.PCAP.PP.KD': 'EPI · 富裕水平维度（核心指标，取对数归一化）',
    'NY.GDP.MKTP.KD.ZG': 'EPI · 增长动能 / MFI · 增长失速与宏观波动',
    'NY.GDP.PCAP.KD.ZG': '国家详情展示（人均 GDP 增速）',
    'FP.CPI.TOTL.ZG': 'EPI · 物价稳定 / MFI · 通胀压力',
    'SL.UEM.TOTL.ZS': 'EPI · 就业质量 / MFI · 就业压力',
    'HD.HCI.OVRL': 'EPI · 人力资本维度（50%）',
    'GC.DOD.TOTL.GD.ZS': 'MFI · 债务压力（IMF 数据缺失时回退）',
    'BN.CAB.XOKA.GD.ZS': 'EPI · 外部韧性 / MFI · 外部脆弱',
    'FI.RES.TOTL.CD': '计算外汇储备覆盖进口月数',
    'NE.EXP.GNFS.ZS': '国家详情展示（出口依存度）',
    'NE.IMP.GNFS.CD': '外储覆盖月数的分母',
    'DT.DOD.DECT.GN.ZS': '国家详情展示（外债 / GNI）',
    'IT.NET.USER.ZS': '国家详情展示（互联网普及率）'
  };
  $('#indicator-body').innerHTML = Object.keys(M.indicators).map(function (k) {
    var it = M.indicators[k];
    return '<tr><td><code>' + k + '</code></td><td>' + esc(it.name) + '</td><td>' + esc(it.unit) + '</td><td>' + esc(USAGE[k] || '辅助指标') + '</td></tr>';
  }).join('');

  $('#source-list').innerHTML = M.sources.map(function (s) {
    return '<div class="source-item"><div class="s-n">' + esc(s.name) + '</div>' +
      '<a class="s-u" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a>' +
      '<div class="s-d">用途：' + esc(s.usage) + '</div></div>';
  }).join('');

  /* ---------------- 11. 图表引擎 ---------------- */
  function lineChart(sel, series, opts) {
    opts = opts || {};
    var W = 760, H = opts.h || 250;
    var pad = { l: 48, r: 16, t: 16, b: 34 };
    if (opts.legend) pad.t = 34;
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

    var all = [];
    series.forEach(function (s) { s.data.forEach(function (d) { if (isNum(d[1])) all.push(d[1]); }); });
    if (opts.ref != null) all.push(opts.ref);
    var yMin = opts.yMin != null ? opts.yMin : Math.min.apply(null, all);
    var yMax = Math.max.apply(null, all);
    var span = (yMax - yMin) || 1;
    if (opts.yMin == null) { yMin -= span * 0.12; yMax += span * 0.12; }
    if (yMin > 0 && yMin < span * 0.5) yMin = 0;

    var labels = series[0].data.map(function (d) { return d[0]; });
    var n = labels.length;
    var X = function (i) { return pad.l + (n <= 1 ? 0 : i / (n - 1) * iw); };
    var Y = function (v) { return pad.t + ih - (v - yMin) / (yMax - yMin) * ih; };

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';
    // 网格 + Y 轴
    for (var t = 0; t <= 4; t++) {
      var v = yMin + (yMax - yMin) * t / 4, y = Y(v);
      s += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (W - pad.r) + '" y2="' + y + '" stroke="#eef1f6" stroke-width="1"/>';
      s += '<text x="' + (pad.l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10.5" fill="#7d8ca3">' + v.toFixed(1) + '</text>';
    }
    if (yMin < 0 && yMax > 0) {
      s += '<line x1="' + pad.l + '" y1="' + Y(0) + '" x2="' + (W - pad.r) + '" y2="' + Y(0) + '" stroke="#c3cbd8" stroke-width="1" stroke-dasharray="3 3"/>';
    }
    if (opts.ref != null) {
      s += '<line x1="' + pad.l + '" y1="' + Y(opts.ref) + '" x2="' + (W - pad.r) + '" y2="' + Y(opts.ref) +
        '" stroke="#2563eb" stroke-width="1" stroke-dasharray="5 4" opacity=".75"/>' +
        '<text x="' + (W - pad.r) + '" y="' + (Y(opts.ref) - 5) + '" text-anchor="end" font-size="10" fill="#2563eb">' + esc(opts.refLabel || '') + '</text>';
    }
    // X 轴标签
    var step = Math.max(1, Math.floor(n / 6));
    for (var i = 0; i < n; i += step) {
      s += '<text x="' + X(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="#7d8ca3">' + esc(labels[i]) + '</text>';
    }
    // 折线
    series.forEach(function (se, si) {
      var d = '', area = '';
      var first = true;
      se.data.forEach(function (p, idx) {
        if (!isNum(p[1])) return;
        var x = X(idx), y = Y(p[1]);
        d += (first ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
        if (first) { area = 'M' + x.toFixed(1) + ' ' + Y(Math.max(yMin, 0)).toFixed(1) + ' L' + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; }
        else { area += 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; }
        first = false;
      });
      if (!d) return;
      var lastX = X(se.data.length - 1);
      if (se.fill) {
        s += '<path d="' + area + 'L' + lastX.toFixed(1) + ' ' + Y(Math.max(yMin, 0)).toFixed(1) + ' Z" fill="' + se.fill + '"/>';
      }
      s += '<path class="ln" style="animation-delay:' + (si * 240) + 'ms" d="' + d +
        '" fill="none" stroke="' + se.color + '" stroke-width="1.8" stroke-linejoin="round"/>';
    });
    // 图例
    if (opts.legend) {
      var lx = pad.l;
      series.forEach(function (se) {
        s += '<rect x="' + lx + '" y="10" width="10" height="3" rx="1.5" fill="' + se.color + '"/>' +
          '<text x="' + (lx + 15) + '" y="15" font-size="11" fill="#42536b">' + esc(se.name) +
          (opts.unit ? '（' + opts.unit + '）' : '') + '</text>';
        lx += 22 + se.name.length * 11 + (opts.unit ? 40 : 0);
      });
    }
    s += '</svg>';
    $(sel).innerHTML = s;
  }

  function scatterChart(sel, pts, opts) {
    opts = opts || {};
    var W = 760, H = opts.h || 400;
    var pad = { l: 52, r: 20, t: 20, b: 46 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs) - 0.06, xMax = Math.max.apply(null, xs) + 0.06;
    var yMin = Math.min.apply(null, ys) - 4, yMax = Math.max.apply(null, ys) + 4;
    var X = function (v) { return pad.l + (v - xMin) / (xMax - xMin) * iw; };
    var Y = function (v) { return pad.t + ih - (v - yMin) / (yMax - yMin) * ih; };

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';
    for (var t = 0; t <= 4; t++) {
      var v = yMin + (yMax - yMin) * t / 4, y = Y(v);
      s += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (W - pad.r) + '" y2="' + y + '" stroke="#eef1f6"/>' +
        '<text x="' + (pad.l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10.5" fill="#7d8ca3">' + v.toFixed(0) + '</text>';
    }
    // X 轴：10 的对数刻度
    [3, 4, 5].forEach(function (e) {
      for (var m = 1; m <= 3; m++) {
        var lv = e + Math.log10(m);
        if (lv < xMin || lv > xMax) continue;
        var x = X(lv);
        s += '<line x1="' + x + '" y1="' + pad.t + '" x2="' + x + '" y2="' + (pad.t + ih) + '" stroke="#f2f5f9"/>' +
          '<text x="' + x + '" y="' + (pad.t + ih + 16) + '" text-anchor="middle" font-size="10" fill="#7d8ca3">' +
          (Math.round(Math.pow(10, lv) / 100) * 100).toLocaleString('en-US') + '</text>';
      }
    });
    s += '<text x="' + (pad.l + iw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#42536b">' + esc(opts.xLabel || '') + '</text>';
    s += '<text x="14" y="' + (pad.t + ih / 2) + '" font-size="11" fill="#42536b" transform="rotate(-90 14 ' + (pad.t + ih / 2) + ')" text-anchor="middle">' + esc(opts.yLabel || '') + '</text>';

    pts.sort(function (a, b) { return b.r - a.r; });
    pts.forEach(function (p, i) {
      s += '<circle class="bub" style="animation-delay:' + Math.min(i * 6, 900) + 'ms" cx="' + X(p.x).toFixed(1) +
        '" cy="' + Y(p.y).toFixed(1) + '" r="' + p.r.toFixed(1) +
        '" fill="' + p.c + '" fill-opacity=".62" stroke="#fff" stroke-width=".8">' +
        '<title>' + esc(p.name + '（' + p.iso + '）\n人均GDP PPP：' + p.ppp + ' 国际元\nEPI：' + p.epi + '　MFI：' + p.mfi + '\n人口：' + p.pop + ' 百万') + '</title></circle>';
    });
    s += '</svg>';
    $(sel).innerHTML = s;
  }

  /* ---------------- 12. 初始化 ---------------- */
  function renderView() {
    renderKPI();
    renderRanks();
    renderMFIRanks();
    renderSelect();
    renderTable();
    renderScatter();
    renderMap();
    animateFills();
  }
  renderView();
  selectCountry('CHN');
  initMap();
  initReveal();

  // 导航高亮
  var links = Array.prototype.slice.call(document.querySelectorAll('.subnav a'));
  var secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  window.addEventListener('scroll', function () {
    var y = window.scrollY + 140, idx = 0;
    secs.forEach(function (sec, i) { if (sec && sec.offsetTop <= y) idx = i; });
    links.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
  }, { passive: true });
})();
