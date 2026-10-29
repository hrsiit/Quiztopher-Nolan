// Engine tests: deno test --allow-read tests/engine.test.js
// Covers the 100-game no-repeat stress test, the ladder, the game rules and the edge cases in the plan.
const root = decodeURIComponent(new URL("..", import.meta.url).pathname);
globalThis.window = globalThis;
for (const f of ["src/data/questions.js", "src/data/pictures.js", "src/data/stickers.js", "src/engine.js"]) {
  (0, eval)(await Deno.readTextFile(root + f));
}
const E = globalThis.QN_Engine;

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "not equal") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); }

const fresh = () => ({ bank: E.buildBank(QN_ROWS), packs: E.defaultPacks(QN_PACKS), settings: E.deepMerge(E.DEFAULT_SETTINGS, {}), decks: {} });
const byId = (bank) => Object.fromEntries(bank.map((q) => [q.id, q]));

// Plays one game with a strategy: "right", "wrong", or a probability of answering right.
function play(env, rnd, strategy) {
  const dealt = E.dealGame(env.bank, env.packs, env.settings, env.decks, rnd);
  const ids = byId(env.bank);
  const g = E.newGame(dealt, env.settings, "Test");
  const reached = [];
  for (;;) {
    const q = ids[g.slots[g.idx].qid];
    reached.push(q.id);
    const correct = strategy === "right" ? true : strategy === "wrong" ? false : rnd() < strategy;
    const pick = correct ? q.ans : (q.ans + 1) % E.optionsFor(q).length;
    const r = E.answer(g, q, pick, env.settings);
    if (r.out || r.isLast) break;
    g.idx++;
  }
  E.finish(g);
  const unreached = dealt.slice(reached.length).map((d) => d.qid);
  E.returnToDecks(env.decks, ids, unreached, rnd);
  return { g, dealt, reached };
}

Deno.test("bank: 120 valid questions, 30 pictures, all drawings present", () => {
  const env = fresh();
  eq(env.bank.length, 120);
  eq(env.bank.filter((q) => E.validateQuestion(q).length).length, 0, "invalid questions");
  const pics = env.bank.filter((q) => q.fmt === "pic");
  eq(pics.length, 30);
  for (const q of pics) assert(QN_PICTURES[q.pic], "missing drawing " + q.pic);
  eq(env.bank.filter((q) => q.diff === "challenge").length, 30, "Q61 to 90 are the challenge round");
  for (const q of env.bank) assert(q.hint && q.tip, "question " + q.n + " needs a hint and a tip");
  for (const q of env.bank) {
    const o = E.optionsFor(q);
    eq(new Set(o.map((x) => x.toLowerCase())).size, o.length, "duplicate options in " + q.n);
  }
});

Deno.test("ladder: 3 easy, 4 medium with Q6 a picture, 1 hard, 2 boss", () => {
  const env = fresh();
  const ids = byId(env.bank);
  const rnd = E.rng(1);
  for (let i = 0; i < 40; i++) {
    const d = E.dealGame(env.bank, env.packs, env.settings, env.decks, rnd);
    eq(d.length, 10);
    const diffs = d.map((x) => ids[x.qid].diff);
    eq(diffs.slice(0, 3).join(), "easy,easy,easy");
    eq(diffs.slice(3, 7).join(), "medium,medium,medium,medium");
    eq(diffs[7], "hard");
    eq(diffs.slice(8).join(), "challenge,challenge");
    assert(d[5].pic && ids[d[5].qid].fmt === "pic", "question 6 is a picture clue");
    const pics = d.filter((x) => x.pic).length;
    assert(pics >= 1 && pics <= 2, "1 or 2 pictures a game");
    for (let k = 0; k < 7; k++) if (k !== 5) assert(!d[k].pic, "no other pictures before the final stretch");
    eq(d.map((x) => x.stage).join(), "warm,warm,warm,tricky,tricky,tricky,tricky,final,boss,boss");
    eq(new Set(d.map((x) => x.qid)).size, 10, "no duplicates inside a game");
  }
});

Deno.test("stress: 100 games, no question comes back before its deck is used up", () => {
  const env = fresh();
  const ids = byId(env.bank);
  const rnd = E.rng(42);
  const deckSize = {}, perGame = { easy: 3, medium: 3, "medium-pic": 1, hard: 1, "hard-pic": 1, challenge: 2 };
  for (const q of env.bank) { const k = E.deckKey(q.diff, E.isPic(q)); deckSize[k] = (deckSize[k] || 0) + 1; }
  const seen = {};
  let repeats = 0, outs = 0;
  for (let gi = 0; gi < 100; gi++) {
    const strategy = gi % 3 === 0 ? 0.25 : 0.7; // some players get out early
    const { g, reached } = play(env, rnd, strategy);
    if (g.outcome === "out") outs++;
    for (const id of reached) {
      const q = ids[id];
      const k = E.deckKey(q.diff, E.isPic(q));
      const s = seen[k] || (seen[k] = new Set());
      if (s.has(id)) {
        // A repeat is fine only once (nearly) every question in the deck has been played.
        assert(s.size >= deckSize[k] - perGame[k], "deck " + k + " repeated " + id + " after only " + s.size + " of " + deckSize[k] + " (game " + (gi + 1) + ")");
        repeats++;
        seen[k] = new Set([id]);
      } else s.add(id);
    }
  }
  assert(outs > 5, "the stress test should include early outs, got " + outs);
  assert(repeats > 0, "100 games should cycle at least one deck");
});

Deno.test("challenge deck cycles about every 15 games", () => {
  const env = fresh();
  const rnd = E.rng(9);
  const first = new Map();
  let firstRepeat = null;
  for (let gi = 1; gi <= 30 && firstRepeat == null; gi++) {
    const { reached } = play(env, rnd, "right");
    for (const id of reached.slice(8)) {
      if (first.has(id)) { firstRepeat = gi; break; }
      first.set(id, gi);
    }
  }
  eq(firstRepeat, 16, "the 30 challenge questions should all be used in 15 games");
});

Deno.test("rules: 4 wrong in a row is out; a right answer resets the count", () => {
  const env = fresh();
  const rnd = E.rng(3);
  const out = play(env, rnd, "wrong");
  eq(out.g.outcome, "out");
  eq(out.reached.length, 4, "out on question 4");
  // R W W W R W W W R W never reaches 4 in a row.
  const dealt = E.dealGame(env.bank, env.packs, env.settings, env.decks, rnd);
  const ids = byId(env.bank);
  const g = E.newGame(dealt, env.settings, "");
  const pattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  pattern.forEach((p, i) => {
    g.idx = i;
    const q = ids[dealt[i].qid];
    const r = E.answer(g, q, p ? q.ans : (q.ans + 1) % E.optionsFor(q).length, env.settings);
    assert(!r.out, "not out at " + (i + 1));
  });
  eq(E.finish(g), "done");
  eq(g.right, 3);
});

Deno.test("rules: 6 right wins a goodie and the player still finishes", () => {
  const env = fresh();
  const { g, reached } = play(env, E.rng(5), "right");
  eq(g.outcome, "win");
  eq(g.goodieAtQ, 6);
  eq(reached.length, 10);
});

Deno.test("rules: a winner is never cut short", () => {
  const env = fresh();
  env.settings.numbers.outAfter = 2; // make the clash possible before question 10
  const dealt = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(6));
  const ids = byId(env.bank);
  const g = E.newGame(dealt, env.settings, "");
  const pattern = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  let ended = null;
  pattern.forEach((p, i) => {
    if (ended) return;
    g.idx = i;
    const q = ids[dealt[i].qid];
    const r = E.answer(g, q, p ? q.ans : (q.ans + 1) % E.optionsFor(q).length, env.settings);
    if (r.out) ended = i + 1;
  });
  eq(ended, null, "a player who has won is never knocked out");
  eq(E.finish(g), "win");
});

Deno.test("rules: unlocking the goodie on question 10", () => {
  const env = fresh();
  const dealt = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(8));
  const ids = byId(env.bank);
  const g = E.newGame(dealt, env.settings, "");
  const pattern = [1, 0, 1, 0, 1, 0, 1, 0, 1, 1];
  pattern.forEach((p, i) => {
    g.idx = i;
    const q = ids[dealt[i].qid];
    E.answer(g, q, p ? q.ans : (q.ans + 1) % E.optionsFor(q).length, env.settings);
  });
  eq(g.goodieAtQ, 10);
  eq(E.finish(g), "win");
});

// Answers a whole game from a pattern of 1 (right) and 0 (wrong); returns the game and each answer's result.
function playPattern(env, seed, pattern) {
  const dealt = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(seed));
  const ids = byId(env.bank);
  const g = E.newGame(dealt, env.settings, "");
  const res = [];
  pattern.forEach((p, i) => {
    g.idx = i;
    const q = ids[dealt[i].qid];
    res.push(E.answer(g, q, p ? q.ans : (q.ans + 1) % E.optionsFor(q).length, env.settings));
  });
  E.finish(g);
  return { g, res };
}

Deno.test("sticker pick: unlocks on the 8th right answer, once, and only for winners", () => {
  const env = fresh();
  const { g, res } = playPattern(env, 11, [1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
  eq(g.right, 8);
  eq(res.findIndex((r) => r.goodieUnlocked), 6, "goodie on the 6th right answer, question 7");
  eq(res.findIndex((r) => r.pickUnlocked), 9, "pick on the 8th right answer, question 10");
  eq(res.filter((r) => r.pickUnlocked).length, 1);
  assert(g.pickWon && E.pickEarned(g, env.settings));
  const seven = playPattern(fresh(), 12, [1, 1, 1, 1, 1, 1, 1, 0, 0, 0]).g;
  eq(seven.outcome, "win");
  assert(!seven.pickWon && !E.pickEarned(seven, env.settings), "7 right wins a goodie but no pick");
});

Deno.test("sticker pick: the switches turn it off cleanly", () => {
  const all = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const off = fresh(); off.settings.modules.stickerPick = false;
  assert(!playPattern(off, 13, all).res.some((r) => r.pickUnlocked), "module off");
  const noGoodie = fresh(); noGoodie.settings.modules.goodieRule = false;
  assert(!playPattern(noGoodie, 13, all).res.some((r) => r.pickUnlocked), "rides on the goodie rule");
  const unreachable = fresh(); unreachable.settings.numbers.stickerAt = 11;
  assert(!E.stickerPickOn(unreachable.settings), "more right answers than questions");
  const same = fresh(); same.settings.numbers.stickerAt = 6;
  const r = playPattern(same, 14, all).res;
  eq(r.findIndex((x) => x.goodieUnlocked), r.findIndex((x) => x.pickUnlocked), "goodie and pick together");
  const quick = E.presetSettings("Quick round", fresh().settings);
  assert(E.stickerPickOn(quick), "the quick round can still reach the pick");
});

Deno.test("stickers: catalogue, counts, choices, take and return", () => {
  const cat = QN_STICKERS;
  eq(cat.length, 47, "47 designs");
  eq(cat.reduce((a, d) => a + d.spots.length, 0), 51, "51 stickers on the four sheets");
  eq(new Set(cat.map((d) => d.id)).size, 47, "unique ids");
  const spots = cat.flatMap((d) => d.spots);
  eq(new Set(spots).size, spots.length, "each spot belongs to one design");
  for (const sh of QN_STICKER_SHEETS) assert(cat.some((d) => d.sheet === sh.id), "sheet " + sh.id + " has designs");
  for (const d of cat) assert(Deno.statSync(root + "assets/stickers/" + d.id + ".webp").size > 500, "picture for " + d.id);

  const st = E.stickerState(null, cat);
  eq(st.auto, true);
  eq(st.items["1-01"].left, 2, "a design printed twice starts with 2");
  eq(st.items["2-03"].left, 1);
  eq(E.stickerChoices(cat, st).length, 47);
  assert(E.takeSticker(st, "2-03"), "the pick takes it");
  eq(st.items["2-03"].left, 0);
  assert(!E.stickerChoices(cat, st).some((d) => d.id === "2-03"), "gone from the choices once taken");
  assert(!E.takeSticker(st, "2-03"), "none left to take");
  E.returnSticker(st, "2-03");
  eq(st.items["2-03"].left, 1, "a change of mind puts it back");
  st.items["1-05"].show = false;
  assert(!E.stickerChoices(cat, st).some((d) => d.id === "1-05"), "hidden stickers are not offered");
  st.auto = false;
  assert(!E.takeSticker(st, "1-01") && st.items["1-01"].left === 2, "manual removal leaves the count alone");
  E.resetStickerCounts(st, cat, 3);
  eq(st.items["1-01"].left, 6, "three printed sets of a design that's on the sheet twice");
  eq(st.items["1-05"].show, false, "resetting counts keeps what's hidden");

  const saved = JSON.parse(JSON.stringify(st));
  delete saved.items["4-19"];
  saved.items["gone"] = { show: true, left: 4 };
  const back = E.stickerState(saved, cat);
  eq(back.items["4-19"].left, 3, "a new design starts full");
  assert(!("gone" in back.items), "designs no longer in the catalogue are dropped");
  eq(back.sets, 3);
});

Deno.test("stickers: reset puts picked ones back and starts the recent picks again", () => {
  const cat = QN_STICKERS;
  const st = E.stickerState(null, cat);
  E.takeSticker(st, "2-03");
  E.takeSticker(st, "1-01");
  st.items["3-05"].show = false;
  const log = [{ t: 100, end: 200, sticker: "2-03" }, { t: 300, end: 400, sticker: "1-01" }, { t: 500, end: 600, sticker: null }];
  eq(E.stickerPicks(log, st).length, 2, "every pick counts before any reset");
  E.resetStickers(st, cat, 1, false, 450);
  eq(st.items["2-03"].left, 1);
  eq(st.items["1-01"].left, 2);
  eq(st.items["3-05"].show, false, "hidden stickers stay hidden unless asked");
  eq(E.stickerPicks(log, st).length, 0, "picks before the reset leave the list");
  eq(log.filter((g) => g.sticker).length, 2, "the game log still says who picked what");
  log.push({ t: 700, end: 800, sticker: "4-15" });
  eq(E.stickerPicks(log, st).length, 1, "picks after the reset count");
  E.resetStickers(st, cat, 2, true, 900);
  eq(st.items["3-05"].show, true, "show every sticker again");
  eq(st.items["1-01"].left, 4);
  eq(E.stickerChoices(cat, st).length, 47);
  eq(E.stickerState(JSON.parse(JSON.stringify(st)), cat).since, 900, "the reset time is saved");
});

Deno.test("rules: a timeout counts as wrong", () => {
  const env = fresh();
  const dealt = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(2));
  const ids = byId(env.bank);
  const g = E.newGame(dealt, env.settings, "");
  const r = E.answer(g, ids[dealt[0].qid], -1, env.settings);
  assert(!r.correct && g.results[0].timeout);
  eq(g.streak, 1);
});

Deno.test("switches: every module that changes dealing really does", () => {
  const ids = (env) => byId(env.bank);
  // Pictures off: no picture questions at all.
  let env = fresh(); env.settings.modules.pictures = false;
  for (let i = 0; i < 20; i++) {
    const d = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i));
    assert(d.every((x) => ids(env)[x.qid].fmt !== "pic"), "pictures off");
    eq(d.length, 10);
  }
  // Ladder off: same mix, any order, stage "mixed".
  env = fresh(); env.settings.modules.ladder = false;
  const d = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(4));
  assert(d.every((x) => x.stage === "mixed"));
  eq(d.length, 10);
  // Boss count 0: no challenge questions.
  env = fresh(); env.settings.numbers.hardCap = 0;
  for (let i = 0; i < 20; i++) assert(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i)).every((x) => ids(env)[x.qid].diff !== "challenge"), "boss 0");
  // Boss count 4.
  env = fresh(); env.settings.numbers.hardCap = 4;
  eq(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(1)).filter((x) => ids(env)[x.qid].diff === "challenge").length, 4);
  // Picture mode "2": always two.
  env = fresh(); env.settings.numbers.pictures = "2";
  for (let i = 0; i < 10; i++) eq(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i)).filter((x) => x.pic).length, 2);
  // Picture mode "1": always one.
  env = fresh(); env.settings.numbers.pictures = "1";
  for (let i = 0; i < 10; i++) eq(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i)).filter((x) => x.pic).length, 1);
  // Hidden questions never appear.
  env = fresh(); env.bank.filter((q) => q.diff === "easy").slice(0, 20).forEach((q) => { q.hidden = true; });
  for (let i = 0; i < 20; i++) assert(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i)).every((x) => !ids(env)[x.qid].hidden));
  // A pinned question appears every game.
  env = fresh(); ids(env).q30.pinned = true;
  for (let i = 0; i < 12; i++) assert(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i)).some((x) => x.qid === "q30"), "pinned in game " + i);
  // No repeats off still never repeats inside one game.
  env = fresh(); env.settings.modules.noRepeats = false;
  for (let i = 0; i < 20; i++) { const dd = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(i)); eq(new Set(dd.map((x) => x.qid)).size, dd.length); }
});

Deno.test("edge: every pack switched off means no game, not a broken one", () => {
  const env = fresh();
  env.packs.forEach((p) => { p.on = false; });
  eq(E.canPlay(env.bank, env.packs, env.settings), false);
  eq(E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(1)).length, 0);
});

Deno.test("edge: only one small pack on still deals a full game from fallbacks", () => {
  const env = fresh();
  env.packs.forEach((p) => { p.on = p.id === "r1"; });
  const d = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(1));
  eq(d.length, 9, "the 9 password questions");
  eq(new Set(d.map((x) => x.qid)).size, 9);
});

Deno.test("edge: only the picture pack on", () => {
  const env = fresh();
  env.packs.forEach((p) => { p.on = p.id === "r9"; });
  const d = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(1));
  eq(d.length, 10);
  assert(d.every((x) => x.pic));
});

Deno.test("edge: a deck running out mid-game reshuffles without repeating inside the game", () => {
  const env = fresh();
  env.packs.forEach((p) => { p.on = p.id === "r1" || p.id === "r2"; }); // 19 questions, mostly easy and medium
  const rnd = E.rng(11);
  for (let i = 0; i < 30; i++) {
    const { dealt } = play(env, rnd, 0.6);
    eq(new Set(dealt.map((x) => x.qid)).size, dealt.length, "game " + i);
  }
});

Deno.test("edge: 15 questions a game and 3 questions a game", () => {
  let env = fresh(); env.settings.numbers.questions = 15;
  let d = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(1));
  eq(d.length, 15);
  env = fresh(); env.settings.numbers.questions = 3;
  d = E.dealGame(env.bank, env.packs, env.settings, env.decks, E.rng(1));
  eq(d.length, 3);
});

Deno.test("out early returns unplayed questions to their decks", () => {
  const env = fresh();
  const ids = byId(env.bank);
  const { dealt, reached } = play(env, E.rng(13), "wrong");
  const unreached = dealt.slice(reached.length).map((x) => x.qid);
  for (const id of unreached) {
    const q = ids[id];
    const pool = env.decks[E.deckKey(q.diff, E.isPic(q))];
    assert(pool.order.includes(id) && !pool.used.includes(id), id + " should be back in its deck");
  }
});

Deno.test("PIN: SHA-256 matches the standard test vectors", async () => {
  eq(E.sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  eq(E.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  eq(E.sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  // Every length around the 64-byte block boundaries, against the platform's own SHA-256.
  for (let n = 0; n < 140; n++) {
    const s = "x".repeat(n);
    const ref = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
    eq(E.sha256(s), ref, "length " + n);
  }
});

Deno.test("PIN: default, hashed, legacy, and weak PINs", () => {
  const ev = E.deepMerge(E.DEFAULT_SETTINGS, {}).event;
  eq(E.pinLength(ev), 8);
  assert(E.pinMatches(ev, "12345678") && !E.pinMatches(ev, "12345679"), "default PIN");
  Object.assign(ev, E.hashPin("40917263"));
  eq(ev.pin, null, "the PIN itself is not stored");
  assert(ev.pinHash && ev.pinSalt && ev.pinHash.length === 64);
  assert(!JSON.stringify(ev).includes("40917263"), "the PIN never appears in saved settings");
  assert(E.pinMatches(ev, "40917263") && !E.pinMatches(ev, "40917262"), "hashed PIN");
  eq(E.pinLength(ev), 8);
  const other = E.hashPin("40917263");
  assert(other.pinSalt !== ev.pinSalt && other.pinHash !== ev.pinHash, "each PIN gets its own salt");
  const legacy = { pin: "4321", pinHash: null, pinChanged: true };
  eq(E.pinLength(legacy), 4, "an old 4-digit PIN still opens the pad until it is changed");
  assert(E.pinMatches(legacy, "4321"));
  for (const w of ["11111111", "12345678", "87654321", "01234567", "56789012", "00000000"]) assert(E.weakPin(w), w + " is weak");
  for (const s of ["40917263", "13572468", "11223344"]) assert(!E.weakPin(s), s + " is fine");
});

Deno.test("team names: one per line, or one comma-separated line, up to 8", () => {
  eq(JSON.stringify(E.teamNames("Harshit Kumar\n  Isha Sharma \n\nJummana Ali\n")), JSON.stringify(["Harshit Kumar", "Isha Sharma", "Jummana Ali"]));
  eq(JSON.stringify(E.teamNames("Harshit, Isha, Jummana, Vaishnavi")), JSON.stringify(["Harshit", "Isha", "Jummana", "Vaishnavi"]));
  eq(E.teamNames(Array.from({ length: 12 }, (_, i) => "Name " + i).join("\n")).length, 8);
  eq(E.teamNames("").length, 0);
});

Deno.test("codes are unique and readable", () => {
  const seen = [];
  for (let i = 0; i < 500; i++) {
    const c = E.makeCode(seen, Math.random);
    assert(/^KV-[A-HJKMNP-Z2-9]{4}$/.test(c), "bad code " + c);
    assert(!seen.includes(c));
    seen.push(c);
  }
});

Deno.test("CSV: export then import gives the same questions", () => {
  const env = fresh();
  const csv = E.bankToCSV(env.bank, env.packs);
  const back = E.csvToQuestions(csv);
  eq(back.errors.length, 0, back.errors.join("; "));
  eq(back.questions.length, 120);
  for (let i = 0; i < 120; i++) {
    const a = env.bank[i], b = back.questions[i];
    eq(b.q, a.q, "question " + a.n);
    eq(JSON.stringify(b.opts), JSON.stringify(E.optionsFor(a)), "options " + a.n);
    eq(b.ans, a.ans, "answer " + a.n);
    eq(b.hint, a.hint); eq(b.tip, a.tip); eq(b.fmt, a.fmt); eq(b.diff, a.diff);
  }
});

Deno.test("CSV: friendly spreadsheet columns import", () => {
  const csv = 'question,format,option_1,option_2,option_3,answer,difficulty,hint,tip\n"Is ""admin123"" a good password?",True / False,,,,False,Easy,Think about it,"Use a passphrase"\nWhat is 2FA?,MCQ,Two passwords,Password + OTP,A PIN,2,medium,,\n,MCQ,a,b,,1,easy,,\n';
  const r = E.csvToQuestions(csv);
  eq(r.questions.length, 2);
  eq(r.errors.length, 1, "the empty question row is reported");
  eq(r.questions[0].fmt, "tf");
  eq(r.questions[0].ans, 1);
  eq(r.questions[0].q, 'Is "admin123" a good password?');
  eq(r.questions[1].ans, 1);
});

Deno.test("stats count outcomes, outs by question and the hardest questions", () => {
  const env = fresh();
  const rnd = E.rng(21);
  const log = [];
  for (let i = 0; i < 40; i++) {
    const { g } = play(env, rnd, 0.55);
    log.push(E.logRecord(g));
  }
  const st = E.stats(log, env.bank);
  eq(st.players, 40);
  eq(st.wins + st.outs + st.done, 40);
  eq(Object.values(st.outAt).reduce((a, b) => a + b, 0), st.outs);
  assert(st.hardest.every((h, i, a) => i === 0 || a[i - 1].rate >= h.rate), "sorted by miss rate");
});
