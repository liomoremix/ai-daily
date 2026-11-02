/* 《Attention 到底在算什么》页面逻辑
   数值全部真算：点积 → /√d → softmax → 加权求和。
   特征向量是为教学手工设定的语义轴，页面上已注明。 */
(function () {
  'use strict';
  var D = 5, SQ = Math.sqrt(D);
  var DIM = ['生命体', '具体物', '动作', '状态', '功能词'];
  var TOK = [
    { w: '那只', f: [-0.2, 0.3, 0.0, 0.0, 0.9] },
    { w: '猫', f: [2.6, 1.3, -0.2, 0.1, -0.4] },
    { w: '没有', f: [0.0, 0.0, 0.2, 0.1, 1.4] },
    { w: '穿过', f: [0.1, 0.2, 1.7, 0.0, 0.2] },
    { w: '马路', f: [0.2, 1.5, 0.1, 0.0, 0.1] },
    { w: '因为', f: [0.0, 0.0, 0.2, 0.2, 1.7] },
    { w: '它', f: [1.4, 0.15, 0.0, 0.25, -0.2] },
    { w: '太', f: [0.0, 0.0, 0.0, 0.8, 1.1] },
    { w: '累', f: [0.6, -0.1, 0.1, 1.7, 0.1] },
    { w: '了', f: [0.0, 0.0, 0.3, 0.2, 1.6] }
  ];
  var SEL = 6, cur = [0, 0, 0, 0, 0, 0], built = {};

  function $(s) { return document.querySelector(s); }
  function clamp(v, a, b) { return v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function fmt(v, d) { return (v >= 0 ? '' : '-') + Math.abs(v).toFixed(d === undefined ? 2 : d); }
  function absMax(v) { return Math.max.apply(null, v.map(Math.abs)); }

  function raws(qi) {
    return TOK.map(function (t) {
      var s = 0;
      for (var i = 0; i < D; i++) s += TOK[qi].f[i] * t.f[i];
      return s / SQ;
    });
  }
  function softmax(v) {
    var m = Math.max.apply(null, v);
    var e = v.map(function (x) { return Math.exp(x - m); });
    var s = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (x) { return x / s; });
  }
  function blend(a) {
    var o = [0, 0, 0, 0, 0];
    TOK.forEach(function (t, i) { for (var d = 0; d < D; d++) o[d] += a[i] * t.f[d]; });
    return o;
  }

  var _a = null, _aSel = -1;
  function attn() {
    if (_aSel !== SEL) { _a = softmax(raws(SEL)); _aSel = SEL; }
    return _a;
  }

  /* ---------- 词表 ---------- */
  function lane(el, stagger) {
    el.innerHTML = '';
    TOK.forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'tok anim a-rise' + (i === SEL ? ' sel' : '');
      if (stagger) b.setAttribute('data-delay', '110');
      b.textContent = t.w;
      b.setAttribute('data-i', i);
      el.appendChild(b);
    });
  }
  function markLanes() {
    var a = attn();
    document.querySelectorAll('.tok').forEach(function (b) {
      var i = +b.getAttribute('data-i');
      b.classList.toggle('sel', i === SEL);
      b.classList.toggle('warm', i !== SEL && a[i] > 0.08);
      b.setAttribute('title', TOK[i].w + ' 的权重 ' + (a[i] * 100).toFixed(0) + '%');
    });
  }

  /* ---------- step 2：Q / K / V ---------- */
  var QKV = [
    { k: 'Q', t: '我要找什么', d: '提问方：它想知道"我指的是谁"' },
    { k: 'K', t: '我是什么', d: '应答方的标签，等着被比对' },
    { k: 'V', t: '我能给什么', d: '真正会被搬运走的内容' }
  ];
  function buildQkv() {
    $('#qkv').innerHTML = QKV.map(function (c) {
      return '<div class="card-qkv"><b class="mono">' + c.k + '</b>' +
        '<div class="qh">' + c.t + '</div><div class="bars5"></div>' +
        '<div class="qd">' + c.d + '</div></div>';
    }).join('');
    $('#qkv').querySelectorAll('.card-qkv').forEach(function (n) {
      n.classList.add('anim', 'a-pop'); n.setAttribute('data-delay', '260');
    });
  }
  function paintQkv(p) {
    var a = attn(), hi = a.indexOf(Math.max.apply(null, a));
    var grow = clamp(p, 0.15, 0.7);
    $('#qkv').querySelectorAll('.card-qkv').forEach(function (n, idx) {
      var vec = idx === 2 ? TOK[hi].f : TOK[SEL].f, mx = absMax(vec) || 1;
      n.querySelector('.bars5').innerHTML = vec.map(function (v, d) {
        return '<span title="' + DIM[d] + ' ' + fmt(v) + '"><i style="width:' +
          (Math.abs(v) / mx * 100 * grow).toFixed(1) + '%;background:' + (v < 0 ? 'var(--hot)' : 'var(--accent)') + '"></i></span>';
      }).join('');
      n.querySelector('.qd').textContent = idx === 2
        ? '本页取权重最高的「' + TOK[hi].w + '」的 V（' + (a[hi] * 100).toFixed(0) + '%）'
        : QKV[idx].d;
    });
  }

  /* ---------- step 3：打分与归一化 ---------- */
  function buildBars() {
    $('#bars').innerHTML = TOK.map(function (t, i) {
      return '<div class="wrow anim a-fadelink" data-delay="80" data-i="' + i + '">' +
        '<span class="lbl">' + t.w + '</span><span class="wtrack"><span class="wfill"></span></span>' +
        '<span class="wval mono"></span></div>';
    }).join('');
  }
  function paintBars(p) {
    var raw = raws(SEL), a = attn();
    var rMin = Math.min.apply(null, raw), rMax = Math.max.apply(null, raw);
    var aMax = Math.max.apply(null, a), best = a.indexOf(aMax);
    var grow = clamp(p, 0.10, 0.42), toSoft = clamp(p, 0.50, 0.86);
    $('#bars').querySelectorAll('.wrow').forEach(function (row) {
      var i = +row.getAttribute('data-i');
      var relRaw = (raw[i] - rMin) / ((rMax - rMin) || 1);
      var v = lerp(relRaw, a[i] / aMax, toSoft) * grow;
      row.querySelector('.wfill').style.width = (v * 100).toFixed(1) + '%';
      row.querySelector('.wval').textContent = toSoft > 0.5 ? (a[i] * 100).toFixed(0) + '%' : fmt(raw[i]);
      row.classList.toggle('top', i === best);
      row.classList.toggle('self', i === SEL);
    });
    var r = raw[best];
    $('#formula').innerHTML =
      '<span class="f1">q·k = ' + fmt(TOK[SEL].f.reduce(function (s, v, d) { return s + v * TOK[best].f[d]; }, 0)) + '</span>' +
      '<span class="f2">÷ √5 = ' + fmt(r) + '</span>' +
      '<span class="f3">e^' + fmt(r) + ' = ' + fmt(Math.exp(r), 2) + '</span>' +
      '<span class="f4">softmax = ' + (a[best] * 100).toFixed(0) + '%</span>';
    ['#formula .f2', '#formula .f3', '#formula .f4'].forEach(function (s, i) {
      $(s).classList.toggle('lit', p > [0.30, 0.52, 0.80][i]);
    });
    $('#barCaption').textContent = toSoft < 0.5
      ? '现在显示的是原始匹配分（点积 ÷ √d）：有负有正，还没归一化，条长按最小值到最大值铺开。'
      : 'softmax 之后：「' + TOK[best].w + '」拿到 ' + (aMax * 100).toFixed(0) +
        '%，其余 9 个词合计 ' + ((1 - aMax) * 100).toFixed(0) + '%——注意没有一个是 0。注意力是软检索，不是硬选择。';
  }

  /* ---------- step 4：加权混合 ---------- */
  var X0 = 78, BW = 250, RA = 30, RB = 122, BH = 9, GAP = 15;
  function paintMix(p) {
    var a = attn(), own = TOK[SEL].f, out = blend(a);
    var mx = absMax(own.concat(out)) || 1;
    var t = clamp(p, 0.28, 0.9);
    var s = ['<text x="' + X0 + '" y="16" font-size="11.5" fill="#55636F">「' + TOK[SEL].w +
      '」自己的 V —— 还没上下文化</text>',
      '<text x="' + X0 + '" y="112" font-size="11.5" fill="#16202B">按权重混合后的新表示</text>'];
    for (var d = 0; d < D; d++) {
      var yA = RA + d * GAP, yB = RB + d * GAP;
      var vOut = lerp(own[d], out[d], t);
      s.push('<text x="' + (X0 - 10) + '" y="' + (yA + BH - 1) + '" text-anchor="end" font-size="10.5" fill="#8A97A3">' + DIM[d] + '</text>');
      s.push('<rect x="' + X0 + '" y="' + yA + '" width="' + (Math.abs(own[d]) / mx * BW).toFixed(1) +
        '" height="' + BH + '" rx="1.5" fill="' + (own[d] < 0 ? '#C2410C' : '#BBD3EE') + '"/>');
      s.push('<rect x="' + X0 + '" y="' + yB + '" width="' + (Math.abs(vOut) / mx * BW).toFixed(1) +
        '" height="' + BH + '" rx="1.5" fill="' + (vOut < 0 ? '#C2410C' : '#1B4B8F') + '"/>');
      var delta = out[d] - own[d];
      if (Math.abs(delta) > 0.04) {
        s.push('<text x="' + (X0 + Math.abs(own[d]) / mx * BW + 6).toFixed(1) + '" y="' + (yB + BH - 1) +
          '" font-size="10" fill="' + (delta > 0 ? '#15695A' : '#C2410C') + '" opacity="' + t.toFixed(2) + '">' +
          (delta > 0 ? '+' : '') + fmt(delta) + '</text>');
      }
    }
    var top = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return y[0] - x[0]; }).slice(0, 4);
    s.push('<text x="' + X0 + '" y="' + (RB + D * GAP + 16) + '" font-size="10.5" fill="#8A97A3">混合配比 ' +
      top.map(function (q) { return TOK[q[1]].w + ' ' + (q[0] * 100).toFixed(0) + '%'; }).join(' · ') + '</text>');
    $('#mix').innerHTML = s.join('');
    var moved = out.map(function (v, d) { return [Math.abs(v - own[d]), d]; })
      .sort(function (x, y) { return y[0] - x[0]; })[0][1];
    $('#mixNote').innerHTML = '变化最大的是<b>' + DIM[moved] + '</b>：' + fmt(own[moved]) + ' → ' + fmt(out[moved]) +
      '。同一个"' + TOK[SEL].w + '"，在这句里被改写成了带「猫」味道的向量——这就是"上下文化"。';
  }

  /* ---------- step 5：n² 的代价 ---------- */
  function paintQuad(p) {
    var n = 4 + Math.round(clamp(p, 0.04, 0.88) * 14);
    var cx = 210, cy = 126, R = 100, pts = [], i, j;
    for (i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
      pts.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang)]);
    }
    var s = [];
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      s.push('<line x1="' + pts[i][0].toFixed(1) + '" y1="' + pts[i][1].toFixed(1) + '" x2="' +
        pts[j][0].toFixed(1) + '" y2="' + pts[j][1].toFixed(1) + '" stroke="#1B4B8F" stroke-width="1" stroke-opacity="' +
        (n > 12 ? 0.12 : 0.3) + '"/>');
    }
    for (i = 0; i < n; i++) {
      s.push('<circle cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) +
        '" r="5" fill="#fff" stroke="#1B4B8F" stroke-width="1.5"/>');
      if (n <= 10) s.push('<text x="' + (cx + (pts[i][0] - cx) * 1.2).toFixed(1) + '" y="' +
        (cy + (pts[i][1] - cy) * 1.2 + 3).toFixed(1) + '" font-size="10" fill="#8A97A3" text-anchor="middle">' + (i + 1) + '</text>');
    }
    $('#quad').innerHTML = s.join('');
    $('#qN').textContent = n;
    $('#qPair').textContent = (n * n).toLocaleString('en-US');
    $('#qMul').textContent = (n * n / 16).toFixed(1);
    $('#quadNote').classList.toggle('lit', p > 0.86);
  }

  /* ---------- step 6：误解 ---------- */
  var MYTH = [
    ['注意力是模型"看见了"重要的词', '它只是一次矩阵乘法。权重高说明这组 Q 与 K 在同一批特征方向上对齐，不存在"看"这个动作。'],
    ['上下文越长，模型知道得就越多', 'n² 的代价意味着长上下文必然要打折；实测里权重常堆在开头几个 token（attention sink），中段反而被摊薄。'],
    ['多头注意力是多套不同的注意力', '同一个式子把 d 拆成 d/h 维子空间各算一遍。头是把相似度投到不同特征方向，不是多个独立模型。'],
    ['KV Cache 缓存的是算好的结果', '缓存的是历史 token 的 K 和 V。省下重复计算，换来显存随序列长度线性增长。']
  ];
  function buildMyths() {
    $('#myths').innerHTML = MYTH.map(function (m) {
      return '<div class="anim a-rise" data-delay="210"><h4>误解</h4><ul><li>' + m[0] + '</li></ul></div>' +
        '<div class="anim a-rise" data-delay="210"><h4>实际</h4><ul><li>' + m[1] + '</li></ul></div>';
    }).join('');
  }

  /* ---------- 装配 ---------- */
  var INIT = [
    function () { lane($('#lane1'), true); },
    function () { buildQkv(); lane($('#lane2'), false); },
    buildBars,
    function () { },
    function () { },
    buildMyths
  ];
  var F = [markLanes, paintQkv, paintBars, paintMix, paintQuad, function () { }];

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.tok') : null;
    if (!b) return;
    var i = +b.getAttribute('data-i');
    if (i === SEL) return;
    SEL = i; _aSel = -1;
    markLanes();
    var k = Motion.index;
    if (F[k]) F[k](cur[k]);
    if (k !== 2) Motion.goto(2);
  });

  window.Motion.boot({
    onInit: function (el, i) { if (!built[i] && INIT[i]) INIT[i](el); built[i] = 1; },
    onFrame: function (i, p, el) { cur[i] = p; if (F[i]) F[i](p); }
  });
})();
