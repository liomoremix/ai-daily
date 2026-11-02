// 把 pages/<date>/ 内联成自包含单文件 index.html
// 用法: node scripts/build_page.mjs --date 2026-11-02
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { ROOT, arg } from './_util.mjs';

const date = arg('--date') || process.argv[2];
if (!date) { console.error('用法: node scripts/build_page.mjs --date 2026-11-02'); process.exit(2); }

const src = join(ROOT, 'pages', date);
const tpl = join(ROOT, 'templates');
const read = (p, optional) => {
  if (!existsSync(p)) { if (optional) return ''; fail(`缺少文件 ${p}`); }
  return readFileSync(p, 'utf8');
};
function fail(msg) { console.error(`[build] ${msg}`); process.exit(1); }

const meta = JSON.parse(read(join(src, 'meta.json')));
const css = read(join(tpl, 'base.css')) + '\n' + read(join(src, 'page.css'), true);

let html = read(join(tpl, 'shell.html'));
const parts = {
  TITLE: `${meta.title} | AI 每日一识 ${date}`,
  SUMMARY: meta.hook.slice(0, 150),
  CSS: css,
  BODY: read(join(src, 'body.html')),
  CONTROLS: read(join(tpl, 'controls.js')),
  PAGEJS: read(join(src, 'script.js')),
  FOOT: read(join(src, 'foot.html'), true) || `AI 每日一识 · ${date} · ${meta.category}`
};
for (const [k, v] of Object.entries(parts)) html = html.replace(new RegExp(`@@${k}@@`, 'g'), () => v);

// ---- 自包含审计：钉钉 webview 拉不到外链，任何外部依赖都是白屏事故 ----
const problems = [];
if (/(?:src|href|srcset|action)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html.split('<footer')[0])) {
  problems.push('存在外链属性 src/href');
}
if (/url\(\s*["']?(?:https?:)?\/\//i.test(html)) problems.push('CSS url() 引用外链');
if (/@import\s/i.test(html)) problems.push('使用了 @import');
if (/(@@[A-Z]+@@)/.test(html)) problems.push(`占位符未替换: ${html.match(/@@[A-Z]+@@/)[0]}`);
if (!html.includes('Motion.boot')) problems.push('页面没调用 Motion.boot');
const steps = (parts.BODY.match(/data-step=/g) || []).length;
if (steps < 3) problems.push(`只有 ${steps} 段，动效叙事太单薄`);
const bytes = Buffer.byteLength(html);
if (bytes > 200 * 1024) problems.push(`体积 ${(bytes / 1024) | 0}KB 超 200KB 上限`);

const outDir = join(ROOT, 'content', 'output', date);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
const gz = zlib.gzipSync(html, { level: 9 }).length;
console.log(`[build] ${join(outDir, 'index.html')}`);
console.log(`[build] ${steps} 段 · ${(bytes / 1024).toFixed(1)}KB · gzip ${(gz / 1024).toFixed(1)}KB`);
problems.forEach(p => console.log(`[warn] ${p}`));
process.exit(problems.length ? 1 : 0);
