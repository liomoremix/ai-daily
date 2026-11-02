// 把当天那条卡片推到钉钉群（加签自定义机器人）
// 用法: node scripts/send_dingtalk.mjs --date 2026-11-02 [--dry-run]
// 说明: 机器人只能发 text/link/markdown/actionCard/feedCard，不解析 HTML ——
//       所以动效页必须先有公网 URL，这里发的是「封面图 + 摘要 + 打开按钮」。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { ROOT, loadEnv, need, post, logLine, arg, has } from './_util.mjs';

loadEnv();
const date = arg('--date') || new Date().toISOString().slice(0, 10);
const dry = has('--dry-run');
if (!dry) need('DINGTALK_WEBHOOK', 'DINGTALK_SECRET');

const dir = join(ROOT, 'content', 'output', date);
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
const base = (process.env.BASE_URL || 'https://REPLACE_ME.github.io/ai-daily').replace(/\/+$/, '');
const pageUrl = meta.page_url || `${base}/d/${date}/index.html`;
const coverUrl = `${base}/d/${date}/cover.png`;
const keyword = process.env.DINGTALK_KEYWORD || 'AI 每日一识';

const text = [
  `![cover](${coverUrl})`,
  '',
  `### ${meta.title}`,
  '',
  meta.hook,
  '',
  `> ${keyword} · ${meta.category}${meta.series ? '／' + meta.series : ''} ｜ 约 ${meta.read_minutes} 分钟 ｜ 手机点开可交互`
].join('\n');

const payload = {
  msgtype: 'actionCard',
  actionCard: {
    title: `${keyword} | ${meta.category} · ${meta.title}`,
    text,
    btnOrientation: '0',
    btns: [{ title: '打开今日动效详解 →', actionURL: pageUrl }]
  }
};

function signedUrl() {
  const ts = Date.now();
  const sign = createHmac('sha256', process.env.DINGTALK_SECRET)
    .update(`${ts}\n${process.env.DINGTALK_SECRET}`).digest('base64');
  return `${process.env.DINGTALK_WEBHOOK}&timestamp=${ts}&sign=${encodeURIComponent(sign)}`;
}

if (dry) {
  console.log('[send] dry-run，未发送。标题：' + payload.actionCard.title);
  console.log('[send] 跳转：' + pageUrl);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

let last;
for (let i = 1; i <= 3; i++) {
  try {
    const r = await post(signedUrl(), payload);
    last = r;
    if (r.json && r.json.errcode === 0) {
      logLine(`send ok ${date} -> ${pageUrl}`);
      console.log('[send] errcode=0 已送达');
      process.exit(0);
    }
    logLine(`send fail ${date} attempt=${i} ${JSON.stringify(r.json || r.text)}`);
    // 310000 签名/关键词不匹配，130121 限流
    if (r.json && r.json.errcode === 310000) break;
  } catch (e) {
    last = { text: String(e) };
    logLine(`send error ${date} attempt=${i} ${e.message}`);
  }
  await new Promise(r => setTimeout(r, i * 2000));
}
console.error('[send] 失败：' + JSON.stringify(last.json || last.text));
process.exit(1);
