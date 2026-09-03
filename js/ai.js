/* =========================================================
 * 掼蛋 AI 训练营 · ai.js
 * 1) decomposeGuandan：手牌拆解（估算"几手出完"，含万能配）
 * 2) botPlay：三档难度 BOT（入门/进阶/高手），含队友配合
 * 3) bestPlay：高手决策（advisor 复用）
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};
  var CT = DD.CT;

  function without(hand, cards) {
    var ids = {};
    cards.forEach(function (c) { ids[c.id] = 1; });
    return hand.filter(function (c) { return !ids[c.id]; });
  }

  /** 近似拆解：返回组合数（估算手数），吃牌优先级：四王炸→炸弹→同花顺→钢板→连对→顺→三带二→三张→对→单 */
  DD.decomposeGuandan = function (hand, level) {
    hand = hand.slice();
    var wilds = hand.filter(function (c) { return DD.isWild(c, level); });
    var naturals = hand.filter(function (c) { return !DD.isWild(c, level); });
    var natCnt = DD.countMap(naturals);
    var jokers = hand.filter(function (c) { return c.v >= 15; });
    var comboN = 0;

    function removeOf(v, num) {
      var ids = {};
      var got = 0;
      for (var i = 0; i < naturals.length && got < num; i++) {
        if (naturals[i].v === v && !ids[naturals[i].id]) { ids[naturals[i].id] = 1; got++; }
      }
      // 不够则用万能配补
      for (var k = 0; k < wilds.length && got < num; k++) {
        if (!ids[wilds[k].id]) { ids[wilds[k].id] = 1; got++; }
      }
      naturals = naturals.filter(function (c) { return !ids[c.id]; });
      wilds = wilds.filter(function (c) { return !ids[c.id]; });
      natCnt = DD.countMap(naturals);
    }

    // 四王炸
    if (jokers.length === 4) { comboN++; }
    jokers.forEach(function () { }); // 占位（王已被排除在 naturals 外）

    // 炸弹（自然 4 张及以上；不足 4 但可配到 4 的也纳入）
    for (var v = 2; v <= 14; v++) {
      var c = natCnt[v] || 0;
      if (c + wilds.length >= 4 && c >= 1) {
        var take = Math.max(4, c);
        if (c >= 4) { comboN++; removeOf(v, c); }
      }
    }

    // 同花顺/顺子/钢板/连对近似：顺子与同花顺都按"5 连单牌"估算消耗，
    // 与配对/三张互斥，属于粗略估计（仅用于"几手"提示与领出比较）
    // 钢板：连续 ≥2 组三张
    function longest(cntMin, minRun) {
      var bestRun = null, run = null;
      for (var vv = 2; vv <= 15; vv++) {
        var c = vv <= 14 ? (natCnt[vv] || 0) : 0;
        if (c >= cntMin) { if (!run) run = []; run.push(vv); }
        else { if (run && run.length >= minRun && (!bestRun || run.length > bestRun.length)) bestRun = run; run = null; }
      }
      if (run && run.length >= minRun && (!bestRun || run.length > bestRun.length)) bestRun = run;
      return bestRun;
    }
    function consumeRun(arr, per) {
      comboN++;
      arr.forEach(function (vv) { removeOf(vv, per); });
    }
    var tripleRun;
    while ((tripleRun = longest(3, 2)) && tripleRun.length >= 2) {
      consumeRun(tripleRun.slice(0, Math.min(tripleRun.length, 3)), 3);
    }
    // 连对
    var pairRun;
    while ((pairRun = longest(2, 3)) && pairRun.length >= 3) {
      consumeRun(pairRun.slice(0, Math.min(pairRun.length, 5)), 2);
    }
    // 顺子（只吃剩余可组成 5 连的值，每个值一张）
    var singleRun;
    while ((singleRun = longest(1, 5))) {
      consumeRun(singleRun.slice(0, 5), 1);
    }
    // 三带二 / 三张 / 对 / 单
    for (var v2 = 2; v2 <= 14; v2++) {
      var c2 = natCnt[v2] || 0;
      while (c2 >= 3) { removeOf(v2, 3); comboN++; c2 = natCnt[v2] || 0; }
    }
    // 剩余配对
    for (var v3 = 2; v3 <= 14; v3++) {
      var c3 = natCnt[v3] || 0;
      while (c3 >= 2) { removeOf(v3, 2); comboN++; c3 = natCnt[v3] || 0; }
    }
    var singles = naturals.length + wilds.length;
    // 万能配并入单张（尽量补对/三已在前面处理）
    comboN += singles;
    return { combos: comboN, hands: comboN };
  };

  function enemyMin(view) {
    var mn = 99;
    view.players.forEach(function (p) {
      if (p.team === view.me.team) return;
      if (p.finished) return;
      if (p.count < mn) mn = p.count;
    });
    return mn;
  }
  function partnerTop(view, idx) {
    // 最近一手是否来自队友
    return view.lastPlay && view.players[view.lastPlay.playerIdx].team === view.me.team;
  }

  function isBombInfo(info) {
    return info.type === 'BOMB' || info.type === 'FLUSH' || info.type === 'FOUR_JOKER';
  }

  function cheapest(moves) {
    var b = null;
    moves.forEach(function (m) {
      if (isBombInfo(m.info)) return;
      if (!b || m.info.main < b.info.main || (m.info.main === b.info.main && m.cards.length < b.cards.length)) b = m;
    });
    if (!b) b = moves[0];
    return b;
  }
  function biggest(moves) {
    var b = moves[0];
    moves.forEach(function (m) { if (m.info.main > b.info.main || (m.info.main === b.info.main && m.cards.length > b.cards.length)) b = m; });
    return b;
  }

  /** 高手推荐（advisor 使用） */
  DD.bestPlay = function (view) {
    var hand = view.me.hand, level = view.level;
    var moves = DD.legalMoves(hand, level, view.lastPlay);
    if (!moves.length) return { move: null, reason: 'NONE' };
    // 一手跑完
    for (var i = 0; i < moves.length; i++) if (moves[i].cards.length === hand.length) return { move: moves[i], reason: 'WIN' };

    var meTeam = view.me.team;
    var last = view.lastPlay;
    if (!last) {
      // 领出：挑"出完剩手最少"的普通牌型
      var best = null, score = 1e9;
      moves.forEach(function (m) {
        if (isBombInfo(m.info)) return;
        var rest = DD.decomposeGuandan(without(hand, m.cards), level).hands;
        var sc = rest * 100 - m.cards.length * 3 + m.info.main;
        if (sc < score) { score = sc; best = m; }
      });
      if (!best) best = moves[0];
      return { move: best, reason: 'LEAD' };
    }
    var enemy = !(view.players[last.playerIdx].team === meTeam);
    var myMin = hand.length;
    var eMin = enemyMin(view);
    var canBomb = moves.some(function (m) { return isBombInfo(m.info); });

    if (!enemy) {
      // 队友出的牌：除非自己能一手跑完，否则不压
      for (var j = 0; j < moves.length; j++) if (moves[j].cards.length === hand.length) return { move: moves[j], reason: 'WIN' };
      return { move: null, reason: 'PASS_PARTNER' };
    }
    // 对手出的牌
    var normals = moves.filter(function (m) { return !isBombInfo(m.info); });
    if (!normals.length) {
      // 只能炸
      if (eMin <= 3 || myMin <= 4) {
        var bm = moves.filter(function (m) { return isBombInfo(m.info); }).sort(function (a, b2) { return bombRank(a) - bombRank(b2); });
        return { move: bm[0], reason: 'BOMB' };
      }
      return { move: null, reason: 'SAVE' };
    }
    if (eMin <= 2) {
      return { move: biggest(normals), reason: 'SUPPRESS' };
    }
    return { move: cheapest(normals), reason: 'BEAT' };
  };

  function bombRank(m) {
    if (m.info.type === 'FOUR_JOKER') return 100;
    if (m.info.type === 'FLUSH') return 60;
    return m.info.len;
  }

  /** 三档难度出牌 */
  DD.botPlay = function (view, difficulty) {
    var hand = view.me.hand, level = view.level;
    var moves = DD.legalMoves(hand, level, view.lastPlay);
    if (!moves.length) return { move: null, reason: 'NONE' };
    // 领出位不允许"过"（规则上无牌可压时必须领出）
    function forceLead(r) {
      if (!view.lastPlay && !r.move) r = { move: moves[0], reason: 'FORCE_LEAD' };
      return r;
    }

    if (difficulty === 'easy') {
      for (var i = 0; i < moves.length; i++) if (moves[i].cards.length === hand.length) return { move: moves[i], reason: 'WIN' };
      if (view.lastPlay && Math.random() < 0.28) return { move: null, reason: 'RANDOM_PASS' };
      return { move: moves[Math.floor(Math.random() * moves.length)], reason: 'RANDOM' };
    }
    if (difficulty === 'medium') {
      var bp = DD.bestPlay(view);
      if (bp.move && bp.reason === 'SAVE' && Math.random() < 0.4) {
        // 进阶偶尔也忍
        return forceLead({ move: null, reason: 'SAVE' });
      }
      return forceLead(bp);
    }
    return forceLead(DD.bestPlay(view));
  };
})(typeof self !== 'undefined' ? self : globalThis);
