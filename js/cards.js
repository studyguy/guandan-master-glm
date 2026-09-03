/* =========================================================
 * 掼蛋 AI 训练营 · cards.js
 * 两副牌（108 张）生成、排序、工具
 * 每张牌唯一 id = r-s-d（点数-花色-副号）；王 v=15/16
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};

  // 生成 2 副 54 张 = 108 张
  DD.newGuandanDeck = function () {
    var deck = [];
    for (var d = 0; d < (DD.RULES.decks || 2); d++) {
      for (var v = 2; v <= 14; v++) {
        for (var s = 0; s < 4; s++) deck.push({ v: v, s: s, d: d, id: v + '-' + s + '-' + d });
      }
      deck.push({ v: 15, s: -1, d: d, id: '15--' + d }); // 小王
      deck.push({ v: 16, s: -1, d: d, id: '16--' + d }); // 大王
    }
    return deck;
  };

  DD.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  // 按当前级牌的有效大小排序（越小越左；王最右）
  DD.sortByLevel = function (cards, level) {
    return cards.slice().sort(function (a, b) {
      return DD.effOf(a.v, level) - DD.effOf(b.v, level);
    });
  };

  DD.countMap = function (cards) {
    var m = {};
    for (var i = 0; i < cards.length; i++) {
      var v = cards[i].v;
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  };

  // 同花色计数
  DD.suitCounts = function (cards) {
    var m = {};
    cards.forEach(function (c) { if (c.s >= 0) m[c.s] = (m[c.s] || 0) + 1; });
    return m;
  };
})(typeof self !== 'undefined' ? self : globalThis);
