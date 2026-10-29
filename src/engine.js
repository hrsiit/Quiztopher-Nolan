// Game engine: settings, storage, question decks, the difficulty ladder and the game rules.
// No DOM access here, so the same file runs in the browser and in the headless tests.
(function (global) {
  "use strict";

  const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  const word = (n) => NUM_WORDS[n] || String(n);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- Defaults ----------

  const DEFAULT_SETTINGS = {
    modules: {
      name: true,          // ask for an optional name
      outRule: true,       // out after N wrong in a row
      goodieRule: true,    // goodie at N right
      stickerPick: true,   // pick your own sticker at N right (needs the goodie rule)
      ladder: true,        // easy-to-hard ladder
      hardCap: true,       // at most N challenge questions, all at the end
      noRepeats: true,     // no question returns until its deck is used up
      pictures: true,      // picture clues
      timer: true,
      fifty: true,
      hint: true,
      tips: true,          // "Tell them" line after each answer
      showRight: true,     // light up the right answer after a wrong pick
      shuffle: true,       // shuffle option order
      mascot: true,
      shields: true,       // shields meter
      goodieMeter: true,
      celebrations: true,  // confetti and fanfare
      stageCards: true,
      sound: true,
      attract: true,       // idle loop with rules and tips
      goodiesLeft: false,  // goodies-left counter on the attract screen
      goodieCodes: true,
      stock: true,         // track goodie stock
      idleReset: true,
      kioskLock: true,
      feedback: false,     // "Learned something new?" at the end
    },
    numbers: {
      questions: 10,
      outAfter: 4,
      goodieAt: 6,
      stickerAt: 8,
      hardCap: 2,
      timerSec: 30,
      fiftyPerGame: 1,
      hintsPerGame: 1,
      pictures: "1-2",     // "1", "1-2" or "2" picture clues a game
      idleSec: 30,
      resultSec: 20,
      winIdleSec: 120,
      lowStockAt: 10,
      volume: 0.35,
      tipAfter: "both",    // "both", "right", "wrong"
      tipAutoSec: 0,       // 0 waits for a tap on Next
      revealMode: "auto",  // "auto" or "volunteer"
    },
    look: { theme: "midnight", motion: "full" },
    event: {
      name: "Quiztopher Nolan",
      tagline: "Cyber Security Awareness Month",
      club: "",
      team: "",            // group members, one per line
      pin: "12345678",     // the default, until someone sets their own (then only a salted hash is kept)
      pinHash: null,
      pinSalt: null,
      pinLength: 8,
      pinChanged: false,
    },
  };
  const DEFAULT_PIN = "12345678";

  const BUILTIN_PRESETS = {
    "Stall default": { modules: {}, numbers: {} },
    "Practice": {
      modules: { outRule: false, timer: false, goodieCodes: false, kioskLock: false, idleReset: false, celebrations: true },
      numbers: { fiftyPerGame: 3, hintsPerGame: 3 },
    },
    "Quick round": {
      modules: { pictures: true },
      numbers: { questions: 6, goodieAt: 4, stickerAt: 5, outAfter: 3, hardCap: 1, timerSec: 20 },
    },
  };

  function deepMerge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over.slice() : base.slice();
    if (base && typeof base === "object") {
      const out = {};
      for (const k of Object.keys(base)) out[k] = deepMerge(base[k], over ? over[k] : undefined);
      if (over && typeof over === "object") for (const k of Object.keys(over)) if (!(k in base)) out[k] = over[k];
      return out;
    }
    return over === undefined ? base : over;
  }

  function presetSettings(name, current) {
    const p = BUILTIN_PRESETS[name];
    if (!p) return null;
    const fresh = deepMerge(DEFAULT_SETTINGS, {});
    fresh.modules = Object.assign(fresh.modules, p.modules);
    fresh.numbers = Object.assign(fresh.numbers, p.numbers);
    fresh.look = current.look;
    fresh.event = current.event;
    return fresh;
  }

  // ---------- Team and PIN ----------

  // One name per line; a single comma-separated line works too. Up to 8 names.
  function teamNames(raw) {
    let lines = String(raw || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].includes(",")) lines = lines[0].split(",").map((s) => s.trim()).filter(Boolean);
    return lines.slice(0, 8).map((s) => s.slice(0, 48));
  }

  // SHA-256, synchronous so the PIN pad can check without waiting (and without needing a secure context).
  function sha256(str) {
    const ror = (x, n) => (x >>> n) | (x << (32 - n));
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    const K = primes.map((p) => frac(Math.cbrt(p)));
    const H = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const bytes = new TextEncoder().encode(str);
    const buf = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 4, bytes.length * 8);
    const W = new Int32Array(64);
    for (let i = 0; i < buf.length; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = dv.getInt32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const a = W[t - 15], b = W[t - 2];
        W[t] = (W[t - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + W[t - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((v, k) => { H[k] = (H[k] + v) | 0; });
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }

  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(a);
    else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
  }

  // The fields to merge into settings.event when someone sets a new PIN. The PIN itself is not kept.
  function hashPin(pin) {
    const salt = randomHex(16);
    return { pin: null, pinSalt: salt, pinHash: sha256(salt + ":" + pin), pinLength: pin.length, pinChanged: true };
  }
  function pinMatches(ev, entry) {
    if (ev.pinHash) return sha256(ev.pinSalt + ":" + entry) === ev.pinHash;
    return String(ev.pin == null ? DEFAULT_PIN : ev.pin) === entry;
  }
  function pinLength(ev) { return ev.pinHash ? ev.pinLength || 8 : String(ev.pin == null ? DEFAULT_PIN : ev.pin).length; }
  // Rejects PINs anyone would guess first: one digit repeated, or a straight run up or down.
  function weakPin(pin) {
    if (/^(\d)\1+$/.test(pin)) return true;
    const up = "01234567890123456789", down = "98765432109876543210";
    return up.includes(pin) || down.includes(pin);
  }

  // ---------- Storage ----------

  const PREFIX = "qn.v1.";
  function makeStore(backend) {
    const mem = {};
    const be = backend || {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
    };
    let lastError = null;
    return {
      get(key, fallback) {
        try {
          const raw = be.getItem(PREFIX + key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { be.setItem(PREFIX + key, JSON.stringify(value)); lastError = null; return true; }
        catch (e) { lastError = e; return false; }
      },
      remove(key) { try { be.removeItem(PREFIX + key); } catch (e) { /* ignore */ } },
      get lastError() { return lastError; },
    };
  }

  // ---------- Random ----------

  function rng(seed) {
    if (seed == null) return Math.random;
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- Question bank ----------

  const FIXED_OPTS = { tf: ["True", "False"], ss: ["Scam", "Safe"] };

  function buildBank(rows) {
    return rows.map((r) => {
      const [n, pack, fmt, diff, q, opts, ans, hint, tip] = r;
      return {
        id: "q" + n, n, pack, fmt, diff, q,
        opts: opts ? opts.slice() : FIXED_OPTS[fmt].slice(),
        ans, hint: hint || "", tip: tip || "",
        pic: fmt === "pic" ? String(n) : null,
        hidden: false, pinned: false, timer: null,
      };
    });
  }

  function defaultPacks(packs) {
    return packs.map((p, i) => ({
      id: p.id, name: p.name, short: p.short, on: true, hints: true, order: i,
      challenge: !!p.challenge, pictures: !!p.pictures, custom: false,
    }));
  }

  function optionsFor(q) {
    if (q.fmt === "tf" || q.fmt === "ss") return FIXED_OPTS[q.fmt].slice();
    return q.opts.slice();
  }

  function validateQuestion(q) {
    const errs = [];
    if (!q.q || !String(q.q).trim()) errs.push("Question text is empty");
    const opts = optionsFor(q).filter((o) => String(o).trim());
    if (opts.length < 2) errs.push("Needs at least 2 options");
    if (!(q.ans >= 0 && q.ans < optionsFor(q).length)) errs.push("Pick the right answer");
    if (!["easy", "medium", "hard", "challenge"].includes(q.diff)) errs.push("Unknown difficulty");
    return errs;
  }

  // ---------- Decks ----------
  // One deck per difficulty tier, with picture clues held in their own half of each tier so the
  // ladder can ask for "a medium picture" without draining the medium questions.

  const TIERS = ["easy", "medium", "hard", "challenge"];
  const deckKey = (tier, pic) => tier + (pic ? "-pic" : "");
  const isPic = (q) => q.fmt === "pic" || !!q.pic;

  function eligibleMap(bank, packs, settings) {
    const on = {};
    for (const p of packs) on[p.id] = p.on;
    const map = {};
    for (const t of TIERS) { map[deckKey(t, false)] = []; map[deckKey(t, true)] = []; }
    for (const q of bank) {
      if (q.hidden || !on[q.pack]) continue;
      if (isPic(q) && !settings.modules.pictures) continue;
      if (validateQuestion(q).length) continue;
      map[deckKey(q.diff, isPic(q))].push(q.id);
    }
    return map;
  }

  function syncPool(pool, elig, rnd) {
    const set = new Set(elig);
    pool.order = pool.order.filter((id) => set.has(id));
    pool.used = pool.used.filter((id) => set.has(id));
    const known = new Set(pool.order.concat(pool.used));
    for (const id of elig) {
      if (known.has(id)) continue;
      const at = Math.floor(rnd() * (pool.order.length + 1));
      pool.order.splice(at, 0, id);
    }
  }

  function drawFromKey(decks, key, elig, exclude, rnd, noRepeats) {
    const ids = elig[key] || [];
    if (!ids.length) return null;
    if (!noRepeats) {
      const cands = ids.filter((id) => !exclude.has(id));
      return cands.length ? cands[Math.floor(rnd() * cands.length)] : null;
    }
    const pool = decks[key] || (decks[key] = { order: [], used: [] });
    syncPool(pool, ids, rnd);
    let i = pool.order.findIndex((id) => !exclude.has(id));
    if (i < 0) {
      // Every question in this deck has had a turn: reshuffle it.
      pool.order = pool.order.concat(shuffle(pool.used, rnd));
      pool.used = [];
      i = pool.order.findIndex((id) => !exclude.has(id));
      if (i < 0) return null;
    }
    const id = pool.order.splice(i, 1)[0];
    pool.used.push(id);
    return id;
  }

  function returnToDecks(decks, bankById, ids, rnd) {
    for (const id of ids) {
      const q = bankById[id];
      if (!q) continue;
      const pool = decks[deckKey(q.diff, isPic(q))];
      if (!pool) continue;
      const u = pool.used.indexOf(id);
      if (u < 0) continue;
      pool.used.splice(u, 1);
      const at = Math.floor(rnd() * (pool.order.length + 1));
      pool.order.splice(at, 0, id);
    }
  }

  function deckSummary(decks, elig) {
    const out = [];
    for (const t of TIERS) {
      const ids = (elig[deckKey(t, false)] || []).concat(elig[deckKey(t, true)] || []);
      const used = [deckKey(t, false), deckKey(t, true)]
        .map((k) => (decks[k] ? decks[k].used.filter((id) => ids.includes(id)).length : 0))
        .reduce((a, b) => a + b, 0);
      out.push({ tier: t, total: ids.length, used });
    }
    return out;
  }

  // ---------- Ladder ----------

  function bossCount(settings) {
    const n = settings.numbers.questions;
    return Math.max(0, Math.min(settings.numbers.hardCap, n - 1));
  }

  function buildSlots(settings, rnd) {
    const m = settings.modules, num = settings.numbers;
    const n = Math.max(1, Math.min(20, num.questions | 0));
    const boss = Math.min(bossCount(settings), n);
    const r = n - boss;
    const final = r >= 4 ? Math.max(1, Math.round(r / 8)) : 0;
    const warm = r >= 3 ? Math.round((r * 3) / 8) : Math.min(r, 1);
    const tricky = Math.max(0, r - warm - final);
    const slots = [];
    const finalTiers = m.hardCap ? ["hard"] : ["hard", "challenge"];
    for (let i = 0; i < warm; i++) slots.push({ stage: "warm", tiers: ["easy"], pic: false });
    for (let i = 0; i < tricky; i++) slots.push({ stage: "tricky", tiers: ["medium"], pic: false });
    for (let i = 0; i < final; i++) slots.push({ stage: "final", tiers: finalTiers, pic: false });
    for (let i = 0; i < boss; i++) slots.push({ stage: "boss", tiers: ["challenge"], pic: false });

    if (m.pictures) {
      const mode = num.pictures;
      const want = mode === "2" ? 2 : mode === "1" ? 1 : 1 + (rnd() < 0.5 ? 1 : 0);
      let placed = 0;
      // The first picture sits in the middle of "Getting tricky" (question 6 of 10).
      if (tricky > 0) { slots[warm + Math.floor(tricky / 2)].pic = true; placed++; }
      else if (warm > 0) { slots[warm - 1].pic = true; placed++; }
      // The second, when there is one, is the hard question in the final stretch.
      if (placed < want && final > 0) { slots[warm + tricky].pic = true; slots[warm + tricky].tiers = ["hard"]; placed++; }
      else if (placed < want && tricky > 1) { slots[warm + tricky - 1].pic = true; placed++; }
    }
    if (!m.ladder) return shuffle(slots, rnd).map((s) => Object.assign({}, s, { stage: "mixed" }));
    return slots;
  }

  const FALLBACK = {
    easy: ["easy", "medium", "hard", "challenge"],
    medium: ["medium", "easy", "hard", "challenge"],
    hard: ["hard", "medium", "challenge", "easy"],
    challenge: ["challenge", "hard", "medium", "easy"],
  };

  // Deal the questions for one game. Mutates `decks`.
  function dealGame(bank, packs, settings, decks, rnd) {
    rnd = rnd || Math.random;
    const elig = eligibleMap(bank, packs, settings);
    const byId = {};
    for (const q of bank) byId[q.id] = q;
    const slots = buildSlots(settings, rnd);
    const exclude = new Set();
    const noRepeats = settings.modules.noRepeats;
    const capOn = settings.modules.hardCap;
    const capN = bossCount(settings);
    let challengeUsed = 0;
    const pinned = bank.filter((q) => q.pinned && !q.hidden && elig[deckKey(q.diff, isPic(q))].includes(q.id));
    const dealt = [];

    for (const slot of slots) {
      let id = null;
      // Pinned questions always appear, in a slot of their own difficulty.
      const pin = pinned.find((q) => !exclude.has(q.id) && slot.tiers.includes(q.diff) && isPic(q) === slot.pic);
      if (pin) {
        id = pin.id;
        const pool = decks[deckKey(pin.diff, isPic(pin))];
        if (pool) {
          const o = pool.order.indexOf(id);
          if (o >= 0) { pool.order.splice(o, 1); pool.used.push(id); }
        }
      }
      if (!id) {
        // Try the slot's own tier(s) first, then nearby tiers, then the other kind (picture / not).
        const order = shuffle(slot.tiers, rnd).map((t) => deckKey(t, slot.pic));
        for (const t of FALLBACK[slot.tiers[0]]) order.push(deckKey(t, slot.pic));
        for (const t of FALLBACK[slot.tiers[0]]) order.push(deckKey(t, !slot.pic));
        const seen = new Set();
        for (const key of order) {
          if (seen.has(key)) continue;
          seen.add(key);
          // With the cap on, no game gets more challenge questions than it has boss slots.
          if (capOn && key.startsWith("challenge") && challengeUsed >= capN) continue;
          id = drawFromKey(decks, key, elig, exclude, rnd, noRepeats);
          if (id) break;
        }
      }
      if (!id) continue;
      exclude.add(id);
      if (byId[id].diff === "challenge") challengeUsed++;
      dealt.push({ qid: id, stage: slot.stage, pic: isPic(byId[id]) });
    }
    return dealt;
  }

  function canPlay(bank, packs, settings) {
    const elig = eligibleMap(bank, packs, settings);
    return Object.values(elig).reduce((a, b) => a + b.length, 0) > 0;
  }

  // ---------- A game ----------

  function newGame(dealt, settings, name, now) {
    return {
      id: "g" + (now || Date.now()).toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      name: name || "",
      startedAt: now || Date.now(),
      slots: dealt,
      idx: 0,
      results: [],
      right: 0,
      streak: 0,
      goodieWon: false,
      goodieAtQ: null,
      pickWon: false,
      fiftyLeft: settings.modules.fifty ? settings.numbers.fiftyPerGame : 0,
      hintLeft: settings.modules.hint ? settings.numbers.hintsPerGame : 0,
      out: false,
      outcome: null,
      code: null,
    };
  }

  // picked: index into the question's own option list, or -1 for a timeout.
  function answer(game, q, picked, settings, extra) {
    const m = settings.modules, num = settings.numbers;
    const correct = picked === q.ans;
    game.results.push(Object.assign({ qid: q.id, picked, correct, timeout: picked === -1 }, extra || {}));
    let goodieUnlocked = false, pickUnlocked = false;
    if (correct) { game.right++; game.streak = 0; }
    else game.streak++;
    if (m.goodieRule && !game.goodieWon && game.right >= num.goodieAt) {
      game.goodieWon = true;
      game.goodieAtQ = game.idx + 1;
      goodieUnlocked = true;
    }
    if (stickerPickOn(settings) && game.goodieWon && !game.pickWon && game.right >= num.stickerAt) {
      game.pickWon = true;
      pickUnlocked = true;
    }
    // A winner is never cut short.
    if (m.outRule && !game.goodieWon && game.streak >= num.outAfter) game.out = true;
    const isLast = game.idx >= game.slots.length - 1;
    return { correct, goodieUnlocked, pickUnlocked, out: game.out, isLast };
  }

  function finish(game) {
    if (game.out) game.outcome = "out";
    else game.outcome = game.goodieWon ? "win" : "done";
    return game.outcome;
  }

  // ---------- Sticker pick ----------

  // A high score lets the player choose their own sticker. The saved state says whether a pick takes the sticker
  // off the count, how many copies of the sheets were printed, when the stickers were last reset, and for each design
  // whether players see it and how many are left. A design added to the catalogue later starts shown with a full count.
  function stickerState(saved, catalog) {
    const st = Object.assign({ auto: true, sets: 1, since: 0, items: {} }, saved || {});
    st.sets = Math.max(1, st.sets | 0);
    const items = {};
    for (const d of catalog) {
      const s = st.items[d.id];
      items[d.id] = s ? { show: s.show !== false, left: Math.max(0, s.left | 0) } : { show: true, left: d.spots.length * st.sets };
    }
    st.items = items;
    return st;
  }

  // The designs a player can choose from right now: shown, with at least one left.
  function stickerChoices(catalog, st) {
    return catalog.filter((d) => st.items[d.id] && st.items[d.id].show && st.items[d.id].left > 0);
  }

  function resetStickerCounts(st, catalog, sets) {
    st.sets = Math.max(1, sets | 0);
    for (const d of catalog) st.items[d.id] = { show: st.items[d.id] ? st.items[d.id].show : true, left: d.spots.length * st.sets };
  }

  // A fresh start, for after testing or a new print run: full counts, optionally every sticker shown again, and the
  // list of recent picks starts from now. The game log itself still records who picked what.
  function resetStickers(st, catalog, sets, showAll, now) {
    resetStickerCounts(st, catalog, sets);
    if (showAll) for (const d of catalog) st.items[d.id].show = true;
    st.since = now || Date.now();
  }
  function stickerPicks(log, st) {
    return log.filter((g) => g.sticker && (g.end || g.t) >= (st.since || 0));
  }

  // With automatic removal on, a pick takes one off the count. Returns whether it did, so a change of mind can put it back.
  function takeSticker(st, id) {
    const it = st.items[id];
    if (!it || !st.auto || it.left <= 0) return false;
    it.left--;
    return true;
  }
  function returnSticker(st, id) {
    const it = st.items[id];
    if (it) it.left++;
  }

  // The pick rides on the goodie rule and must be reachable in one game.
  function stickerPickOn(settings) {
    const m = settings.modules, n = settings.numbers;
    return !!(m.goodieRule && m.stickerPick && n.stickerAt <= n.questions);
  }
  function pickEarned(game, settings) {
    return stickerPickOn(settings) && game.goodieWon && game.right >= settings.numbers.stickerAt;
  }

  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function makeCode(existing, rnd) {
    rnd = rnd || Math.random;
    const used = new Set(existing || []);
    for (let tries = 0; tries < 1000; tries++) {
      let s = "";
      for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)];
      const code = "KV-" + s;
      if (!used.has(code)) return code;
    }
    return "KV-" + Date.now().toString(36).slice(-4).toUpperCase();
  }

  function logRecord(game, endedAt) {
    const reached = game.results.map((r) => r.qid);
    return {
      id: game.id,
      t: game.startedAt,
      end: endedAt || Date.now(),
      n: game.slots.length,
      qs: reached,
      res: game.results.map((r) => (r.correct ? 1 : r.timeout ? -1 : 0)),
      right: game.right,
      outcome: game.outcome,
      outAt: game.outcome === "out" ? game.results.length : null,
      goodieAt: game.goodieAtQ,
      code: game.code,
      sticker: null,
      handed: null,
      fifty: game.results.some((r) => r.fifty),
      hint: game.results.some((r) => r.hint),
      fb: null,
    };
  }

  // ---------- Stats ----------

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function stats(log, bank) {
    const byDay = {};
    const outAt = {};
    const perQ = {};
    let wins = 0, handed = 0, outs = 0, done = 0, left = 0, fbYes = 0, fbNo = 0;
    for (const g of log) {
      const d = dayKey(g.t);
      const day = byDay[d] || (byDay[d] = { day: d, players: 0, wins: 0, handed: 0, outs: 0, done: 0, left: 0 });
      day.players++;
      if (g.outcome === "win") { wins++; day.wins++; }
      if (g.handed) { handed++; day.handed++; }
      if (g.outcome === "out") { outs++; day.outs++; outAt[g.outAt] = (outAt[g.outAt] || 0) + 1; }
      if (g.outcome === "done") { done++; day.done++; }
      if (g.outcome === "left") { left++; day.left++; }
      if (g.fb === "yes") fbYes++;
      if (g.fb === "no") fbNo++;
      g.qs.forEach((qid, i) => {
        const s = perQ[qid] || (perQ[qid] = { qid, seen: 0, missed: 0 });
        s.seen++;
        if (g.res[i] !== 1) s.missed++;
      });
    }
    const byId = {};
    for (const q of bank) byId[q.id] = q;
    const hardest = Object.values(perQ)
      .filter((s) => s.seen >= 2 && s.missed > 0)
      .map((s) => Object.assign(s, { rate: s.missed / s.seen, q: byId[s.qid] }))
      .sort((a, b) => b.rate - a.rate || b.seen - a.seen)
      .slice(0, 10);
    return {
      players: log.length, wins, handed, outs, done, left, fbYes, fbNo,
      days: Object.values(byDay).sort((a, b) => (a.day < b.day ? 1 : -1)),
      outAt, hardest,
    };
  }

  // ---------- CSV ----------

  function csvCell(v) {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  const FMT_NAMES = { mcq: "mcq", tf: "true_false", ss: "scam_or_safe", fill: "fill_in", ff: "full_form", pic: "picture" };
  const CSV_HEAD = ["id", "number", "pack", "format", "difficulty", "question", "option_1", "option_2", "option_3", "option_4",
    "answer", "hint", "tip", "picture", "hidden", "pinned", "timer_seconds"];

  function bankToCSV(bank, packs) {
    const name = {};
    for (const p of packs) name[p.id] = p.name;
    const rows = [CSV_HEAD];
    for (const q of bank) {
      const o = optionsFor(q);
      rows.push([q.id, q.n, name[q.pack] || q.pack, FMT_NAMES[q.fmt], q.diff, q.q, o[0] || "", o[1] || "", o[2] || "", o[3] || "",
        q.ans + 1, q.hint, q.tip, q.pic || "", q.hidden ? "yes" : "", q.pinned ? "yes" : "", q.timer || ""]);
    }
    return toCSV(rows);
  }

  function normFmt(s) {
    const k = String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    if (["mcq", "multiplechoice", "choice"].includes(k)) return "mcq";
    if (["tf", "truefalse", "trueorfalse"].includes(k)) return "tf";
    if (["ss", "scamorsafe", "scamsafe"].includes(k)) return "ss";
    if (["fill", "fillin", "fillintheblank", "blank"].includes(k)) return "fill";
    if (["ff", "fullform"].includes(k)) return "ff";
    if (["pic", "picture", "image"].includes(k)) return "pic";
    return null;
  }
  function normDiff(s) {
    const k = String(s || "").toLowerCase().trim();
    if (["easy", "medium", "hard", "challenge"].includes(k)) return k;
    if (["boss", "challenge round"].includes(k)) return "challenge";
    return null;
  }
  const yes = (s) => /^(y|yes|true|1|on)$/i.test(String(s || "").trim());

  // Returns { questions, errors } with each question ready for the bank (pack still to be set).
  function csvToQuestions(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { questions: [], errors: ["The file is empty"] };
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const col = (name) => head.indexOf(name);
    if (col("question") < 0) return { questions: [], errors: ["No “question” column found in the first row"] };
    const out = [], errors = [];
    rows.slice(1).forEach((r, i) => {
      const get = (name) => (col(name) >= 0 ? (r[col(name)] || "").trim() : "");
      const line = i + 2;
      const fmt = normFmt(get("format")) || "mcq";
      const diff = normDiff(get("difficulty")) || "medium";
      let opts = [get("option_1"), get("option_2"), get("option_3"), get("option_4")].filter(Boolean);
      if (fmt === "tf") opts = ["True", "False"];
      if (fmt === "ss") opts = ["Scam", "Safe"];
      const a = get("answer");
      let ans = -1;
      if (/^\d+$/.test(a)) ans = parseInt(a, 10) - 1;
      else if (/^[a-d]\)?$/i.test(a)) ans = a.toLowerCase().charCodeAt(0) - 97;
      else ans = opts.findIndex((o) => o.toLowerCase() === a.toLowerCase());
      const q = {
        id: get("id") || null, n: parseInt(get("number"), 10) || null, packName: get("pack"),
        fmt, diff, q: get("question"), opts, ans, hint: get("hint"), tip: get("tip"),
        pic: get("picture") || null, hidden: yes(get("hidden")), pinned: yes(get("pinned")),
        timer: parseInt(get("timer_seconds"), 10) || null,
      };
      if (fmt === "pic" && !q.pic) q.pic = null;
      const errs = validateQuestion(q);
      if (errs.length) errors.push("Row " + line + ": " + errs.join(", "));
      else out.push(q);
    });
    return { questions: out, errors };
  }

  global.QN_Engine = {
    NUM_WORDS, word, cap, DEFAULT_SETTINGS, DEFAULT_PIN, BUILTIN_PRESETS, deepMerge, presetSettings,
    teamNames, sha256, hashPin, pinMatches, pinLength, weakPin,
    makeStore, rng, shuffle, buildBank, defaultPacks, optionsFor, validateQuestion,
    TIERS, deckKey, isPic, eligibleMap, drawFromKey, returnToDecks, deckSummary,
    bossCount, buildSlots, dealGame, canPlay, newGame, answer, finish, makeCode, logRecord,
    stickerState, stickerChoices, resetStickerCounts, resetStickers, stickerPicks, takeSticker, returnSticker, stickerPickOn, pickEarned,
    dayKey, stats, toCSV, parseCSV, bankToCSV, csvToQuestions, FMT_NAMES,
  };
})(typeof window !== "undefined" ? window : globalThis);
