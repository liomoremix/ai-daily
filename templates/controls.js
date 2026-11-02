/* ============================================================
   ai-daily controls.js  ——  可_scrub_ 的分步动画播放器
   所有时间都表达为归一化进度 p∈[0,1]，因此：
     ?poster=N&at=0.55  可以把第 N 步定格在 55% 那一帧用来截封面
     prefers-reduced-motion / ?static=1  直接落到 p=1 的完整可读终态
   页面脚本只需实现 onFrame(i, p, el)，不自己管时钟。
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };
  var params = new URLSearchParams(location.search);
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('static');
  var posterIdx = parseInt(params.get('poster') || '', 10) || 0;
  var posterAt = parseFloat(params.get('at'));
  if (!(posterAt >= 0 && posterAt <= 1)) posterAt = 1;

  var steps = $$('[data-step]');

  var st = { i: -1, playing: !reduced, t: 0, total: 2400, events: [], raf: 0, last: 0 };
  var hooks = { onInit: null, onFrame: null };

  /* ---------- 排期：把 [data-anim] 的累积延迟换成进度阈值 ---------- */
  function schedule(el) {
    var acc = 0, events = $$('.anim', el);
    events.forEach(function (n) {
      acc += parseFloat(n.getAttribute('data-delay') || '240');
      n.__at = acc;
      n.classList.remove('on');
    });
    var total = Math.max(acc + 320, parseFloat(el.getAttribute('data-dur') || '2400'));
    st.events = events;
    st.total = total;
  }

  function applyTo(p) {
    for (var k = 0; k < st.events.length; k++) {
      var n = st.events[k], on = (n.__at / st.total) <= p;
      if (on !== n.classList.contains('on')) n.classList.toggle('on', on);
    }
    if (hooks.onFrame && st.i >= 0) hooks.onFrame(st.i, p, steps[st.i]);
    if (dockBar) dockBar.style.width = (p * 100).toFixed(1) + '%';
  }

  function settle(el) {
    $$('.anim', el).forEach(function (n) { n.classList.add('on'); });
    if (hooks.onFrame) hooks.onFrame(steps.indexOf(el), 1, el);
  }

  /* ---------- 帧循环 ---------- */
  function loop(now) {
    st.raf = requestAnimationFrame(loop);
    var dt = Math.min(now - st.last, 50);
    st.last = now;
    if (!st.playing || st.i < 0) return;
    st.t = Math.min(st.t + dt, st.total);
    applyTo(st.t / st.total);
    if (st.t >= st.total) root.classList.remove('is-playing');
    else root.classList.add('is-playing');
  }

  /* ---------- 激活某一步 ---------- */
  function activate(i, replay) {
    if (i < 0 || i >= steps.length) return;
    if (st.i === i && !replay) return;
    if (st.i >= 0 && st.i !== i) settle(steps[st.i]);   // 离开的步骤保持内容可读
    st.i = i;
    if (hooks.onInit) hooks.onInit(steps[i], i);   // 先生成 DOM，再收集 .anim
    schedule(steps[i]);
    st.t = reduced ? st.total : 0;
    applyTo(st.t / st.total);
    paintProgress();
  }

  function paintProgress() {
    if (prog) prog.textContent = (st.i + 1) + ' / ' + steps.length;
    if (btnPrev) btnPrev.disabled = st.i <= 0;
    if (btnNext) btnNext.disabled = st.i >= steps.length - 1;
  }

  /* ---------- 控制条 ---------- */
  var dock, dockBar, prog, btnPlay, btnPrev, btnNext, btnAgain;

  function buildDock() {
    dock = document.getElementById('dock');
    if (!dock) return;
    dock.className = 'dock';
    dock.innerHTML =
      '<i class="bar"></i>' +
      '<button data-act="prev" aria-label="上一步">‹ 上一步</button>' +
      '<button data-act="play" class="pri">暂停</button>' +
      '<button data-act="next" aria-label="下一步">下一步 ›</button>' +
      '<button data-act="replay">重播</button>' +
      '<span class="prog"></span>';
    dockBar = dock.querySelector('.bar');
    prog = dock.querySelector('.prog');
    btnPlay = dock.querySelector('[data-act=play]');
    btnPrev = dock.querySelector('[data-act=prev]');
    btnNext = dock.querySelector('[data-act=next]');
    btnAgain = dock.querySelector('[data-act=replay]');

    dock.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'play') setPlaying(!st.playing);
      if (a === 'prev') jump(st.i - 1);
      if (a === 'next') jump(st.i + 1);
      if (a === 'replay') { st.t = 0; applyTo(0); setPlaying(true); activate(st.i, true); }
    });
    paintProgress();
  }

  function setPlaying(v) {
    st.playing = v;
    root.classList.toggle('is-playing', v);
    if (btnPlay) btnPlay.textContent = v ? '暂停' : '播放';
  }

  function jump(i) {
    if (i < 0 || i >= steps.length) return;
    steps[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- 进入视口中央即播放 ---------- */
  function observe() {
    if (!('IntersectionObserver' in window)) { activate(0); return; }
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (en.isIntersecting) activate(steps.indexOf(en.target));
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    steps.forEach(function (s) { io.observe(s); });
  }

  /* ---------- poster 模式（截图用）：?poster=N&at=0..1 ---------- */
  function posterMode(n) {
    var pick = steps[n - 1] || steps[0];
    document.body.classList.add('poster');
    steps.forEach(function (s) { s.classList.toggle('poster-pick', s === pick); });
    if (!pick) return;
    st.i = steps.indexOf(pick);
    if (hooks.onInit) hooks.onInit(pick, st.i);   // 先生成 DOM，再收集 .anim
    schedule(pick);
    $$('.anim', pick).forEach(function (n2) { n2.classList.toggle('on', (n2.__at / st.total) <= posterAt); });
    if (hooks.onFrame) hooks.onFrame(st.i, posterAt, pick);
  }

  /* ---------- boot ---------- */
  window.Motion = {
    get reduced() { return reduced; },
    get poster() { return document.body.classList.contains('poster'); },
    get index() { return st.i; },
    get playing() { return st.playing; },
    steps: steps,
    boot: function (h) {
      hooks = h || {};
      var p = parseInt(params.get('poster') || '', 10);
      if (p) { posterMode(p); return; }
      if (steps.length > 1 && !reduced) buildDock();
      else if (steps.length) { dockBar = null; }
      root.classList.toggle('is-playing', st.playing);
      observe();
      if (st.i < 0) activate(0);
      st.last = performance.now();
      st.raf = requestAnimationFrame(loop);
    },
    play: function () { setPlaying(true); },
    pause: function () { setPlaying(false); },
    goto: jump,
    replay: function () { st.t = 0; applyTo(0); activate(st.i, true); }
  };

  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!st.playing); }
    if (e.key === 'ArrowRight') jump(st.i + 1);
    if (e.key === 'ArrowLeft') jump(st.i - 1);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && st.playing) { st.playing = false; root.classList.remove('is-playing'); }
    else if (!document.hidden && !reduced && !posterIdx) { setPlaying(true); }
  });
})();
