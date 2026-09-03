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

  // ===== 高手难度：小残局精确搜索（忽略对手干扰的上限规划） =====
  // 把手牌折算成 点数→张数（王单独计 J15/J16）
  function countByV(cards) {
    var cnt = {};
    cards.forEach(function (c) {
      var key = c.s < 0 ? 'J' + c.v : c.v;
      cnt[key] = (cnt[key] || 0) + 1;
    });
    return cnt;
  }
  function stateKey(cnt) {
    var ks = [];
    for (var v = 2; v <= 14; v++) ks.push(cnt[v] || 0);
    ks.push(cnt['J15'] || 0, cnt['J16'] || 0);
    return ks.join(',');
  }
  function cntTake(cnt, v, n) {
    if (!(cnt[v] >= n)) return false;
    cnt[v] -= n;
    return true;
  }
  function cntRestore(cnt, v, n) { cnt[v] = (cnt[v] || 0) + n; }

  /** 最少几手出完（记忆化 DFS；hand ≤ 10 张时调用，节点预算防失控） */
  DD.minHandsExact = function (cards, level) {
    var cnt = {};
    cards.forEach(function (c) {
      var key = c.s < 0 ? 'J' + c.v : c.v;
      cnt[key] = (cnt[key] || 0) + 1;
    });
    var memo = {};
    var budget = { n: 60000 };
    function dfs(st) {
      var key = stateKey(st);
      if (memo[key] != null) return memo[key];
      if (budget.n-- <= 0) return 99;
      // 剩余牌总数
      var total = 0, v;
      for (v = 2; v <= 14; v++) total += st[v] || 0;
      total += (st['J15'] || 0) + (st['J16'] || 0);
      if (total === 0) { memo[key] = 0; return 0; }
      var best = 99;
      function tryHand(take, undo) {
        take();
        var sub = dfs(st);
        if (1 + sub < best) best = 1 + sub;
        undo();
      }
      // 同点数 1/2/3 张 或 炸弹（≥4 全出）
      for (v = 2; v <= 14; v++) {
        var n = st[v] || 0;
        if (n >= 1) (function (vv) { tryHand(function () { cntTake(st, vv, 1); }, function () { cntRestore(st, vv, 1); }); })(v);
        if (n >= 2) (function (vv) { tryHand(function () { cntTake(st, vv, 2); }, function () { cntRestore(st, vv, 2); }); })(v);
        if (n >= 3) (function (vv) { tryHand(function () { cntTake(st, vv, 3); }, function () { cntRestore(st, vv, 3); }); })(v);
        if (n >= 4) (function (vv, all) { tryHand(function () { cntTake(st, vv, all); }, function () { cntRestore(st, vv, all); }); })(v, n);
      }
      // 顺子（5 连，含 A2345）
      for (var lo = 3; lo <= 10; lo++) {
        if (st[lo] && st[lo + 1] && st[lo + 2] && st[lo + 3] && st[lo + 4]) {
          [lo, lo + 1, lo + 2, lo + 3, lo + 4].forEach(function (vv) { cntTake(st, vv, 1); });
          tryHand(function () {}, function () {});
          [lo, lo + 1, lo + 2, lo + 3, lo + 4].forEach(function (vv) { cntRestore(st, vv, 1); });
        }
      }
      if (st[14] && st[2] && st[3] && st[4] && st[5]) {
        [14, 2, 3, 4, 5].forEach(function (vv) { cntTake(st, vv, 1); });
        tryHand(function () {}, function () {});
        [14, 2, 3, 4, 5].forEach(function (vv) { cntRestore(st, vv, 1); });
      }
      // 连对（≥3 连续点数，各出 2）
      var L;
      for (L = 3; L <= 8; L++) {
        for (lo = 3; lo + L - 1 <= 14; lo++) {
          var okRun = true;
          for (v = lo; v < lo + L; v++) if (!(st[v] >= 2)) { okRun = false; break; }
          if (okRun) {
            (function (lo2, L2) {
              for (v = lo2; v < lo2 + L2; v++) cntTake(st, v, 2);
              tryHand(function () {}, function () {});
              for (v = lo2; v < lo2 + L2; v++) cntRestore(st, v, 2);
            })(lo, L);
          }
        }
      }
      // 钢板（≥2 连续点数，各出 3）
      for (L = 2; L <= 4; L++) {
        for (lo = 3; lo + L - 1 <= 14; lo++) {
          var ok3 = true;
          for (v = lo; v < lo + L; v++) if (!(st[v] >= 3)) { ok3 = false; break; }
          if (ok3) {
            (function (lo2, L2) {
              for (v = lo2; v < lo2 + L2; v++) cntTake(st, v, 3);
              tryHand(function () {}, function () {});
              for (v = lo2; v < lo2 + L2; v++) cntRestore(st, v, 3);
            })(lo, L);
          }
        }
      }
      // 三带二
      for (v = 2; v <= 14; v++) {
        if (!(st[v] >= 3)) continue;
        for (var w = 2; w <= 14; w++) {
          if (w === v || !(st[w] >= 2)) continue;
          cntTake(st, v, 3); cntTake(st, w, 2);
          tryHand(function () {}, function () {});
          cntRestore(st, v, 3); cntRestore(st, w, 2);
        }
      }
      // 四王炸
      if ((st['J15'] || 0) >= 2 && (st['J16'] || 0) >= 2) {
        st['J15'] -= 2; st['J16'] -= 2;
        tryHand(function () {}, function () {});
        st['J15'] += 2; st['J16'] += 2;
      }
      // 王单张
      if (st['J15'] >= 1) { st['J15'] -= 1; tryHand(function () {}, function () {}); st['J15'] += 1; }
      if (st['J16'] >= 1) { st['J16'] -= 1; tryHand(function () {}, function () {}); st['J16'] += 1; }
      memo[key] = best;
      return best;
    }
    function dfs(st) {
      var key = stateKey(st);
      if (memo[key] != null) return memo[key];
      if (budget.n-- <= 0) return 99;
      var total = 0, v;
      for (v = 2; v <= 14; v++) total += st[v] || 0;
      total += (st['J15'] || 0) + (st['J16'] || 0);
      if (total === 0) { memo[key] = 0; return 0; }
      var best = 99;
      // 同点数 1/2/3 张 或 炸弹（≥4 全出）
      for (v = 2; v <= 14; v++) {
        var n = st[v] || 0;
        if (n >= 1 && best > 1) { st[v] = n - 1; var sub = dfs(st); st[v] = n; if (1 + sub < best) best = 1 + sub; }
        if (n >= 2 && best > 2) { st[v] = n - 2; sub = dfs(st); st[v] = n; if (2 + sub < best) best = 2 + sub; }
        if (n >= 3 && best > 3) { st[v] = n - 3; sub = dfs(st); st[v] = n; if (3 + sub < best) best = 3 + sub; }
        if (n >= 4) { st[v] = 0; sub = dfs(st); st[v] = n; if (1 + sub < best) best = 1 + sub; }
      }
      // 顺子（5 连，含 A2345）
      var lo, v2, i2, seg;
      for (lo = 3; lo <= 10; lo++) {
        var okS = true;
        for (v2 = lo; v2 < lo + 5; v2++) if (!(st[v2] >= 1)) { okS = false; break; }
        if (okS) {
          seg = [lo, lo + 1, lo + 2, lo + 3, lo + 4];
          seg.forEach(function (vv) { st[vv]--; });
          var s1 = dfs(st);
          seg.forEach(function (vv) { st[vv]++; });
          if (1 + s1 < best) best = 1 + s1;
        }
      }
      if (st[14] && st[2] && st[3] && st[4] && st[5]) {
        st[14]--; st[2]--; st[3]--; st[4]--; st[5]--;
        var s2 = dfs(st);
        st[14]++; st[2]++; st[3]++; st[4]++; st[5]++;
        if (1 + s2 < best) best = 1 + s2;
      }
      // 连对（≥3 连续点数，各出 2）
      for (var L = 3; L <= 8; L++) {
        for (lo = 3; lo + L - 1 <= 14; lo++) {
          var okP = true;
          for (v2 = lo; v2 < lo + L; v2++) if (!(st[v2] >= 2)) { okP = false; break; }
          if (okP) {
            for (v2 = lo; v2 < lo + L; v2++) st[v2] -= 2;
            var s3 = dfs(st);
            for (v2 = lo; v2 < lo + L; v2++) st[v2] += 2;
            if (1 + s3 < best) best = 1 + s3;
          }
        }
      }
      // 钢板（≥2 连续点数，各出 3）
      for (var M = 2; M <= 4; M++) {
        for (lo = 3; lo + M - 1 <= 14; lo++) {
          var okT = true;
          for (v2 = lo; v2 < lo + M; v2++) if (!(st[v2] >= 3)) { okT = false; break; }
          if (okT) {
            for (v2 = lo; v2 < lo + M; v2++) st[v2] -= 3;
            var s4 = dfs(st);
            for (v2 = lo; v2 < lo + M; v2++) st[v2] += 3;
            if (1 + s4 < best) best = 1 + s4;
          }
        }
      }
      // 三带二
      for (v = 2; v <= 14; v++) {
        if (!(st[v] >= 3)) continue;
        for (var w = 2; w <= 14; w++) {
          if (w === v || !(st[w] >= 2)) continue;
          st[v] -= 3; st[w] -= 2;
          var s5 = dfs(st);
          st[v] += 3; st[w] += 2;
          if (1 + s5 < best) best = 1 + s5;
        }
      }
      // 四王炸
      if ((st['J15'] || 0) >= 2 && (st['J16'] || 0) >= 2) {
        st['J15'] -= 2; st['J16'] -= 2;
        var s6 = dfs(st);
        st['J15'] += 2; st['J16'] += 2;
        if (1 + s6 < best) best = 1 + s6;
      }
      // 王单张
      if (st['J15'] >= 1) { st['J15'] -= 1; var a1 = dfs(st); st['J15'] += 1; if (1 + a1 < best) best = 1 + a1; }
      if (st['J16'] >= 1) { st['J16'] -= 1; var a2 = dfs(st); st['J16'] += 1; if (1 + a2 < best) best = 1 + a2; }
      memo[key] = best;
      return best;
    }
    return dfs(cnt);
  };

  /** 其他玩家手中还可能存在的更大压制牌（估算：总8张 - 已打出 - 我手里的） */
  function higherLeftOf(mainV, level, played, myCnt) {
    var eff = DD.effOf(mainV, level);
    var left = 0;
    for (var vv = 2; vv <= 16; vv++) {
      var effV = DD.effOf(vv, level);
      if (effV <= eff) continue;
      var total = vv >= 15 ? 2 : 8;
      left += Math.max(0, total - (played[vv] || 0) - (myCnt[vv] || 0));
    }
    return left;
  }
  /** 对手还能组成更大同型牌的估算（对/三：向下取整凑组） */
  function higherComboLeft(mainV, level, played, myCnt, per) {
    var eff = DD.effOf(mainV, level);
    var left = 0;
    for (var vv = 2; vv <= 16; vv++) {
      var effV = DD.effOf(vv, level);
      if (effV <= eff) continue;
      var total = vv >= 15 ? 2 : 8;
      left += Math.max(0, Math.floor((total - (played[vv] || 0) - (myCnt[vv] || 0)) / per));
    }
    return left;
  }

  /**
   * 智能理牌（仅用于展示排序，不影响出牌校验）：
   * 组顺序 王 → 炸弹(同点≥4) → 同花色连张(≥3连，标"同顺"，同花顺机会) →
   * 三张 → 对子 → 单张；组内按点数升序，组间由 UI 留间隔。
   * @returns {{cards: Array, marks: Array<{idx:number, tag:string}>}}
   *          cards 为理牌后的有序手牌；marks 记录分组起始下标（idx>0）。
   */
  DD.arrangeHandSmart = function (hand, level) {
    var groups = [];
    function addGroup(tag, cards) {
      if (!cards.length) return;
      cards = cards.slice().sort(function (a, b) { return a.v - b.v || a.d - b.d; });
      groups.push({ tag: tag, cards: cards });
    }

    // 王（无花色，小王在前）
    addGroup('王', hand.filter(function (c) { return c.s < 0; }));

    var used = {};
    function isUsed(c) { return used[c.id]; }
    function take(cards) { cards.forEach(function (c) { used[c.id] = 1; }); }

    // 炸弹：同点 ≥4（两副牌同点最多 8 张，全部归入）
    var byV = {};
    hand.forEach(function (c) { if (c.s >= 0) (byV[c.v] = byV[c.v] || []).push(c); });
    Object.keys(byV).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
      if (byV[v].length >= 4) {
        var bomb = byV[v].filter(function (c) { return !isUsed(c); });
        take(bomb); addGroup('炸', bomb);
      }
    });

    // 同花色连张：每花色取剩余牌中"点数连续段"≥3 的（重复点数一并收拢），每次提取当前最长段
    while (true) {
      var best = null;
      for (var suit = 0; suit < 4; suit++) {
        var inSuit = {};
        hand.forEach(function (c) {
          if (c.s === suit && !isUsed(c)) inSuit[c.v] = (inSuit[c.v] || 0) + 1;
        });
        var run = [];
        for (var v = 2; v <= 15; v++) {
          if (inSuit[v]) run.push(v);
          else {
            if (run.length >= 3 && (!best || run.length > best.len)) best = { suit: suit, lo: run[0], hi: run[run.length - 1], len: run.length };
            run = [];
          }
        }
        if (run.length >= 3 && (!best || run.length > best.len)) best = { suit: suit, lo: run[0], hi: run[run.length - 1], len: run.length };
      }
      if (!best) break;
      var cards = hand.filter(function (c) { return c.s === best.suit && !isUsed(c) && c.v >= best.lo && c.v <= best.hi; });
      take(cards); addGroup('同顺', cards);
    }

    // 三张 / 对子 / 单张：每个点数各一列（按剩余张数动态归类）
    function remainCount(v) {
      var n = 0;
      hand.forEach(function (c) { if (c.s >= 0 && !isUsed(c) && c.v === v) n++; });
      return n;
    }
    [['三张', 3], ['对子', 2], ['单张', 1]].forEach(function (spec) {
      for (var v = 2; v <= 14; v++) {
        if (remainCount(v) === spec[1]) {
          var cards = hand.filter(function (c) { return c.s >= 0 && !isUsed(c) && c.v === v; });
          addGroup(spec[0], cards);
        }
      }
    });

    // 展平 + 分组起始标记（横向兼容接口）；columns 供纵向列渲染
    var cards = [], marks = [];
    groups.forEach(function (g) {
      if (cards.length) marks.push({ idx: cards.length, tag: g.tag });
      g.cards.forEach(function (c) { cards.push(c); });
    });
    return { columns: groups, cards: cards, marks: marks };
  };

  /**
   * 理牌列结构（供手牌纵向渲染）：按模式把手牌拆成"列"数组。
   * @param mode 'smart' 智能理牌 | 'suit' 按花色 | 'rank' 按大小
   * @param lockedMap 锁牌表（id→true）：锁牌恒为最左一列，不受排序影响
   * @returns {{columns: Array<{tag:string, cards:Array}>}}
   */
  DD.arrangeHandColumns = function (hand, level, mode) {
    function byVD(a, b) { return a.v - b.v || a.s - b.s || a.d - b.d; }
    var columns = [];
    var rest = hand;

    if (mode === 'suit') {
      // 按花色：♠ ♥ ♣ ♦ 各成一列连排，王列最右
      [0, 1, 2, 3].forEach(function (suit) {
        var cards = rest.filter(function (c) { return c.s === suit; }).sort(byVD);
        if (cards.length) columns.push({ tag: '', cards: cards });
      });
      var js = rest.filter(function (c) { return c.s < 0; }).sort(function (a, b) { return a.v - b.v; });
      if (js.length) columns.push({ tag: '王', cards: js });
      return { columns: columns };
    }

    if (mode === 'rank') {
      // 按大小：同有效点数一列，列按点数升序
      var sorted = DD.sortByLevel(rest, level);
      var cur = null;
      sorted.forEach(function (c) {
        var eff = DD.effOf(c.v, level);
        if (!cur || cur.eff !== eff) { cur = { eff: eff, cards: [] }; columns.push(cur); }
        cur.cards.push(c);
      });
      return { columns: columns };
    }

    // 智能理牌：王→炸弹→同花色连张(同顺)→三张→对子→单张
    DD.arrangeHandSmart(rest, level).columns.forEach(function (g) {
      columns.push({ tag: g.tag, cards: g.cards });
    });
    return { columns: columns };
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

  /**
   * 高手专属博弈层（在 bestPlay 启发式之上叠加）：
   * 1. 无敌领出：基于已出牌推断"该列牌对手已无更大牌可压"
   * 2. 炸弹经济：根据未现身炸弹潜力决定忍/炸
   * 3. 搭档协同：搭档快出完时领小单张喂牌；自己剩 2 张时大牌接管
   * 4. 小残局精确规划：≤10 张时按最少手数精确搜索选择领出/压制
   */
  DD.bestPlayHard = function (view) {
    var hand = view.me.hand, level = view.level;
    var base = DD.bestPlay(view);
    if (!base.move && base.reason !== 'NONE') return base;

    var moves = DD.legalMoves(hand, level, view.lastPlay);
    if (!moves.length) return base;
    var myCnt = DD.countMap(hand);
    var played = view.played || {};
    var meIdx = view.me.idx;
    var partnerIdx = (meIdx + 2) % 4;
    var partner = null;
    view.players.forEach(function (p) { if (p.idx === partnerIdx) partner = p; });
    var partnerCnt = partner ? partner.count : 99;
    var myMin = hand.length;
    var eMin = enemyMin(view);
    var last = view.lastPlay;

    // —— 领出 ——
    if (!last) {
      // 喂搭档：搭档只剩 1~2 张且我不少手 → 领最小单张让搭档接走
      if (partnerCnt >= 1 && partnerCnt <= 2 && myMin > 4) {
        var singles = moves.filter(function (m) { return m.info.type === 'SINGLE'; })
          .sort(function (a, b) { return a.info.main - b.info.main; });
        if (singles.length) return { move: singles[0], reason: 'FEED' };
      }
      // 无敌领出：同点数列对手已无更大同型牌可压（含炸弹无法再生的近似）
      var unbeat = null;
      moves.forEach(function (m) {
        var t = m.info.type;
        if (t !== 'SINGLE' && t !== 'PAIR' && t !== 'TRIPLE' && t !== 'BOMB') return;
        var per = t === 'SINGLE' ? 1 : t === 'PAIR' ? 2 : 3;
        var left = higherComboLeft(m.info.main, level, played, myCnt, per);
        if (left === 0 && (!unbeat || m.cards.length > unbeat.cards.length)) unbeat = m;
      });
      if (unbeat) return { move: unbeat, reason: 'UNBEATABLE' };
      // 小残局精确规划
      if (hand.length <= 10) {
        var seen = {};
        var best = null, bestSc = 99;
        moves.forEach(function (m) {
          var k2 = m.info.type + '|' + m.info.main;
          if (seen[k2]) return; seen[k2] = 1;
          var rest = without(hand, m.cards);
          var h2 = DD.minHandsExact(rest, level);
          if (h2 < bestSc) { bestSc = h2; best = m; }
        });
        if (best) return { move: best, reason: 'EXACT_LEAD' };
      }
      return base;
    }

    // —— 跟牌 ——
    var enemy = !(view.players[last.playerIdx].team === view.me.team);
    var normals = moves.filter(function (m) { return !isBombInfo(m.info); });

    if (!enemy) {
      // 队友出的牌：我快出完时大牌接管抢头游；否则不压队友
      for (var j = 0; j < moves.length; j++) if (moves[j].cards.length === hand.length) return { move: moves[j], reason: 'WIN' };
      if (myMin <= 2) {
        var over = biggest(moves.filter(function (m) { return !isBombInfo(m.info); }));
        if (over) return { move: over, reason: 'OVERTAKE' };
      }
      return { move: null, reason: 'PASS_PARTNER' };
    }

    // 对手出的牌
    if (!normals.length) {
      // 只能炸：炸弹经济——对手还有炸弹潜力且不紧迫时保留
      var risk = 0;
      for (var v = 2; v <= 14; v++) {
        var unseen = Math.max(0, 8 - (played[v] || 0) - (myCnt[v] || 0));
        if (unseen >= 4) risk++;
      }
      if (eMin <= 3 || myMin <= 4 || risk === 0) {
        var bm = moves.filter(function (m) { return isBombInfo(m.info); })
          .sort(function (a, b2) { return bombRank(a) - bombRank(b2); });
        return { move: bm[0], reason: 'BOMB' };
      }
      return { move: null, reason: 'SAVE' };
    }
    if (eMin <= 2) return { move: biggest(normals), reason: 'SUPPRESS' };
    // 中盘强压制：出大牌后我的剩余手数（精确）≤1 → 抢回控制权快速收尾
    if (hand.length <= 10) {
      var big = biggest(normals);
      var restN = without(hand, big.cards);
      if (DD.minHandsExact(restN, level) <= 1) return { move: big, reason: 'SUPPRESS_END' };
    }
    // 万能配经济：优先不消耗 ✦ 的 cheapest
    var cheapNoWild = cheapest(normals.filter(function (m) {
      return !m.cards.some(function (c) { return DD.isWild(c, level); });
    }));
    if (cheapNoWild) return { move: cheapNoWild, reason: 'BEAT' };
    return { move: cheapest(normals), reason: 'BEAT_WILD' };
  };

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
    return forceLead(DD.bestPlayHard(view));
  };
})(typeof self !== 'undefined' ? self : globalThis);
