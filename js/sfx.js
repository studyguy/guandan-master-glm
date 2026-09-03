/* =========================================================
 * 掼蛋 AI 训练营 · sfx.js
 * 轻量合成音效：WebAudio 实时生成，无任何音频素材文件
 *   play  出牌"嗒"   pass 过牌低音
 *   bomb  炸弹低频爆响 + 噪声        click/hint 按钮/提示
 *   win   胜利上行琶音               lose 失败下行音
 *   BGM   music/bgm.mp3 循环背景音乐（跟随 enabled 开关）
 * 可通过 DD.SFX.enabled（设置持久化）一键开关；
 * 惰性创建 AudioContext，首次用户手势后解锁自动播放限制。
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};

  var SFX = DD.SFX = {
    _ctx: null,
    _master: null
  };
  // enabled 用存取器实现：切换音效开关时同步暂停/续播背景音乐
  var _bgmSync = function () {};
  Object.defineProperty(SFX, 'enabled', {
    get: function () { return SFX._enabled !== false; },
    set: function (v) { SFX._enabled = v !== false; _bgmSync(); }
  });
  SFX._enabled = true;

  function getCtx() {
    if (SFX._ctx) return SFX._ctx;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      SFX._ctx = new AC();
      SFX._master = SFX._ctx.createGain();
      SFX._master.gain.value = 0.25;
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
    // ===== 背景音乐 BGM：循环播放，跟随 enabled 开关 =====
    var bgm = null;
    try {
      bgm = new Audio('music/bgm.mp3');
      bgm.loop = true;
      bgm.volume = 0.35;
    } catch (e) { bgm = null; }
    function bgmSync() {
      if (!bgm) return;
      if (SFX.enabled) { bgm.play().catch(function () { /* 等待首次用户手势 */ }); }
      else bgm.pause();
    }
    DD.BGM = {
      play: function () { bgmSync(); },
      pause: function () { if (bgm) bgm.pause(); }
    };
    // 启动即尝试自动播放；被自动播放策略拦截时，首次用户手势自动续播
    var bgmKick = function () { _bgmSync(); };
    document.addEventListener('pointerdown', bgmKick);
    document.addEventListener('keydown', bgmKick);
    _bgmSync = function () { bgmSync(); };
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

  var LIB = {
    play: function () { tone({ freq: 520, slideTo: 340, dur: 0.07, type: 'triangle', vol: 0.32 }); },
    pass: function () { tone({ freq: 220, dur: 0.08, type: 'sine', vol: 0.22 }); },
    bomb: function () { boomSound(); },
    click: function () { tone({ freq: 700, dur: 0.035, type: 'square', vol: 0.1 }); },
    hint: function () { tone({ freq: 980, dur: 0.06, type: 'sine', vol: 0.18 }); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.32, delay: i * 0.13 });
      });
    },
    lose: function () {
      tone({ freq: 330, slideTo: 262, dur: 0.22, type: 'triangle', vol: 0.28 });
      tone({ freq: 262, slideTo: 196, dur: 0.3, type: 'triangle', vol: 0.28, delay: 0.22 });
    }
  };

  SFX.play = function (name) {
    if (!SFX.enabled) return;
    var fn = LIB[name];
    if (fn) { try { fn(); } catch (e) { /* 静默 */ } }
  };
})(typeof self !== 'undefined' ? self : globalThis);
