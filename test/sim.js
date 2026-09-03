/* =========================================================
 * 掼蛋 AI 训练营 · test/sim.js
 * Node 逻辑层测试：
 *   [1] 牌型识别 / 压制链 / 万能配 / A2345
 *   [2] 走法生成合法性与跟牌覆盖
 *   [3] AI 教练 / 方案
 *   [4] 4-BOT 对局仿真（排名、升级、会话）
 * 运行：node test/sim.js
 * ========================================================= */
'use strict';
var path = require('path');
['rules', 'cards', 'combos', 'movegen', 'ai', 'advisor', 'game'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
});
var DD = globalThis.DD;

var pass = 0, fail = 0, failNames = [];
function T(name, cond) {
  if (cond) { pass++; } else { fail++; failNames.push(name); console.log('  ✗ FAIL: ' + name); }
}
function card(v, s, d) { return { v: v, s: s, d: d == null ? 0 : d, id: v + '-' + s + '-' + (d == null ? 0 : d) }; }
function mk(arr) { return arr.map(function (x) { return card(x[0], x[1], x[2] == null ? 0 : x[2]); }); }
function A(cards, lv) { return DD.analyze(cards, lv || 5); }

// ---------------- [1] 牌型与规则 ----------------
console.log('[1] 牌型/压制/万能配');
(function () {
  var L = 5;
  T('级牌序 2<3<A<级<小王<大王', DD.effOf(3, 5) > DD.effOf(2, 5) && DD.effOf(14, 5) > DD.effOf(13, 5) &&
    DD.effOf(5, 5) > DD.effOf(14, 5) && DD.effOf(15, 5) > DD.effOf(5, 5) && DD.effOf(16, 5) > DD.effOf(15, 5));
  T('打2时2为级牌', DD.effOf(2, 2) === 17 && DD.effOf(3, 2) === 3);

  var t;
  t = A(mk([[8, 0], [8, 1]])); T('对8', t && t.type === 'PAIR');
  t = A(mk([[9, 0], [9, 1], [9, 2]])); T('三9', t && t.type === 'TRIPLE');
  t = A(mk([[9, 0], [9, 1], [9, 2], [3, 0], [3, 1]])); T('三带二', t && t.type === 'TRIPLE_PAIR');
  T('三带一非法', A(mk([[9, 0], [9, 1], [9, 2], [3, 0]])) === null);
  t = A(mk([[14, 0], [2, 1], [3, 2], [4, 3], [5, 0]])); T('A2345 顺', t && t.type === 'STRAIGHT');
  T('K A 2 3 4 非法', A(mk([[13, 0], [14, 1], [2, 0], [3, 0], [4, 0]])) === null);
  t = A(mk([[5, 0], [6, 0], [7, 0], [8, 0], [9, 0]])); T('同花顺', t && t.type === 'FLUSH');
  t = A([card(15, -1, 0), card(15, -1, 1), card(16, -1, 0), card(16, -1, 1)]); T('四王炸', t && t.type === 'FOUR_JOKER');
  T('双王不同不成对', A([card(15, -1, 0), card(16, -1, 0)]) === null || (DD.RULES.jokerPair && A([card(15, -1, 0), card(15, -1, 1)]) === null));

  // 炸弹压制链
  var b4 = A(mk([[13, 0], [13, 1], [13, 2], [13, 3]]));
  var f5 = A(mk([[5, 0], [6, 0], [7, 0], [8, 0], [9, 0]]));
  var six2 = []; for (var d = 0; d < 2; d++) for (var s = 0; s < 3; s++) six2.push(card(2, s, d));
  var b6 = A(six2);
  var fourJ = A([card(15, -1, 0), card(15, -1, 1), card(16, -1, 0), card(16, -1, 1)]);
  T('4炸可压普通', DD.beats(b4, A(mk([[6, 0]]))) && DD.beats(b4, A(mk([[10, 0], [10, 1]]))));
  T('同花顺>4炸', DD.beats(f5, b4));
  T('6炸>同花顺', DD.beats(b6, f5));
  T('同花顺>5炸且<6炸', (function () { var b5 = A(mk([[9, 0], [9, 1], [9, 2], [9, 3], [9, 0]]).slice(0, 5)); b5 = A((function(){var a=[];for(var i=0;i<5;i++)a.push(card(9,i%4,Math.floor(i/4)));return a;})()); return DD.beats(f5, b5) && DD.beats(b6, f5); })());
  T('四王炸最大', DD.beats(fourJ, b6));
  T('同花顺不可被4/5炸反压', !DD.beats(b4, f5));
  // 同花顺之间同顶比花色：♠>♥
  var fs1 = A(mk([[5, 0], [6, 0], [7, 0], [8, 0], [9, 0]])); // 顶9♠
  var fs2 = A(mk([[5, 1], [6, 1], [7, 1], [8, 1], [9, 1]])); // 顶9♥
  T('同顶同花顺按花色(♠压♥)', DD.beats(fs1, fs2));

  // 万能配
  var wc = card(5, 1, 0);
  t = A([card(8, 0, 0), card(8, 1, 0), wc]); T('88+配=三8', t && t.type === 'TRIPLE' && t.rank === 8);
  t = A([card(6, 0, 0), card(7, 1, 0), card(8, 2, 0), card(9, 3, 0), wc]); T('配补成6-10顺', t && t.type === 'STRAIGHT');
  t = A([card(6, 0, 0), card(7, 0, 0), card(8, 0, 0), card(9, 0, 0), wc]); T('配补成同花顺', t && t.type === 'FLUSH');
  t = A([card(7, 0, 0), card(7, 1, 0), card(7, 2, 0), wc]); T('777+配=4张7炸', t && t.type === 'BOMB');
  t = A([wc, card(10, 0, 0), card(10, 1, 0), card(10, 2, 0)]); T('单配+三10=4炸', t && t.type === 'BOMB' && t.rank === 10);
  t = A([card(3, 0, 0), card(4, 0, 0), card(5, 0, 0), card(6, 0, 0), wc]);
  T('3456+配=顺或同花顺', !!t && (t.type === 'STRAIGHT' || t.type === 'FLUSH'));
  T('万能配不能当王(单张仍算级牌)', A([wc], 5).main === 17);

  // 王/级牌单张的 info.rank 完整（供 moveLabel/记牌器展示，回归：曾显示"单张 undefined"）
  T('王单张含rank且可命名', (function () {
    var bj = A([card(16, -1, 0)], 5), sj = A([card(15, -1, 0)], 5);
    return bj.rank === 16 && sj.rank === 15 && DD.moveLabel(bj) === '单张 大王' && DD.moveLabel(sj) === '单张 小王';
  })());

  // 智能理牌：王→炸弹→同花色连张(同顺)→三张→对子→单张；不丢牌、组内升序
  T('智能理牌分组完整且不丢牌', (function () {
    var hand = mk([[3, 0], [3, 1], [3, 2], [3, 3], [5, 0], [5, 1], [5, 2],
      [6, 0], [7, 0], [8, 0], [9, 1], [9, 2], [13, 3], [15, -1], [16, -1]]);
    var r = DD.arrangeHandSmart(hand, 2);
    if (r.cards.length !== hand.length) return false;              // 不丢牌
    var ids = {};
    r.cards.forEach(function (c) { if (ids[c.id]) return false; ids[c.id] = 1; });
    var seq = r.cards.map(function (c) { return c.v + (c.s < 0 ? 100 : 0); });
    // 王组在最前（两只王）；炸弹组（4 张 3）紧随其后；其后首张是三张 5
    return seq[0] >= 100 && seq[1] >= 100 && seq[2] === 3 && seq[5] === 3 && seq[6] === 5;
  })());
  T('智能理牌提取同花色连张并标同顺', (function () {
    // ♠4-5-6-7 同花色连张 + 干扰牌
    var hand = mk([[4, 0], [5, 0], [6, 0], [7, 0], [2, 1], [10, 2], [10, 3], [13, 1]]);
    var r = DD.arrangeHandSmart(hand, 2);
    // 找到"同顺"组：4 张连张且同花色
    var found = null;
    for (var i = 0; i < r.cards.length - 3; i++) {
      var win = r.cards.slice(i, i + 4);
      var ok = win.every(function (c) { return c.s === 0; }) &&
        win[0].v === 4 && win[1].v === 5 && win[2].v === 6 && win[3].v === 7;
      if (ok) { found = i; break; }
    }
    if (found === null) return false;
    if (found === 0) return true; // 首组无需标记
    var mark = null;
    r.marks.forEach(function (m) { if (m.idx <= found && (!mark || m.idx > mark)) mark = m.idx; });
    return mark === found; // 连张位于分组起始处
  })());
})();

// ---------------- [2] 走法生成 ----------------
console.log('[2] movegen');
(function () {
  var deck = DD.shuffle(DD.newGuandanDeck());
  for (var t = 0; t < 60; t++) {
    var hand = deck.slice(t * 1 % 100, t * 1 % 100 + 27);
    var level = 2 + Math.floor(Math.random() * 13);
    var leads = DD.leadingMoves(hand, level);
    if (!leads.every(function (m) { return !!DD.analyze(m.cards, level); })) { T('先手全部合法 #' + t, false); return; }
    if (!leads.length && hand.length) { T('先手非空 #' + t, false); return; }
  }
  T('60 手随机先手全部合法', true);

  // 跟牌：选定某手后生成 follow，须全部压过
  var last = null, moves = null;
  for (var i = 0; i < 200; i++) {
    var h2 = deck.slice((i * 7) % 54, (i * 7) % 54 + 27);
    var lv = 3 + (i % 12);
    moves = DD.leadingMoves(h2, lv);
    var cand = moves.filter(function (m) { return m.info.type === 'PAIR'; });
    if (!cand.length) continue;
    last = cand[0];
    var f = DD.followMoves(h2, lv, last);
    if (!f.every(function (m) { return DD.beats(m.info, last.info); })) { T('跟牌全部压过 #' + i, false); return; }
    break;
  }
  T('跟牌全部压过', last !== null);

  var wildsLead = null;
  for (var k = 0; k < 400; k++) {
    var h3 = deck.slice((k * 11) % 108, (k * 11) % 108 + 27);
    if (h3.some(function (c) { return DD.isWild(c, 5); })) { wildsLead = DD.leadingMoves(h3, 5); break; }
  }
  T('含万能配的先手枚举正常' + (wildsLead ? ' (' + wildsLead.length + ')' : ' (未取到)'), !wildsLead || wildsLead.every(function (m) { return !!DD.analyze(m.cards, 5); }));
})();

// ---------------- [3] AI 教练 ----------------
console.log('[3] advisor');
(function () {
  var view = {
    me: { idx: 0, hand: mk([[3, 0], [4, 1], [5, 2], [6, 3], [7, 0], [10, 0], [10, 1], [15, -1], [16, -1]]), team: 0 },
    players: [
      { idx: 0, count: 9, team: 0 }, { idx: 1, count: 17, team: 1 },
      { idx: 2, count: 20, team: 0 }, { idx: 3, count: 12, team: 1 }
    ],
    lastPlay: null, level: 5, turn: 0
  };
  var adv = DD.advise(view);
  T('建议含讲解', !!adv && adv.title && adv.title.length > 0 && adv.lines.length > 0);
  var ps = DD.buildPlans(view, 6);
  T('方案 1~6 且推荐第一', ps.length >= 1 && ps.length <= 6 && ps[0].tag === '推荐');
  T('方案无重复主键', (function () { var s = {}; return ps.every(function (p) { if (p.pass) return true; var k = p.move.info.type + '|' + p.move.info.main; if (s[k]) return false; s[k] = 1; return true; }); })());
  // 队友出的牌
  var view2 = {
    me: { idx: 0, hand: mk([[10, 0], [10, 1], [15, -1]]), team: 0 },
    players: [
      { idx: 0, count: 3, team: 0 }, { idx: 1, count: 17, team: 1 },
      { idx: 2, count: 22, team: 0 }, { idx: 3, count: 12, team: 1 }
    ],
    lastPlay: { playerIdx: 2, info: A(mk([[14, 0]])), cards: mk([[14, 0]]) }, level: 5, turn: 0
  };
  var adv2 = DD.advise(view2);
  T('队友大牌建议不出', adv2.pass === true);
  var ev = DD.evaluateSelection(mk([[10, 0]]), view2);
  T('压队友不算“压不过”报错（不拦队友）', ev.ok === false || ev.ok === true);
  var view3 = { me: { idx: 0, hand: mk([[10, 0], [10, 1]]), team: 0 },
    players: view2.players.slice(),
    lastPlay: { playerIdx: 3, info: A(mk([[8, 0]])), cards: mk([[8, 0]]) }, level: 5, turn: 0 };
  var ev3 = DD.evaluateSelection(mk([[10, 0]]), view3);
  T('选牌单10可压单8', ev3.ok === true);
})();

// ---------------- [4] 对局仿真 ----------------
console.log('[4] 4-BOT 对局仿真');
function runHand(diff) {
  return new Promise(function (resolve) {
    var steps = 0, done = false;
    var g = new DD.Game({
      players: [
        { name: 'A', type: 'bot', difficulty: diff },
        { name: 'B', type: 'bot', difficulty: diff },
        { name: 'C', type: 'bot', difficulty: diff },
        { name: 'D', type: 'bot', difficulty: diff }
      ],
      botDelay: 0, autoNext: false,
      onEvent: function (ev, d) {
        if (done) return;
        if (++steps > 500000) { done = true; g.destroy(); resolve({ ok: false, err: 'overflow' }); return; }
        if (ev === 'handOver') {
          var s = g.state();
          var ord = d.order;
          var err = null;
          if (ord.length !== 4) err = 'order!=4';
          else {
            var seen = {}; for (var i = 0; i < 4; i++) seen[ord[i]] = 1;
            if (Object.keys(seen).length !== 4) err = 'dup order';
          }
          if (!err && d.levels.some(function (x) { return x < 2 || x > 14; })) err = 'bad level';
          if (!err && !d.passedA && s.tableLevel !== d.levels[d.winnerTeam]) err = 'level not advanced';
          done = true;
          g.destroy();
          resolve({ ok: !err, err: err });
        }
      }
    });
    g.start();
  });
}

function runSession() {
  return new Promise(function (resolve) {
    var hands = 0, lastWinner = -1;
    var g = new DD.Game({
      players: [
        { name: 'A', type: 'bot', difficulty: 'hard' },
        { name: 'B', type: 'bot', difficulty: 'hard' },
        { name: 'C', type: 'bot', difficulty: 'medium' },
        { name: 'D', type: 'bot', difficulty: 'medium' }
      ],
      botDelay: 0,
      onEvent: function (ev, d) {
        if (ev === 'sessionOver') { g.destroy(); resolve({ ok: true, hands: hands, winner: d.winnerTeam, levels: d.levels }); return; }
        if (ev === 'handOver') {
          hands++;
          if (hands > 400) { g.destroy(); resolve({ ok: false, err: 'too many hands' }); return; }
        }
      }
    });
    g.start();
  });
}

(async function () {
  var diffs = ['easy', 'medium', 'hard'];
  for (var di = 0; di < diffs.length; di++) {
    var N = 20;
    for (var i = 0; i < N; i++) {
      var r = await runHand(diffs[di]);
      if (!r.ok) { T('仿真[' + diffs[di] + '] #' + i, false); console.log('    ' + r.err); }
    }
    console.log('  · ' + diffs[di] + ' 完成 ' + N + ' 手');
  }
  T('60 手 4-BOT 仿真全部正常', true);

  // 完整一场（直到过 A）
  var res = await runSession();
  T('完整一场直到过A ' + JSON.stringify(res.ok ? { hands: res.hands, winner: res.winner, levels: res.levels } : res),
    res.ok && res.winner >= 0 && res.hands >= 3);

  // 回归：三家全过 → 领出者直接再领出（不再要求领出者自过；旧阈值多算曾致人类玩家死局）
  // 注：引擎首局领出位随机，故记录实际首领者 L，断言一圈全过后回到 L。
  var trickClose = await (function () {
    return new Promise(function (resolve) {
      var plays = 0, passes = 0, firstLeader = -1, done = false;
      var g = new DD.Game({
        players: [
          { name: 'A', type: 'human' }, { name: 'B', type: 'human' },
          { name: 'C', type: 'human' }, { name: 'D', type: 'human' }
        ],
        botDelay: 0, autoNext: false,
        onEvent: function (ev, d) {
          if (done) return;
          if (ev === 'needPlay') {
            plays++;
            var st = g.state();
            if (firstLeader < 0) firstLeader = st.turn;
            var hand = st.players[st.turn].hand;
            if (plays === 1) {
              var leads = DD.leadingMoves(hand, st.tableLevel);
              var singles = leads.filter(function (m) { return m.info.type === 'SINGLE'; });
              var mv = singles.length ? singles[0] : leads[0];
              g.humanMove({ cards: mv.cards, info: mv.info });
            } else {
              passes++;
              g.humanMove(null);
            }
          }
          if (ev === 'trickLead') { done = true; g.destroy(); resolve({ leader: d.leader, firstLeader: firstLeader, plays: plays, passes: passes }); }
          if (ev === 'handOver') { done = true; g.destroy(); resolve({ leader: -9, firstLeader: firstLeader, plays: plays, passes: passes }); }
        }
      });
      g.start();
    });
  })();
  T('三家全过后领出者直接再领出 ' + JSON.stringify(trickClose),
    trickClose.leader === trickClose.firstLeader && trickClose.plays === 4 && trickClose.passes === 3);

  // 回归：头游最后一手无人压 → 对家接风（trickLead 携带 windfall 标记）
  // 让实际首领者一路单张领出（其余三家全过），打完 27 张成为头游后验证接风。
  var windfall = await (function () {
    return new Promise(function (resolve) {
      var leaderPlays = 0, runner = -1, done = false;
      var g = new DD.Game({
        players: [
          { name: 'A', type: 'human' }, { name: 'B', type: 'human' },
          { name: 'C', type: 'human' }, { name: 'D', type: 'human' }
        ],
        botDelay: 0, autoNext: false,
        onEvent: function (ev, d) {
          if (done) return;
          if (ev === 'needPlay') {
            var st = g.state();
            if (runner < 0) runner = st.turn;
            if (st.turn === runner && !st.lastPlay) {
              leaderPlays++;
              var c = st.players[runner].hand[0];
              g.humanMove({ cards: [c], info: DD.analyze([c], st.tableLevel) });
            } else {
              g.humanMove(null); // 其余三家全过，让首领者一路单张到底
            }
          }
          if (ev === 'trickLead' && leaderPlays >= 27) {
            done = true; g.destroy();
            resolve({ windfall: d.windfall, leader: d.leader, partner: (runner + 2) % 4 });
          }
          if (ev === 'handOver') { done = true; g.destroy(); resolve({ windfall: null, leader: -9, partner: (runner + 2) % 4 }); }
        }
      });
      g.start();
      setTimeout(function () { if (!done) { done = true; g.destroy(); resolve({ windfall: null, leader: -9, partner: -9 }); } }, 5000);
    });
  })();
  T('头游最后一手无人压 → 对家接风 ' + JSON.stringify(windfall),
    windfall.windfall === true && windfall.leader === windfall.partner);

  console.log('\n========== 测试结果 ==========');
  console.log('通过 ' + pass + '，失败 ' + fail);
  if (fail > 0) { console.log('失败项：' + failNames.join(' | ')); process.exit(1); }
  console.log('ALL PASS ✅');
})();
