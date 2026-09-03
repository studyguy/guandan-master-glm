/* =========================================================
 * 掼蛋 AI 训练营 · game.js
 * 对局状态机（纯逻辑，无 DOM）：
 *  4 人 2 队（0,2 / 1,3 对家），2 副牌 108 张 27×4 全发。
 *  流程：发牌 → 轮流出牌（接风/排名）→ 全手打完 → 升级判定 → 下一手
 *        直到某方"过 A"获胜（一场比赛 = 从 2 打到 A）。
 *  事件：state / needPlay / play / pass / alarm / finish / trickLead /
 *        handOver / sessionOver / redeal(重发安全)
 * ========================================================= */
(function (root) {
  'use strict';
  var DD = root.DD = root.DD || {};
  var CT = DD.CT;

  DD.Game = function (opts) {
    var players = opts.players.map(function (p, i) {
      return {
        idx: i, name: p.name, type: p.type, difficulty: p.difficulty || 'medium',
        hand: [], finished: false, order: -1, total: p.total || 0
      };
    });
    var emit = opts.onEvent || function () {};
    var botDelay = opts.botDelay != null ? opts.botDelay : 700;
    var timer = null;
    var hasHuman = opts.players.some(function (p) { return p.type === 'human'; });
    var autoNext = opts.autoNext != null ? opts.autoNext : !hasHuman;

    // 比赛状态（跨手）
    var M = {
      phase: 'idle',                 // idle | playing | handOver | sessionOver
      hand: 0,
      tableLevel: 2,                 // 本手"打几"
      levelOwner: -1,                // 级牌归属方（-1=初始打2）
      levels: [2, 2],                // 两队各自等级
      aFails: [0, 0],
      turn: -1, leader: -1,
      lastPlay: null,
      order: [],                     // 本手出完名次 idx 列表
      rank: [-1, -1, -1, -1],
      winnerTeam: -1,
      passAfterLast: 0,
      nextLeader: -1
    };

    function teamOf(i) { return i % 2; }
    function partnerOf(i) { return (i + 2) % 4; }
    function nextOf(i) { return (i + 1) % 4; }
    function alive() { return players.filter(function (p) { return !p.finished; }); }
    function idxAfterSkip(i) {
      var j = nextOf(i);
      while (players[j].finished) j = nextOf(j);
      return j;
    }
    function snap() {
      return {
        phase: M.phase, hand: M.hand,
        tableLevel: M.tableLevel, levelOwner: M.levelOwner,
        levels: M.levels.slice(), aFails: M.aFails.slice(),
        turn: M.turn, leader: M.leader, lastPlay: M.lastPlay,
        rank: M.rank.slice(), winnerTeam: M.winnerTeam,
        players: players.map(function (p) {
          return { idx: p.idx, name: p.name, type: p.type, difficulty: p.difficulty,
            count: p.hand.length, hand: p.hand, finished: p.finished, order: p.order,
            total: p.total, team: teamOf(p.idx) };
        })
      };
    }

    // ---------------- 发牌（一手） ----------------
    function dealHand(leaderIdx) {
      var deck = DD.shuffle(DD.newGuandanDeck());
      players.forEach(function (p, i) {
        p.hand = DD.sortByLevel(deck.slice(i * 27, i * 27 + 27), M.tableLevel);
        p.finished = false; p.order = -1;
      });
      M.hand++;
      M.order = [];
      M.rank = [-1, -1, -1, -1];
      M.winnerTeam = -1;
      M.lastPlay = null;
      M.passAfterLast = 0;
      M.nextLeader = -1;
      M.leader = leaderIdx < 0 ? Math.floor(Math.random() * 4) : leaderIdx;
      M.turn = M.leader;
      M.phase = 'playing';
      emit('deal', { leader: M.leader, level: M.tableLevel });
      emit('state', snap());
      schedule();
    }

    function schedule() {
      if (M.phase !== 'playing') return;
      var p = players[M.turn];
      if (p.type === 'bot') {
        timer = setTimeout(function () {
          var v = viewFor(M.turn);
          var c = DD.botPlay(v, p.difficulty);
          apply(M.turn, c.move);
        }, botDelay);
      } else {
        emit('needPlay', snap());
      }
    }

    // ---------------- 出牌 / 过牌 ----------------
    function canPass(idx) {
      return !players[idx].finished && M.lastPlay && M.lastPlay.playerIdx !== idx && M.turn === idx;
    }
    function humanMove(move) {
      if (M.phase !== 'playing') return false;
      var p = players[M.turn];
      if (p.type !== 'human') return false;
      if (!move) {
        if (!canPass(M.turn)) return false;
        apply(M.turn, null); return true;
      }
      var info = move.info || DD.analyze(move.cards, M.tableLevel);
      if (!info) return false;
      var v = viewFor(M.turn);
      if (M.lastPlay && M.lastPlay.playerIdx !== M.turn && !DD.beats(info, M.lastPlay.info)) return false;
      if (!containsAll(p.hand, move.cards)) return false;
      apply(M.turn, { cards: move.cards, info: info });
      return true;
    }

    function containsAll(hand, play) {
      var ids = {}; hand.forEach(function (c) { ids[c.id] = 1; });
      for (var i = 0; i < play.length; i++) if (!ids[play[i].id]) return false;
      return true;
    }

    function apply(idx, move) {
      var p = players[idx];
      if (move) {
        var ids = {}; move.cards.forEach(function (c) { ids[c.id] = 1; });
        p.hand = p.hand.filter(function (c) { return !ids[c.id]; });
        M.lastPlay = { playerIdx: idx, info: move.info, cards: move.cards };
        M.passAfterLast = 0;
        emit('play', { idx: idx, move: move, left: p.hand.length });
        if (!p.hand.length) markFinish(idx);
        else if (p.hand.length <= DD.RULES.reportAt) emit('alarm', { idx: idx, count: p.hand.length });
        if (M.phase !== 'playing') return; // 打完本手
        M.turn = idxAfterSkip(idx);
        emit('state', snap());
        schedule();
      } else {
        M.passAfterLast++;
        emit('pass', { idx: idx });
        // 领出位不会收到"过"（canPass 拦截人类；botPlay 兜底强制领出），此处防御异常输入
        if (!M.lastPlay) {
          M.turn = idxAfterSkip(idx);
          emit('state', snap());
          schedule();
          return;
        }
        // 一圈无人压（其余未出完者全部过）→ 本轮胜者领出；若胜者已走完则接风给对家。
        // 注意：领出者本人不能再"过"，故阈值是 alive 数减去领出者是否仍在场。
        var others = alive().length - (players[M.lastPlay.playerIdx].finished ? 0 : 1);
        if (M.passAfterLast >= others) {
          var winner = M.lastPlay.playerIdx;
          var lead = players[winner].finished ? partnerOf(winner) : winner;
          if (players[lead].finished) lead = idxAfterSkip(winner); // 接风对象也已出完（双上局面）→ 顺延
          M.lastPlay = null; M.passAfterLast = 0;
          emit('trickLead', { leader: lead });
          M.leader = lead; M.turn = lead;
          emit('state', snap());
          schedule();
          return;
        }
        M.turn = idxAfterSkip(idx);
        emit('state', snap());
        schedule();
      }
    }

    function markFinish(idx) {
      var order = M.order.length + 1; // 1..4
      players[idx].finished = true;
      players[idx].order = order;
      M.order.push(idx);
      M.rank[idx] = order;
      emit('finish', { idx: idx, order: order });
      if (order === 3) {
        // 最后一名自动
        var last = players.findIndex(function (p) { return !p.finished; });
        players[last].finished = true; players[last].order = 4;
        M.order.push(last); M.rank[last] = 4;
        emit('finish', { idx: last, order: 4 });
        endHand();
      }
    }

    // ---------------- 一手结束 → 升级 ----------------
    function endHand() {
      M.phase = 'handOver';
      clearTimeout(timer);
      var head = M.order[0];
      var winTeam = teamOf(head);
      var part = partnerOf(head);
      var partOrder = M.rank[part];      // 2 或 3
      var rise = partOrder === 2 ? 3 : partOrder === 3 ? 2 : 1;
      var winLevel0 = M.levels[winTeam];
      var passedA = false;
      var prevOwner = M.levelOwner, prevTable = M.tableLevel;

      if (prevTable === 14 && prevOwner === winTeam) {
        // 正打本方 A：头游且队友非末游 → 过 A
        if (partOrder !== 4) {
          passedA = true;
          M.winnerTeam = winTeam;
        } else {
          M.aFails[winTeam]++;
          if (DD.RULES.backTo2OnFail3 && M.aFails[winTeam] >= 3) {
            M.levels[winTeam] = 2;
            M.aFails[winTeam] = 0;
          }
        }
      } else {
        M.levels[winTeam] = DD.advanceLevel(winLevel0, rise);
        M.aFails[winTeam] = 0;
      }

      var ev = {
        winnerTeam: winTeam, head: head, order: M.order.slice(), rank: M.rank.slice(),
        rise: passedA ? -1 : rise,
        levelBefore: winLevel0,
        levelAfter: M.levels[winTeam],
        passedA: passedA,
        levels: M.levels.slice(),
        tableLevel: M.tableLevel,
        players: players.map(function (p) { return { idx: p.idx, name: p.name, order: p.order, team: teamOf(p.idx) }; })
      };
      // 下一手级牌 = 胜方升级后的级牌（谁赢打谁的级牌）
      M.tableLevel = M.levels[winTeam];
      M.levelOwner = winTeam;
      M.nextLeader = head;
      emit('handOver', ev);

      if (passedA) {
        M.phase = 'sessionOver';
        emit('sessionOver', { winnerTeam: winTeam, levels: M.levels.slice() });
        return;
      }
      if (!autoNext) return; // 有玩家或显式暂停：等 UI 调 nextGame()
      dealHand(head); // 全 Bot 自动续打（无进贡简化，头游先出）
    }

    // ---------------- 视图 ----------------
    function viewFor(idx) {
      return {
        me: { idx: idx, hand: players[idx].hand, team: teamOf(idx) },
        players: players.map(function (p) {
          return { idx: p.idx, count: p.hand.length, finished: p.finished, order: p.order, team: teamOf(p.idx) };
        }),
        lastPlay: M.lastPlay,
        level: M.tableLevel,
        turn: M.turn
      };
    }

    return {
      start: function () {
        M.levels = [2, 2]; M.aFails = [0, 0]; M.tableLevel = 2; M.levelOwner = -1; M.hand = 0;
        dealHand(-1);
      },
      humanMove: humanMove,
      viewFor: viewFor,
      state: snap,
      humanIdx: function () {
        for (var i = 0; i < players.length; i++) if (players[i].type === 'human') return i;
        return -1;
      },
      nextGame: function () { dealHand(M.nextLeader >= 0 ? M.nextLeader : M.leader); },
      destroy: function () { clearTimeout(timer); }
    };
  };
})(typeof self !== 'undefined' ? self : globalThis);
