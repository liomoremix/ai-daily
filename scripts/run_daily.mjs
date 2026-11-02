// 每日编排：构建 → 浏览器实测门禁 → 部署 → 推送 → 记台账
// 用法: node scripts/run_daily.mjs --date 2026-11-02 [--dry-run] [--skip-check]
// 任一环节失败就停，不会把半成品推进群。
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { ROOT, loadEnv, logLine, arg, has, post } from './_util.mjs';

loadEnv();
const date = arg('--date') || new Date().toISOString().slice(0, 10);
const dry = has('--dry-run');
const dir = join(ROOT, 'content', 'output', date);
const metaPath = join(ROOT, 'pages', date, 'meta.json');

if (!existsSync(metaPath)) {
  logLine(`abort ${date}: 还没有 pages/${date}/meta.json —— 先跑选题器并生成内容`);
  console.error(`[run] 缺 pages/${date}/ 内容。选题: node scripts/pick_topic.mjs --date ${date}`);
  process.exit(2);
}
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

function step(name, file, extra = []) {
  console.log(`\n===== ${name} =====`);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', file), '--date', date, ...extra],
    { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) throw new Error(`${name} 失败 (exit ${r.status})`);
}

async function alert(text) {
  const url = process.env.ALERT_WEBHOOK;
  if (!url) return;
  const ts = Date.now();
  let target = url;
  if (process.env.ALERT_SECRET) {
    const sign = createHmac('sha256', process.env.ALERT_SECRET).update(`${ts}\n${process.env.ALERT_SECRET}`).digest('base64');
    target = `${url}&timestamp=${ts}&sign=${encodeURIComponent(sign)}`;
  }
  try { await post(target, { msgtype: 'text', text: { content: `AI每日一识流水线告警：${text}` } }); } catch { }
}

try {
  step('构建', 'build_page.mjs');
  if (!has('--skip-check')) step('浏览器实测', 'check_page.mjs');
  if (dry) {
    console.log('\n[run] dry-run：跳过部署与推送');
    console.log(`[run] 本地产物 ${join(dir, 'index.html')}`);
    process.exit(0);
  }
  step('部署', 'deploy_github.mjs');
  const urls = JSON.parse(readFileSync(join(dir, 'urls.json'), 'utf8'));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, page_url: urls.page_url }, null, 2));
  step('推送', 'send_dingtalk.mjs');

  const stateFile = join(ROOT, 'content', 'state.json');
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (!state.sent.some(s => s.date === date)) {
    state.sent.push({ date, id: meta.id, category: meta.category, title: meta.title, url: urls.page_url });
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }
  logLine(`run ok ${date} ${meta.id} -> ${urls.page_url}`);
  console.log(`\n[run] 完成：${urls.page_url}`);
} catch (e) {
  logLine(`run FAIL ${date} ${meta.id || '?'} :: ${e.message}`);
  await alert(`${date} ${e.message}`);
  console.error('[run] ' + e.message);
  process.exit(1);
}
