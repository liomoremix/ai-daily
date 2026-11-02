// 共用工具：读 .env、发 HTTP、记日志。只用 Node 内置模块，零依赖。
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = (date) => join(ROOT, 'content', 'output', date);

export function loadEnv() {
  const f = join(ROOT, '.env');
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m || line.trim().startsWith('#')) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return process.env;
}

export function need(...keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[env] 缺少配置: ${missing.join(', ')} —— 请在项目根目录 .env 里填好（参考 .env.example）`);
    process.exit(3);
  }
}

// GitHub 凭证：优先 .env 的 GITHUB_TOKEN；没填就向 Git 凭证管理器要一次
// （本机 git 登录过 GitHub 时无需再造 PAT，token 也不落进 .env 和日志）。
export function ghToken() {
  const t = (process.env.GITHUB_TOKEN || '').trim();
  if (t && !/^(your|xxx|CHANGE_ME)/i.test(t)) return t;
  let out = '';
  try {
    out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, GCM_INTERACTIVE: 'never' }
    });
  } catch { /* 统一走下面的提示，不回显任何凭证相关错误细节 */ }
  const m = out && out.match(/^password=(.+)$/m);
  if (!m) {
    console.error('[gh] 拿不到 GitHub 凭证。两种办法任选其一：\n' +
      '  1) 终端里跑一次 git ls-remote https://github.com/<你的用户名>/<repo> 完成浏览器登录；\n' +
      '  2) 在 .env 的 GITHUB_TOKEN 填一个 fine-grained PAT（只给这个 repo 的 Contents 读写）。');
    process.exit(3);
  }
  return m[1].trim();
}

export async function ghFetch(path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ghToken()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ai-daily',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* Pages 构建期会返回 HTML，忽略 */ }
  return { status: r.status, json, text };
}

export async function post(url, body, timeout = 12000) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; }
  catch { return { status: r.status, json: null, text }; }
}

export function logLine(msg) {
  mkdirSync(join(ROOT, 'logs'), { recursive: true });
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(join(ROOT, 'logs', 'daily.log'), line);
  process.stdout.write(line);
}

export function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}
export const has = flag => process.argv.includes(flag);
