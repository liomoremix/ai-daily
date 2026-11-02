// 一次性开通：把源码 + 当天成品推进 repo，并打开 GitHub Pages，最后实测线上地址。
// 之后每天由 run_daily 走 deploy_github.mjs，这个脚本不用再跑。
// 用法: node scripts/bootstrap_repo.mjs --date 2026-11-02 [--dry-run]
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, loadEnv, ghFetch, logLine, arg, has } from './_util.mjs';

loadEnv();
const date = arg('--date');
const dry = has('--dry-run');
const repo = arg('--repo') || process.env.GITHUB_REPO;
const branch = process.env.PAGES_BRANCH || 'main';
if (!repo || !repo.includes('/')) {
  console.error('[boot] .env 里要把 GITHUB_REPO 填成 owner/name，并带 --date YYYY-MM-DD');
  process.exit(2);
}
const base = (process.env.BASE_URL || `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}`).replace(/\/+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// git 的 blob sha：本地算一次，用来证明 GitHub 上存下来的字节和我手里完全一致
const gitSha = buf => createHash('sha1').update(`blob ${buf.length}\u0000`).update(buf).digest('hex');

const SKIP = new Set(['.env', '.env.local', '.git', 'node_modules', 'logs', 'output']);
const entries = [];
function walk(rel) {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else entries.push({ path: p, buf: readFileSync(join(ROOT, p)) });
  }
}
entries.push({ path: '.nojekyll', buf: Buffer.alloc(0) });
if (existsSync(join(ROOT, '.gitignore'))) entries.push({ path: '.gitignore', buf: readFileSync(join(ROOT, '.gitignore')) });
for (const d of ['scripts', 'templates', 'pages', 'content']) if (existsSync(join(ROOT, d))) walk(d);
if (date) {
  const out = join(ROOT, 'content', 'output', date);
  for (const f of ['index.html', 'cover.png', 'meta.json']) {
    const p = join(out, f);
    if (!existsSync(p)) { console.error(`[boot] 缺成品 ${p}，先跑 build_page + check_page`); process.exit(1); }
    entries.push({ path: `d/${date}/${f}`, buf: readFileSync(p) });
  }
}
const totalKb = entries.reduce((s, e) => s + e.buf.length, 0) / 1024;

console.log(`[boot] repo=${repo} branch=${branch} 共 ${entries.length} 个文件 ${(totalKb / 1024).toFixed(2)}MB`);
for (const e of entries) console.log(`       ${e.path.padEnd(34)} ${(e.buf.length / 1024).toFixed(1)}KB`);

// 只读探测：dry-run 也跑，这样"要不要建分支"这类判断有实测依据
const repoInfo = await ghFetch(`/repos/${repo}`);
if (repoInfo.status !== 200) { console.error(`[boot] 读不到 repo HTTP ${repoInfo.status}: ${repoInfo.text.slice(0, 200)}`); process.exit(1); }
console.log(`[boot] repo ${repoInfo.json.full_name} private=${repoInfo.json.private} default=${repoInfo.json.default_branch}`);
const ref0 = await ghFetch(`/repos/${repo}/git/ref/heads/${branch}`);
let head = ref0.status === 200 ? ref0.json.object.sha : null;
console.log(`[boot] refs/heads/${branch}: ${head ? head.slice(0, 7) : '不存在，本次创建'}`);
const pages0 = await ghFetch(`/repos/${repo}/pages`);
console.log(`[boot] Pages: ${pages0.status === 200 ? `${pages0.json.status} -> ${pages0.json.html_url}` : `未开启 (HTTP ${pages0.status})`}`);

if (dry) { console.log('[boot] --dry-run，没有写入任何内容'); process.exit(0); }

// 空仓库不允许建 blob（409 Git Repository is empty），先用 Contents API 落一个提交把仓库初始化
if (!head) {
  let s = await ghFetch(`/repos/${repo}/contents/.nojekyll`, { method: 'PUT', body: { message: 'chore: 初始化仓库并关闭 Jekyll 处理', branch, content: '' } });
  if (![200, 201].includes(s.status)) {
    s = await ghFetch(`/repos/${repo}/contents/.nojekyll`, { method: 'PUT', body: { message: 'chore: 初始化仓库并关闭 Jekyll 处理', branch, content: Buffer.from('\n').toString('base64') } });
  }
  if (![200, 201].includes(s.status)) { console.error(`[boot] 初始化仓库失败 HTTP ${s.status}: ${s.text.slice(0, 240)}`); process.exit(1); }
  const r1 = await ghFetch(`/repos/${repo}/git/ref/heads/${branch}`);
  if (r1.status !== 200) { console.error(`[boot] 初始化后仍读不到 refs/heads/${branch}`); process.exit(1); }
  head = r1.json.object.sha;
  console.log(`[boot] 仓库已初始化，refs/heads/${branch} = ${head.slice(0, 7)}`);
}

for (const e of entries) e.sha = gitSha(e.buf);
let baseTree = null;
if (head) baseTree = (await ghFetch(`/repos/${repo}/git/commits/${head}`)).json.tree.sha;
const tree = [];
for (const e of entries) {
  // 空文件（.nojekyll）直接用 git 的固定空 blob sha：blob 接口拒绝空 content
  if (!e.buf.length) { tree.push({ path: e.path, mode: '100644', type: 'blob', sha: e.sha }); console.log(`[boot] blob ${e.path} (空)`); continue; }
  // 必须显式声明 encoding，否则 blob 接口把 content 当原文存，base64 会被二次落盘
  const r = await ghFetch(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: e.buf.toString('base64'), encoding: 'base64' } });
  // 同内容 blob 已存在时 GitHub 返回原 sha，重复上传是幂等的
  if (![200, 201].includes(r.status)) { console.error(`[boot] blob ${e.path} HTTP ${r.status}: ${r.text.slice(0, 200)}`); process.exit(1); }
  if (r.json.sha !== e.sha) { console.error(`[boot] blob ${e.path} sha 不一致: 远端 ${r.json.sha} 本地 ${e.sha}`); process.exit(1); }
  tree.push({ path: e.path, mode: '100644', type: 'blob', sha: e.sha });
  console.log(`[boot] blob ${e.path} ${e.sha.slice(0, 7)}`);
}
const treeRes = await ghFetch(`/repos/${repo}/git/trees`, {
  method: 'POST',
  body: baseTree ? { base_tree: baseTree, tree } : { tree }
});
if (treeRes.status !== 201) { console.error(`[boot] tree HTTP ${treeRes.status}: ${treeRes.text.slice(0, 300)}`); process.exit(1); }

const commitRes = await ghFetch(`/repos/${repo}/git/commits`, {
  method: 'POST',
  body: {
    message: head ? `deploy: AI 每日一识 ${date || '-'} 更新` : `init: AI 每日一识 ${date || ''} 源码 + 首篇成品`.trim(),
    tree: treeRes.json.sha,
    ...(head ? { parents: [head] } : {})
  }
});
if (commitRes.status !== 201) { console.error(`[boot] commit HTTP ${commitRes.status}: ${commitRes.text.slice(0, 300)}`); process.exit(1); }
const commit = commitRes.json.sha;

if (head) {
  const r = await ghFetch(`/repos/${repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit } });
  if (r.status !== 200) { console.error(`[boot] 移动分支失败 HTTP ${r.status}: ${r.text.slice(0, 200)}`); process.exit(1); }
} else {
  const r = await ghFetch(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit } });
  if (r.status !== 201) { console.error(`[boot] 建分支失败 HTTP ${r.status}: ${r.text.slice(0, 200)}`); process.exit(1); }
}
console.log(`[boot] commit ${commit.slice(0, 7)} 已落到 ${branch}`);

// Pages：201=刚开、409=已经开过（改成确认分支），其余算失败
let pagesMsg;
let r = await ghFetch(`/repos/${repo}/pages`, { method: 'POST', body: { source: { branch, path: '/' } } });
if (r.status === 201) pagesMsg = 'Pages 已开启';
else if (r.status === 409) {
  const u = await ghFetch(`/repos/${repo}/pages`, { method: 'PUT', body: { source: { branch, path: '/' } } });
  pagesMsg = u.status === 201 ? 'Pages 本来已开，已确认来源分支' : `Pages 已存在，但更新返回 HTTP ${u.status}: ${u.text.slice(0, 160)}`;
} else {
  console.error(`[boot] 开启 Pages 失败 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  process.exit(1);
}
console.log(`[boot] ${pagesMsg}`);

// 等构建：Pages 生效不是即时的，以线上真的返回 200 为准
const pageUrl = `${base}/d/${date}/index.html`;
const coverUrl = `${base}/d/${date}/cover.png`;
let built = null;
for (let i = 0; i < 30 && !built; i++) {
  const p = await ghFetch(`/repos/${repo}/pages`);
  const st = p.json && p.json.status;
  process.stdout.write(`[boot] 等待 Pages 构建… ${i * 10}s status=${st || '?'}\r`);
  if (st === 'built') built = true;
  else if (st === 'errored') { console.error('\n[boot] Pages 构建报错'); process.exit(1); }
  else await sleep(10000);
}
console.log();
if (!built) { console.error('[boot] 5 分钟内 Pages 没进入 built，稍后手动刷新线上地址再看'); process.exit(1); }

const results = [];
for (const [url, name, wantType] of [[pageUrl, 'index.html', 'text/html'], [coverUrl, 'cover.png', 'image/png']]) {
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const buf = Buffer.from(await res.arrayBuffer());
      const type = (res.headers.get('content-type') || '').split(';')[0];
      const local = entries.find(e => e.path.endsWith(name));
      const same = buf.length === local.buf.length && gitSha(buf) === local.sha;
      console.log(`[live] ${res.status} ${type} ${buf.length}B 字节一致=${same} ${url}`);
      ok = res.status === 200 && type === wantType && same;
      if (!ok) await sleep(10000);
    } catch (e) { console.log(`[live] 取 ${name} 出错: ${e.message}`); await sleep(10000); }
  }
  results.push({ name, ok });
}
if (!results.every(x => x.ok)) { console.error('[boot] 线上校验未通过: ' + results.filter(x => !x.ok).map(x => x.name).join(', ')); process.exit(1); }

writeFileSync(join(ROOT, 'content', 'output', date, 'urls.json'), JSON.stringify({ date, page_url: pageUrl, cover_url: coverUrl }, null, 2));
logLine(`bootstrap ok ${repo} pages=built commit=${commit.slice(0, 7)} ${pageUrl}`);
console.log('[boot] 全部通过');
console.log('[boot] 页面 ' + pageUrl);
console.log('[boot] 封面 ' + coverUrl);
