/* =========================================================
 * 掼蛋 AI 训练营 · movegen.js
 * 先手/跟牌合法走法枚举（含逢人配补位）
 * 约定：对每个"图案"只产出一种代表性走法（用最少万能配、id 字典序最小），
 *       再按 牌型+主值 去重；跟牌 = 先手全集 过滤 beats。
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};
  var CT = DD.CT;

  // 按 needs 从 hand 抓牌（先自然后万能配；suitFlush 仅同花顺用）
  function take(hand, needs, level, suitFlush) {
    needs = needs.slice();
    var used = {}, out = [];
    var wilds = hand.filter(function (c) { return DD.isWild(c, level); });
    var normals = hand.filter(function (c) { return !DD.isWild(c, level); });
    for (var i = 0; i < needs.length; i++) {
      var v = needs[i][0], need = needs[i][1];
      for (var j = 0; j < normals.length && need > 0; j++) {
        var c = normals[j];
        if (c.v === v && !used[c.id] && (suitFlush == null || c.s === suitFlush)) {
          used[c.id] = 1; out.push(c); need--;
        }
      }
      for (var k = 0; k < wilds.length && need > 0; k++) {
        if (!used[wilds[k].id]) { used[wilds[k].id] = 1; out.push(wilds[k]); need--; }
      }
      if (need > 0) return null;
    }
    return out;
  }

  // 轴值 1 代表 A(14)
  function axisV(a) { return a === 1 ? 14 : a; }

  function push(res, cards, level) {
    if (!cards || !cards.length) return;
    var info = DD.analyze(cards, level);
    if (!info) return;
    var key = cards.map(function (c) { return c.id; }).sort().join(',');
    if (res._seen[key]) return;
    res._seen[key] = 1;
    res.push({ cards: DD.sortByLevel(cards, level), info: info });
  }

  function keyOf(a, b) { return a.type + '|' + a.len + '|' + a.main + '|' + (a.suit != null ? a.suit : '-'); }

  /** 先手全集 */
  DD.leadingMoves = function (hand, level) {
    var res = [];
    res._seen = {};
    var W = hand.filter(function (c) { return DD.isWild(c, level); });
    var w = W.length;
    var cnt = DD.countMap(hand);
    var wildCnt = {};
    W.forEach(function (c) { wildCnt[c.v] = (wildCnt[c.v] || 0) + 1; });
    // 王的自然计数不参与万能
    var natCnt = {};
    hand.forEach(function (c) {
      if (!DD.isWild(c, level)) natCnt[c.v] = (natCnt[c.v] || 0) + 1;
    });
    var vals = [];
    for (var v = 2; v <= 14; v++) if (natCnt[v]) vals.push(v);

    var i, vv;
    // ---- 四王炸 ----
    if (cnt[15] === 2 && cnt[16] === 2) {
      push(res, take(hand, [[15, 2], [16, 2]], level), level);
    }
    // ---- 炸弹（4..8 张，万能配补位）----
    for (i = 0; i < vals.length; i++) {
      vv = vals[i];
      var maxK = Math.min(8, natCnt[vv] + w);
      for (var k = 4; k <= maxK; k++) {
        var needN = Math.max(0, k - natCnt[vv]);
        if (needN > w) continue;
        var cardsB = take(hand, [[vv, k]], level);
        if (cardsB) push(res, cardsB, level);
      }
    }
    // ---- 顺子 / 同花顺（5 连）----
    var i2;
    for (i2 = 0; i2 < 2; i2++) { // 两轮：0=普通顺，1=同花顺（若自然同花则覆盖）
    }
    for (var start = 1; start <= 10; start++) {
      if (!DD.RULES.a2345 && start === 1) continue;
      var run = [];
      for (var p = start; p < start + 5; p++) run.push([axisV(p), 1]);
      var cS = take(hand, run, level);
      if (!cS) continue;
      // 若自然部分全同花 → 同花顺；否则普通顺
      var natSel = cS.filter(function (c) { return !DD.isWild(c, level); });
      var flushSuit = -1;
      if (natSel.length) {
        var s0 = natSel[0].s, same = natSel.every(function (c) { return c.s === s0; });
        if (same) flushSuit = s0;
      }
      push(res, cS, level); // analyze 会正确归类 FLUSH/STRAIGHT
    }
    // ---- 连对（3..7 组）----
    for (var gn = 3; gn <= 7; gn++) {
      for (var st2 = 1; st2 + gn - 1 <= 14; st2++) {
        if (!DD.RULES.a2345 && st2 === 1) continue;
        var need = [];
        for (var q = st2; q < st2 + gn; q++) need.push([axisV(q), 2]);
        var cardsD = take(hand, need, level);
        if (cardsD) push(res, cardsD, level);
      }
    }
    // ---- 钢板（2..5 组三同张）----
    for (var g3 = 2; g3 <= 5; g3++) {
      for (var st3 = 1; st3 + g3 - 1 <= 14; st3++) {
        if (!DD.RULES.a2345 && st3 === 1) continue;
        var need3 = [];
        for (var r = st3; r < st3 + g3; r++) need3.push([axisV(r), 3]);
        var cardsT = take(hand, need3, level);
        if (cardsT) push(res, cardsT, level);
      }
    }
    // ---- 三同张 / 三带二 ----
    for (i = 0; i < vals.length; i++) {
      vv = vals[i];
      var c = natCnt[vv];
      for (var m = 0; m <= w; m++) {
        if (c + m === 3) {
          var t3 = take(hand, [[vv, 3]], level);
          if (t3) push(res, t3, level);
        }
      }
      if (c + w >= 3) {
        // 三带二：找一个对子带牌
        var tri = take(hand, [[vv, 3]], level);
        if (!tri) continue;
        for (var pv = 2; pv <= 14; pv++) {
          if (pv === vv) continue;
          var pc2 = natCnt[pv] || 0;
          var leftW = w - Math.max(0, 3 - c);
          if (pc2 >= 2 && leftW === 0) {
            var c5 = take(hand, [[vv, 3], [pv, 2]], level);
            push(res, c5, level);
          } else if (pc2 === 1 && leftW >= 1) {
            var c5b = take(hand, [[vv, 3], [pv, 2]], level);
            push(res, c5b, level);
          }
        }
      }
    }
    // ---- 对子 ----
    for (i = 0; i < vals.length; i++) {
      vv = vals[i];
      var c2 = natCnt[vv];
      if (c2 >= 2) { var pr = take(hand, [[vv, 2]], level); push(res, pr, level); }
      else if (c2 === 1 && w >= 1) { var pr2 = take(hand, [[vv, 2]], level); push(res, pr2, level); }
    }
    // ---- 单张（每个不同面各一张代表；王同）----
    var seenS = {};
    hand.forEach(function (c) {
      if (seenS[c.v]) return;
      seenS[c.v] = 1;
      push(res, [c], level);
    });

    // 去重：同 牌型+主值 只保留最早一个（即最小 wild 用量的）
    var byKey = {};
    var out = [];
    for (i = 0; i < res.length; i++) {
      var k = keyOf(res[i].info);
      if (byKey[k]) continue;
      byKey[k] = 1;
      out.push(res[i]);
    }
    return out;
  };

  /** 跟牌全集（同型更大 / 炸弹族） */
  DD.followMoves = function (hand, level, lastPlay) {
    var all = DD.leadingMoves(hand, level);
    var out = all.filter(function (m) { return DD.beats(m.info, lastPlay.info); });
    return out;
  };

  DD.legalMoves = function (hand, level, lastPlay) {
    return lastPlay ? DD.followMoves(hand, level, lastPlay) : DD.leadingMoves(hand, level);
  };
})(typeof self !== 'undefined' ? self : globalThis);
