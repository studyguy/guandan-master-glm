/* =========================================================
 * 掼蛋 AI 训练营 · advisor.js
 * AI 教练：面向新手的掼蛋辅导
 *   advise            当前局面建议 + 中文讲解
 *   evaluateSelection 校验玩家选牌（教学式纠错）
 *   reviewPlay        玩家出牌后对比点评
 *   buildPlans        可点选方案（推荐恒第一）
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};
  var CT = DD.CT;

  function enemyMinOf(view) {
    var mn = 99;
    view.players.forEach(function (p) {
      if (p.team === view.me.team || p.finished) return;
      if (p.count < mn) mn = p.count;
    });
    return mn;
  }
  function partnerCount(view) {
    var m = 99;
    view.players.forEach(function (p) {
      if (p.team === view.me.team && p.idx !== view.me.idx && !p.finished) m = p.count;
    });
    return m === 99 ? 0 : m;
  }
  function lastFromEnemy(view) {
    return view.lastPlay && view.players[view.lastPlay.playerIdx].team !== view.me.team;
  }
  function moveTagOf(reason) {
    if (reason === 'BEAT') return '最小';
    if (reason === 'SUPPRESS') return '最大';
    if (reason === 'BOMB') return '炸弹';
    if (reason === 'PASS_PARTNER' || reason === 'SAVE' || reason === 'NONE') return '让过';
    return '推荐';
  }

  /** 生成建议（高手策略） */
  DD.advise = function (view) {
    var res = DD.bestPlay(view);
    var move = res.move, reason = res.reason;
    var label = move ? DD.moveLabel(move.info) : '不出';
    var meTeam = view.me.team;
    var lines = [], title;
    var myHands = DD.decomposeGuandan(view.me.hand, view.level).hands;
    var eMin = enemyMinOf(view);
    var pCnt = partnerCount(view);
    var whoLast = view.lastPlay ? view.players[view.lastPlay.playerIdx] : null;

    switch (reason) {
      case 'WIN':
        title = '直接出「' + label + '」，一把走完当上游！';
        lines.push('你这手牌正好能全部出完，出完就是头游。');
        break;
      case 'NONE':
        title = '要不起，选择「不出」';
        lines.push('你手上没有能压过上家这手的牌型（同型更大或炸弹/同花顺/四王炸）。');
        break;
      case 'PASS_PARTNER':
        title = '建议「不出」，这是队友出的牌';
        lines.push('掼蛋是两两组队，队友（对家）出的牌不要急着压，让他保持出牌权、尽快跑牌。');
        break;
      case 'SAVE':
        title = '建议「不出」，炸弹留到关键';
        lines.push('现在只有炸弹级牌能压住，但对手手牌还多，先过，等残局或对手快跑完时再出手。');
        break;
      case 'SUPPRESS':
        title = '出「' + label + '」，顶住对手！';
        lines.push('对手只剩 ' + eMin + ' 张就要走完了，用最大的牌压住，把出牌权抢回来。');
        break;
      case 'BOMB':
        title = '动用「' + label + '」，该炸就炸';
        lines.push('普通牌压不住了，对手/你都在收尾阶段，用炸弹打开局面（注意倍数记分）。');
        break;
      case 'LEAD':
        title = '先出「' + label + '」';
        lines.push(whoLast ? '你领出时优先走小牌/顺子等，把王、级牌、炸弹留作控制。' : '优先拆小牌走，保留炸弹和同花顺作大控制。');
        break;
      default:
        title = move ? '出「' + label + '」' : '「不出」';
    }
    lines.push('你是 ' + (meTeam === 0 ? '我方' : '对方') + ' · 本手打 ' + DD.levelText(view.level) +
      ' · 你约 ' + myHands + ' 手出完' + (pCnt > 0 ? ' · 队友剩 ' + pCnt + ' 张' : '') +
      ' · 敌最少 ' + (eMin === 99 ? '?' : eMin) + ' 张');
    return { move: move, pass: !move, title: title, lines: lines, reason: reason };
  };

  /** 出牌方案（点选直出），推荐恒第一 */
  DD.buildPlans = function (view, maxN) {
    maxN = maxN || 6;
    var hand = view.me.hand;
    var rec = DD.bestPlay(view);
    var moves = DD.legalMoves(hand, view.level, view.lastPlay);
    var out = [];
    var canPass = !!view.lastPlay;
    var eMin = enemyMinOf(view);

    // 去重 牌型+主值（保留先出现的 = 高手推荐的那手）
    var seen = {};
    var list = [];
    moves.forEach(function (m) {
      var k = m.info.type + '|' + m.info.len + '|' + m.info.main;
      if (seen[k]) return;
      seen[k] = 1; list.push(m);
    });

    function isBombInfo(i) { return i.type === 'BOMB' || i.type === 'FLUSH' || i.type === 'FOUR_JOKER'; }

    // 推荐（来自 bestPlay，恒第一）
    if (rec.move) {
      var rm = rec.move;
      var rest = DD.decomposeGuandan(hand.filter(function (c) { return !rm.cards.some(function (x) { return x.id === c.id; }); }), view.level).hands;
      out.push({
        move: rm, pass: false, label: DD.moveLabel(rm.info), tag: '推荐',
        desc: rest === 0 ? '一手跑完即头游' : '当前最优解', order: 0
      });
    }
    // 不出（跟牌时）
    if (canPass) {
      out.push({
        move: null, pass: true, label: '不出', tag: '让过',
        desc: rec.reason === 'PASS_PARTNER' ? '队友出的牌' : (rec.reason === 'SAVE' ? '保留炸弹' : '要不起/让权'),
        order: rec.pass ? 1 : 4
      });
    }
    // 其它候选
    var normals = [], bombs = [];
    list.forEach(function (m) {
      if (rec.move && m.info.type === rec.move.info.type && m.info.main === rec.move.info.main && m.info.len === rec.move.info.len) return;
      (isBombInfo(m.info) ? bombs : normals).push(m);
    });
    normals.forEach(function (m) {
      var isMin = normals.length > 1 && m.info.main === normals.reduce(function (a, b) { return a.info.main < b.info.main ? a : b; }).info.main;
      out.push({
        move: m, pass: false, label: DD.moveLabel(m.info),
        tag: isMin ? '最小' : '备选',
        desc: view.lastPlay && !lastFromEnemy(view) ? '队友的牌建议别压' : (isMin ? '最小的接法' : '另一种出法'),
        order: 2
      });
    });
    bombs.forEach(function (m) {
      out.push({
        move: m, pass: false, label: DD.moveLabel(m.info), tag: '炸弹',
        desc: eMin <= 3 ? '对手要跑完了' : '炸开出牌权', order: 3
      });
    });
    out.sort(function (a, b) { return a.order - b.order; });
    return out.slice(0, maxN);
  };

  /** 校验玩家当前选中的牌（教学式） */
  DD.evaluateSelection = function (sel, view) {
    if (!sel || !sel.length) return { ok: false, msg: '请先点选要出的牌。' };
    var info = DD.analyze(sel, view.level);
    if (!info) {
      var hint = '这 ' + sel.length + ' 张不能组成掼蛋牌型。';
      var j = sel.filter(function (c) { return c.v >= 15; }).length;
      if (j) hint += '注意：王不能参与顺子/连对/钢板/炸弹等连牌，只能单出或成双王对。';
      if (sel.length === 4 && new Set(sel.map(function (c) { return c.v; })).size === 2) hint += '四带二在掼蛋中不存在；4 张同点才是炸弹。';
      if (sel.length >= 6 && sel.length % 2 === 0 && new Set(sel.map(function (c) { return c.v; })).size >= 3) hint += '连对至少 3 对且要连续；2 和王不能入连。';
      return { ok: false, msg: hint };
    }
    if (view.lastPlay && view.players[view.lastPlay.playerIdx].team !== view.me.team) {
      if (!DD.beats(info, view.lastPlay.info)) {
        return {
          ok: false,
          msg: '「' + DD.moveLabel(info) + '」压不过上家的「' + DD.moveLabel(view.lastPlay.info) +
            '」。跟牌需同型更大，或用 5 张以上炸弹/同花顺/四王炸。'
        };
      }
    }
    return { ok: true, info: info, label: DD.moveLabel(info) };
  };

  DD.reviewPlay = function (chosenInfo, advice) {
    if (!advice) return null;
    var same = chosenInfo && advice.move &&
      chosenInfo.type === advice.move.info.type &&
      chosenInfo.main === advice.move.info.main &&
      chosenInfo.len === advice.move.info.len;
    if (!chosenInfo && advice.pass) return '👍 和 AI 教练的想法一致（不出），配合不错！';
    if (same) return '👍 和 AI 教练的建议完全一致！';
    var sug = advice.move ? '当时建议出「' + DD.moveLabel(advice.move.info) + '」' : '当时建议「不出」';
    return '💡 教练' + sug + '。多打几手，慢慢建立掼蛋的牌感～';
  };
})(typeof self !== 'undefined' ? self : globalThis);
