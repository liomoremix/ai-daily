'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PATHS = {
  book:'M3 5h6a3 3 0 0 1 3 3v13a4 4 0 0 0-4-3H3z M21 5h-6a3 3 0 0 0-3 3v13a4 4 0 0 1 4-3h5z',
  home:'m3 10 9-7 9 7 M5 9v11h5v-6h4v6h5V9',
  spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  download:'M12 3v12 m-5-5 5 5 5-5 M4 16v4h16v-4',
  message:'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
  edit:'m15 5 4 4 M4 20l5-1L21 7l-4-4L5 15z',
  folder:'M3 6h7l2 3h9v11H3z M3 6V4h7l2 2h8v3',
  file:'M5 3h10l4 4v14H5z M14 3v5h5 M9 12h6 M9 16h6',
  flag:'M5 21V3 M5 4c5-4 9 4 15 0v10c-6 4-10-4-15 0',
  arrow:'M4 12h16 m-6-6 6 6-6 6',
  back:'M20 12H4 m6-6-6 6 6 6',
  chevron:'m9 5 7 7-7 7',
  check:'m5 12 4 4L19 6',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v6l4 2',
  copy:'M9 8h11v13H9z M15 8V3H4v13h5',
  heart:'M12 20S2 14 2 8c0-5 7-6 10-1 3-5 10-4 10 1 0 6-10 12-10 12z',
  help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3 M12 17h.01',
  shield:'m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z m-4 9 3 3 5-6',
  image:'M3 3h18v18H3z m0 14 6-6 4 4 3-3 5 5 M16 7h.01',
  play:'m8 4 12 8-12 8z',
  pause:'M8 5v14 M16 5v14',
  search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 m6 13 5 5',
  zoom:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 m5 12 6 6 M7 10h6 M10 7v6',
  hand:'M8 12V5a2 2 0 0 1 4 0v7 M12 9a2 2 0 0 1 4 0v3 M16 10a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-1c-3 0-4-2-6-4l-4-4a2 2 0 0 1 3-3l2 2',
  menu:'M4 6h16 M4 12h16 M4 18h16',
  external:'M13 3h8v8 m0-8-11 11 M9 3H3v18h18v-6',
  bulb:'M8 16c0-2-4-3-4-7a8 8 0 0 1 16 0c0 4-4 5-4 7z M9 20h6 M10 23h4',
  refresh:'M20 7V3l-3 3a8 8 0 1 0 3 9 M20 7h-6',
  trophy:'M7 3h10v7a5 5 0 0 1-10 0z M7 5H3v3a4 4 0 0 0 4 4 M17 5h4v3a4 4 0 0 1-4 4 M12 15v6 M8 21h8'
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || PATHS.spark}"/></svg>`; }
const STORAGE = 'workbuddy-school-v1';
let storageAvailable = true;
let state = { done:[], checked:[], favorites:[], last:'0-0', motion:true, large:false };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
  if (saved && typeof saved === 'object') {
    for (const key of ['done','checked','favorites']) if (Array.isArray(saved[key])) state[key] = [...new Set(saved[key].filter(id => STEPS.some(s => s.id === id)))];
    if (STEPS.some(s => s.id === saved.last)) state.last = saved.last;
    if (typeof saved.motion === 'boolean') state.motion = saved.motion;
    if (typeof saved.large === 'boolean') state.large = saved.large;
  }
} catch { storageAvailable = false; }
function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { storageAvailable = false; $('#save-status').textContent = '当前浏览器无法保存进度'; }
}
let activeStep = null;
let demoTimer = null;
let demoIndex = 0;
let toastTimer = null;
let libraryFilter = 'all';
let librarySearch = '';
let zoom = 1;
const main = $('#main');
const getStep = id => STEPS.find(s => s.id === id);
const chapterDone = ci => COURSE[ci].lessons.filter((s,si) => state.done.includes(`${COURSE[ci].id}-${si}`)).length;
const coreDone = () => coreSteps.filter(step => state.done.includes(step.id)).length;
const percent = () => Math.round(coreDone() / coreSteps.length * 100);
const chapterLabel = ci => COURSE[ci].optional ? '前置章节' : '第 ' + ci + ' 章';
const sourceType = step => step.image.startsWith('official-') ? '官方指南配图' : '本机实拍 · WorkBuddy 5.11.3';
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
}
function applyPreferences() {
  document.documentElement.classList.toggle('no-motion', !state.motion);
  document.documentElement.classList.toggle('large-text', state.large);
  $('#motion-button').innerHTML = icon(state.motion ? 'pause' : 'play');
  $('#motion-button').setAttribute('aria-label', state.motion ? '关闭交互动画' : '开启交互动画');
  $('#motion-button').setAttribute('aria-pressed', String(!state.motion));
  $('#font-button').setAttribute('aria-pressed', String(state.large));
  $('#font-button').setAttribute('aria-label', state.large ? '恢复标准文字大小' : '放大文字');
  if (!storageAvailable) $('#save-status').textContent = '当前浏览器无法保存进度';
}
function renderSidebar(page, ci) {
  $('#sidebar').innerHTML = `<a class="brand" href="#home" aria-label="WorkBuddy 新手学堂首页"><img src="assets/favicon.svg" alt="" width="40" height="40"><div><strong>WorkBuddy</strong><span>新 手 学 堂</span></div></a>
    <a class="side-home ${page === 'home' ? 'active' : ''}" href="#home">${icon('home')}<span>我的学习之旅</span></a>
    <p class="side-heading">从零开始 · 学习路线</p>
    <nav class="course-nav" aria-label="课程章节">${COURSE.map((c,i) => {
      const n = chapterDone(i), complete = n === c.lessons.length;
      const first = c.lessons.findIndex((s,j) => !state.done.includes(`${c.id}-${j}`));
      return `<a class="chapter-nav ${ci === i ? 'active' : ''} ${complete ? 'complete' : ''}" ${ci === i ? 'aria-current="true"' : ''} href="#lesson/${c.id}-${first < 0 ? 0 : first}"><span class="num">${complete ? '✓' : c.optional ? '前置' : String(i).padStart(2,'0')}</span><span class="chapter-text">${c.short}</span><small>${n}/${c.lessons.length}</small></a>`;
    }).join('')}</nav>
    <div class="side-bottom"><div class="side-progress"><div class="progress-label"><span>正课学习进度</span><strong>${percent()}%</strong></div><div class="progress-track" role="progressbar" aria-label="正课学习进度" aria-valuemin="0" aria-valuemax="${coreSteps.length}" aria-valuenow="${coreDone()}"><span style="width:${percent()}%"></span></div><p class="small muted" style="font-size:10px;margin-top:8px">已完成 ${coreDone()} / ${coreSteps.length} 个小步骤</p></div><a href="#help" class="side-help">${icon('help')}<span>卡住了？来这里找帮助</span></a></div>`;
  $('#sidebar').inert = innerWidth <= 760 && !$('#sidebar').classList.contains('open');
}
function go(id) { location.hash = `lesson/${id}`; }
function renderHome() {
  const resume = getStep(state.last) || STEPS[0];
  main.innerHTML = `<section class="start-panel" aria-labelledby="hero-title"><h1 id="hero-title">从这里开始学 WorkBuddy</h1>
    <p>先看截图，再在自己的电脑上试一次。请选择你的起点。</p>
    <div class="start-actions"><a class="button" href="#lesson/11-0">还没安装，学怎么装 ${icon('arrow')}</a><a class="button secondary" href="#lesson/0-0">已经安装，从第一章开始 ${icon('arrow')}</a></div></section>
    ${state.done.length ? `<div class="resume-banner">${icon('book')}<div><strong>欢迎回来，接着上次的小步骤</strong><p>${esc(COURSE[resume.ci].short)} / ${esc(resume.title)}</p></div><a href="#lesson/${resume.id}" class="button">继续学习 ${icon('arrow')}</a></div>` : ''}
    <nav class="advanced-shortcuts" aria-label="直接进入进阶课"><strong>进阶练习</strong><a href="#lesson/7-0">使用专家</a><a href="#lesson/8-0">套件与技能</a><a href="#lesson/9-0">连接器</a><a href="#lesson/10-0">定时任务</a></nav><section id="roadmap"><div class="section-top"><div><h2>课程目录</h2><p>可以按顺序学，也可以点一章回看。</p></div><span class="section-meta">安装选学 · 正课 ${COURSE.length-1} 章</span></div><div class="course-grid">${COURSE.map((c,i) => {
      const n = chapterDone(i), first = c.lessons.findIndex((s,j) => !state.done.includes(`${c.id}-${j}`));
      return `<a class="course-card ${COURSE.length % 3 === 1 && i === COURSE.length-1 ? 'last-card' : ''}" href="#lesson/${c.id}-${Math.max(0,first)}"><div class="card-top"><span class="chapter-icon ${c.color}">${icon(c.icon)}</span><small>${chapterLabel(i)}</small></div><div><h3>${esc(c.title)}</h3><p>${esc(c.subtitle)}</p></div><div class="card-meta"><span>${icon('book')}${c.lessons.length} 个小步骤</span><span>${icon('clock')}约 ${c.time} 分钟</span>${n ? `<span>${n === c.lessons.length ? '✓ 已完成' : `${n} 步已完成`}</span>` : ''}</div><span class="card-go">${icon('arrow')}</span></a>`;
    }).join('')}</div></section>`;
}
function renderLesson(step) {
  activeStep = step;
  state.last = step.id;
  persist();
  demoIndex = 0;
  const c = COURSE[step.ci];
  const index = STEPS.indexOf(step);
  const checked = state.checked.includes(step.id) || state.done.includes(step.id);
  const nextLabel = index === STEPS.length-1 ? '完成本次学习' : c.optional && step.si === c.lessons.length-1 ? '进入第一章' : '下一步';
  const path = entryRoutes[c.id];
  const entryLesson = Boolean(path && step.si === 0);
  main.innerHTML = `<div class="breadcrumb"><a href="#home">学习中心</a>${icon('chevron')}<span>${chapterLabel(step.ci)} · ${esc(c.short)}</span></div>
    <div class="lesson-heading"><div><h1>${esc(step.title)}</h1><p>${esc(c.subtitle)}</p></div><span class="lesson-count">第 ${step.si+1} / ${c.lessons.length} 步</span></div>
    <nav class="step-rail" aria-label="本章小步骤">${c.lessons.map((s,i) => `<button class="step-tab ${i === step.si ? 'active' : ''} ${state.done.includes(`${c.id}-${i}`) ? 'done' : ''}" data-step="${c.id}-${i}" aria-label="第${i+1}步：${esc(s.title)}" ${i === step.si ? 'aria-current="step"' : ''} title="${esc(s.title)}">${state.done.includes(`${c.id}-${i}`) && i !== step.si ? icon('check') : String(i+1).padStart(2,'0')}</button>`).join('')}</nav>
    ${path ? `<section class="entry-route" aria-label="在 WorkBuddy 里怎么走"><div><strong>从已打开的 WorkBuddy 开始</strong>${entryLesson ? '' : `<a href="#lesson/${c.id}-0">重看入口图解</a>`}</div><p>${path.map(esc).join(' <span aria-hidden="true">→</span> ')}</p><details><summary>我的窗口里看不到左边这列文字</summary><div class="sidebar-recovery"><button type="button" data-image="entry-restore.webp" data-image-title="WorkBuddy 左上角的侧栏开关，蓝框内" aria-label="放大侧栏开关截图"><img src="assets/entry-restore.webp" alt="左上角的小矩形图标，靠左有一条竖线"></button><p>看 WorkBuddy 窗口最左上角，点击蓝框里的侧栏图标。出现“新建任务”“助理”等文字后，就可以按本章路径继续。在已有对话里也能使用这个入口。</p></div></details></section>` : ''}
    <div class="learning-flow"><span class="active"><b>1</b> 看图学操作</span>${icon('chevron')}<span><b>2</b> 自己试一次</span>${icon('chevron')}<span><b>3</b> 自检并继续</span></div>
    ${step.id === '11-0' ? `<p class="lesson-resource install-link"><a href="https://www.workbuddy.cn/" target="_blank" rel="noopener">打开 WorkBuddy 官网 ${icon('external')}</a><span>会打开新标签页。可以随时点回本教程看图。</span></p>` : ''}
    <section class="lesson-grid" aria-label="图文操作示范"><div class="screen-panel"><div class="screen-header"><span class="source-label">${esc(step.frames?.[0].source || sourceType(step))}</span><button data-image="${esc(step.image)}" data-image-title="${esc(step.title)}">${icon('zoom')} 放大查看</button></div><div class="screenshot-wrap" id="screenshot-wrap"><button class="screenshot-button" data-image="${esc(step.image)}" data-image-title="${esc(step.title)}" aria-label="放大截图：${esc(step.title)}"><img src="assets/${esc(step.image)}" alt="${esc(step.focus)}" id="lesson-image"></button></div><div class="screen-caption"><span class="demo-number caption-step" id="caption-step" aria-hidden="true">1</span><strong id="screen-focus">${esc(step.focus)}</strong></div><div class="demo-toolbar"><button class="button secondary" id="play-demo">${icon('play')} 看分步讲解</button><span id="demo-status">点击右侧说明，也能逐条看</span></div></div>
    ${entryLesson ? `<div class="explain-panel entry-panel"><div class="eyebrow">${icon('hand')} 对照自己的 WorkBuddy 操作</div><nav class="entry-dots" aria-label="选择一幅入口图解">${step.explain.map(([title],i) => `<button type="button" class="demo-step" data-demo="${i}" aria-label="第 ${i+1} 幅：${esc(title)}" title="${esc(title)}">${i+1}</button>`).join('')}</nav><div aria-live="polite" aria-atomic="true"><h2 id="entry-title"></h2><p id="entry-instruction"></p><div class="entry-try"><strong>轮到你</strong><p id="entry-attempt"></p></div></div><div class="entry-controls"><button class="button secondary" id="entry-back">上一幅</button><button class="button" id="entry-forward"></button></div></div>` :
    `<div class="explain-panel"><div class="eyebrow">${icon('book')} 跟着这几步做</div><h2>先看一遍，再自己试</h2>${step.explain.map(([title,description],i) => `<button class="demo-step ${i === 0 ? 'selected' : ''}" data-demo="${i}" aria-pressed="${i === 0}"><span class="demo-number">${i+1}</span><span><strong>${esc(title)}</strong><p>${esc(description)}</p></span></button>`).join('')}</div>`}</section>
    <section class="prompt-section" id="step-exercise" tabindex="-1"><div class="prompt-header"><h2>${icon('copy')}${c.optional ? '需要帮忙时，可以复制这句话' : '这一步的提示词'}</h2><div class="prompt-actions">${c.optional ? '' : `<button class="icon-button favorite-button" data-favorite="${step.id}" aria-label="${state.favorites.includes(step.id) ? '取消收藏' : '收藏提示词'}" aria-pressed="${state.favorites.includes(step.id)}">${icon('heart')}</button>`}<button class="button" data-copy="${step.id}">${icon('copy')} ${c.optional ? '复制求助文字' : '复制提示词'}</button></div></div><p class="prompt-text" id="step-prompt">${esc(step.prompt)}</p><div class="prompt-hint">${icon('bulb')}${c.optional ? '遇到困难时，把空白处换成自己的情况，发给帮助你安装的人。' : step.id === '10-1' ? '复制后回到新建定时任务窗口，点击提示词框，按 Ctrl + V。' : '复制后切换到 WorkBuddy，点击输入框，再按 Ctrl + V 粘贴。'}</div><p class="exercise-line"><strong>自己试一次</strong>${esc(step.practice)}</p></section>
    ${step.id === '8-2' ? `<div class="lesson-resource"><a href="assets/旧书交换会练习.pdf" download>${icon('download')} 下载旧书交换会练习.pdf</a></div>` : ''}
    ${c.id === 4 ? `<div class="lesson-resource"><a href="assets/练习会议记录.txt" download>${icon('download')} 下载练习会议记录.txt</a></div>` : ''}
    ${c.id === 5 ? `<div class="lesson-resource"><a href="assets/新手练习-会议纪要.docx" download>${icon('download')} 下载实拍中的示例 Word（供对照）</a></div>` : ''}
    <details class="help-details"><summary>没成功？展开看看这一步的提示</summary><p>${esc(step.help)}</p></details>
    <section class="practice-section ${checked ? 'checked' : ''}" id="practice"><label class="self-check"><input type="checkbox" id="self-check" ${checked ? 'checked' : ''}><span><strong>点方框打勾后，才能点“${nextLabel}”</strong><span>${esc(step.check)}</span></span></label></section>
    <div class="lesson-bottom"><button class="button secondary" id="previous-step" ${index === 0 || step.id === '0-0' ? 'disabled' : ''}>${icon('back')} 上一步</button><div class="next-group"><small id="next-hint" aria-live="polite">${checked ? '已勾选，可以继续' : '先勾选上方方框'}</small><button class="button" id="next-step" aria-describedby="next-hint" ${checked ? '' : 'disabled'}>${nextLabel}${icon('arrow')}</button></div></div>
    <div class="mini-progress"><span>${c.optional ? '安装' : '正课'} ${c.optional ? chapterDone(step.ci) : coreDone()}/${c.optional ? c.lessons.length : coreSteps.length} 步已完成</span><div class="progress-track"><span style="width:${c.optional ? chapterDone(step.ci)/c.lessons.length*100 : percent()}%"></span></div><span>按你的节奏来</span></div>`;
  if (step.frames) setDemo(0);
  if (c.id === 9 && step.si >= 1) mountMailbox();
  if (c.id === 10 && step.si >= 2) mountSchedule();
}
// These two exercises use fixtures in this tab. They never connect to a service.
const mockSubject = '练习：旧书交换会';
const mailbox = {read:false, subject:mockSubject, result:''};
function mountMailbox() {
  $('#practice .self-check').insertAdjacentHTML('beforebegin', `<form class="practice-lab" id="mail-lab">
    <h3>网页练习 · 虚构邮箱</h3><p>这里有一封主题为“练习：旧书交换会”的信。勾选允许读取，再按完整主题查询。</p>
    <label><input type="checkbox" name="read" ${mailbox.read ? 'checked' : ''}> 允许读取这份虚构邮箱</label>
    <label>查找的主题<input name="subject" type="text" maxlength="100" value="${esc(mailbox.subject)}" required></label>
    <button class="button secondary" type="submit">查找邮件</button><output aria-live="polite"></output></form>`);
  const form = $('#mail-lab'), output = form.querySelector('output');
  output.textContent = mailbox.result;
  form.elements.read.onchange = () => {
    mailbox.read = form.elements.read.checked;
    output.textContent = mailbox.result = mailbox.read ? '已允许读取。现在可以查询。' : '读取已关闭。';
  };
  form.onsubmit = event => {
    event.preventDefault();
    mailbox.subject = form.elements.subject.value.trim();
    output.textContent = mailbox.result = !mailbox.read ? '查询未执行。请先允许读取虚构邮箱。'
      : mailbox.subject === mockSubject ? '匹配 1 封 · 练习：旧书交换会\n时间　周五 12:30\n地点　一楼阅览角' : '匹配 0 封。检查主题中的文字、冒号和空格，再试一次。';
  };
}
const simPlan = {minute:720, next:null, daily:false, paused:false, records:[]};
function simTime(minute) {
  const day = Math.floor(minute / 1440) + 1;
  return `第 ${day} 天 ${String(Math.floor(minute % 1440 / 60)).padStart(2,'0')}:${String(minute % 60).padStart(2,'0')}`;
}
function mountSchedule() {
  $('#practice .self-check').insertAdjacentHTML('beforebegin', `<form class="practice-lab" id="timer-lab">
    <h3>网页练习 · 模拟时钟</h3><p>任务名为“练习－午间复盘”。快进只会在这个网页里生成三行复盘模板。</p>
    <div class="lab-fields"><label>重复<select name="rule"><option value="once">单次</option><option value="daily">每天</option></select></label>
    <label>模拟执行时间<input type="time" name="time" value="12:05" required></label></div>
    <div class="lab-actions"><button class="button secondary" type="submit">保存模拟计划</button><button class="button" type="button" name="advance">快进到执行时间</button><button class="button secondary" type="button" name="pause">暂停后续执行</button></div>
    <output aria-live="polite"></output><div class="lab-records"></div></form>`);
  const form = $('#timer-lab'), fields = form.elements;
  fields.rule.value = simPlan.daily ? 'daily' : 'once';
  if (simPlan.next !== null) fields.time.value = simTime(simPlan.next).slice(-5);
  function update(notice='') {
    fields.advance.disabled = simPlan.next === null || simPlan.paused;
    fields.pause.disabled = simPlan.next === null;
    fields.pause.textContent = simPlan.paused ? '恢复后续执行' : '暂停后续执行';
    const status = simPlan.paused ? '已暂停' : simPlan.next === null ? '没有待执行计划' : '下一次 ' + simTime(simPlan.next);
    form.querySelector('output').textContent = [notice,'模拟时钟　'+simTime(simPlan.minute),status].filter(Boolean).join('\n');
    form.querySelector('.lab-records').textContent = simPlan.records.length
      ? '运行记录（'+simPlan.records.length+' 次）\n最近一次　'+simTime(simPlan.records.at(-1))+' · 成功\n今天完成了____\n遇到的问题是____\n下一步准备____'
      : '运行记录（0 次）';
  }
  form.onsubmit = event => {
    event.preventDefault();
    const [h,m] = fields.time.value.split(':').map(Number);
    const minutes = h*60+m;
    const daily = fields.rule.value === 'daily';
    let next = Math.floor(simPlan.minute/1440)*1440 + minutes;
    if (next <= simPlan.minute && !daily) return update('请选择模拟时钟之后的时间。');
    if (next <= simPlan.minute) next += 1440;
    Object.assign(simPlan,{daily,next,paused:false});
    update('模拟计划已保存 · '+(daily ? '每天' : '单次'));
  };
  fields.advance.onclick = () => {
    if (simPlan.paused || simPlan.next === null) return;
    simPlan.minute = simPlan.next;
    simPlan.records.push(simPlan.minute);
    simPlan.next = simPlan.daily ? simPlan.minute+1440 : null;
    update('模拟运行完成');
  };
  fields.pause.onclick = () => {simPlan.paused = !simPlan.paused; update();};
  update();
}
function setDemo(i) {
  if (!activeStep) return;
  demoIndex = i;
  document.querySelectorAll('[data-demo]').forEach(button => {
    button.classList.toggle('selected',Number(button.dataset.demo) === i);
    button.setAttribute('aria-pressed',String(Number(button.dataset.demo) === i));
  });
  $('#screen-focus').textContent = activeStep.explain[i][0] + '：' + activeStep.explain[i][1];
  $('#demo-status').textContent = `讲解 ${i+1} / ${activeStep.explain.length}`;
  $('#caption-step').textContent = String(i+1);
  const frame = activeStep.frames?.[i];
  if ($('#entry-title')) {
    const [title, instruction] = activeStep.explain[i];
    $('#entry-title').textContent = title;
    $('#entry-instruction').textContent = instruction;
    $('#entry-attempt').textContent = frame.attempt;
    $('#screen-focus').textContent = title;
    $('#entry-back').disabled = i === 0;
    $('#entry-forward').textContent = i+1 === activeStep.explain.length ? '我找到了，去练习' : '看到了，继续';
  }
  if (frame) {
    const img = $('#lesson-image');
    const viewport = img.parentElement;
    viewport.classList.toggle('crop-view', Boolean(frame.crop));
    viewport.style.aspectRatio = frame.crop ? `${frame.crop[2]} / ${frame.crop[3]}` : '';
    img.style.cssText = '';
    img.onload = () => {
      if (!frame.crop) return;
      const [x,y,w,h] = frame.crop;
      img.style.width = `${img.naturalWidth/w*100}%`;
      img.style.height = `${img.naturalHeight/h*100}%`;
      img.style.left = `${-x/w*100}%`;
      img.style.top = `${-y/h*100}%`;
    };
    img.src = `assets/${frame.image}`;
    img.alt = frame.alt;
    img.style.objectFit = frame.fit || 'contain';
    img.style.objectPosition = frame.position || 'center';
    img.style.transform = `scale(${frame.scale || 1})`;
    img.style.transformOrigin = frame.origin || 'center';
    if (img.complete && img.naturalWidth) img.onload();
    $('.screen-panel .source-label').textContent = frame.source || sourceType(activeStep);
    document.querySelectorAll('.screen-panel [data-image]').forEach(button => {
      button.dataset.image = frame.image;
      button.dataset.imageTitle = frame.alt;
      button.setAttribute('aria-label', `放大截图：${frame.alt}`);
    });
  }

}
function stopDemo() {
  clearTimeout(demoTimer); demoTimer = null;
  if ($('#play-demo')) $('#play-demo').innerHTML = `${icon('play')} 再看分步讲解`;
}
function playDemo() {
  if (demoTimer) { stopDemo(); return; }
  setDemo(0);
  $('#play-demo').innerHTML = `${icon('pause')} 暂停讲解`;
  const tick = () => {
    if (!activeStep) return stopDemo();
    if (demoIndex < activeStep.explain.length-1) { setDemo(demoIndex+1); demoTimer = setTimeout(tick,5000); }
    else { stopDemo(); $('#demo-status').textContent = '讲解结束，轮到你试试了'; }
  };
  demoTimer = setTimeout(tick,5000);
}
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('Clipboard API unavailable');
    toast('已复制。点到需要填字的位置，按 Ctrl + V 粘贴。');
    return true;
  } catch {
    const area = document.createElement('textarea'); area.value = text;
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.append(area); area.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch {}
    area.remove();
    toast(success ? '已复制，可以粘贴。' : '浏览器不允许自动复制，请选中文字后按 Ctrl + C。');
    return success;
  }
}
function toggleFavorite(id, button) {
  const exists = state.favorites.includes(id);
  state.favorites = exists ? state.favorites.filter(x => x !== id) : [...state.favorites,id];
  persist();
  button?.setAttribute('aria-pressed',String(!exists));
  button?.setAttribute('aria-label',exists ? '收藏提示词' : '取消收藏');
  toast(exists ? '已取消收藏。' : '已放进提示词口袋，下次可以直接找回来。');
  if (location.hash.startsWith('#prompts') && libraryFilter === 'favorites') renderLibraryCards();
}
function renderPrompts() {
  main.innerHTML = `<div class="page-heading"><div class="eyebrow">${icon('copy')} 把好用的话，放进口袋</div><h1>提示词口袋</h1><p>找到一个合适的例子，复制、改成自己的需求，再交给 WorkBuddy。</p></div><label class="search-field">${icon('search')}<input type="search" id="prompt-search" placeholder="搜索通知、文件、修改……" value="${esc(librarySearch)}" aria-label="搜索提示词"></label><div class="filter-row" aria-label="提示词分类"><button class="filter-chip ${libraryFilter === 'all' ? 'active' : ''}" data-filter="all" aria-pressed="${libraryFilter === 'all'}">全部提示词</button><button class="filter-chip ${libraryFilter === 'favorites' ? 'active' : ''}" data-filter="favorites" aria-pressed="${libraryFilter === 'favorites'}">我的收藏</button>${COURSE.slice(1).map(chapter => chapter.short).map((label,i) => `<button class="filter-chip ${libraryFilter === String(i+1) ? 'active' : ''}" data-filter="${i+1}" aria-pressed="${libraryFilter === String(i+1)}">${label}</button>`).join('')}</div><div class="prompt-library" id="prompt-library"></div>`;
  renderLibraryCards();
}
function renderLibraryCards() {
  const query = librarySearch.trim().toLowerCase();
  const unique = new Set();
  const items = coreSteps.filter(s => {
    if (libraryFilter === 'favorites') return state.favorites.includes(s.id) && `${s.title}${s.prompt}`.toLowerCase().includes(query);
    if (libraryFilter !== 'all' && s.ci !== Number(libraryFilter)) return false;
    if (!`${s.title}${s.prompt}`.toLowerCase().includes(query)) return false;
    if (unique.has(s.prompt)) return false;
    unique.add(s.prompt); return true;
  });
  $('#prompt-library').innerHTML = items.length ? items.map(s => `<article class="library-card"><p class="category">${esc(COURSE[s.ci].short)}</p><h2>${esc(s.title)}</h2><p class="prompt-text">${esc(s.prompt)}</p><footer><a href="#lesson/${s.id}">查看对应图文教程 ${icon('chevron')}</a><div class="prompt-actions"><button class="icon-button" data-favorite="${s.id}" aria-label="${state.favorites.includes(s.id) ? '取消收藏' : '收藏提示词'}" aria-pressed="${state.favorites.includes(s.id)}">${icon('heart')}</button><button class="button secondary" data-copy="${s.id}">${icon('copy')} 复制</button></div></footer></article>`).join('') : `<div class="empty-state">${libraryFilter === 'favorites' ? '这里还没有符合条件的收藏。点一下提示词旁边的爱心，就能把它留下。' : '暂时没有找到，试试“通知”“修改”或“文件”。'}</div>`;
}
const FAQ = [
  ['提示词是什么？','就是你发给 AI 的任务说明。用日常语言写“帮我做什么、我提供什么、要什么格式、有什么要求”即可。'],
  ['复制之后，为什么 WorkBuddy 没有反应？','复制只是把文字放进剪贴板。你还需要切到 WorkBuddy，点输入框，按 Ctrl + V 粘贴，再检查并点击发送箭头。'],
  ['网页说已完成，是否表示 WorkBuddy 真的做完了？','本网页只记录你自己的学习勾选，不连接或监控 WorkBuddy。请根据实际操作结果勾选自检。'],
  ['我的界面和图片不一样怎么办？','本机实拍版本为 Windows WorkBuddy 5.11.3，官方配图可能来自其他版本。先找相同的按钮名称。复杂菜单可以去官方帮助中心查当前说明。'],
  ['回答和截图不一样，算失败吗？','不算。AI 的措辞可能不同。核对事实、格式和要求才是判断标准，不必追求逐字一致。'],
  ['它一直在思考，或者出现额度提示怎么办？','先观察处理状态，不要反复发送。网络错误先检查网络；额度或套餐限制以你账号当前的客户端提示为准。本课不承诺免费额度，也不会要求你为了完成练习立即付款。'],
  ['文件已经生成，但我找不到在哪里？','找回答里的文件入口或右侧产物区。点文件卡片的“⋯”，选择“打开文件夹”或“另存为”。仍找不到就要求它给出实际保存位置。'],
  ['它让我授权，我该点什么？','先看本次操作是什么、涉及哪些文件和范围。和你的任务无关的请求先不批准；可以让它解释用途。只想写文字时，在提示词里写“只在对话中回答”。'],
  ['关闭网页后，进度还在吗？','正常情况下保存在当前浏览器。重新用同一浏览器打开同一网址可以继续；无痕模式、清理浏览器数据、换网址或换电脑可能让进度丢失。'],
  ['我要怎样换行，而不误发送？','可以尝试 Shift + Enter 换行，发送时优先点击向上箭头。若客户端修改了快捷键，以当前输入框或设置说明为准。']
];
function renderHelp() {
  main.innerHTML = `<div class="page-heading"><div class="eyebrow">${icon('bulb')} 遇到问题，不用从头猜</div><h1>新手工具箱</h1><p>常用按键、练习材料、提示词填空，以及你可能遇到的小问题。</p></div>
    <div class="tool-grid"><section class="tool-card"><h2>先记住这几个按键</h2><dl class="shortcut-list"><dt><kbd>Ctrl</kbd> + <kbd>C</kbd></dt><dd>复制选中的文字</dd><dt><kbd>Ctrl</kbd> + <kbd>V</kbd></dt><dd>粘贴刚才复制的内容</dd><dt><kbd>Alt</kbd> + <kbd>Tab</kbd></dt><dd>在教程和 WorkBuddy 之间切换</dd><dt><kbd>Ctrl</kbd> + <kbd>J</kbd></dt><dd>查看浏览器下载记录</dd><dt><kbd>Esc</kbd></dt><dd>关闭本页的截图放大窗口</dd></dl></section><section class="tool-card"><h2>一份可以放心练习的材料</h2><p>虚构的培训准备会议记录，包含三个待办和两项待确认信息。配合第四章，练习上传、整理和核对。</p><a class="button secondary" href="assets/练习会议记录.txt" download>${icon('download')} 下载练习会议记录</a><p style="margin-top:14px">Mac 用户可参考<a href="https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Installation-Mac-Guide" target="_blank" rel="noopener" style="color:var(--blue)">官方 Mac 安装指南</a>；复制和粘贴通常使用 ⌘ + C / ⌘ + V。</p></section></div>
    <section class="tool-card" style="margin-top:20px"><h2>不会组织提示词？填四个空就好</h2><div class="builder-grid"><label>① 想让它做什么？<textarea data-builder="task" placeholder="例如：写一段培训通知" maxlength="2000"></textarea></label><label>② 已经知道哪些信息？<textarea data-builder="context" placeholder="例如：11月20日下午3点，二楼会议室" maxlength="4000"></textarea></label><label>③ 想得到什么形式？<textarea data-builder="format" placeholder="例如：一段可以直接复制的通知正文" maxlength="2000"></textarea></label><label>④ 有哪些要求？<textarea data-builder="limits" placeholder="例如：80字以内、语气友好、不实际发送" maxlength="2000"></textarea></label></div><p class="builder-output" id="builder-output">填写上面的内容，这里会帮你拼成一条完整提示词。</p><button class="button" id="copy-builder" disabled>${icon('copy')} 复制我的提示词</button><p class="small" style="margin-top:10px">本工具只在网页中拼接文字，不会把填写内容发给 AI，也不会保存这些输入。</p></section>
    <div class="section-top"><div><h2>常见的小问题</h2><p>先从你遇到的情况开始。</p></div></div><div class="faq-list">${FAQ.map(([q,a]) => `<details class="help-details"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div><div class="learning-tip">${icon('refresh')}<span>想从头再练一次？可以清除本网页进度，收藏仍会保留。</span><button class="button secondary" id="reset-progress">重新开始学习</button></div>`;
}
function renderSources() {
  main.innerHTML = `<div class="sources"><div class="page-heading"><h1>截图来源与使用说明</h1><p>独立制作的新手教学页面，非 WorkBuddy 官方网站。内容核对日期：2026 年 11 月 18 日。</p></div><h2>本机真实操作截图</h2><p>首页、输入、处理状态、通知回答、追问、改写及文件操作相关画面，采集自 Windows WorkBuddy 5.11.3。教学内容使用虚构培训安排。截图只保留教学区域；不包含账号头像、真实邮箱、私人历史任务等信息。图片中的模型名称仅代表拍摄时的选择，无需跟着切换。</p><h2>安装课配图</h2><p>下载入口和 Windows 菜单取自 11 月 18 日的 WorkBuddy 官网。安装向导与登录选项取自下方的官方 Windows 安装指南，最后一张图是登录后的本机界面。</p><h2>进阶课配图</h2><p>专家召唤、标题回答、技能市场及套件来自 11 月 18 日本机实拍。邮箱授权和定时任务表单采用官方指南局部配图。虚构邮箱与模拟时钟来自本网页练习，均按来源标注。</p><h2>官方指南参考</h2><ul class="source-list"><li><a target="_blank" rel="noopener" href="https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Expert-Center">专家中心</a></li><li><a target="_blank" rel="noopener" href="https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market">技能和套件</a></li><li><a target="_blank" rel="noopener" href="https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector">连接器和 QQ 邮箱授权</a></li><li><a target="_blank" rel="noopener" href="https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Automation-Guide">定时任务与运行记录</a></li><li><a href="https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Installation-Win-Guide" target="_blank" rel="noopener">Windows 安装指南</a>：需要安装软件时可查阅。</li><li><a href="https://www.workbuddy.cn/docs/workbuddy/Create-Task" target="_blank" rel="noopener">创建任务</a>：新建任务、附加材料与要求组织方式。</li><li><a href="https://www.workbuddy.cn/docs/workbuddy/Conversation" target="_blank" rel="noopener">任务对话</a>：继续追问与任务操作说明。</li><li><a href="https://www.workbuddy.cn/docs/workbuddy/Results" target="_blank" rel="noopener">结果查看</a>：用于核对产物、文件菜单与另存为的操作说明；课程中的文件画面使用本机实拍。</li></ul><p>商标和界面归原权利方所有。你的练习应以自己生成的文件为准。</p><h2>学习进度与隐私</h2><p>本页不要求登录，不读取 WorkBuddy，不上传你的练习内容。进度、收藏和显示偏好仅保存在当前浏览器。学员点击自检表示自己确认；网页不能自动验证外部软件中的操作结果。公共链接会在你主动点击时打开官方网站。</p><h2>版本与实际使用</h2><p>教程主要面向 Windows 用户；按钮名称、权限提示、登录方式和模型可用性会随版本及账号变化。费用与额度以客户端当前显示为准。阅读教程可离线进行；实际使用 WorkBuddy 通常需要联网并登录。</p><h2>教学节奏</h2><p>章节分钟数是阅读和练习的估计，不是倒计时。可以任意返回复习，也可以先查看后面的章节。只有勾选自检并点击下一步，才会计为完成；跳转浏览不会自动完成未学的步骤。</p></div>`;
}
function celebrate() {
  if (!state.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#2455e6','#36b3a0','#edb64b','#97b8fa'];
  $('#confetti').innerHTML = Array.from({length:35},(_,i) => `<i class="confetto" style="--x:${(i*37)%100}%;--c:${colors[i%4]};--d:${(i%7)*.06}s;--drift:${(i%2 ? 1 : -1)*(25+i*3)}px"></i>`).join('');
  setTimeout(() => { $('#confetti').innerHTML = ''; },2400);
}
function renderCompletion() {
  const missing = coreSteps.filter(s => !state.done.includes(s.id));
  const all = missing.length === 0;
  main.innerHTML = `<section class="completion"><div class="completion-mark">${icon(all ? 'trophy' : 'flag')}</div><h1>${all ? '你已经迈出了 AI 办公的第一步。' : '本步练习完成，继续按你的节奏学。'}</h1><p>${all ? '你已完成基础操作，也练习了专家、套件、技能、连接器和定时任务。' : '你已走到课程最后。前面还有一些步骤未确认完成，可以回来慢慢补上。'}</p><div class="completion-stats"><div><strong>${state.done.length}</strong><span>已完成的小步骤</span></div><div><strong>${COURSE.filter((c,i) => chapterDone(i) === c.lessons.length).length}</strong><span>已完成的章节</span></div><div><strong>${state.favorites.length}</strong><span>收藏的提示词</span></div></div>${all ? '<p>这不是技能认证，而是你自己完成练习的记录。下次遇到一个小任务，试着从“说清要求”开始。</p>' : `<div class="review-list">${missing.slice(0,4).map(s => `<a href="#lesson/${s.id}">${icon('book')}${esc(s.title)}${icon('chevron')}</a>`).join('')}${missing.length > 4 ? `<p>还有 ${missing.length-4} 个步骤可从课程地图返回。</p>` : ''}</div>`}<div class="button-row"><a class="button" href="${all ? '#prompts' : '#lesson/'+missing[0].id}">${all ? '带走我的提示词' : '继续未完成的步骤'}${icon('arrow')}</a><a class="button secondary" href="#home">返回学习地图</a><button class="button secondary" id="export-progress">${icon('download')} 保存学习记录</button></div></section>`;
}
function render() {
  stopDemo(); activeStep = null;
  const route = location.hash.slice(1) || 'home';
  const step = route.startsWith('lesson/') ? getStep(route.slice(7)) : null;
  const page = step ? 'lesson' : ['home','prompts','help','sources','complete'].includes(route) ? route : 'home';
  renderSidebar(page,step?.ci);
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active',a.dataset.nav === (page === 'lesson' || page === 'complete' || page === 'sources' ? 'home' : page)));
  $('#sidebar').classList.remove('open');$('#menu-button').setAttribute('aria-expanded','false');
  $('#sidebar').inert = innerWidth <= 760;
  if (step) renderLesson(step);
  else ({home:renderHome,prompts:renderPrompts,help:renderHelp,sources:renderSources,complete:renderCompletion}[page])();
  document.title = `${step ? step.title : {home:'从第一句话开始',prompts:'提示词口袋',help:'新手工具箱',sources:'截图来源',complete:'我的学习记录'}[page]} · WorkBuddy 新手学堂`;
  main.classList.remove('route-enter');void main.offsetWidth;main.classList.add('route-enter');
  window.scrollTo({top:0,behavior:'instant'});
  main.focus({preventScroll:true});
  if (route === 'roadmap') $('#roadmap').scrollIntoView({behavior:state.motion ? 'smooth' : 'instant'});
}
function updateBuilder() {
  const values = {};
  document.querySelectorAll('[data-builder]').forEach(input => values[input.dataset.builder] = input.value.trim());
  const ready = Object.values(values).every(Boolean);
  $('#builder-output').textContent = ready ? `请帮我${values.task}。\n已知信息：${values.context}。\n请输出：${values.format}。\n要求：${values.limits}。\n未知内容先问我，不要编造。` : '填写上面的四项内容，这里会帮你拼成一条完整提示词。';
  $('#copy-builder').disabled = !ready;
}
document.addEventListener('click', async event => {
  const target = event.target.closest('button,a');
  if ($('#sidebar').classList.contains('open') && !event.target.closest('#sidebar') && target?.id !== 'menu-button') {
    $('#sidebar').classList.remove('open');$('#sidebar').inert = innerWidth <= 760;$('#menu-button').setAttribute('aria-expanded','false');
  }
  if (!target) return;
  if (target.hasAttribute('data-step')) go(target.dataset.step);
  if (target.hasAttribute('data-demo')) { stopDemo();setDemo(Number(target.dataset.demo)); }
  if (target.hasAttribute('data-copy')) {
    const step = getStep(target.dataset.copy);
    if (step) { const success = await copyText(step.prompt); if(success){target.innerHTML = `${icon('check')} 已复制`;setTimeout(() => { if(target.isConnected)target.innerHTML = `${icon('copy')} ${COURSE[step.ci].optional ? '复制求助文字' : '复制提示词'}`; },1800);} }
  }
  if (target.hasAttribute('data-favorite')) toggleFavorite(target.dataset.favorite,target);
  if (target.hasAttribute('data-filter')) {
    libraryFilter = target.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => {b.classList.toggle('active',b.dataset.filter === libraryFilter);b.setAttribute('aria-pressed',String(b.dataset.filter === libraryFilter));});
    renderLibraryCards();
  }
  if (target.hasAttribute('data-image')) {
    zoom = 1;$('#zoom-image').src = `assets/${target.dataset.image}`;$('#zoom-image').alt = target.dataset.imageTitle;
    $('#zoom-image').style.width = '100%';$('#image-title').textContent = target.dataset.imageTitle;
    $('#image-caption').textContent = '这里显示当前讲解对应的完整截图。点击 ＋ 放大，可滚动查看。按 Esc 或点 × 关闭。';$('#image-dialog').showModal();
  }
  if (target.hasAttribute('data-close')) target.closest('dialog').close();
  switch(target.id) {
    case 'entry-back':
    case 'entry-forward': {
      stopDemo();
      const nextFrame = demoIndex + (target.id === 'entry-back' ? -1 : 1);
      if (nextFrame === activeStep.frames.length) {
        $('#step-exercise').scrollIntoView({block:'start'});
        $('#step-exercise').focus({preventScroll:true});
      } else if (nextFrame >= 0) {
        setDemo(nextFrame);
        if (matchMedia('(max-width:760px)').matches) $('.screen-panel').scrollIntoView({block:'start'});
      }
      break;
    }
    case 'play-demo': playDemo(); break;
    case 'next-step': {
      if (!activeStep || !$('#self-check').checked) break;
      const current = activeStep;
      if (!state.done.includes(current.id)) state.done.push(current.id);
      const next = STEPS[STEPS.indexOf(current)+1];
      if (next) state.last = next.id;
      persist();
      if (current.si === COURSE[current.ci].lessons.length-1) { celebrate();toast(`${chapterLabel(current.ci)}的最后一步已确认，继续保持自己的节奏。`); }
      if (next) go(next.id);else {location.hash = 'complete';celebrate();}break;
    }
    case 'previous-step': if(activeStep) { const previous = STEPS[STEPS.indexOf(activeStep)-1];if(previous)go(previous.id); }break;
    case 'menu-button': { const open = $('#sidebar').classList.toggle('open');target.setAttribute('aria-expanded',String(open));$('#sidebar').inert = !open;if(open)$('a',$('#sidebar')).focus();break; }
    case 'motion-button': state.motion = !state.motion;persist();applyPreferences();if(!state.motion){stopDemo();$('#confetti').innerHTML='';}toast(state.motion ? '已开启交互动画。' : '已关闭交互动画。');break;
    case 'font-button': state.large = !state.large;persist();applyPreferences();break;
    case 'zoom-in': zoom = Math.min(3,zoom+.25);$('#zoom-image').style.width = `${zoom*100}%`;break;
    case 'zoom-out': zoom = Math.max(.5,zoom-.25);$('#zoom-image').style.width = `${zoom*100}%`;break;
    case 'copy-builder': await copyText($('#builder-output').textContent);break;
    case 'reset-progress': $('#reset-dialog').showModal();break;
    case 'confirm-reset': state.done = [];state.checked = [];state.last = '0-0';persist();$('#reset-dialog').close();location.hash='home';toast('学习进度已重置，收藏的提示词已保留。');break;
    case 'export-progress': {
      const text = `WorkBuddy 新手学堂 · 学习记录\n导出时间：${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}\n正课已完成 ${coreDone()}/${coreSteps.length} 步，选学安装已完成 ${chapterDone(0)}/${COURSE[0].lessons.length} 步\n本记录由学员自检确认，不是技能认证。\n\n`+COURSE.map((c,ci) => `${c.title}\n`+c.lessons.map((s,si) => `${state.done.includes(`${COURSE[ci].id}-${si}`) ? '✓' : '○'} ${s.title}`).join('\n')).join('\n\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF',text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='WorkBuddy-我的学习记录.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;
    }
  }
});
document.addEventListener('input',event => {
  if (event.target.id === 'prompt-search') { librarySearch = event.target.value;renderLibraryCards(); }
  if (event.target.hasAttribute('data-builder')) updateBuilder();
});
document.addEventListener('change',event => {
  if (event.target.id === 'self-check' && activeStep) {
    const id = activeStep.id;
    if (event.target.checked) { if(!state.checked.includes(id))state.checked.push(id); }
    else { state.checked = state.checked.filter(x=>x!==id);state.done = state.done.filter(x=>x!==id); }
    persist();$('#next-step').disabled = !event.target.checked;$('#practice').classList.toggle('checked',event.target.checked);
    $('#next-hint').textContent = event.target.checked ? '已勾选，可以继续' : '先勾选上方方框';
    renderSidebar('lesson',activeStep.ci);
  }
});
document.addEventListener('keydown',event => {
  if(!$('#sidebar').classList.contains('open')) return;
  if(event.key === 'Escape'){$('#sidebar').classList.remove('open');$('#sidebar').inert = innerWidth <= 760;$('#menu-button').setAttribute('aria-expanded','false');$('#menu-button').focus();}
  if(event.key === 'Tab' && innerWidth <= 760){
    const links = [...$('#sidebar').querySelectorAll('a')];
    if(event.shiftKey && document.activeElement === links[0]){event.preventDefault();links.at(-1).focus();}
    else if(!event.shiftKey && document.activeElement === links.at(-1)){event.preventDefault();links[0].focus();}
  }
});
window.addEventListener('hashchange',render);
window.addEventListener('resize',()=>{$('#sidebar').inert = innerWidth <= 760 && !$('#sidebar').classList.contains('open');});
$('#menu-button').innerHTML = icon('menu');
applyPreferences();render();
