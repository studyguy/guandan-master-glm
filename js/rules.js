/* =========================================================
 * 掼蛋 AI 训练营 · rules.js
 * 规则开关（区域差异集中配置）+ 级牌/牌序/升级辅助
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};

  DD.RULES = {
    // 两副牌打掼蛋
    decks: 2,
    // 顺子是否允许 A2345（A 作 1）；关闭则顺子最低 23456
    a2345: true,
    // 王是否可组成对子（双大王/双小王）；1大1小永不成对
    jokerPair: false,
    // 三带二所带对子是否禁止王对
    noJokerKicker: true,
    // 三带一 / 飞机带单等斗地主型牌型在掼蛋中一律非法（保持 false）
    // 打 A 三次未过是否退回 2
    backTo2OnFail3: true,
    // 每场起始级牌随机（2~K，不含 A）；默认关闭——标准规则从 2 打起、以升级推进
    randomStartLevel: false,
    // 报牌张数提示阈值（≤ 该张数须报牌）
    reportAt: 10,
    // 进贡/还贡/抗贡：默认不做（头游先出）；true 为完整进贡
    gong: false,
    // 记分牌：上游→下游的输赢筹码换算仅用于展示层（不做博彩）
    showScore: true
  };

  // 等级序列：2,3,...,K,A
  DD.LEVELS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  DD.levelText = function (lv) {
    return DD.RANK_NAME[lv] || String(lv); // 11→J 12→Q 13→K 14→A（旧版缺映射，打 J 显示为"打 11"）
  };

  // 升级：升 n 级（越过 A 仍需通过 A，不循环）
  DD.advanceLevel = function (lv, n) {
    var idx = DD.LEVELS.indexOf(lv);
    var next = Math.min(idx + n, DD.LEVELS.length - 1);
    return DD.LEVELS[next];
  };

  // 单张有效大小（用于同点比较与普通牌型主值）：2最小(2)…A(14)，
  // 级牌插到 A 之上(17)，小王 18、大王 19。
  DD.effOf = function (r, level) {
    if (r === 16) return 19;      // 大王
    if (r === 15) return 18;      // 小王
    if (r === level) return 17;   // 级牌
    return r;                     // 2..14（2 最小、A=14 最大普通）
  };

  DD.RANK_NAME = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '小王', 16: '大王'
  };
  DD.SUITS = [
    { sym: '♠', red: false }, { sym: '♥', red: true },
    { sym: '♣', red: false }, { sym: '♦', red: true }
  ];

  // 是否为万能配（红桃级牌）：r 为级牌点数且花色为 ♥
  DD.isWild = function (card, level) {
    return card.v <= 14 && card.v === level && card.s === 1;
  };

  DD.cardName = function (c) {
    if (c.v >= 15) return DD.RANK_NAME[c.v];
    return DD.RANK_NAME[c.v] + DD.SUITS[c.s].sym;
  };
})(typeof self !== 'undefined' ? self : globalThis);
