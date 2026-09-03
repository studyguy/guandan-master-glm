/* =========================================================
 * 掼蛋 AI 训练营 · sfx.js
 * 轻量合成音效：WebAudio 实时生成，无任何音频素材文件
 *   play  出牌"嗒"   pass 过牌低音
 *   bomb  炸弹低频爆响 + 噪声        click/hint 按钮/提示
 *   win   胜利上行琶音               lose 失败下行音
 *   BGM   music/bgm.mp3 循环背景音乐（跟随 enabled 开关）
 * 可通过 DD.SFX.enabled（设置持久化）一键开关；
 * 混音层级：BGM 为背景垫(0.14) < 音效总线(0.35)内按功能分级——
 * 微调听感请调 bgm.volume 与 _master.gain.value 两个旋钮；
 * 惰性创建 AudioContext，首次用户手势后解锁自动播放限制。
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};

  var SFX = DD.SFX = {
    enabled: true,
    _ctx: null,
    _master: null
  };

  function getCtx() {
    if (SFX._ctx) return SFX._ctx;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      SFX._ctx = new AC();
      SFX._master = SFX._ctx.createGain();
      SFX._master.gain.value = 0.35; // 音效总线：整体响度高于 BGM 背景垫，功能音可清晰穿透
      SFX._master.connect(SFX._ctx.destination);
    } catch (e) {
      SFX._ctx = null;
    }
    return SFX._ctx;
  }

  // 首次用户手势解锁（浏览器自动播放策略）
  if (typeof document !== 'undefined') {
    var unlock = function () {
      var c = getCtx();
      if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* 忽略 */ } }
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    // ===== 背景音乐 BGM：循环常开；启动即尝试自动播放，
    // 被浏览器自动播放策略拦截时，首次用户手势自动续播 =====
    var bgm = null;
    try {
      bgm = new Audio('music/bgm.mp3');
      bgm.loop = true;
      bgm.volume = 0.14; // 背景垫层级：明显低于音效层，不抢主观响度
    } catch (e) { bgm = null; }
    function bgmSync() {
      if (!bgm) return;
      bgm.play().catch(function () { /* 等待首次用户手势 */ });
    }
    DD.BGM = {
      play: function () { bgmSync(); },
      pause: function () { if (bgm) bgm.pause(); }
    };
    var bgmKick = function () { bgmSync(); };
    document.addEventListener('pointerdown', bgmKick);
    document.addEventListener('keydown', bgmKick);
    bgmSync();
  }

  // 单音：freq 起始频率，slideTo 滑向频率（可选），delay 相对当前时刻
  function tone(opt) {
    var c = getCtx();
    if (!c || !SFX.enabled) return;
    try {
      if (c.state === 'suspended') c.resume();
      var t0 = c.currentTime + (opt.delay || 0);
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = opt.type || 'triangle';
      osc.frequency.setValueAtTime(opt.freq, t0);
      if (opt.slideTo) osc.frequency.exponentialRampToValueAtTime(opt.slideTo, t0 + opt.dur);
      var vol = opt.vol != null ? opt.vol : 0.4;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
      osc.connect(g);
      g.connect(SFX._master);
      osc.start(t0);
      osc.stop(t0 + opt.dur + 0.05);
    } catch (e) { /* 静默 */ }
  }

  // 炸弹：低频滑音 + 低通噪声爆响
  function boomSound() {
    var c = getCtx();
    if (!c || !SFX.enabled) return;
    try {
      if (c.state === 'suspended') c.resume();
      var t0 = c.currentTime;
      var len = Math.floor(c.sampleRate * 0.35);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource();
      src.buffer = buf;
      var filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, t0);
      var g = c.createGain();
      g.gain.setValueAtTime(0.8, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      src.connect(filter);
      filter.connect(g);
      g.connect(SFX._master);
      src.start(t0);
      tone({ freq: 120, slideTo: 45, dur: 0.4, type: 'sine', vol: 0.85 });
    } catch (e) { /* 静默 */ }
  }

  // 噪声簇助手：滤波噪声短脉冲（发牌/翻页/whoosh 等质感音）
  function noise(opt) {
    var c = getCtx();
    if (!c || !SFX.enabled) return;
    try {
      if (c.state === 'suspended') c.resume();
      var dur = opt.dur || 0.05;
      var at = c.currentTime + (opt.delay || 0);
      var len = Math.max(16, Math.floor(c.sampleRate * dur));
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource();
      src.buffer = buf;
      var f = c.createBiquadFilter();
      f.type = opt.type || 'highpass';
      f.frequency.setValueAtTime(opt.freq || 1800, at);
      if (opt.freqTo) f.frequency.exponentialRampToValueAtTime(opt.freqTo, at + dur);
      var g = c.createGain();
      g.gain.setValueAtTime(opt.vol || 0.2, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f); f.connect(g); g.connect(SFX._master);
      src.start(at);
    } catch (e) { /* 静默 */ }
  }

  var LIB = {
    // —— 对局事件 ——
    deal: function () { // 发牌：连续甩牌噪声簇
      for (var i = 0; i < 8; i++) noise({ dur: 0.04, delay: i * 0.07, vol: 0.1, freq: 2200 + Math.random() * 900 });
    },
    alarm: function () { // 报牌警告：短促两连
      tone({ freq: 880, dur: 0.09, type: 'square', vol: 0.12 });
      tone({ freq: 660, dur: 0.12, type: 'square', vol: 0.12, delay: 0.11 });
    },
    windfall: function () { // 接风：轻快上行双音
      tone({ freq: 660, dur: 0.09, type: 'sine', vol: 0.24 });
      tone({ freq: 990, dur: 0.14, type: 'sine', vol: 0.24, delay: 0.1 });
    },
    rank: function (order) { // 名次产生：头游华丽、二/三/末游递降
      var seq = order === 1 ? [784, 1047] : order === 2 ? [659] : order === 3 ? [523] : [392];
      seq.forEach(function (f, i) { tone({ freq: f, dur: 0.12, type: 'triangle', vol: order === 1 ? 0.28 : 0.22, delay: i * 0.12 }); });
      if (order === 1) tone({ freq: 1319, dur: 0.2, type: 'sine', vol: 0.16, delay: 0.24 });
    },
    handWin: function () { // 本手胜：轻量上行短句
      [523, 659, 784].forEach(function (f, i) { tone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.24, delay: i * 0.1 }); });
    },
    handLose: function () { // 本手负：轻量下行
      tone({ freq: 440, dur: 0.12, type: 'triangle', vol: 0.22 });
      tone({ freq: 349, dur: 0.18, type: 'triangle', vol: 0.22, delay: 0.13 });
    },
    fanfare: function () { // 过 A / 整场胜利：隆重钟声琶音 + 彩带沙沙
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.28, delay: i * 0.12 }); });
      tone({ freq: 2093, dur: 0.5, type: 'sine', vol: 0.14, delay: 0.6 });
      noise({ dur: 0.5, delay: 0.2, vol: 0.05, freq: 6000 });
    },
    // —— UI 交互 ——
    select: function (count) { // 选牌：音高随已选张数微升
      tone({ freq: 920 + (count || 1) * 55, dur: 0.04, type: 'triangle', vol: 0.18 });
    },
    deselect: function () { tone({ freq: 600, dur: 0.04, type: 'triangle', vol: 0.14 }); },
    fold: function () { tone({ freq: 700, slideTo: 420, dur: 0.1, type: 'sine', vol: 0.16 }); },
    unfold: function () { tone({ freq: 420, slideTo: 700, dur: 0.1, type: 'sine', vol: 0.16 }); },
    coachOn: function () {
      tone({ freq: 523, dur: 0.08, type: 'sine', vol: 0.2 });
      tone({ freq: 784, dur: 0.12, type: 'sine', vol: 0.2, delay: 0.09 });
    },
    coachOff: function () {
      tone({ freq: 659, dur: 0.08, type: 'sine', vol: 0.18 });
      tone({ freq: 440, dur: 0.12, type: 'sine', vol: 0.18, delay: 0.09 });
    },
    page: function () { noise({ dur: 0.08, vol: 0.12, freq: 1200, type: 'bandpass' }); },
    pop: function () { tone({ freq: 320, slideTo: 640, dur: 0.09, type: 'sine', vol: 0.2 }); },
    whoosh: function () { noise({ dur: 0.12, vol: 0.12, freq: 800, freqTo: 3500, type: 'bandpass' }); },
    // 旧
    play: function () { tone({ freq: 520, slideTo: 340, dur: 0.07, type: 'triangle', vol: 0.26 }); },
    pass: function () { tone({ freq: 220, dur: 0.08, type: 'sine', vol: 0.22 }); },
    bomb: function () { boomSound(); },
    click: function () { tone({ freq: 700, dur: 0.035, type: 'square', vol: 0.13 }); },
    hint: function () { tone({ freq: 980, dur: 0.06, type: 'sine', vol: 0.2 }); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.28, delay: i * 0.13 });
      });
    },
    lose: function () {
      tone({ freq: 330, slideTo: 262, dur: 0.22, type: 'triangle', vol: 0.24 });
      tone({ freq: 262, slideTo: 196, dur: 0.3, type: 'triangle', vol: 0.24, delay: 0.22 });
    }
  };

  SFX.play = function (name, opt) {
    if (!SFX.enabled) return;
    var fn = LIB[name];
    if (fn) { try { fn(opt); } catch (e) { /* 静默 */ } }
  };
})(typeof self !== 'undefined' ? self : globalThis);
