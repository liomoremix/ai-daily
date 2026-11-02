// 选题器：从题库挑今天该写哪一篇，保证类目不连重、不发过
// 用法: node scripts/pick_topic.mjs [--date 2026-11-03]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, arg } from './_util.mjs';

const bank = JSON.parse(readFileSync(join(ROOT, 'content', 'topic_bank.json'), 'utf8'));
const state = JSON.parse(readFileSync(join(ROOT, 'content', 'state.json'), 'utf8'));
const date = arg('--date') || new Date().toISOString().slice(0, 10);

const used = new Set(state.sent.map(s => s.id));
const sent = state.sent.slice().sort((a, b) => a.date.localeCompare(b.date));
const yesterday = sent.filter(s => s.date < date).pop();
const count = {};
bank.categories.forEach(c => (count[c] = 0));
sent.forEach(s => { if (count[s.category] !== undefined) count[s.category]++; });

const pool = bank.topics.filter(t => !used.has(t.id));
if (!pool.length) {
  console.error('[pick] 题库已空，需要补充 content/topic_bank.json');
  process.exit(1);
}

// 优先选"发得最少、且不是昨天那一类"的类目
const cats = bank.categories
  .filter(c => pool.some(t => t.category === c))
  .filter(c => !yesterday || c !== yesterday.category)
  .sort((a, b) => count[a] - count[b]);
const chosenCat = (cats[0] || bank.categories.find(c => pool.some(t => t.category === c)));
const topic = pool.find(t => t.category === chosenCat);

console.log(JSON.stringify({
  date,
  id: topic.id,
  category: topic.category,
  series: topic.series || topic.category,
  title: topic.title,
  hook: topic.hook,
  mechanism: topic.mechanism,
  difficulty: topic.difficulty,
  read_minutes: topic.read_minutes || 4,
  remaining: pool.length - 1,
  yesterday: yesterday ? `${yesterday.date} ${yesterday.category}` : null
}, null, 2));
