/* =========================================================
 * 掼蛋 AI 训练营 · app.js
 * 主页（难度/开关/战绩）、教程、自动演示与调试钩子
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  DD.renderHome = function () {
    var s = DD.UI.settings;
    $$('#diff-group .diff-option').forEach(function (o) { o.classList.toggle('on', o.dataset.diff === s.difficulty); });
    var st = DD.UI.stats;
    $('#home-stats').innerHTML =
      '<span>整场胜 <b>' + (st.wins || 0) + '</b></span>' +
      '<span>已打 <b>' + (st.games || 0) + '</b> 场</span>' +
      '<span>胜率 <b>' + (st.games ? Math.round(st.wins / st.games * 100) : 0) + '%</b></span>';
  };

  function bindHome() {
    $$('#diff-group .diff-option').forEach(function (o) {
      o.addEventListener('click', function () {
        DD.UI.settings.difficulty = o.dataset.diff;
        save(); DD.renderHome();
      });
    });
    $('#btn-start').addEventListener('click', function () { DD.startGame(); });
    $('#btn-tutorial').addEventListener('click', function () { DD.SFX.play('pop'); $('#modal-tutorial').classList.remove('hidden'); });
    $('#btn-game-tutorial').addEventListener('click', function () { DD.SFX.play('pop'); $('#modal-tutorial').classList.remove('hidden'); });
    $('#btn-home-coach').addEventListener('click', function () { DD.UI.settings.coach = !DD.UI.settings.coach; DD.SFX.play(DD.UI.settings.coach ? 'coachOn' : 'coachOff'); save(); renderToggles(); });
    $('#btn-home-counter').addEventListener('click', function () { DD.UI.settings.counter = !DD.UI.settings.counter; save(); renderToggles(); });
    $('#btn-tutorial-close').addEventListener('click', function () { DD.SFX.play('fold'); $('#modal-tutorial').classList.add('hidden'); });
    renderToggles();
  }

  function renderToggles() {
    var s = DD.UI.settings;
    $('#btn-home-coach').textContent = '🎓 AI 教练：' + (s.coach ? '开' : '关');
    $('#btn-home-counter').textContent = '🔍 记牌器：' + (s.counter ? '开' : '关');
  }
  function save() { localStorage.setItem('dd_trainer_settings', JSON.stringify(DD.UI.settings)); }

  // 教程 tab
  (function bindTabs() {
    var tabs = document.querySelectorAll('#tutorial-tabs .tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        DD.SFX.play('page');
        tabs.forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        document.querySelectorAll('#tutorial-panels .panel').forEach(function (p) {
          p.classList.toggle('hidden', p.id !== 'panel-' + t.dataset.tab);
        });
      });
    });
  })();

  // 自动演示/调试钩子：
  //  ?autotest=autoplay 全自动打（人类座位由 AI 代打）
  //  &side=1 强制展开侧栏；?debug=1 输出主要元素包围盒（供自动化检查干涉）
  function initAutotest() {
    var q = new URLSearchParams(location.search);
    if (q.get('autotest') === 'autoplay') DD.UI.autoplay = true;
    if (q.get('side') === '1') { DD.UI.settings.coach = true; localStorage.setItem('dd_trainer_settings', JSON.stringify(DD.UI.settings)); }
    window.addEventListener('error', function (e) {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;bottom:0;left:0;z-index:99999;background:#a00;color:#fff;font-size:12px;padding:4px;';
      d.textContent = 'ERR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno;
      document.body.appendChild(d);
    });
    if (q.get('debug') === '1') {
      setTimeout(function () { DD.startGame(); }, 350);
      setTimeout(function () {
        var ids = ['top-bar', 'seat-1', 'seat-2', 'seat-3', 'play-0', 'play-1', 'play-2', 'play-3',
          'counter', 'coach-fab', 'hand', 'actions', 'me-bar', 'combo-label', 'coach-side', 'center-msg'];
        var out = ['W=' + innerWidth + ' H=' + innerHeight];
        ids.forEach(function (id) {
          var e = document.getElementById(id);
          if (!e || e.classList.contains('hidden')) { out.push(id + ':hidden'); return; }
          var r = e.getBoundingClientRect();
          out.push(id + '=' + Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
        var d = document.createElement('div');
        d.id = 'debug-out';
        d.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;background:#000;color:#0f0;font-size:12px;padding:4px;white-space:pre;max-width:100vw;';
        d.textContent = out.join(' | ');
        document.body.appendChild(d);
      }, 7000);
      return;
    }
    setTimeout(function () { DD.startGame(); }, 350);
  }

  // ===== 全屏 + 横屏（发布用）=====
  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function reqFs() {
    var el = document.documentElement;
    try {
      var p = el.requestFullscreen
        ? el.requestFullscreen({ navigationUI: 'hide' })
        : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : Promise.reject(new Error('unsupported')));
      Promise.resolve(p).then(function () {
        if (screen.orientation && screen.orientation.lock) {
          try { screen.orientation.lock('landscape').catch(function () {}); } catch (e2) { /* 忽略 */ }
        }
      }).catch(function () {});
    } catch (e) { /* 忽略 */ }
  }
  function exitFs() {
    try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* 忽略 */ }
  }
  function initFsGate() {
    // 自动化钩子不显示全屏门
    if (location.search.indexOf('autotest') >= 0 || location.search.indexOf('debug') >= 0) {
      var g0 = document.getElementById('fs-gate');
      if (g0) g0.classList.add('hidden');
      return;
    }
    var enter = document.getElementById('btn-fs-enter');
    var skip = document.getElementById('btn-fs-skip');
    var fsBtn = document.getElementById('btn-fs');
    var gate = document.getElementById('fs-gate');
    if (!enter || !gate) return;
    function dismiss() { gate.classList.add('hidden'); }
    enter.addEventListener('click', function () { reqFs(); dismiss(); });
    skip.addEventListener('click', dismiss);
    if (fsBtn) {
      fsBtn.addEventListener('click', function () { if (isFs()) exitFs(); else reqFs(); });
      var syncBtn = function () { if (fsBtn) fsBtn.textContent = isFs() ? '⛶ 退出全屏' : '⛶ 全屏'; };
      document.addEventListener('fullscreenchange', syncBtn);
      document.addEventListener('webkitfullscreenchange', syncBtn);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initFsGate();
    bindHome();      // 主页交互（难度/开始/教程/开关）——曾遗漏调用导致主页按钮全部失效
    DD.boot();
    initAutotest();
  });
})(typeof self !== 'undefined' ? self : globalThis);
