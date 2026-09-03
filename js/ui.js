/* =========================================================
 * 掼蛋 AI 训练营 · ui.js
 * 表现层：4 人对家对座牌桌、选牌交互、AI 教练侧栏（两段式）、
 *         记牌器、本手/整场结算
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};
  var CT = DD.CT;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var HUMAN = 0;             // 座位 0 我；2=对家队友；1=下家；3=上家
  var ME_TEAM = 0;

  var UI = DD.UI = {
    settings: { difficulty: 'easy', coach: true, counter: true, sound: true, coachOpen: true, counterFolded: false, rotateDismissed: false, sortMode: 'smart' },
    game: null,
    selected: {}, advice: null, plans: [],
    selectedPlanKey: null, review: '', analysisOpen: false,
    playedAcc: {},           // 对手已出计数（我/队友用当前手牌扣除）
    orderBadges: ['', '🥇', '🥈', '🥉', '4'],
    stats: { wins: 0, games: 0 },
    _lastTap: null, _bottomMode: null
  };

  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem('dd_trainer_settings') || '{}');
      for (var k in s) if (k in UI.settings) UI.settings[k] = s[k];
      UI.stats = Object.assign({ wins: 0, games: 0 }, JSON.parse(localStorage.getItem('dd_trainer_stats') || '{}'));
    } catch (e) { /* ignore */ }
    // 窄屏首次使用（无持久化偏好）默认收起抽屉，避免开局即遮挡牌桌
    try {
      if (isMobileLayout() && !localStorage.getItem('dd_trainer_settings')) UI.settings.coachOpen = false;
    } catch (e) { /* ignore */ }
    // 旧版"花色排序"已升级为智能理牌
    if (UI.settings.sortMode === 'suit') UI.settings.sortMode = 'smart';
    DD.SFX.enabled = UI.settings.sound !== false;
  }
  function saveSettings() { try { localStorage.setItem('dd_trainer_settings', JSON.stringify(UI.settings)); } catch (e) { /* */ } }
  function saveStats() { try { localStorage.setItem('dd_trainer_stats', JSON.stringify(UI.stats)); } catch (e) { /* */ } }
  function toast(msg, kind) {
    var t = $('#toast'); t.textContent = msg; t.className = 'show ' + (kind || 'info');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 2600);
  }
  function showScreen(name) {
    $$('.screen').forEach(function (s) { s.classList.add('hidden'); });
    $('#screen-' + name).classList.remove('hidden');
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function isMobileLayout() { return window.innerWidth <= 1024; }
  function levelT(lv) { return DD.levelText(lv); }

  // ---------- 卡牌 DOM ----------
  function cardEl(c, small, faceDown) {
    var e = el('div', 'card' + (small ? ' small' : '') + (faceDown ? ' back' : ''));
    e.dataset.id = c.id;
    if (faceDown) return e;
    var isWild = DD.isWild(c, (UI.game && UI.game.state().tableLevel) || 2);
    if (c.v >= 15) {
      e.classList.add(c.v === 16 ? 'joker-big' : 'joker-small');
      e.innerHTML = '<div class="corner">' + (c.v === 16 ? '大王' : '小王') + '</div><div class="jk">王</div>';
    } else {
      var red = DD.SUITS[c.s].red;
      if (red) e.classList.add('red');
      var cap = (c.s === 1 && isWild) ? '✦' : DD.RANK_NAME[c.v];
      e.innerHTML = '<div class="corner">' + cap + '<i>' + DD.SUITS[c.s].sym + '</i></div><div class="pip">' + DD.SUITS[c.s].sym + '</div>';
      if (isWild) e.classList.add('wild');
    }
    return e;
  }

  // ---------- 记牌器 ----------
  function renderCounter(st) {
    var box = $('#counter');
    if (!UI.settings.counter) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    // 窄屏默认折叠为小 pill（本次会话内点开后保持展开，不覆盖用户桌面端的持久化选择）
    var folded = UI.settings.counterFolded || (isMobileLayout() && !UI.counterOpenMobile);
    if (folded) { box.classList.add('folded'); return; }
    box.classList.remove('folded');
    var acc = function (v) { return UI.playedAcc[v] || 0; };
    var mine = DD.countMap(st.players[HUMAN].hand);
    var part = DD.countMap(st.players[2].hand);
    var html = '<div class="counter-row">';
    var order = [16, 15]; // 王先显示：大王小王合并为“王”
    html += '<div class="counter-item hot"><b>王</b><span>' + Math.max(0, 4 - acc(16) - acc(15)) + '</span></div>';
    // 级牌高亮行
    var lv = st.tableLevel;
    html += '<div class="counter-item hot"><b>级' + levelT(lv) + '</b><span>' + Math.max(0, 8 - (mine[lv] || 0) - (part[lv] || 0) - acc(lv)) + '</span></div>';
    html += '</div><div class="counter-row">';
    for (var v = 14; v >= 2; v--) {
      if (v === lv) continue;
      var n = Math.max(0, 8 - (mine[v] || 0) - (part[v] || 0) - acc(v));
      html += '<div class="counter-item"><b>' + (v === 14 ? 'A' : v) + '</b><span>' + n + '</span></div>';
    }
    html += '</div>';
    $('#counter-body').innerHTML = html;
  }

  // ---------- 座位渲染 ----------
  function seatInfo(idx, st) {
    var p = st.players[idx];
    var role = p.finished ? '已出完' : (p.team === ME_TEAM ? '队友' : '对手');
    if (idx === HUMAN) role = '你';
    return { p: p, role: role };
  }
  function renderSeat(idx, st) {
    var seat = $('#seat-' + idx);
    var si = seatInfo(idx, st);
    $('#name-' + idx).textContent = si.p.name + (si.p.finished ? ' ' + UI.orderBadges[si.p.order] : '');
    $('#role-' + idx).textContent = si.role;
    $('#count-' + idx).textContent = si.p.finished ? '' : (si.p.count + ' 张');
    seat.classList.toggle('active', !si.p.finished && st.turn === idx);
    // 报牌提示：≤报牌张数时常驻红点
    seat.classList.toggle('reporting', !si.p.finished && si.p.count > 0 && si.p.count <= DD.RULES.reportAt);
  }
  // 对家亮牌小扇形（宽度自适应：不超过牌桌宽的 45%，避免压到右上角记牌器）
  function renderFanPartner(st) {
    var box = $('#fan-2');
    box.innerHTML = '';
    var cards = DD.sortByLevel(st.players[2].hand, st.tableLevel);
    var n = cards.length;
    if (!n) return;
    var probe = cardEl(cards[0], true);
    box.appendChild(probe);
    var cw = probe.offsetWidth || 30;
    var table = $('#table');
    var maxW = Math.max(cw * 2, (table ? table.clientWidth : window.innerWidth) * 0.42);
    var step = n > 1 ? Math.min(cw * 0.55, (maxW - cw) / (n - 1)) : 0;
    box.removeChild(probe);
    cards.forEach(function (c, k) {
      var e = cardEl(c, true);
      if (k > 0) e.style.marginLeft = (step - cw).toFixed(1) + 'px';
      box.appendChild(e);
    });
  }
  function renderFansOpponents(st) {
    [1, 3].forEach(function (i) {
      var box = $('#fan-' + i);
      box.innerHTML = '';
      var n = st.players[i].count;
      if (!n) return;
      // 动态压缩重叠：扇形总高不超过桌面高的 42%（卡高按实际渲染尺寸测量，随视口缩放）
      var probe = el('div', 'card back mini2');
      box.appendChild(probe);
      var cardH = probe.offsetHeight || 30;
      var maxH = Math.max(120, Math.round(window.innerHeight * 0.42));
      var step = n > 1 ? Math.min(16, (maxH - cardH) / (n - 1)) : 0;
      box.removeChild(probe);
      for (var k = 0; k < n; k++) {
        var c = el('div', 'card back mini2');
        if (k > 0) c.style.marginTop = (step - cardH).toFixed(1) + 'px';
        box.appendChild(c);
      }
    });
  }
  // 出牌展示
  function showPlay(idx, move) {
    var box = $('#play-' + idx);
    box.innerHTML = '';
    var lab = el('div', 'played-label', DD.moveLabel(move.info));
    box.appendChild(lab);
    var row = el('div', 'played-cards');
    DD.sortByLevel(move.cards, (UI.game ? UI.game.state() : { tableLevel: 2 }).tableLevel).forEach(function (c) { row.appendChild(cardEl(c, true)); });
    box.appendChild(row);
    var seat = $('#seat-' + idx) || $('#me-bar');
    seat.classList.add('just-played');
    setTimeout(function () { seat.classList.remove('just-played'); }, 600);
  }
  function showPass(idx) {
    var box = $('#play-' + idx);
    box.innerHTML = '<div class="pass-mark">不出</div>';
  }
  function clearPlays() { [0, 1, 2, 3].forEach(function (i) { $('#play-' + i).innerHTML = ''; }); }

  // ---------- 我的信息 & 手牌 ----------
  function bubble(idx, text, ms) {
    var b = $('#bubble-' + idx);
    b.textContent = text; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(function () { b.classList.remove('show'); }, ms || 1800);
  }
  function renderMy(st) {
    $('#seat-me-name').textContent = '你';
    var rank = st.rank[HUMAN];
    $('#me-rank').textContent = rank > 0 ? UI.orderBadges[rank] : '';
  }
  // 当前理牌模式的列结构：每列 = 同点数一叠（纵向排列）；智能理牌时按
  // 王→炸弹→同花色连张(同顺)→三张→对子→单张 分组，组间留间隔
  function handColumns(st) {
    if (UI.settings.sortMode === 'smart') {
      return DD.arrangeHandSmart(st.players[HUMAN].hand, st.tableLevel).columns.map(function (col) {
        return { tag: col.tag, cards: col.cards.slice() };
      });
    }
    var sorted = DD.sortByLevel(st.players[HUMAN].hand, st.tableLevel);
    var cols = [];
    sorted.forEach(function (c) {
      var eff = DD.effOf(c.v, st.tableLevel);
      if (!cols.length || cols[cols.length - 1].eff !== eff) cols.push({ eff: eff, tag: '', cards: [] });
      cols[cols.length - 1].cards.push(c);
    });
    return cols.map(function (col) { return { tag: '', cards: col.cards }; });
  }

  function renderHand(st) {
    var box = $('#hand');
    box.innerHTML = '';
    var cols = handColumns(st);
    var smart = UI.settings.sortMode === 'smart';
    cols.forEach(function (col, ci) {
      var colDiv = el('div', 'hcol');
      col.cards.sort(function (a, b) { return a.s - b.s || a.d - b.d; });
      col.cards.forEach(function (c, k) {
        var e = cardEl(c, false);
        if (UI.selected[c.id]) e.classList.add('sel');
        if (col.tag === '同顺' && k === col.cards.length - 1) e.classList.add('tongshun');
        e.addEventListener('click', function () {
          var now = Date.now();
          if (UI._lastTap && UI._lastTap.id === c.id && now - UI._lastTap.t < 350) { UI._lastTap = null; quickPlay(c); return; }
          UI._lastTap = { id: c.id, t: now };
          var wasArmed = UI.selectedPlanKey != null;
          UI.selectedPlanKey = null; clearHint();
          if (wasArmed) renderPlans(UI.game.viewFor(HUMAN));
          if (UI.selected[c.id]) { delete UI.selected[c.id]; e.classList.remove('sel'); }
          else { UI.selected[c.id] = c; e.classList.add('sel'); }
          updateComboLabel(st);
        });
        colDiv.appendChild(e);
      });
      if (ci > 0 && smart && cols[ci - 1].tag !== col.tag) colDiv.dataset.gap = '1';
      box.appendChild(colDiv);
    });
    layoutHand();
  }
  function layoutHand() {
    var box = $('#hand'); var n = box.children.length; if (!n) return;
    // 实测卡宽（--card-w 在桌面端是 clamp 表达式，getComputedStyle 取不到数值）
    var cw = box.children[0].offsetWidth || 44;
    var table = document.getElementById('table');
    var tw = table && table.clientWidth ? table.clientWidth : window.innerWidth;
    var avail = Math.max(cw, tw - 24);
    // 理牌分组间隔计入总宽预算，保证分组不把整列撑出牌桌
    var gapExtra = Math.max(10, cw * 0.35);
    var extras = 0;
    for (var g = 1; g < n; g++) if (box.children[g].dataset && box.children[g].dataset.gap) extras += gapExtra;
    var pitch = n > 1 ? Math.max(cw * 0.55, Math.min(cw + 6, (avail - n * cw - extras) / (n - 1) + cw)) : cw;
    for (var i = 0; i < n; i++) {
      var node = box.children[i];
      var extra = node.dataset && node.dataset.gap ? gapExtra : 0;
      node.style.marginLeft = i === 0 ? '0px' : (pitch - cw + extra).toFixed(1) + 'px';
    }
  }

  function getSelected() { return Object.keys(UI.selected).map(function (k) { return UI.selected[k]; }); }
  function updateComboLabel(st) {
    var lab = $('#combo-label'), btn = $('#btn-play');
    var sel = getSelected();
    if (!sel.length) { lab.innerHTML = '<span class="muted">点击手牌选牌（双击单张直接出）</span>'; btn.disabled = true; return; }
    var view = UI.game.viewFor(HUMAN);
    var ev = DD.evaluateSelection(sel, view);
    btn.disabled = !ev.ok; btn.title = ev.ok ? '' : '无法这样出牌';
    if (ev.ok) {
      var enemyTop = view.lastPlay && view.players[view.lastPlay.playerIdx].team !== view.me.team;
      lab.innerHTML = '已选：<b>' + ev.label + '</b> ' + (view.lastPlay && enemyTop ? '<span class="ok">✓ 压得上家</span>' : '<span class="ok">✓ 可出</span>');
    } else { lab.innerHTML = '<span class="warn">✗ ' + ev.msg + '</span>'; }
  }
  function quickPlay(card) {
    var st = UI.game.state();
    if (st.phase !== 'playing' || st.turn !== HUMAN) return;
    var view = UI.game.viewFor(HUMAN);
    var ev = DD.evaluateSelection([card], view);
    if (ev.ok && UI.game.humanMove({ cards: [card], info: ev.info })) { UI.review = DD.reviewPlay(ev.info, UI.advice) || ''; UI.selected = {}; UI.selectedPlanKey = null; return; }
    UI.selected = {}; UI.selected[card.id] = card;
    renderHand(st); updateComboLabel(st);
    if (!ev.ok) toast(ev.msg, 'warn');
  }

  // ---------- 顶部信息 ----------
  function renderTop(st) {
    $('#chip-hand').textContent = '第 ' + st.hand + ' 手';
    $('#chip-level').textContent = '打 ' + levelT(st.tableLevel);
    $('#chip-score').textContent = '我方 ' + levelT(st.levels[0]) + ' : ' + levelT(st.levels[1]) + ' 对方';
  }
  function centerMsg(st) {
    var m = $('#center-msg'), last = $('#table-last');
    var myTurn = st.phase === 'playing' && st.turn === HUMAN;
    m.classList.toggle('attention', myTurn);
    if (st.phase !== 'playing') { m.textContent = ''; last.textContent = ''; last.style.display = 'none'; return; }
    var who = st.players[st.turn];
    if (myTurn) m.textContent = '轮到你出牌' + (st.lastPlay ? '' : '（本手先出）');
    else m.textContent = who.name + ' 思考中…';
    if (st.lastPlay) {
      last.style.display = '';
      last.textContent = '上家出：「' + DD.moveLabel(st.lastPlay.info) + '」 · ' + st.players[st.lastPlay.playerIdx].name;
    } else { last.textContent = ''; last.style.display = 'none'; }
  }

  // ---------- 操作 ----------
  function onPlay() {
    var sel = getSelected();
    var view = UI.game.viewFor(HUMAN);
    var ev = DD.evaluateSelection(sel, view);
    if (!ev.ok) { toast(ev.msg, 'warn'); return; }
    if (UI.game.humanMove({ cards: sel, info: ev.info })) {
      UI.review = DD.reviewPlay(ev.info, UI.advice) || '';
      UI.selected = {}; UI.selectedPlanKey = null;
    }
  }
  function onPass() {
    if (UI.game.humanMove(null)) { UI.review = DD.reviewPlay(null, UI.advice) || ''; UI.selected = {}; UI.selectedPlanKey = null; }
  }
  function clearHint() { $$('#hand .card').forEach(function (e) { e.classList.remove('hinted'); }); }

  // ---------- 教练侧栏 ----------
  function renderCoachShell() {
    var side = $('#coach-side'), fab = $('#coach-fab'), bd = $('#side-backdrop');
    var show = UI.settings.coach && UI.game && UI.settings.coachOpen;
    var mob = isMobileLayout();
    side.classList.toggle('hidden', !show);
    side.classList.toggle('open', show && mob);
    bd.classList.toggle('hidden', !(show && mob));
    fab.classList.toggle('hidden', !(UI.settings.coach && UI.game) || show);
  }
  function setCoachOpen(open) {
    var was = UI.settings.coachOpen;
    UI.settings.coachOpen = !!open; saveSettings();
    if (isMobileLayout() && open !== was) {
      var side = $('#coach-side');
      if (open) { renderCoachShell(); void side.offsetWidth; side.classList.add('open'); return; }
      side.classList.remove('open'); setTimeout(renderCoachShell, 230); return;
    }
    renderCoachShell();
  }
  function setAnalysis(open) {
    UI.analysisOpen = !!open;
    $('#coach-lines').classList.toggle('collapsed', !open);
    $('#btn-analysis-toggle').textContent = open ? '收起分析 ▴' : '展开分析 ▾';
  }
  function renderCoachSide(st) {
    if (!UI.game) return;
    if (!UI.settings.coach) { renderCoachShell(); return; }
    var view = UI.game.viewFor(HUMAN);
    var myTurn = st.phase === 'playing' && st.turn === HUMAN;
    var titleEl = $('#coach-title'), linesEl = $('#coach-lines');
    var handsN = DD.decomposeGuandan(view.me.hand, view.level).hands;
    var partCnt = st.players[2].count;
    $('#cs-situation').textContent = '你 · ' + (st.levels[0] === st.tableLevel ? '打本方 ' + levelT(st.tableLevel) : '打 ' + levelT(st.tableLevel)) +
      ' · 队友剩 ' + partCnt + ' 张 · 你约 ' + handsN + ' 手 · 级牌 ' + levelT(st.tableLevel) + '（红桃为万能配）';
    if (!myTurn) {
      titleEl.textContent = '⏳ 等待';
      linesEl.innerHTML = '<div class="coach-line">' + (st.players[st.turn].name) + ' 思考中…</div>';
      linesEl.classList.add('is-dim');
      $('#coach-plans').innerHTML = '<div class="cs-plans-empty">轮到你时给出方案</div>';
      return;
    }
    UI.advice = DD.advise(view);
    titleEl.textContent = '💡 ' + UI.advice.title;
    var html = '';
    UI.advice.lines.forEach(function (l) { html += '<div class="coach-line">· ' + l + '</div>'; });
    if (UI.review) html += '<div class="coach-review">' + UI.review + '</div>';
    linesEl.innerHTML = html;
    linesEl.classList.remove('is-dim');
    setAnalysis(UI.analysisOpen);
    renderPlans(view);
  }
  function planKey(p) { return p.pass ? 'pass' : p.move.info.type + '|' + p.move.info.main + '|' + p.move.info.len; }
  function renderPlans(view) {
    var box = $('#coach-plans');
    UI.plans = DD.buildPlans(view, 6);
    box.innerHTML = '';
    if (!UI.plans.length) { box.innerHTML = '<div class="cs-plans-empty">没有能压过的牌，选择「不出」</div>'; return; }
    UI.plans.forEach(function (p) {
      var row = document.createElement('button');
      var tc = p.tag === '推荐' ? 'rec' : p.tag === '炸弹' ? 'bomb' : p.tag === '最大' ? 'big' : '';
      row.className = 'plan-row' + (p.tag === '推荐' ? ' recommended' : '') + (p.pass ? ' is-pass' : '') +
        (UI.selectedPlanKey === planKey(p) ? ' selected' : '');
      row.innerHTML = '<span class="plan-tag ' + tc + '">' + p.tag + '</span><b>' + p.label + '</b>' +
        '<span class="plan-desc">' + (UI.selectedPlanKey === planKey(p) ? '再点一次打出' : p.desc) + '</span>';
      row.addEventListener('click', function () {
        DD.SFX && DD.SFX.play('click');
        var st0 = UI.game.state();
        if (st0.phase !== 'playing' || st0.turn !== HUMAN) return;
        if (UI.selectedPlanKey === planKey(p)) { playPlan(p); return; }
        UI.selectedPlanKey = planKey(p);
        // 方案牌同步为真实选中：手动点出牌按钮 / 空格也能打出
        UI.selected = {};
        if (p.move) p.move.cards.forEach(function (c) { UI.selected[c.id] = c; });
        renderHand(st0);
        renderPlans(UI.game.viewFor(HUMAN));
        if (p.move) { highlight(p.move.cards); updateComboLabel(st0); } else clearHint();
      });
      box.appendChild(row);
    });
    var badge = $('#coach-fab-badge');
    var rec = UI.plans[0];
    badge.textContent = rec ? (rec.pass ? '不出' : shortLabel(rec.move.info)) : 'AI';
  }
  function shortLabel(info) {
    var RN = DD.RANK_NAME;
    if (info.type === 'SINGLE') return RN[info.rank];
    if (info.type === 'PAIR') return '对' + RN[info.rank];
    if (info.type === 'BOMB') return '炸' + info.len;
    if (info.type === 'FLUSH') return '同花顺';
    if (info.type === 'FOUR_JOKER') return '四王炸';
    return DD.CT_NAME[info.type] || '出';
  }
  function highlight(cards) {
    var ids = {}; cards.forEach(function (c) { ids[c.id] = 1; });
    $$('#hand .card').forEach(function (e) { e.classList.toggle('hinted', !!ids[e.dataset.id]); });
  }
  function playPlan(p) {
    var st = UI.game.state();
    if (st.phase !== 'playing' || st.turn !== HUMAN) return;
    if (p.pass) onPass();
    else if (p.move && UI.game.humanMove({ cards: p.move.cards, info: p.move.info })) {
      UI.review = DD.reviewPlay(p.move.info, UI.advice) || '';
      UI.selected = {};
    }
    UI.selectedPlanKey = null;
    if (isMobileLayout()) setCoachOpen(false);
  }

  // ---------- 结算 ----------
  function renderOver(d) {
    var st = UI.game.state();
    var iWonHand = (d.winnerTeam === ME_TEAM);
    var meOrder = d.rank[HUMAN];
    UI.stats.games = (UI.stats.games || 0);
    // games = 场次在 session 结束时统计；这里只展示
    $('#over-title').textContent = iWonHand ? '本手 · 我方获胜' : '本手 · 对方获胜';
    $('#over-title').className = iWonHand ? 'win' : 'lose';
    $('#over-sub').textContent = '头游 ' + d.players.find(function (p) { return p.idx === d.head; }).name +
      (d.passedA ? ' · 成功过 A！' : (d.rise > 0 ? ' · 升级 ' + d.rise + ' 级' : ' · 未升级'));
    var tb = $('#over-table');
    var html = '<tr><th>名次</th><th>玩家</th><th>队伍</th></tr>';
    d.players.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (p) {
      var isMe = p.idx === HUMAN || p.idx === 2;
      html += '<tr' + (isMe ? ' class="me-row"' : '') + '><td>' + UI.orderBadges[p.order] + '</td><td>' + p.name + '</td><td>' +
        (p.team === ME_TEAM ? '我方' : '对方') + '</td></tr>';
    });
    tb.innerHTML = html;
    // 级牌推进图示：胜方 旧级 ➜ 新级（+n），失败方不动
    var winnerName = iWonHand ? '我方' : '对方';
    var loserName = iWonHand ? '对方' : '我方';
    var loserLv = d.levels[1 - d.winnerTeam];
    var prog = d.passedA
      ? winnerName + ' 打 A ➜ 过 A 成功 🎉 · ' + loserName + ' ' + levelT(loserLv)
      : winnerName + ' ' + levelT(d.levelBefore) + ' ➜ ' + levelT(d.levelAfter) + '（+' + d.rise + ' 级） · ' + loserName + ' ' + levelT(loserLv);
    prog += '（下一手打 ' + levelT(d.levels[d.winnerTeam]) + '）';
    $('#over-extra').textContent = prog;
    $('#modal-over').classList.remove('hidden');
  }
  function spawnConfetti(cont) {
    cont.classList.remove('hidden');
    cont.innerHTML = '';
    var colors = ['#ffd76a', '#7dffb0', '#8fd6ff', '#ff9b7a', '#e8a0ff', '#ffffff'];
    for (var i = 0; i < 26; i++) {
      var s = document.createElement('span');
      s.className = 'confetti-bit';
      s.style.left = (Math.random() * 100) + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 0.7).toFixed(2) + 's';
      s.style.animationDuration = (1.3 + Math.random() * 1.2).toFixed(2) + 's';
      cont.appendChild(s);
    }
    setTimeout(function () { cont.classList.add('hidden'); cont.innerHTML = ''; }, 3200);
  }
  function renderSession(d) {
    var iWon = d.winnerTeam === ME_TEAM;
    $('#modal-over').classList.add('hidden');
    UI.stats.games++;
    if (iWon) UI.stats.wins++;
    saveStats();
    $('#sess-title').textContent = iWon ? '🎉 我方先过 A，赢下整场！' : '😅 对方先过 A，再接再厉';
    $('#sess-title').className = iWon ? 'win' : 'lose';
    $('#sess-sub').textContent = '整场共 ' + UI.game.state().hand + ' 手 · 我方打到 ' + levelT(UI.game.state().levels[0]) + ' · 对方打到 ' + levelT(UI.game.state().levels[1]);
    $('#modal-session').classList.remove('hidden');
    if (iWon) spawnConfetti($('#confetti-s'));
  }

  // ---------- 事件 ----------
  function onEv(ev, d) {
    var st = UI.game ? UI.game.state() : null;
    switch (ev) {
      case 'deal':
        UI.playedAcc = {}; UI.selected = {}; UI.plans = []; UI.review = ''; UI.selectedPlanKey = null;
        clearPlays(); renderAll(st); break;
      case 'state': renderAll(st); break;
      case 'needPlay':
        UI.review = ''; UI.selectedPlanKey = null;
        renderAll(st);
        if (UI.autoplay) {
          setTimeout(function () {
            if (!UI.game) return; // 已退出对局
            var v = UI.game.viewFor(HUMAN);
            var bp = DD.bestPlay(v);
            if (bp.move && UI.game.humanMove({ cards: bp.move.cards, info: bp.move.info })) return;
            if (UI.game.humanMove(null)) return;
            // 兜底：建议与过牌都被拒时改走首个合法走法，保证自动演示不卡死
            var st = UI.game.state();
            var mvs = st.lastPlay ? DD.followMoves(st.players[HUMAN].hand, st.tableLevel, st.lastPlay.info)
              : DD.leadingMoves(st.players[HUMAN].hand, st.tableLevel);
            if (mvs.length) UI.game.humanMove({ cards: mvs[0].cards, info: mvs[0].info });
            else UI.game.humanMove(null);
          }, 300);
        }
        break;
      case 'play':
        showPlay(d.idx, d.move);
        if (d.idx === 1 || d.idx === 3) { // 对手
          d.move.cards.forEach(function (c) { UI.playedAcc[c.v] = (UI.playedAcc[c.v] || 0) + 1; });
          renderCounter(st);
        }
        if (d.idx === HUMAN && UI.settings.coach) toast(UI.review || '已出', 'info');
        DD.SFX && DD.SFX.play(d.move.info.type === 'BOMB' || d.move.info.type === 'FLUSH' || d.move.info.type === 'FOUR_JOKER' ? 'bomb' : 'play');
        break;
      case 'pass': showPass(d.idx); bubble(d.idx, '不出'); DD.SFX && DD.SFX.play('pass'); break;
      case 'alarm':
        bubble(d.idx, d.idx === HUMAN ? '你只剩 ' + d.count + ' 张！' : '只剩 ' + d.count + ' 张！', 2200);
        break;
      case 'finish':
        bubble(d.idx, UI.orderBadges[d.order], 2600);
        if (UI.settings.counter) renderCounter(UI.game.state());
        break;
      case 'trickLead':
        clearPlays();
        if (d.windfall && d.leader !== HUMAN) {
          bubble(d.leader, d.leader === 2 ? '对家接风！' : (st.players[d.leader].name + ' 接风'), 2200);
        } else if (d.windfall) {
          bubble(HUMAN, '你接风，继续出牌！', 2200);
        }
        break;
      case 'handOver': renderOver(d); break;
      case 'sessionOver': DD.SFX && DD.SFX.play(d.winnerTeam === ME_TEAM ? 'win' : 'lose'); renderSession(d); break;
    }
  }

  function renderAll(st) {
    if (!st) return;
    renderTop(st);
    renderSeat(1, st); renderSeat(2, st); renderSeat(3, st);
    renderFanPartner(st); renderFansOpponents(st);
    renderHand(st); renderMy(st); renderCounter(st); centerMsg(st);
    renderControls(st); updateComboLabel(st); renderCoachSide(st);
  }
  function renderControls(st) {
    var myTurn = st.phase === 'playing' && st.turn === HUMAN;
    var actions = $('#actions');
    actions.classList.toggle('hidden', !myTurn);
    $('#combo-label').classList.toggle('hidden', st.phase !== 'playing');
    if (myTurn) {
      var passable = !!st.lastPlay;
      $('#btn-pass').disabled = !passable;
      $('#btn-pass').classList.toggle('pulse', passable && !DD.legalMoves(st.players[HUMAN].hand, st.tableLevel, st.lastPlay).length);
      $('#btn-pass').textContent = (passable && !DD.legalMoves(st.players[HUMAN].hand, st.tableLevel, st.lastPlay).length) ? '要不起，不出' : '不 出';
    }
  }

  // ---------- 开局 ----------
  function startGame() {
    var diff = UI.settings.difficulty;
    var names = {
      easy: { partner: '小萌', opps: ['阿豆', '阿皮'] },
      medium: { partner: '慧姐', opps: ['阿强', '阿伟'] },
      hard: { partner: '牌圣', opps: ['神·北', '神·南'] }
    };
    var nm = names[diff];
    UI.selected = {}; UI.advice = null; UI.plans = []; UI.review = ''; UI.selectedPlanKey = null; UI.playedAcc = {};
    UI.counterOpenMobile = false;
    UI.game = new DD.Game({
      players: [
        { name: '你', type: 'human' },
        { name: nm.opps[0], type: 'bot', difficulty: diff },
        { name: nm.partner, type: 'bot', difficulty: 'medium' },
        { name: nm.opps[1], type: 'bot', difficulty: diff }
      ],
      botDelay: isMobileLayout() ? 550 : 750,
      onEvent: onEv
    });
    clearPlays();
    $('#modal-session').classList.add('hidden');
    $('#modal-over').classList.add('hidden');
    showScreen('game');
    UI.game.start();
    renderCoachShell();
    checkRotateHint();
  }
  function backHome() {
    if (UI.game) { UI.game.destroy(); UI.game = null; }
    $('#modal-over').classList.add('hidden'); $('#modal-session').classList.add('hidden');
    DD.renderHome && DD.renderHome();
    showScreen('home');
    checkRotateHint();
  }
  function checkRotateHint() {
    var hint = $('#rotate-hint');
    var portrait = window.innerWidth <= 700 && window.innerHeight > window.innerWidth;
    var show = portrait && !UI.settings.rotateDismissed && !!UI.game;
    hint.classList.toggle('dismissed', !!UI.settings.rotateDismissed);
    hint.classList.toggle('hidden', !show);
  }

  // ---------- 绑定 ----------
  function bind() {
    $('#btn-play').addEventListener('click', onPlay);
    $('#btn-pass').addEventListener('click', onPass);
    $('#btn-analysis-toggle').addEventListener('click', function () {
      var open = !UI.analysisOpen; setAnalysis(open);
      var st = UI.game ? UI.game.state() : null;
      if (st && st.phase === 'playing' && st.turn === HUMAN) {
        if (open && UI.advice && UI.advice.move) highlight(UI.advice.move.cards); else clearHint();
      }
    });
    $('#btn-coach-close').addEventListener('click', function (e) { e.stopPropagation(); setCoachOpen(false); });
    $('#coach-fab').addEventListener('click', function () { setCoachOpen(true); });
    $('#side-backdrop').addEventListener('click', function () { setCoachOpen(false); });
    $('#btn-counter-fold').addEventListener('click', function (e) { e.stopPropagation(); UI.settings.counterFolded = true; UI.counterOpenMobile = false; saveSettings(); if (UI.game) renderCounter(UI.game.state()); });
    $('#counter').addEventListener('click', function () { if (UI.settings.counterFolded || UI.counterOpenMobile !== true) { UI.settings.counterFolded = false; UI.counterOpenMobile = true; saveSettings(); if (UI.game) renderCounter(UI.game.state()); } });
    window.addEventListener('resize', function () {
      layoutHand(); renderCoachShell(); checkRotateHint();
      if (UI.game && !$('#screen-game').classList.contains('hidden')) renderFansOpponents(UI.game.state());
    });
    $('#btn-rotate-ok').addEventListener('click', function () { UI.settings.rotateDismissed = true; saveSettings(); checkRotateHint(); });
    $('#btn-exit').addEventListener('click', backHome);
    $('#btn-over-home').addEventListener('click', backHome);
    $('#btn-sess-home').addEventListener('click', backHome);
    $('#btn-sess-again').addEventListener('click', startGame);
    $('#btn-next').addEventListener('click', function () { $('#modal-over').classList.add('hidden'); clearPlays(); UI.selected = {}; UI.review = ''; UI.game.nextGame(); });
    $('#btn-sound-toggle').addEventListener('click', function () {
      UI.settings.sound = !UI.settings.sound; DD.SFX.enabled = UI.settings.sound; saveSettings();
      this.textContent = (UI.settings.sound ? '🔊' : '🔇') + ' 音效';
      if (UI.settings.sound) DD.SFX.play('click');
    });
    $('#btn-counter-toggle').addEventListener('click', function () {
      UI.settings.counter = !UI.settings.counter; saveSettings();
      this.textContent = '🔍 记牌器' + (UI.settings.counter ? '' : '：关');
      if (UI.game) renderCounter(UI.game.state());
    });
    $('#btn-coach-toggle').addEventListener('click', function () {
      UI.settings.coach = !UI.settings.coach; saveSettings();
      this.textContent = '🎓 教练' + (UI.settings.coach ? '' : '：关');
      renderCoachShell(); if (UI.game) renderAll(UI.game.state());
    });
    $('#btn-sort-toggle').addEventListener('click', function () {
      UI.settings.sortMode = UI.settings.sortMode === 'smart' ? 'rank' : 'smart';
      saveSettings();
      this.textContent = UI.settings.sortMode === 'smart' ? '↩ 恢复理牌' : '🔀 智能理牌';
      DD.SFX && DD.SFX.play('click');
      if (UI.game) renderHand(UI.game.state());
    });
    $('#btn-sort-toggle').textContent = UI.settings.sortMode === 'smart' ? '↩ 恢复理牌' : '🔀 智能理牌';
    $('#btn-sound-toggle').textContent = '🔊 音效';
    $('#btn-counter-toggle').textContent = '🔍 记牌器';
    $('#btn-coach-toggle').textContent = '🎓 教练';
    // 快捷键
    document.addEventListener('keydown', function (e) {
      if (!UI.game) return;
      if (!$('#modal-over').classList.contains('hidden') && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); $('#btn-next').click(); return; }
      if (!$('#modal-session').classList.contains('hidden')) return;
      var st = UI.game.state();
      if (st.phase !== 'playing' || st.turn !== HUMAN) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onPlay(); }
      else if (e.code === 'KeyP') onPass();
      else if (e.code === 'Escape') { UI.selected = {}; UI.selectedPlanKey = null; renderHand(st); updateComboLabel(st); renderPlans(UI.game.viewFor(HUMAN)); }
    });
  }

  DD.boot = function () { loadStore(); bind(); DD.renderHome && DD.renderHome(); };
  DD.startGame = startGame;
})(typeof self !== 'undefined' ? self : globalThis);
