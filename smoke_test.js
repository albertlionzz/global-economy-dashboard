/* 冒烟测试：用最小 DOM 桩执行 app.js 的全部渲染路径，并模拟视图切换，捕获运行时错误 */
const fs = require('fs');
const path = require('path');

const store = {};
function El(sel) {
  return {
    _sel: sel,
    innerHTML: '', textContent: '', value: '', href: '', download: '',
    style: {}, offsetTop: 0, handlers: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
    querySelectorAll() { return []; },
    insertAdjacentHTML() {}, appendChild() {},
    getAttribute() { return null; }, setAttribute() {},
    closest() { return null; }, scrollIntoView() {}, click() {},
  };
}
const document = {
  body: El('body'),
  querySelector(sel) {
    if (!store[sel]) store[sel] = El(sel);
    return store[sel];
  },
  querySelectorAll() { return []; },
  createElement() { return El('new'); },
  getElementById() { return El('byid'); },
  addEventListener() {},
};
const window = { addEventListener() {}, scrollY: 0, requestAnimationFrame() {} };

global.window = window;
global.document = document;

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'global_data.json'), 'utf8'));
window.__GLOBAL_DATA__ = D;

let err = null;
try {
  eval(fs.readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8'));
} catch (e) {
  err = e;
}
if (err) {
  console.error('❌ 运行时错误：', err && err.stack || err);
  process.exit(1);
}
console.log('✅ app.js 初始化渲染成功（默认 G20 视图）');

let bad = 0;
function check(name, sel, min) {
  const el = store[sel];
  const len = el ? String(el.innerHTML || el.textContent || '').length : 0;
  const ok = len >= (min || 40);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(16, '　')} ${sel}  (${len} 字符)`);
}

const checks = [
  ['视图切换器', '#view-switch', 40],
  ['KPI 卡片', '#kpi-grid', 200],
  ['地图图例', '#map-legend', 100],
  ['地图标题', '#map-title', 2],
  ['VIX 量表', '#vix-gauge', 200],
  ['VIX 走势图', '#vix-chart', 2000],
  ['VIX 历史峰值', '#vix-peaks', 400],
  ['GFI 拆解', '#gfi-bars', 200],
  ['全球 MFI 统计', '#mfi-global-stats', 200],
  ['繁荣指数排行', '#rank-grid', 2000],
  ['宏观恐慌排行', '#mfi-top', 2000],
  ['数据表', '#table-body', 5000],
  ['国家详情', '#detail-body', 2000],
  ['GDP 趋势图', '#chart-growth', 2000],
  ['人口趋势图', '#chart-pop', 2000],
  ['散点图', '#chart-scatter', 5000],
  ['EPI 权重', '#epi-weights', 400],
  ['MFI 权重', '#mfi-weights', 400],
  ['指标清单', '#indicator-body', 800],
  ['数据源说明', '#source-list', 300],
];
checks.forEach((c) => check(c[0], c[1], c[2]));

/* --- 校验 G20 视图内容 --- */
function countRows(sel) {
  const html = String((store[sel] || {}).innerHTML || '');
  return (html.match(/data-iso="/g) || []).length;
}
const g20Rows = countRows('#rank-grid');
const g20Table = countRows('#table-body');
const g20Pts = (String(store['#chart-scatter'].innerHTML).match(/<circle/g) || []).length;
console.log(`\n[G20 视图] 排行 ${g20Rows} 行 · 表格 ${g20Table} 行 · 散点 ${g20Pts} 点`);
if (g20Rows !== 19) { console.error(`❌ G20 排行应为 19 个，实际 ${g20Rows}`); bad++; }
if (g20Table !== 19) { console.error(`❌ G20 表格应为 19 行，实际 ${g20Table}`); bad++; }
const g20Tags = (String(store['#rank-grid'].innerHTML).match(/g20-tag/g) || []).length;
if (g20Tags !== 19) { console.error(`❌ G20 徽标应为 19 个，实际 ${g20Tags}`); bad++; }

/* --- 模拟点击切换到「全部样本」 --- */
const vs = store['#view-switch'];
const clickHandlers = vs.handlers.click || [];
if (!clickHandlers.length) {
  console.error('❌ 视图切换器未绑定点击事件'); bad++;
} else {
  try {
    clickHandlers[0].call(vs, { target: { closest: () => ({ getAttribute: () => 'ALL' }) } });
    console.log('✅ 视图切换（G20 → 全部样本）执行成功');
    const allRows = countRows('#rank-grid');
    const allTable = countRows('#table-body');
    console.log(`[全部视图] 排行 ${allRows} 行（TOP20+BOTTOM20）· 表格 ${allTable} 行`);
    if (allTable !== D.meta.country_count) {
      console.error(`❌ 全部视图表格应为 ${D.meta.country_count} 行，实际 ${allTable}`); bad++;
    }
    if (allRows !== 40) { console.error(`❌ 全部视图排行应为 40 行，实际 ${allRows}`); bad++; }
    // 切回 G20
    clickHandlers[0].call(vs, { target: { closest: () => ({ getAttribute: () => 'G20' }) } });
    if (countRows('#rank-grid') !== 19) { console.error('❌ 切回 G20 失败'); bad++; }
    else console.log('✅ 切回 G20 正常');
  } catch (e) {
    console.error('❌ 视图切换报错：', e && e.stack || e); bad++;
  }
}

/* --- 详情面板数值校验 --- */
const dbHtml = String(store['#detail-body'].innerHTML || '');
const metrics = (dbHtml.match(/class="metric"/g) || []).length;
const nas = (dbHtml.match(/class="na"/g) || []).length;
console.log(`\n国家详情（默认中国）：指标卡 ${metrics} 个，其中无数据 ${nas} 个`);
if (metrics < 18) { console.error('❌ 指标卡数量异常'); bad++; }
if (nas > 6) { console.error('❌ 无数据指标过多，疑似格式化 bug'); bad++; }

/* --- 样本口径校验：经济体量前 TOP_N 名 --- */
const TOPN = D.meta.top_n || 50;
console.log(`\n[样本口径] ${D.meta.sample_rule || ''}`);
if (D.meta.country_count !== TOPN) {
  console.error(`❌ 样本数量应为 ${TOPN}，实际 ${D.meta.country_count}`); bad++;
} else {
  console.log(`✅ 样本数量 = ${TOPN}`);
}
const ranks = D.countries.map((r) => r.gdp_rank).filter((v) => typeof v === 'number');
const rankSet = new Set(ranks);
if (rankSet.size !== TOPN || Math.min(...ranks) !== 1 || Math.max(...ranks) !== TOPN) {
  console.error(`❌ GDP 排名应覆盖 1..${TOPN} 且不重复，实际 ${rankSet.size} 个 [${Math.min(...ranks)}..${Math.max(...ranks)}]`); bad++;
} else {
  console.log(`✅ GDP 排名覆盖 1..${TOPN} 无重复`);
}
// GDP 应随 gdp_rank 递减
const byRank = D.countries.slice().sort((a, b) => a.gdp_rank - b.gdp_rank);
let desc = true;
for (let i = 1; i < byRank.length; i++) {
  if ((byRank[i - 1].gdp || 0) < (byRank[i].gdp || 0) - 1e-6) { desc = false; break; }
}
if (!desc) { console.error('❌ GDP 未按经济体量递减排序'); bad++; }
else console.log('✅ GDP 按经济体量递减排序正确');
// G20 19 个成员国应全部在前 TOP_N 内
const G20 = ['ARG','AUS','BRA','CAN','CHN','FRA','DEU','IND','IDN','ITA','JPN','KOR','MEX','RUS','SAU','ZAF','TUR','GBR','USA'];
const missing = G20.filter((c) => !D.countries.some((r) => r.iso3 === c));
if (missing.length) { console.error(`❌ G20 成员缺失: ${missing.join(',')}`); bad++; }
else console.log('✅ G20 19 个成员国全部在样本内');

/* --- 无密钥降级视图（分组气泡矩阵，不依赖腾讯地图） --- */
const fbHtml = String((store['#map-container'] || {}).innerHTML || '');
const fbBubbles = (fbHtml.match(/class="bf-b"/g) || []).length;
const fbRegs = (fbHtml.match(/class="bf-reg"/g) || []).length;
console.log(`\n[降级视图] 分组气泡 ${fbBubbles} 个 · 地区分组 ${fbRegs} 个`);
if (fbBubbles !== 19) { console.error(`❌ G20 视图降级气泡应为 19 个，实际 ${fbBubbles}`); bad++; }
else if (fbRegs < 2) { console.error('❌ 地区分组数量异常'); bad++; }
else console.log('✅ 无密钥时自动渲染分组气泡视图');

/* --- 地图数据完整性 --- */
const withGeo = D.countries.filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number').length;
console.log(`\n地图定位数据：${withGeo} / ${D.countries.length} 个经济体含经纬度`);
if (withGeo < D.countries.length - 3) { console.error('❌ 经纬度缺失过多'); bad++; }

console.log(`\n覆盖 ${D.meta.country_count} 个经济体 · VIX ${D.vix.latest}（${D.vix.latest_date}）· GFI ${D.global.gfi}`);
console.log(bad ? `\n❌ 共 ${bad} 项未通过` : '\n✅ 全部检查通过');
process.exit(bad ? 1 : 0);
