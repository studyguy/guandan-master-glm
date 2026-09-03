/* =========================================================
 * 掼蛋 AI 训练营 · combos.js
 * 掼蛋牌型识别 analyze / 大小比较 beats
 *
 * 牌型：单张 / 对子 / 三同张 / 三带二 / 顺子(5) / 连对(≥3对) /
 *       钢板(≥2组连续三同张) / 炸弹(4~8同点) / 同花顺(5同花连) /
 *       四王炸(2大2小)
 *
 * 万能配（逢人配 = 红桃级牌，一副两张）在 analyze 时按"可被替代为
 * 除大小王外任意牌"处理；单张按自然级牌，参与顺/同花/炸弹等按需补位。
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};

  DD.CT = {
    SINGLE: 'SINGLE', PAIR: 'PAIR', TRIPLE: 'TRIPLE', TRIPLE_PAIR: 'TRIPLE_PAIR',
    STRAIGHT: 'STRAIGHT', DSTRAIGHT: 'DSTRAIGHT', TRIPLE_SEQ: 'TRIPLE_SEQ',
    BOMB: 'BOMB', FLUSH: 'FLUSH', FOUR_JOKER: 'FOUR_JOKER'
  };
  DD.CT_NAME = {
    SINGLE: '单张', PAIR: '对子', TRIPLE: '三同张', TRIPLE_PAIR: '三带二',
    STRAIGHT: '顺子', DSTRAIGHT: '连对', TRIPLE_SEQ: '钢板',
    BOMB: '炸弹', FLUSH: '同花顺', FOUR_JOKER: '四王炸'
  };

  // 炸弹压制档位：四王炸 > 8炸 > 7炸 > 6炸 > 同花顺 > 5炸 > 4炸
  function specialRank(t, len) {
    if (t === 'FOUR_JOKER') return 100;
    if (t === 'FLUSH') return 93;
    if (t === 'BOMB') return 82 + len * 2; // 4→90,5→92,6→94,7→96,8→98；夹住同花顺93
    return 0;
  }

  // ---- 工具：连线的值域（A 可作 1 或 14） ----
  function lineOf(cards) { return cards.map(function (c) { return c.v; }); }

  // 判定给定"物理点数序列"是否为 5 个连续（允许 A=1 或 14 端点），返回 {minVal,maxVal} 或 null
  function runWindow(vals) {
    var uniq = Array.from(new Set(vals)).sort(function (a, b) { return a - b; });
    if (uniq.length !== vals.length) return null; // 顺/同花顺不允许重复点数
    var n = uniq.length;
    var lo = uniq[0], hi = uniq[n - 1];
    if (hi - lo === n - 1) return { lo: lo, hi: hi };
    // A(14) 作 1 的低端：如 14,2,3,4,5
    if (DD.RULES.a2345 && uniq[0] === 2 && uniq[n - 1] === 14) {
      var rest = uniq.slice(1, n - 1);
      var ok = true;
      for (var i = 1; i < rest.length; i++) if (rest[i] !== rest[i - 1] + 1) ok = false;
      if (ok && rest[0] === 3 && rest[rest.length - 1] === n - 1) { // 2..? 中间连续
        return { lo: 1, hi: uniq[n - 2], aLow: true };
      }
      // 14,2,3,4,5 → rest=[2,3,4]
      if (rest[0] === 2) return { lo: 1, hi: n - 2, aLow: true };
    }
    return null;
  }
  DD._runWindow = runWindow;

  /**
   * 识别掼蛋牌型。
   * @param {Array} cards
   * @param {number} level 当前级牌（2..14）
   * @returns {null|{type, main, len?, suit?, high?, comboName, wild}}
   *   main 用于同型比较（有效大小）；len 语义随牌型：
   *   连对/钢板=组数，炸弹=张数
   */
  DD.analyze = function (cards, level) {
    level = level || 2;
    var n = cards.length;
    if (!n) return null;
    var wild = cards.filter(function (c) { return DD.isWild(c, level); });
    var nat = cards.filter(function (c) { return !DD.isWild(c, level); });
    var w = wild.length, natCnt = DD.countMap(nat);

    function mk(type, main, extra) {
      var r = { type: type, main: main, wild: w };
      if (extra) for (var k in extra) r[k] = extra[k];
      r.comboName = DD.CT_NAME[type];
      return r;
    }

    // ---------- 王相关（先于万能配，因为万能配不能代替王） ----------
    var jk = cards.filter(function (c) { return c.v >= 15; });
    if (jk.length) {
      if (cards.length !== jk.length) return null; // 王不能与普通牌混搭（除四王炸本身）
      var cntJ = DD.countMap(jk);
      if (cntJ[16] === 2 && cntJ[15] === 2) return mk('FOUR_JOKER', 100, { len: 4 });
      if (n === 1) return mk('SINGLE', DD.effOf(jk[0].v, level), { rank: jk[0].v });
      if (DD.RULES.jokerPair && n === 2 && (cntJ[15] === 2 || cntJ[16] === 2)) {
        return mk('PAIR', DD.effOf(jk[0].v, level), { rank: jk[0].v });
      }
      return null; // 3 王、1大1小等非法
    }

    // ---------- 万能配可用张数约束（总配数 ≤2） ----------
    var wMax = w;

    function fillNeeds(needs) { // needs: {value:need}
      var used = 0;
      for (var v in needs) {
        var c = natCnt[Number(v)] || 0;
        if (c < needs[v]) used += needs[v] - c;
      }
      return used;
    }

    // 是否有某个自然对 / 三张基础
    function bestGroup(minN, per) {
      // 返回 自然张数最多、点数最接近某值的候选
      var best = null;
      for (var v = 2; v <= 14; v++) {
        var c = natCnt[v] || 0;
        if (c >= minN) { if (!best || c > best.c || (c === best.c && v > best.v)) best = { v: v, c: c }; }
      }
      return best;
    }

    // ===== 炸弹：全牌同点（4..8 张），万能配补位 =====
    if (n >= 4 && n <= 8) {
      var keys = Object.keys(natCnt).map(Number);
      if (keys.length <= 1) {
        var bv = keys.length ? keys[0] : 2; // 若全为配（不允许，需 ≥1 自然）
        if (keys.length === 0) return null;
        if (natCnt[bv] + w === n) return mk('BOMB', DD.effOf(bv, level), { len: n, rank: bv });
      }
    }

    // ===== 连牌族（顺/连对/钢板/同花顺）=====
    // 收集候选窗口；顺子与同花顺长度为 5；连对为 [3..7] 组；钢板为 [2..6] 组
    var windows = [];
    for (var start = 1; start <= 10; start++) { // 线段 1..14
      for (var end = Math.max(start, start + 4); end <= 14; end++) {
        var len = end - start + 1;
        if (len >= 5 && len <= 14) windows.push([start, end]);
      }
    }

    function windowPhys(wnd, i) {
      var val = wnd[0] + i;
      return val === 1 ? 14 : val; // 线段值 1 代表 A(14)
    }

    // 试：连牌（unitCount 每组张数；长度 = 组数）
    function tryRun(unitCount, needGroups, cardsNeed) {
      if (n !== cardsNeed) return null;
      var per = unitCount; // 每组需 per 张同点
      for (var wi = 0; wi < windows.length; wi++) {
        var wnd = windows[wi];
        if (!DD.RULES.a2345 && wnd[0] === 1) continue; // 不允许 A 作 1
        var groups = wnd[1] - wnd[0] + 1;
        if (groups !== needGroups) continue;
        var needs = {};
        for (var k = 0; k < groups; k++) needs[windowPhys(wnd, k)] = per;
        // 自然牌必须全部落在窗口需求内（不允许窗口外剩余）
        var used = 0, ok = true;
        for (var v2 = 2; v2 <= 14; v2++) {
          var c = natCnt[v2] || 0;
          var need = needs[v2] || 0;
          if (c > need) { ok = false; break; }
          if (c < need) used += need - c;
        }
        if (!ok) continue;
        if (used > wMax) continue;
        if (wMax - used > 0) { // 窗口已满仍有剩余万能配 → 无法用掉，非法（配不能单独出）
          continue;
        }
        var physHi = windowPhys(wnd, groups - 1);
        var hiEff = DD.effOf(physHi, level);
        if (unitCount === 1 && groups === 5) {
          // 顺子 或 同花顺：自然部分若全同花则为同花顺，否则普通顺
          var flushSuit = -1;
          if (nat.length) {
            var s0 = nat[0].s, same = nat.every(function (c) { return c.s === s0; });
            flushSuit = same ? s0 : -1;
          }
          return mk(flushSuit >= 0 ? 'FLUSH' : 'STRAIGHT', hiEff,
            { len: 5, suit: flushSuit, high: physHi, low: windowPhys(wnd, 0) });
        }
        if (unitCount === 2) {
          return mk('DSTRAIGHT', hiEff, { len: groups, low: windowPhys(wnd, 0), high: physHi });
        }
        if (unitCount === 3) {
          return mk('TRIPLE_SEQ', hiEff, { len: groups, low: windowPhys(wnd, 0), high: physHi });
        }
      }
      return null;
    }

    // 顺子 5
    if (n === 5 && w + nat.length === 5) {
      var st = tryRun(1, 5, 5);
      if (st) return st;
    }
    // 连对（≥3 组对）
    for (var g2 = 3; g2 <= 7; g2++) {
      if (n === g2 * 2) {
        var ds = tryRun(2, g2, g2 * 2);
        if (ds) return ds;
      }
    }
    // 钢板（≥2 组三同张）
    for (var g3 = 2; g3 <= 5; g3++) {
      if (n === g3 * 3) {
        var ts = tryRun(3, g3, g3 * 3);
        if (ts) return ts;
      }
    }

    // ===== 三同张 / 三带二 =====
    if (n === 3) {
      for (var tv = 2; tv <= 14; tv++) {
        var tc = natCnt[tv] || 0;
        if (tc >= 1 && tc <= 3 && tc + w === 3) return mk('TRIPLE', DD.effOf(tv, level), { rank: tv });
      }
      return null;
    }
    if (n === 5) {
      // 主三张(可配) + 一个对子(可配)；带牌不能是王（王已在前面拦截）
      for (var tv2 = 2; tv2 <= 14; tv2++) {
        var t2c = natCnt[tv2] || 0;
        if (t2c < 1 || t2c > 3) continue;
        var mw = 3 - t2c;
        if (mw > w) continue;
        var pw = w - mw;
        var pairVal = -1, pairCnt = 0;
        for (var vv = 2; vv <= 14; vv++) {
          if (vv === tv2) continue;
          var cv = natCnt[vv] || 0;
          if (cv > 0) { if (pairVal >= 0) pairVal = -2; else { pairVal = vv; pairCnt = cv; } }
        }
        if (pairVal < 0) continue; // 没有带牌值 或 多余两种带牌
        var pairOK = (pairCnt === 2 && pw === 0) || (pairCnt === 1 && pw === 1);
        if (pairOK) return mk('TRIPLE_PAIR', DD.effOf(tv2, level), { rank: tv2 });
      }
      return null;
    }

    // ===== 对子 / 单张 =====
    if (n === 2) {
      for (var pv = 2; pv <= 14; pv++) {
        var pc = natCnt[pv] || 0;
        if (pc === 2 || (pc === 1 && w === 1)) return mk('PAIR', DD.effOf(pv, level), { rank: pv });
      }
      return null;
    }
    if (n === 1) {
      var c0 = cards[0];
      return mk('SINGLE', DD.effOf(c0.v, level), { rank: c0.v });
    }
    return null;
  };

  /** a 能否压过 b */
  DD.beats = function (a, b) {
    if (!a) return false;
    if (!b) return true;
    var ra = specialRank(a.type, a.len), rb = specialRank(b.type, b.len);
    var aBomb = a.type === 'BOMB' || a.type === 'FLUSH' || a.type === 'FOUR_JOKER';
    var bBomb = b.type === 'BOMB' || b.type === 'FLUSH' || b.type === 'FOUR_JOKER';
    if (aBomb || bBomb) {
      if (ra !== rb) return ra > rb;
      if (a.type === 'BOMB' && b.type === 'BOMB') return a.main > b.main;
      if (a.type === 'FLUSH' && b.type === 'FLUSH') {
        if (a.main !== b.main) return a.main > b.main;
        var sp = { 0: 4, 1: 3, 2: 2, 3: 1 }; // ♠>♥>♣>♦
        return (sp[a.suit] || 0) > (sp[b.suit] || 0);
      }
      return a.main > b.main;
    }
    if (a.type !== b.type) return false;
    if (a.type === 'SINGLE' || a.type === 'PAIR' || a.type === 'TRIPLE' || a.type === 'TRIPLE_PAIR') {
      return a.main > b.main;
    }
    // 顺子/同花顺/连对/钢板：同长度比主值
    return a.type === b.type && a.len === b.len && a.main > b.main;
  };

  /** 牌型中文名，供界面展示 */
  DD.moveLabel = function (info) {
    if (!info) return '不出';
    var RN = DD.RANK_NAME;
    function pt(v) { return v === 14 ? 'A' : RN[v]; }
    switch (info.type) {
      case 'FOUR_JOKER': return '四王炸';
      case 'BOMB': return info.len + '张炸（' + pt(info.rank) + '）';
      case 'FLUSH': return '同花顺 ' + pt(info.low) + '-' + pt(info.high);
      case 'SINGLE': return '单张 ' + pt(info.rank);
      case 'PAIR': return '对 ' + pt(info.rank);
      case 'TRIPLE': return '三张 ' + pt(info.rank);
      case 'TRIPLE_PAIR': return '三带二（' + pt(info.rank) + '）';
      case 'STRAIGHT': return '顺子 ' + pt(info.low) + '-' + pt(info.high);
      case 'DSTRAIGHT': return info.len + '连对 ' + pt(info.low) + '-' + pt(info.high);
      case 'TRIPLE_SEQ': return info.len + '连钢板 ' + pt(info.low) + '-' + pt(info.high);
      default: return DD.CT_NAME[info.type] || '?';
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
