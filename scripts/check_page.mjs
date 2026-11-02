// 用 Edge + CDP 真正打开页面跑一遍：抓 JS 异常 + 断言动画状态 + 出封面图
// 用法: node scripts/check_page.mjs 2026-11-02
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ROOT, arg } from './_util.mjs';
const date = arg('--date') || new Date().toISOString().slice(0, 10);
const OUT = join(ROOT, 'content', 'output', date);
const meta = JSON.parse(readFileSync(join(ROOT, 'pages', date, 'meta.json'), 'utf8'));
const page = join(OUT, 'index.html');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => existsSync(p));
if (!EDGE) { console.error('[check] 找不到 msedge.exe'); process.exit(1); }

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'aidaily-edge-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForDebugger(timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const tgt = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (tgt) return tgt;
    } catch { /* 还没起 */ }
    await sleep(300);
  }
  throw new Error('Edge 远程调试端口没起来');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pend = new Map(), handlers = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) {
      (handlers.get(m.method) || []).forEach(fn => fn(m.params));
    }
  });
  return new Promise((res, rej) => {
    ws.addEventListener('error', rej);
    ws.addEventListener('open', () => res({
      send: (method, params = {}) => new Promise((resolve, reject) => {
        const i = ++id; pend.set(i, { res: resolve, rej: reject });
        ws.send(JSON.stringify({ id: i, method, params }));
      }),
      on: (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]),
      close: () => ws.close()
    }));
  });
}

const errors = [];
let loadResolve = null;
const client = await connect((await waitForDebugger()).webSocketDebuggerUrl);
client.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description?.split('\n')[0] || 'JS 异常'));
client.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push('console.error: ' + p.args.map(a => a.value).join(' ')); });
client.on('Log.entryAdded', p => { if (p.entry.level === 'error' && !/favicon/i.test(p.entry.text)) errors.push(p.entry.text); });
client.on('Page.loadEventFired', () => loadResolve && loadResolve());

await client.send('Runtime.enable');
await client.send('Page.enable');
await client.send('Log.enable');

async function open(qs, { width = 390, height = 844, scale = 2 } = {}) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: true });
  const loaded = new Promise(res => { loadResolve = res; });
  await client.send('Page.navigate', { url: pathToFileURL(page).href + qs });
  await Promise.race([loaded, sleep(8000)]);
  await sleep(700);
}
async function evl(expr) {
  const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

// ---------- 断言 ----------
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
const STEPS = {
  1: () => evl(`document.querySelectorAll('#lane1 .tok').length`),
  2: () => evl(`[document.querySelectorAll('#qkv .card-qkv').length, [...document.querySelectorAll('#qkv .bars5 i')].filter(i=>parseInt(i.style.width)>0).length]`),
  3: () => evl(`(()=>{const w=[...document.querySelectorAll('#bars .wval')].map(n=>parseInt(n.textContent)||0);return [document.querySelectorAll('#bars .wrow').length, w.reduce((a,b)=>a+b,0), document.querySelector('#formula .f4').classList.contains('lit')?1:0, Math.max(...[...document.querySelectorAll('#bars .wfill')].map(f=>f.getBoundingClientRect().width))]})()`),
  4: () => evl(`[document.querySelector('#mix').children.length, document.querySelector('#mixNote').textContent.includes('→')?1:0]`),
  5: () => evl(`[document.querySelectorAll('#quad line').length, document.getElementById('qPair').textContent, document.querySelector('#quadNote').classList.contains('lit')?1:0]`),
  6: () => evl(`document.querySelectorAll('#myths > div').length`)
};

// A) 正常播放模式（手机视口）
await open('');
const stepsCount = await evl(`window.Motion && Motion.steps.length`);
ok('Motion 装载 / 段落数', stepsCount === 6, `steps=${stepsCount}`);
const dockBtns = await evl(`document.querySelectorAll('#dock button').length`);
ok('控制条（播放/步进/重播）', dockBtns === 4, `按钮=${dockBtns}`);
const playing = await evl(`document.documentElement.classList.contains('is-playing')`);
ok('默认自动播放', playing === true);
await sleep(3200);
const revealed = await evl(`document.querySelectorAll('#lane1 .tok.anim.on').length`);
ok('第 1 步分词逐个浮现', revealed === 10, `${revealed}/10 个 token 已揭示`);
const paused = await evl(`(()=>{document.querySelector('#dock button.pri').click();return Motion.playing})()`);
ok('暂停按钮可用', paused === false);

// B) 逐步进 poster 模式，定格到 p=1 校验每段都真的画出来了
for (const [n, check] of Object.entries(STEPS)) {
  await open(`?poster=${n}&at=1`);
  const v = await check();
  if (n === '1' || n === '6') ok(`第 ${n} 段渲染`, v === (n === '1' ? 10 : 8), `数量=${v}`);
  if (n === '2') ok('第 2 段 QKV 三卡 + 特征条', v[0] === 3 && v[1] >= 10, `卡=${v[0]} 非零条=${v[1]}`);
  if (n === '3') {
    ok('第 3 段 权重条 10 行', v[0] === 10, `行=${v[0]}`);
    ok('softmax 归一（合计≈100%）', v[1] >= 96 && v[1] <= 104, `合计=${v[1]}%`);
    ok('公式末段揭示', v[2] === 1);
    ok('权重条真的渲染出像素宽度', v[3] > 60, `最宽 ${v[3].toFixed(0)}px`);
  }
  if (n === '4') ok('第 4 段 混合向量图 + 结论', v[0] >= 18 && v[1] === 1, `svg 节点=${v[0]}`);
  if (n === '5') ok('第 5 段 n² 连线暴涨', v[0] === 153 && v[1] === '324' && v[2] === 1, `线=${v[0]} 打分=${v[1]}`);
}

// C) 交互：换一个词当提问方，权重必须重算
await open('');
await evl('Motion.goto(2)');
await sleep(4300);
const changed = await evl(`(()=>{const g=()=>[...document.querySelectorAll('#bars .wval')].map(n=>n.textContent).join();
  const before=g(); if(document.querySelectorAll('#bars .wrow').length<10) return 'not-built';
  document.querySelector('#lane1 .tok[data-i="4"]').click();
  return before!==g() ? 'ok' : 'frozen'})()`);
ok('点任意词可重算权重', changed === 'ok', changed);

// D) 封面出图
const ps = meta.poster || { step: 3, at: 0.72, width: 820, height: 620 };
await open(`?poster=${ps.step}&at=${ps.at}`, { width: ps.width, height: ps.height, scale: 2 });
const shot = await client.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'cover.png'), Buffer.from(shot.data, 'base64'));
await open(`?poster=${ps.step}&at=${ps.at}`, { width: 390, height: 700, scale: 2 });
const shot2 = await client.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'preview-mobile.png'), Buffer.from(shot2.data, 'base64'));
ok('封面 + 手机预览出图', true, `cover.png / preview-mobile.png (${ps.step}段 @${ps.at})`);

ok('无 JS 异常', errors.length === 0, errors.slice(0, 4).join(' | '));

const bad = results.filter(r => !r.pass);
results.forEach(r => console.log(`${r.pass ? '  ok' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
console.log(`\n[check] ${results.length - bad.length}/${results.length} 通过`);

try { client.close(); } catch { }
try { proc.kill(); } catch { }
await sleep(1500);
try { rmSync(profile, { recursive: true, force: true }); } catch { console.log('[check] 临时 profile 未清理，可忽略: ' + profile); }
process.exit(bad.length ? 1 : 0);
