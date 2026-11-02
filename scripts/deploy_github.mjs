// 部署到 GitHub Pages —— 故意只用 Contents API 的单次 PUT，不碰 git。
// 这样"谁来调度"变成可插拔：本地 Node、GitHub Actions、千问办公的 HTTP 节点
// 都能执行同一步，只要它能发一个带 Bearer token 的 HTTPS 请求。
// 用法: node scripts/deploy_github.mjs --date 2026-11-02 [--dry-run]
//       node scripts/deploy_github.mjs --init        （一次性：关 Jekyll）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv, need, ghToken, logLine, arg, has } from './_util.mjs';

loadEnv();
const date = arg('--date');
const init = has('--init');
const dry = has('--dry-run');
if (!init && !date) { console.error('用法: --date YYYY-MM-DD 或 --init'); process.exit(2); }
if (!dry) need('GITHUB_REPO');

const repo = process.env.GITHUB_REPO || 'liomoremix/ai-daily';
const branch = process.env.PAGES_BRANCH || 'main';
const base = (process.env.BASE_URL || `https://${(repo || 'user').split('/')[0]}.github.io/${(repo || 'repo').split('/')[1]}`).replace(/\/+$/, '');
const H = {
  Authorization: `Bearer ${ghToken()}`,
  'Content-Type': 'application/json',
  'User-Agent': 'ai-daily',
  'X-GitHub-Api-Version': '2022-11-28'
};

async function put(path, buf, message) {
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  let sha = null;
  const head = await fetch(`${api}?ref=${branch}`, { headers: H });
  if (head.status === 200) sha = (await head.json()).sha;
  else if (head.status !== 404) throw new Error(`读取 ${path} 失败 HTTP ${head.status}`);

  const body = { message, branch, content: buf.toString('base64') };
  if (sha) body.sha = sha;
  const r = await fetch(api, { method: 'PUT', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`上传 ${path} 失败 HTTP ${r.status}: ${j && j.message}`);
  return j.commit.sha;
}

const dir = join(ROOT, 'content', 'output', date || '_init');
const jobs = init
  ? [{ path: '.nojekyll', file: null, msg: 'chore: disable jekyll' }]
  : [
      { path: `d/${date}/index.html`, file: 'index.html', msg: `docs: AI 每日一识 ${date}` },
      { path: `d/${date}/cover.png`, file: 'cover.png', msg: `cover: ${date}` },
      { path: `d/${date}/meta.json`, file: 'meta.json', msg: `meta: ${date}` }
    ];

const missing = [];
for (const j of jobs) {
  if (j.file) {
    const p = join(dir, j.file);
    if (!existsSync(p)) { missing.push(j.file); continue; }
    j.buf = readFileSync(p);
  } else {
    j.buf = Buffer.alloc(0);
  }
  if (dry) { console.log(`[deploy] (dry) ${j.path}  ${(j.buf.length / 1024).toFixed(1)}KB`); continue; }
  const sha = await put(j.path, j.buf, j.msg);
  console.log(`[deploy] ${j.path}  commit ${sha.slice(0, 7)}`);
  j.sha = sha;
}
if (missing.length) { console.error('[deploy] 缺文件: ' + missing.join(', ')); process.exit(1); }

if (!init) {
  const urls = {
    date,
    page_url: `${base}/d/${date}/index.html`,
    cover_url: `${base}/d/${date}/cover.png`
  };
  writeFileSync(join(dir, 'urls.json'), JSON.stringify(urls, null, 2));
  logLine(`deploy ok ${date} -> ${urls.page_url}`);
  console.log('[deploy] ' + urls.page_url);
  console.log('[deploy] 首次部署后 Pages 生效要 1-2 分钟，别立刻判定为失败');
}
