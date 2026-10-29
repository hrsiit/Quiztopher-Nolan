// Quiztopher Nolan: the visitor-facing app (attract, start, play, endings) plus kiosk, idle, backup and queue screen.
(function () {
  "use strict";
  const E = window.QN_Engine, K = window.QN_Kit;
  const { esc, rich, icon, Sound } = K;

  function safeStorage() {
    try { localStorage.setItem("qn.test", "1"); localStorage.removeItem("qn.test"); return localStorage; }
    catch (e) { return null; }
  }
  const store = E.makeStore(safeStorage());
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const S = {};
  const App = {
    screen: null, el: null, game: null, q: null, timers: [], W: 1440, scale: 1,
    inAdmin: false, lastInput: Date.now(), phaseAt: Date.now(), wantFullscreen: false, queue: false,
    storageWarn: false, overlay: null, idleEl: null, kioskEl: null, busy: false, lastName: "",
  };

  // ---------- State ----------

  function mergePacks(saved) {
    const base = E.defaultPacks(window.QN_PACKS);
    if (!Array.isArray(saved)) return base;
    const ids = new Set(saved.map((p) => p.id));
    return saved.concat(base.filter((p) => !ids.has(p.id))).sort((a, b) => a.order - b.order);
  }

  // readOnly is for the queue screen: it must never touch the main window's game in progress.
  function load(readOnly) {
    S.settings = E.deepMerge(E.DEFAULT_SETTINGS, store.get("settings", {}));
    S.packs = mergePacks(store.get("packs", null));
    S.bank = store.get("bank", null) || E.buildBank(window.QN_ROWS);
    S.strings = store.get("strings", {});
    S.tips = store.get("tips", null) || window.QN_TIPS.slice();
    S.presets = store.get("presets", {});
    S.activePreset = store.get("activePreset", "Stall default");
    S.decks = store.get("decks", {});
    S.log = store.get("log", []);
    S.goodies = Object.assign({ stock: 50, left: 50, setAt: null }, store.get("goodies", {}));
    S.stickers = E.stickerState(store.get("stickers", null), window.QN_STICKERS || []);
    S.images = store.get("images", {});
    S.clubLogo = store.get("clubLogo", null);
    S.inflight = store.get("inflight", null);
    // Laptops still on the old 4-digit default move to the 8-digit one.
    const ev = S.settings.event;
    if (!ev.pinChanged && !ev.pinHash) ev.pin = E.DEFAULT_PIN;
    reindex();
    if (readOnly) return;
    // A game was cut off by a restart: put its unplayed questions back in their decks.
    if (Array.isArray(S.inflight) && S.inflight.length) {
      E.returnToDecks(S.decks, App.byId, S.inflight, Math.random);
      save("decks");
    }
    S.inflight = null;
    store.remove("inflight");
  }

  function reindex() {
    App.byId = {};
    for (const q of S.bank) App.byId[q.id] = q;
    App.packById = {};
    for (const p of S.packs) App.packById[p.id] = p;
  }

  // Saves one or more parts of the state. A failed write (storage full) shows a warning in the admin panel.
  function save() {
    let ok = true;
    for (const k of arguments) if (!store.set(k, S[k])) ok = false;
    if (!ok) App.storageWarn = true;
    return ok;
  }
  // The game log matters most, so on a full disk it is retried after clearing the throwaway status key.
  function saveLog() {
    if (store.set("log", S.log)) return true;
    store.remove("live");
    const ok = store.set("log", S.log);
    if (!ok) App.storageWarn = true;
    return ok;
  }

  // ---------- Text ----------

  function baseVars() {
    const n = S.settings.numbers;
    const boss = S.settings.modules.ladder ? E.bossCount(S.settings) : 0;
    const q = Math.min(n.questions, 20);
    return {
      n: q, N: E.cap(E.word(q)), nWord: E.word(q),
      g: n.goodieAt, G: E.cap(E.word(n.goodieAt)), gWord: E.word(n.goodieAt),
      o: n.outAfter, O: E.cap(E.word(n.outAfter)), oWord: E.word(n.outAfter),
      p: n.stickerAt, P: E.cap(E.word(n.stickerAt)), pWord: E.word(n.stickerAt),
      boss, bossWord: E.word(boss),
    };
  }
  function t(key, v) {
    const own = S.strings[key];
    let s = own != null && own !== "" ? own : window.QN_STRINGS[key];
    if (s == null) return key;
    if (s.indexOf("|") >= 0) { const parts = s.split("|"); s = parts[Math.floor(Math.random() * parts.length)]; }
    const b = baseVars();
    return s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : b[k] != null ? b[k] : m));
  }
  const tr = (key, v) => rich(t(key, v));
  const cleanName = (s) => String(s || "").replace(/[`*_<>{}|]/g, "").replace(/\s+/g, " ").trimStart().slice(0, 20);

  // ---------- Stage ----------

  const stage = () => $("#stage");
  function fit() {
    const vw = innerWidth, vh = innerHeight;
    const W = Math.round(Math.min(1760, Math.max(1280, (900 * vw) / vh)));
    const s = Math.min(vw / W, vh / 900);
    const st = stage();
    st.style.width = W + "px";
    st.style.transform = "translate(" + (vw - W * s) / 2 + "px," + (vh - 900 * s) / 2 + "px) scale(" + s + ")";
    App.W = W; App.scale = s;
  }

  function later(fn, ms) { const id = setTimeout(fn, ms); App.timers.push(id); return id; }
  function every(fn, ms) { const id = setInterval(fn, ms); App.timers.push(id); return id; }
  function clearScreenTimers() {
    App.timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
    App.timers = [];
    stopQTimer();
  }

  function mount(name, html, opts) {
    clearScreenTimers();
    hideIdle();
    const el = document.createElement("div");
    el.className = "screen enter " + name;
    el.innerHTML = html;
    const old = App.el;
    if (old) {
      old.classList.remove("enter");
      old.classList.add("leave");
      setTimeout(() => old.remove(), 240);
    }
    const st = stage();
    const firstOverlay = $(".overlay, .goodie-burst", st);
    st.insertBefore(el, firstOverlay || null);
    App.el = el;
    App.screen = name;
    App.phaseAt = Date.now();
    document.body.dataset.screen = name;
    document.body.dataset.mood = (opts && opts.mood) || "";
    $$(".logo", el).forEach(bindLogo);
    return el;
  }

  function announce(text) {
    const sr = $("#sr");
    if (!sr) return;
    sr.textContent = "";
    setTimeout(() => { sr.textContent = text; }, 40);
  }

  function motion() { return document.documentElement.dataset.motion || "full"; }

  // ---------- Shared bits ----------

  function brandMarkup(sub) {
    const ev = S.settings.event;
    return '<div class="brand"><button class="logo" aria-label="' + esc(ev.name) + '">' + icon("shieldLogo", 24, { color: "#0B1020", sw: 2.2 }) + "</button>" +
      '<div class="col" style="gap:2px"><span class="brand-name">' + esc(ev.name) + "</span>" + (sub ? '<span class="brand-sub">' + esc(sub) + "</span>" : "") + "</div></div>";
  }

  function rulesList() {
    const m = S.settings.modules;
    const v = baseVars();
    const list = [];
    const subKey = m.ladder && v.boss > 0 ? (v.boss === 1 ? "One" : "") : "Flat";
    list.push({ tone: "accent", ico: K.bars([8, 14, 20, 26]), t: t("rule.questions"), s: t("rule.questionsSub" + subKey),
      ct: t("start.cardQuestions"), cs: t("start.cardQuestionsSub" + subKey), cls: "" });
    const pickOn = pickOffered();
    if (m.goodieRule) list.push({ tone: "warn", ico: icon("gift", 26), t: t("rule.goodie"), s: t(pickOn ? "rule.goodieSubPick" : "rule.goodieSub"),
      ct: t("start.cardGoodie"), cs: t(pickOn ? "start.cardGoodieSubPick" : "start.cardGoodieSub"), cls: "warn" });
    if (m.outRule) list.push({ tone: "bad", ico: K.crackedShield(false, 26), t: t("rule.out"), s: t("rule.outSub"),
      ct: t("start.cardOut"), cs: t("start.cardOutSub"), cls: "bad" });
    if (list.length < 3 && m.tips) list.push({ tone: "good", ico: icon("bulb", 26), t: t("rule.tips"), s: t("rule.tipsSub"),
      ct: t("start.cardTips"), cs: t("start.cardTipsSub"), cls: "good" });
    return list;
  }

  function goodiesLeft() { return Math.max(0, S.goodies.left | 0); }

  // The sticker pick: players who reach numbers.stickerAt choose their own sticker after the game.
  const stickerCatalog = () => window.QN_STICKERS || [];
  function stickerChoices() { return E.stickerChoices(stickerCatalog(), S.stickers); }
  // Offered only while it can be honoured: switched on, reachable, goodies in stock and stickers left to choose.
  function pickOffered() {
    const m = S.settings.modules;
    return E.stickerPickOn(S.settings) && !(m.stock && goodiesLeft() <= 0) && stickerChoices().length > 0;
  }
  function stickerById(id) { return stickerCatalog().find((d) => d.id === id) || null; }
  function stickerImg(d, cls) {
    const src = (window.QN_STICKER_ART || {})[d.id] || "";
    return '<img class="' + (cls || "") + '" src="' + src + '" alt="' + esc(d.name) + '" draggable="false">';
  }
  // Where a volunteer finds it: "Sheet 2, no. 3", or "Sheet 1, no. 1 or 3" for a design printed twice.
  function stickerWhere(d) {
    const by = {};
    d.spots.forEach((s) => { const [sh, no] = s.split("-"); (by[sh] = by[sh] || []).push(+no); });
    return Object.keys(by).map((sh) => t("pick.where", { sheet: sh, no: by[sh].join(" or ") })).join(" or ");
  }
  // Once the goodie is won, its meter counts down to the sticker pick while the pick is still reachable.
  function wonLabel(g) {
    if (!App.pickOn) return t("q.goodieDone");
    if (g.pickWon) return t("q.stickerDone");
    const k = S.settings.numbers.stickerAt - g.right;
    if (k > g.slots.length - g.results.length) return t("q.goodieDone");
    return k === 1 ? t("q.stickerOneMore") : t("q.stickerMore", { k });
  }

  // The group members, shown under "Made by" on the attract and queue screens.
  function teamMarkup(i) {
    const team = E.teamNames(S.settings.event.team);
    if (!team.length) return "";
    return '<section class="team rise" style="--i:' + (i || 4) + '" aria-label="' + esc(t("attract.madeBy")) + '"><span class="label">' + esc(t("attract.madeBy")) + "</span>" +
      '<ul class="' + (team.length > 3 ? "two" : "") + '">' + team.map((n) => "<li>" + esc(n) + "</li>").join("") + "</ul></section>";
  }

  // ---------- Attract ----------

  function showAttract() {
    const m = S.settings.modules, ev = S.settings.event;
    const playable = E.canPlay(S.bank, S.packs, S.settings);
    const sub = (ev.club ? ev.club + " · " : "") + ev.tagline;
    const stockOut = m.stock && goodiesLeft() <= 0;
    let pill = "";
    if (m.goodieRule && !stockOut && playable) {
      pill = '<div class="pill-goodie">' + icon("gift", 17, { color: "var(--warn)" }) +
        esc(m.goodiesLeft && m.stock ? t("attract.pillLeft", { left: goodiesLeft() }) : t("attract.pill")) + "</div>";
    }
    const logo = S.clubLogo ? '<img class="club-logo" src="' + S.clubLogo + '" alt="' + esc(ev.club || "Club logo") + '">' : "";
    const tips = S.tips.filter((x) => x.trim());
    const tipIdx = tips.length ? Math.floor(Math.random() * tips.length) : 0;
    const rules = rulesList().map((r) =>
      '<div class="rule-row"><span class="icon-tile ' + r.tone + '">' + r.ico + '</span><div class="col"><span class="t">' + esc(r.t) + '</span><span class="s">' + esc(r.s) + "</span></div></div>").join("");
    const cta = playable
      ? '<div class="cta rise" style="--i:3"><button class="btn btn-primary xl pulse" data-act="play">' + esc(t("attract.play")) + icon("arrowR", 26, { sw: 2.4, cls: "arrow" }) +
        '</button><span class="or">' + esc(t("attract.orPress")) + " <kbd>Space</kbd></span></div>"
      : '<div class="notice rise" style="--i:3">' + esc(t("attract.noQuestions")) + "</div>";
    const html =
      '<header class="abs row" style="left:72px;right:72px;top:40px;justify-content:space-between">' + brandMarkup(sub) +
      '<div class="row" style="gap:16px">' + logo + pill + "</div></header>" +
      '<main class="hero"><div class="chip accent mono rise" style="--i:0"><span class="dot"></span>' + esc(m.ladder ? t("attract.badge") : t("attract.badgeFlat")) + "</div>" +
      '<h1 class="rise" style="--i:1">' + esc(t("attract.title")) + ' <span class="accent">' + esc(t("attract.titleAccent")) + "</span></h1>" +
      '<p class="lede rise" style="--i:2">' + esc(m.goodieRule ? t(pickOffered() ? "attract.subPick" : "attract.sub") : t("attract.subNoGoodie")) + "</p>" + cta + "</main>" +
      (m.mascot ? '<div class="mascot-row rise" style="--i:4">' + K.kavach("wave", 120, "Kavach, the quiz mascot, waving") +
        '<div class="bubble tail-left"><p>' + tr("attract.mascot") + "</p></div></div>" : "") +
      '<aside><section class="card lift rise" style="--i:2"><h2>' + esc(t("attract.howTo")) + '</h2><div class="rules">' + rules + "</div></section>" +
      (tips.length ? '<section class="card warm tip-card rise" style="--i:3"><div class="row" style="gap:10px">' + icon("bulb", 18, { color: "var(--warn)" }) +
        '<span class="label warn">' + esc(t("attract.didYouKnow")) + '</span></div><p class="tip">' + rich(tips[tipIdx]) + "</p>" +
        '<div class="row" style="margin-top:22px;justify-content:space-between"><div class="tip-dots">' + tips.map((_, i) => '<span class="' + (i === tipIdx ? "on" : "") + '"></span>').join("") +
        '</div><span class="label" data-tipcount style="font-weight:500;letter-spacing:0;text-transform:none">' + esc(t("attract.tipCount", { i: tipIdx + 1, total: tips.length })) + "</span></div></section>" : "") +
      teamMarkup(4) + "</aside>" +
      "<footer>" + tr("attract.footer") + "</footer>" +
      (Backup.status === "paused" || App.storageWarn ? '<span class="backup-warn" title="Backup needs attention in the admin panel"></span>' : "");
    const el = mount("attract", html);
    let i = tipIdx;
    if (tips.length > 1) {
      every(() => {
        i = (i + 1) % tips.length;
        const p = $(".tip", el);
        if (!p) return;
        p.classList.remove("swap"); void p.offsetWidth; p.classList.add("swap");
        p.innerHTML = rich(tips[i]);
        $$(".tip-dots span", el).forEach((d, k) => d.classList.toggle("on", k === i));
        const c = $("[data-tipcount]", el);
        if (c) c.textContent = t("attract.tipCount", { i: i + 1, total: tips.length });
      }, 7000);
    }
    if (playable) {
      el.addEventListener("click", (e) => { if (!e.target.closest(".logo")) startFlow(); });
    }
    setLive({ state: "free" });
  }

  function startFlow() {
    if (App.busy) return;
    Sound.init();
    Sound.play("tap");
    enterFullscreen();
    showStart();
  }

  // ---------- Start ----------

  function showStart(prefill) {
    const m = S.settings.modules, num = S.settings.numbers;
    const name = cleanName(prefill || "");
    const rules = rulesList();
    const cards = rules.map((r) => '<div class="rule-card ' + r.cls + '"><span class="icon-tile sm ' + r.tone + '">' + r.ico + '</span><span class="t">' + esc(r.ct) + '</span><span class="s">' + esc(r.cs) + "</span></div>").join("");
    const lls = [];
    if (m.fifty && num.fiftyPerGame > 0) lls.push('<span class="ll-tag mono">50:50</span>');
    if (m.hint && num.hintsPerGame > 0) lls.push('<span class="ll-tag">' + icon("bulb", 15, { color: "var(--warn)", sw: 2.2 }) + esc(t("q.hint")) + "</span>");
    const llLine = lls.length ? '<div class="lifelines-line rise" style="--i:4">' + lls.join("") + esc(lls.length > 1 ? t("start.lifelinesBoth") : t("start.lifelinesOne")) + "</div>" : "";
    const html =
      '<header class="abs row" style="left:72px;right:72px;top:40px;justify-content:space-between">' + brandMarkup("") +
      '<span style="font-size:15px;color:var(--dim)">' + esc(t("start.duration")) + "</span></header>" +
      '<section class="abs" style="left:72px;top:136px;width:660px">' +
      '<h1 class="rise" style="--i:0">' + esc(t("start.title")) + '</h1><p class="lede rise" style="--i:1">' + esc(t("start.sub")) + "</p>" +
      (m.name ? '<label class="name-label rise" style="--i:2" for="player-name">' + esc(t("start.nameLabel")) + " <span>" + esc(t("start.optional")) + "</span></label>" +
        '<div class="name-box rise" style="--i:2"><input id="player-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="' + esc(t("start.namePlaceholder")) + '" value="' + esc(name) + '"></div>' +
        '<p class="name-note rise" style="--i:2">' + esc(t("start.nameNote")) + "</p>" : "") +
      '<div class="rule-cards rise" style="--i:3;grid-template-columns:repeat(' + rules.length + ',minmax(0,1fr))">' + cards + "</div>" + llLine + "</section>" +
      (m.mascot ? '<section class="abs col" aria-label="Kavach the mascot" style="left:' + (App.W - 620) + 'px;top:150px;width:548px;align-items:center">' +
        '<div class="bubble big tail-down pop" style="max-width:420px;padding:22px 26px;border-radius:26px"><p id="greet"></p></div>' +
        '<div style="margin-top:34px">' + K.kavach("wave", 240, "Kavach, a smiling shield, waving") + "</div></section>" : "") +
      '<footer class="abs row" style="left:72px;right:72px;bottom:44px;justify-content:space-between">' +
      '<button class="btn btn-ghost" data-act="back">' + icon("arrowL", 18, { sw: 2.2 }) + esc(t("start.back")) + "</button>" +
      '<div class="row" style="gap:20px"><span style="font-size:15px;color:var(--dim)">' + esc(t("start.countHint")) + "</span>" +
      '<button class="btn btn-primary" data-act="ready">' + esc(t("start.ready")) + icon("arrowR", 24, { sw: 2.4, cls: "arrow" }) + "</button></div></footer>";
    const el = mount("start", html);
    const input = $("#player-name", el);
    const greet = () => {
      const g = $("#greet", el);
      if (!g) return;
      const nm = input ? cleanName(input.value).trim() : "";
      const shields = m.outRule && m.shields;
      const key = shields ? (nm ? "start.bubble" : "start.bubbleNoName") : nm ? "start.bubbleNoShields" : "start.bubbleNoShieldsNoName";
      g.innerHTML = rich(t(key, { name: nm }));
    };
    greet();
    if (input) {
      input.addEventListener("input", () => {
        const c = cleanName(input.value);
        if (c !== input.value) input.value = c;
        greet();
      });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ready(); } });
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    }
    const ready = () => {
      const nm = input ? cleanName(input.value).trim() : "";
      App.lastName = nm;
      countdown(() => beginGame(nm));
    };
    $('[data-act="back"]', el).addEventListener("click", () => { Sound.play("tap"); home(); });
    $('[data-act="ready"]', el).addEventListener("click", () => { Sound.play("tap"); ready(); });
    App.startReady = ready;
  }

  // ---------- Countdown ----------

  function countdown(done) {
    if (App.busy) return;
    App.busy = true;
    const steps = ["3", "2", "1", t("countdown.go")];
    const ov = document.createElement("div");
    ov.className = "overlay dim";
    ov.innerHTML = '<div class="countdown" aria-live="assertive"></div>';
    stage().appendChild(ov);
    const box = $(".countdown", ov);
    const fast = motion() === "none";
    let i = 0;
    const tick = () => {
      if (i >= steps.length) { ov.remove(); App.busy = false; done(); return; }
      box.innerHTML = '<span class="' + (i === 3 ? "go" : "") + '">' + esc(steps[i]) + "</span>";
      Sound.play(i === 3 ? "go" : "count");
      i++;
      setTimeout(tick, fast ? 450 : i === 4 ? 700 : 820);
    };
    tick();
  }

  // ---------- A game ----------

  function beginGame(name) {
    const dealt = E.dealGame(S.bank, S.packs, S.settings, S.decks, Math.random);
    save("decks");
    if (!dealt.length) { home(); return; }
    App.lastName = name || "";
    App.game = E.newGame(dealt, S.settings, name);
    App.pickOn = pickOffered();
    S.inflight = dealt.map((d) => d.qid);
    store.set("inflight", S.inflight);
    showQuestion();
  }

  function questionCtx(g) {
    const num = S.settings.numbers, m = S.settings.modules;
    const slot = g.slots[g.idx];
    const q = App.byId[slot.qid];
    return {
      idx: g.idx, slots: g.slots, results: g.results, right: g.right, streak: g.streak, name: g.name, stage: slot.stage,
      fiftyLeft: g.fiftyLeft, hintLeft: g.hintLeft, goodieWon: g.goodieWon,
      timerOn: m.timer, timerSec: (q && q.timer) || num.timerSec,
    };
  }

  function hudMarkup(ctx) {
    const m = S.settings.modules, num = S.settings.numbers;
    const nm = ctx.name ? esc(ctx.name) : esc(S.settings.event.name);
    const groups = [];
    let cur = null;
    ctx.slots.forEach((s, i) => {
      if (!cur || cur.stage !== s.stage) { cur = { stage: s.stage, items: [] }; groups.push(cur); }
      cur.items.push(i);
    });
    const n = ctx.slots.length;
    const segw = Math.max(12, Math.min(30, Math.floor((520 - (groups.length - 1) * 14) / n) - 5));
    let wrong = 0;
    ctx.results.forEach((r) => { if (!r.correct) wrong++; });
    const prog = groups.map((gr) => '<div class="grp">' + gr.items.map((i) => {
      const r = ctx.results[i];
      let c = "seg";
      if (r) c += r.correct ? " right" : " wrong";
      else if (i === ctx.idx) c += " now" + (ctx.slots[i].pic ? " pic" : "");
      else if (ctx.slots[i].stage === "boss") c += " boss";
      return '<span class="' + c + '" data-seg="' + i + '"></span>';
    }).join("") + "</div>").join("");
    let meters = "";
    if (m.shields && m.outRule) {
      const total = num.outAfter, broken = Math.min(ctx.streak, total);
      const last = total > 1 && broken === total - 1;
      meters += '<div class="meter" role="img" aria-label="Shields: ' + (total - broken) + " of " + total + ' left"><span class="label ' + (last ? "bad" : "") + '" data-shield-label>' +
        esc(last ? t("q.lastShield") : t("q.shields")) + '</span><div class="shields">' +
        Array.from({ length: total }, (_, i) => '<span class="shield' + (i >= total - broken ? " broken" : "") + '" style="--i:' + i + '">' + K.shieldIcon() + "</span>").join("") + "</div></div>";
    }
    if (m.goodieMeter && m.goodieRule) {
      const g = num.goodieAt, on = Math.min(ctx.right, g);
      const won = ctx.goodieWon, near = !won && on === g - 1;
      meters += '<div class="meter" role="img" aria-label="Goodie meter: ' + on + " of " + g + '"><span class="label warn" data-goodie-label>' +
        esc(won ? wonLabel(App.game) : near ? t("q.goodieOneMore") : t("q.goodieMeter", { r: on, g })) + "</span>" +
        '<div class="goodie-meter' + (won ? " won" : near ? " near" : "") + '">' +
        Array.from({ length: g }, (_, i) => '<span class="gstep' + (i < on ? " on" : near && i === on ? " next" : "") + '"></span>').join("") +
        icon("gift", 18, { cls: "gift" }) + "</div></div>";
    }
    return '<div class="hud"><div class="who"><button class="logo sm" aria-label="' + esc(S.settings.event.name) + '">' + icon("shieldLogo", 22, { color: "#0B1020", sw: 2.2 }) + "</button>" +
      '<div class="col" style="gap:1px;min-width:0"><span class="nm">' + nm + '</span><span class="st">' + esc(t("stage." + ctx.stage)) + "</span></div></div>" +
      '<div class="mid"><span class="label" style="color:var(--muted)">' + esc(t("q.counter", { i: ctx.idx + 1, n })) + "</span>" +
      '<div class="progress" role="img" style="--segw:' + segw + 'px" aria-label="Progress: ' + (ctx.results.length - wrong) + " right, " + wrong + " wrong, question " + (ctx.idx + 1) + ' now">' + prog + "</div></div>" +
      '<div class="meters">' + meters + "</div></div>";
  }

  function chipsMarkup(q) {
    const pack = App.packById[q.pack];
    let first;
    if (q.fmt === "pic") first = '<span class="chip teal">' + icon("image", 16) + esc(t("q.picChip")) + "</span>";
    else if (q.diff === "challenge" || (pack && pack.challenge)) first = '<span class="chip warn">' + esc(pack ? pack.name : t("stage.boss")) + "</span>";
    else first = '<span class="chip accent">' + esc(pack ? pack.name : "") + "</span>";
    return '<div class="qchips">' + first + '<span class="chip">' + esc(t("q.diff." + q.diff)) + "</span></div>";
  }

  function pictureMarkup(q) {
    const alt = esc(K.plain(q.fmt === "pic" ? q.q : "Picture for this question"));
    const img = S.images[q.pic];
    if (img) return '<img src="' + img + '" alt="' + alt + '">';
    const svg = window.QN_PICTURES[q.pic];
    if (svg) return '<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + alt + '" stroke-linecap="round" stroke-linejoin="round">' + svg + "</svg>";
    return '<p style="color:#2B3138;font-size:22px;text-align:center">' + alt + "</p>";
  }

  function optionText(q, oi) {
    if (q.fmt === "tf") return t(oi === 0 ? "q.true" : "q.false");
    if (q.fmt === "ss") return t(oi === 0 ? "q.scam" : "q.safe");
    return q.opts[oi];
  }

  function optionsMarkup(q, order, layout) {
    const n = order.length;
    let cls;
    if (n <= 2) cls = "g2";
    else if (layout === "pic") cls = n === 4 ? "g4" : n === 3 ? "g3" : "g2x2";
    else if (n === 3) cls = order.some((i) => String(q.opts[i]).length > 34) ? "g1" : "g3";
    else cls = "g2x2";
    const anim = q.fmt === "ss" ? "thump" : "deal";
    const items = order.map((oi, si) => {
      const text = optionText(q, oi);
      if (q.fmt === "ss") {
        return '<button class="opt ' + (oi === 0 ? "scam" : "safe") + '" data-si="' + si + '" style="--i:' + si + '"><span class="ico">' +
          icon(oi === 0 ? "warning" : "shieldCheck", 30, { sw: 2.2 }) + '</span><span class="txt">' + esc(text) + "</span></button>";
      }
      return '<button class="opt" data-si="' + si + '" style="--i:' + si + '"><span class="key">' + (si + 1) + '</span><span class="txt">' + rich(text) + "</span></button>";
    }).join("");
    return '<div class="opts ' + cls + " " + anim + '" role="group" aria-label="Answers">' + items + "</div>";
  }

  function hintAvailable(q) {
    const pack = App.packById[q.pack];
    return !!(q.hint && q.hint.trim() && (!pack || pack.hints !== false));
  }

  function lifelinesMarkup(ctx, q, nOpts) {
    const m = S.settings.modules, num = S.settings.numbers;
    let ll = "";
    if (m.fifty && num.fiftyPerGame > 0) {
      const can = ctx.fiftyLeft > 0 && nOpts > 2;
      const inner = ctx.fiftyLeft <= 0 ? '<span class="ff">' + esc(t("q.fiftyUsed")) + "</span>"
        : nOpts <= 2 ? '<span class="ff">50:50</span><span style="font-size:14px">' + esc(t("q.fiftyNA")) + "</span>"
        : '<span class="ff">' + esc(t("q.fifty")) + '</span><span class="cnt">' + esc(t("q.left", { k: ctx.fiftyLeft })) + "</span>";
      ll += '<button class="llbtn" data-act="fifty"' + (can ? "" : " disabled") + ' aria-keyshortcuts="F">' + inner + "</button>";
    }
    if (m.hint && num.hintsPerGame > 0) {
      const has = hintAvailable(q);
      const can = ctx.hintLeft > 0 && has;
      const label = ctx.hintLeft <= 0 ? t("q.hintUsed") : t("q.hint");
      ll += '<button class="llbtn hint" data-act="hint"' + (can ? "" : " disabled") + ' aria-keyshortcuts="H">' + icon("bulb", 20, { color: can ? "var(--warn)" : "currentColor" }) +
        esc(label) + (can ? '<span class="cnt">' + esc(t("q.left", { k: ctx.hintLeft })) + "</span>" : !has && ctx.hintLeft > 0 ? '<span style="font-size:14px">' + esc(t("q.fiftyNA")) + "</span>" : "") + "</button>";
    }
    const keys = esc(t("q.keys", { k1: "\u0001", k2: "\u0002" })).replace("\u0001", "<kbd>1</kbd>").replace("\u0002", "<kbd>" + nOpts + "</kbd>");
    return '<div class="ll">' + ll + '</div><span class="keys-hint">' + keys + "</span>";
  }

  function timerMarkup(sec, sm) {
    return '<div class="timer' + (sm ? " sm" : "") + '" role="timer" aria-label="' + sec + ' seconds left"><svg viewBox="0 0 140 140" aria-hidden="true">' +
      '<circle class="track" cx="70" cy="70" r="60" stroke-width="10"/><circle class="ring" cx="70" cy="70" r="60" stroke-width="10" stroke-dasharray="376.99" stroke-dashoffset="0" transform="rotate(-90 70 70)"/></svg>' +
      '<div class="in"><span class="num">' + sec + '</span><span class="unit">' + esc(t("q.seconds")) + "</span></div></div>";
  }

  function playMarkup(q, order, ctx) {
    const isP = E.isPic(q);
    const opts = optionsMarkup(q, order, isP ? "pic" : "std");
    const foot = '<div class="qfoot"><div class="lifelines">' + lifelinesMarkup(ctx, q, order.length) + "</div></div>";
    if (isP) {
      const prompt = q.fmt === "pic" ? t("q.picPrompt") : q.q;
      return hudMarkup(ctx) + '<div class="picwrap"><div class="pictop"><figure class="picfig sharpen">' + pictureMarkup(q) + "</figure>" +
        '<div class="picside' + (ctx.timerOn ? " has-timer" : "") + '">' + (ctx.timerOn ? timerMarkup(ctx.timerSec, true) : "") + chipsMarkup(q) + '<h1 class="qtitle">' + rich(prompt) + "</h1>" +
        '<div class="hintslot"></div><div class="react"></div></div></div>' + opts + foot + "</div>";
    }
    return hudMarkup(ctx) + '<div class="qwrap"><div class="qhead"><div class="qtext">' + chipsMarkup(q) + '<h1 class="qtitle">' + rich(q.q) + "</h1>" +
      '<div class="hintslot"></div></div><div class="qside">' + (ctx.timerOn ? timerMarkup(ctx.timerSec) : "") + '<div class="react"></div></div></div>' + opts + foot + "</div>";
  }

  // Shrinks the question and option text until everything fits the stage.
  function fitPlay(el) {
    const opts = $(".opts", el);
    if (opts) {
      const maxH = $(".picwrap", el) ? 190 : 430;
      const txts = $$(".opt .txt", opts);
      let size = txts.length ? parseFloat(getComputedStyle(txts[0]).fontSize) : 27;
      let guard = 12;
      while (guard-- > 0 && size > 20 && (opts.offsetHeight > maxH || txts.some((x) => x.scrollWidth > x.clientWidth + 1))) {
        size -= 1.5;
        txts.forEach((x) => { x.style.fontSize = size + "px"; });
      }
    }
    const box = $(".qtext", el) || $(".picside", el);
    const title = $(".qtitle", el);
    if (box && title) {
      let size = parseFloat(getComputedStyle(title).fontSize);
      let guard = 20;
      const over = () => box.scrollHeight > box.clientHeight + 1;
      while (guard-- > 0 && size > 30 && over()) { size -= 2; title.style.fontSize = size + "px"; }
    }
  }

  function showQuestion() {
    const g = App.game;
    if (!g) return home();
    const slot = g.slots[g.idx];
    const q = App.byId[slot.qid];
    if (!q) { g.idx++; return g.idx < g.slots.length ? showQuestion() : endGame(); }
    const m = S.settings.modules;
    let order = E.optionsFor(q).map((_, i) => i).filter((i) => String(E.optionsFor(q)[i]).trim() !== "");
    if (m.shuffle && q.fmt !== "tf" && q.fmt !== "ss") order = E.shuffle(order, Math.random);
    const ctx = questionCtx(g);
    App.q = { q, order, phase: "question", fifty: false, hint: false, t0: performance.now(), picked: null, prevStreak: g.streak, prevRight: g.right };
    const el = mount("play", playMarkup(q, order, ctx), { mood: E.isPic(q) ? "pic" : "" });
    if (q.fmt === "ss") later(() => Sound.play("thump"), 120);
    fitPlay(el);
    $$(".opt", el).forEach((b) => b.addEventListener("click", () => pick(+b.dataset.si)));
    const fifty = $('[data-act="fifty"]', el), hint = $('[data-act="hint"]', el);
    if (fifty) fifty.addEventListener("click", useFifty);
    if (hint) hint.addEventListener("click", useHint);
    S.inflight = g.slots.slice(g.idx).map((s) => s.qid);
    store.set("inflight", S.inflight);
    setLive({ state: "playing", i: g.idx + 1, n: g.slots.length });
    if (ctx.timerOn) startQTimer(ctx.timerSec, () => { if (App.q && App.q.phase === "question") reveal(-1); });
  }

  // ---------- Question timer ----------

  const QT = { raf: 0, total: 0, left: 0, last: 0, running: false, whole: null, onEnd: null };
  const RING = 376.99;
  function startQTimer(sec, onEnd) {
    Object.assign(QT, { total: sec * 1000, left: sec * 1000, last: performance.now(), running: true, whole: sec, onEnd });
    cancelAnimationFrame(QT.raf);
    QT.raf = requestAnimationFrame(tickQT);
  }
  function tickQT(now) {
    if (!QT.running) return;
    QT.left -= now - QT.last;
    QT.last = now;
    if (QT.left <= 0) {
      QT.left = 0; drawTimer(); QT.running = false;
      if (QT.onEnd) QT.onEnd();
      return;
    }
    drawTimer();
    QT.raf = requestAnimationFrame(tickQT);
  }
  function stopQTimer() { QT.running = false; cancelAnimationFrame(QT.raf); }
  function drawTimer() {
    const el = App.el && $(".timer", App.el);
    if (!el) return;
    const ring = $(".ring", el);
    ring.style.strokeDashoffset = String(RING * (1 - QT.left / QT.total));
    const s = Math.ceil(QT.left / 1000);
    if (s !== QT.whole) {
      QT.whole = s;
      $(".num", el).textContent = s;
      el.setAttribute("aria-label", s + " seconds left");
      if (s <= 5) { el.classList.add("low"); if (s > 0) Sound.play("tick"); }
    }
  }

  // ---------- Lifelines ----------

  function useFifty() {
    const g = App.game, cq = App.q;
    if (!cq || cq.phase !== "question" || g.fiftyLeft <= 0 || cq.fifty) return;
    const live = cq.order.map((oi, si) => ({ oi, si })).filter((x) => x.oi !== cq.q.ans);
    if (cq.order.length <= 2) return;
    const drop = E.shuffle(live, Math.random).slice(0, cq.order.length === 3 ? 1 : 2);
    cq.fifty = true;
    g.fiftyLeft--;
    Sound.play("fifty");
    for (const d of drop) {
      const b = $('.opt[data-si="' + d.si + '"]', App.el);
      if (!b) continue;
      b.classList.add("gone");
      b.disabled = true;
      b.setAttribute("aria-hidden", "true");
      later(() => b.classList.add("gone-done"), 560);
    }
    const btn = $('[data-act="fifty"]', App.el);
    btn.disabled = true;
    btn.innerHTML = '<span class="ff">' + esc(t("q.fiftyUsed")) + "</span>";
    App.lastInput = Date.now();
  }

  function useHint() {
    const g = App.game, cq = App.q;
    if (!cq || cq.phase !== "question" || g.hintLeft <= 0 || cq.hint || !hintAvailable(cq.q)) return;
    cq.hint = true;
    g.hintLeft--;
    Sound.play("hint");
    const slot = $(".hintslot", App.el);
    const inline = !E.isPic(cq.q);
    slot.innerHTML = '<div class="hintbox' + (inline ? " inline" : "") + '" role="note"><span class="label warn row" style="gap:10px">' + icon("bulb", 18, { color: "var(--warn)" }) +
      esc(t("q.hintLabel")) + "</span><p>" + rich(cq.q.hint) + "</p></div>";
    const btn = $('[data-act="hint"]', App.el);
    btn.disabled = true;
    btn.innerHTML = icon("bulb", 20) + esc(t("q.hintUsed"));
    fitPlay(App.el);
    announce(t("q.hintLabel") + ": " + K.plain(cq.q.hint));
  }

  // ---------- Answering ----------

  function pick(si) {
    const cq = App.q;
    if (!cq || cq.phase !== "question") return;
    if (si < 0 || si >= cq.order.length) return;
    const b = $('.opt[data-si="' + si + '"]', App.el);
    if (!b || b.disabled) return;
    App.lastInput = Date.now();
    stopQTimer();
    if (S.settings.numbers.revealMode === "volunteer") {
      cq.phase = "locked";
      cq.picked = cq.order[si];
      cq.ms = Math.round(performance.now() - cq.t0);
      b.classList.add("picked");
      $(".opts", App.el).classList.add("locked");
      $$(".opt", App.el).forEach((x) => { x.disabled = true; });
      Sound.play("tap");
      const foot = $(".qfoot", App.el);
      foot.innerHTML = '<div class="lockcol"><p>' + esc(t("q.lockedIn")) + '</p><button class="btn btn-primary" data-act="reveal">' + esc(t("q.reveal")) + icon("arrowR", 24, { sw: 2.4, cls: "arrow" }) + "</button></div>";
      $('[data-act="reveal"]', foot).addEventListener("click", () => reveal(cq.picked));
      App.phaseAt = Date.now();
      return;
    }
    reveal(cq.order[si]);
  }

  function reveal(oi) {
    const cq = App.q, g = App.game;
    if (!cq || (cq.phase !== "question" && cq.phase !== "locked")) return;
    stopQTimer();
    const m = S.settings.modules, num = S.settings.numbers;
    const q = cq.q, el = App.el;
    const prevStreak = g.streak, prevWon = g.goodieWon;
    const res = E.answer(g, q, oi, S.settings, { fifty: cq.fifty, hint: cq.hint, ms: cq.ms || Math.round(performance.now() - cq.t0) });
    cq.phase = "reveal";
    App.phaseAt = Date.now();
    S.inflight = g.slots.slice(g.idx + 1).map((s) => s.qid);
    store.set("inflight", S.inflight);

    // Tiles
    const opts = $(".opts", el);
    opts.classList.add("locked");
    opts.classList.remove("deal", "thump");
    const showRight = res.correct || m.showRight;
    $$(".opt", el).forEach((b) => {
      b.disabled = true;
      const o = cq.order[+b.dataset.si];
      const key = $(".key", b) || $(".ico", b);
      if (o === q.ans && showRight) {
        b.classList.add("right");
        b.classList.remove("picked");
        if (key) key.innerHTML = '<svg class="tick" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
        b.insertAdjacentHTML("beforeend", '<span class="tag">' + esc(t("r.rightLabel")) + "</span>");
        if (!res.correct) setTimeout(() => b.classList.add("flash"), 350);
      } else if (o === oi) {
        b.classList.add("wrong", "shake");
        b.classList.remove("picked");
        if (key) key.innerHTML = icon("x", 24, { sw: 3 });
        b.insertAdjacentHTML("beforeend", '<span class="tag">' + esc(t("r.yourPick")) + "</span>");
      } else if (!b.classList.contains("gone")) b.classList.add("dim");
    });
    const blank = $(".qtitle .blank", el);
    if (blank && showRight && (q.fmt === "fill")) {
      blank.classList.add("filled");
      blank.textContent = K.plain(q.opts[q.ans]);
    }

    // Sound and meters
    Sound.play(res.correct ? "right" : "wrong");
    const seg = $('[data-seg="' + g.idx + '"]', el);
    if (seg) { seg.classList.remove("now", "pic"); seg.classList.add(res.correct ? "right" : "wrong", "just"); }
    const shields = $(".shields", el);
    if (shields) {
      const total = num.outAfter;
      const all = $$(".shield", shields);
      const lbl = $("[data-shield-label]", el);
      if (res.correct && prevStreak > 0) {
        all.forEach((s) => s.classList.remove("broken"));
        shields.classList.add("repairing");
        if (lbl) { lbl.textContent = t("q.repaired"); lbl.className = "label good"; }
        setTimeout(() => Sound.play("repair"), 260);
      } else if (!res.correct) {
        const broken = Math.min(g.streak, total);
        const s = all[total - broken];
        if (s) { s.classList.add("broken", "cracking"); setTimeout(() => Sound.play("crack"), 200); }
        if (lbl && broken === total - 1 && total > 1) { lbl.textContent = t("q.lastShield"); lbl.className = "label bad"; }
        shields.parentElement.setAttribute("aria-label", "Shields: " + (total - broken) + " of " + total + " left");
      }
    }
    const meter = $(".goodie-meter", el);
    if (meter && res.correct && !prevWon) {
      const steps = $$(".gstep", meter);
      const on = Math.min(g.right, num.goodieAt);
      const st = steps[on - 1];
      steps.forEach((s) => s.classList.remove("next"));
      if (st) { st.classList.add("on", "spark"); setTimeout(() => Sound.play("spark"), 380); }
      const lbl = $("[data-goodie-label]", el);
      if (g.goodieWon) { meter.classList.add("won"); meter.classList.remove("near"); if (lbl) lbl.textContent = wonLabel(g); }
      else if (on === num.goodieAt - 1) { meter.classList.add("near"); if (steps[on]) steps[on].classList.add("next"); if (lbl) lbl.textContent = t("q.goodieOneMore"); }
      else if (lbl) lbl.textContent = t("q.goodieMeter", { r: on, g: num.goodieAt });
    } else if (meter && prevWon) {
      const lbl = $("[data-goodie-label]", el);
      if (lbl) lbl.textContent = wonLabel(g);
    }

    // Kavach reacts where the timer was
    const timer = $(".timer", el);
    if (timer) { timer.classList.add("gone"); setTimeout(() => timer.remove(), 260); }
    const react = $(".react", el);
    if (E.isPic(q)) { const hs = $(".hintslot", el); if (hs) hs.innerHTML = ""; }
    if (react && m.mascot) {
      let title, sub = "";
      if (res.correct) {
        title = t("mascot.right");
        const toPick = num.stickerAt - g.right;
        if (res.pickUnlocked && App.pickOn) sub = t("goodie.pickUnlocked");
        else if (res.goodieUnlocked) sub = t("goodie.unlocked");
        else if (m.goodieRule && !g.goodieWon) {
          const k = num.goodieAt - g.right;
          sub = k === 1 ? t("mascot.rightOneToGoodie") : t("mascot.rightToGoodie", { k: E.cap(E.word(k)) });
        } else if (App.pickOn && !g.pickWon && toPick <= g.slots.length - g.results.length) {
          sub = toPick === 1 ? t("mascot.rightOneToSticker") : t("mascot.rightToSticker", { k: E.cap(E.word(toPick)) });
        } else if (prevStreak > 0 && m.outRule) sub = t("mascot.rightRepaired");
        else sub = t("mascot.rightPlain");
      } else {
        title = oi === -1 ? t("mascot.timeout") : t("mascot.wrong");
        if (m.outRule && !g.goodieWon && !g.out) {
          const left = num.outAfter - g.streak;
          sub = left === 1 ? t("mascot.wrongLastShield") : t("mascot.wrongShields", { s: E.cap(E.word(left)) });
        } else if (!g.out && showRight) sub = t("mascot.wrongPlain");
      }
      react.innerHTML = '<div class="bubble ' + (res.correct ? "good" : "bad") + ' pop"><p>' + esc(title) + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</p></div>" +
        K.kavach(res.correct ? "cheer" : "gasp", E.isPic(q) ? 120 : 150, res.correct ? "Kavach cheering with both arms up" : "Kavach gasping");
    }

    // Tip and Next
    const isEnd = g.out || res.isLast;
    const nextSlot = isEnd ? null : g.slots[g.idx + 1];
    let upnext = "";
    if (nextSlot) {
      if (nextSlot.pic) upnext = icon("image", 18, { color: "var(--teal)" }) + esc(t("r.upNextPic"));
      else if (nextSlot.stage === "boss" && g.slots[g.idx].stage !== "boss") upnext = icon("warning", 18, { color: "var(--warn)" }) + esc(t("r.upNextBoss"));
      else if (g.idx + 1 === g.slots.length - 1) upnext = esc(t("r.upNextLast"));
    }
    const tipOn = m.tips && q.tip && q.tip.trim() && (num.tipAfter === "both" || (num.tipAfter === "right") === res.correct);
    const auto = num.tipAutoSec > 0;
    const foot = $(".qfoot", el);
    foot.innerHTML = '<div class="feedback"' + (tipOn ? "" : ' style="justify-content:flex-end"') + ">" +
      (tipOn ? '<section class="tipcard"><span class="icon-tile sm warn">' + icon("bulb", 24) + '</span><div class="txt"><span class="label warn">' + esc(t("r.remember")) + "</span><p>" + rich(q.tip) + "</p></div></section>" : "") +
      '<div class="nextcol">' + (upnext ? '<div class="upnext">' + upnext + "</div>" : "") +
      '<button class="btn btn-primary lg" data-act="next">' + esc(isEnd ? t("r.finish") : t("r.next")) + icon("arrowR", 24, { sw: 2.4, cls: "arrow" }) + "</button>" +
      (auto ? '<div class="autobar"><span></span></div>' : "") + "</div></div>";
    const tipP = $(".tipcard p", foot);
    if (tipP) {
      let size = 23;
      while (size > 17 && $(".tipcard", foot).scrollHeight > 141) { size -= 1; tipP.style.fontSize = size + "px"; }
    }
    const nb = $('[data-act="next"]', foot);
    nb.addEventListener("click", () => { Sound.play("tap"); next(); });
    setTimeout(() => { if (document.activeElement === document.body || !document.activeElement || document.activeElement.closest(".opt")) nb.focus({ preventScroll: true }); }, 60);
    if (auto) {
      const bar = $(".autobar span", foot);
      bar.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: num.tipAutoSec * 1000, easing: "linear", fill: "forwards" });
      later(() => next(), num.tipAutoSec * 1000);
    }

    const right = q.fmt === "tf" || q.fmt === "ss" ? optionText(q, q.ans) : K.plain(q.opts[q.ans]);
    announce(res.correct ? t("a11y.right") : t(oi === -1 ? "a11y.timeout" : "a11y.wrong", { a: right }));
    const pickNow = res.pickUnlocked && App.pickOn;
    if (res.goodieUnlocked || pickNow) later(() => goodieBurst(pickNow), 550);
  }

  // pick: the sticker pick was just unlocked, so three of the stickers fan out instead of the gift.
  function goodieBurst(pick) {
    const m = S.settings.modules;
    if (!m.celebrations) return;
    const g = App.game;
    const box = document.createElement("div");
    box.className = "goodie-burst" + (pick ? " pick" : "");
    const more = g && !(g.idx >= g.slots.length - 1);
    const fan = pick ? '<div class="fan">' + E.shuffle(stickerChoices(), Math.random).slice(0, 3).map((d, i) => '<span style="--i:' + i + '">' + stickerImg(d) + "</span>").join("") + "</div>" : "";
    const line = pick ? t(more ? "goodie.pickKeepGoing" : "goodie.pickNext") : more ? t("goodie.keepGoing") : "";
    box.innerHTML = '<div class="box">' + (pick ? fan : K.giftClosed(130)) + "<h2>" + esc(t(pick ? "goodie.pickUnlocked" : "goodie.unlocked")) + "</h2>" + (line ? "<p>" + esc(line) + "</p>" : "") + "</div>";
    stage().appendChild(box);
    Sound.play("fanfare");
    const mo = motion();
    if (mo !== "none") K.Confetti.burst(mo === "reduced" ? 60 : 170);
    setTimeout(() => box.remove(), 2400);
  }

  function next() {
    const cq = App.q, g = App.game;
    if (!cq || cq.phase !== "reveal" || !g) return;
    cq.phase = "done";
    if (g.out || g.idx >= g.slots.length - 1) return endGame();
    const prev = g.slots[g.idx].stage;
    g.idx++;
    const cur = g.slots[g.idx].stage;
    if (cur !== prev) stageCard(cur, showQuestion);
    else showQuestion();
  }

  function stageCard(stageName, then) {
    const m = S.settings.modules;
    if (!m.ladder || !m.stageCards || stageName === "warm" || stageName === "mixed") return then();
    const g = App.game;
    const order = [];
    g.slots.forEach((s) => { if (!order.includes(s.stage)) order.push(s.stage); });
    const at = order.indexOf(stageName);
    const sub = stageName === "tricky" ? (g.slots.some((s) => s.stage === "tricky" && s.pic) ? t("stageCard.trickyPic") : t("stageCard.tricky"))
      : stageName === "final" ? t("stageCard.final") : t("stageCard.boss");
    const ov = document.createElement("div");
    ov.className = "overlay dim";
    ov.innerHTML = '<div class="stagecard' + (stageName === "boss" ? " boss" : "") + '" role="status"><span class="label ' + (stageName === "boss" ? "warn" : "accent") + '">' + esc(t("stageCard.label")) + "</span>" +
      "<h2>" + esc(t("stage." + stageName)) + "</h2><p>" + esc(sub) + '</p><div class="steps">' + order.map((_, i) => '<span class="' + (i <= at ? "on" : "") + '"></span>').join("") + "</div></div>";
    stage().appendChild(ov);
    App.busy = true;
    Sound.play("whoosh");
    announce(t("stage." + stageName));
    setTimeout(() => {
      ov.remove();
      App.busy = false;
      if (App.game === g) then();
    }, motion() === "none" ? 1200 : 1900);
  }

  // ---------- Endings ----------

  function returnInflight() {
    if (Array.isArray(S.inflight) && S.inflight.length) {
      E.returnToDecks(S.decks, App.byId, S.inflight, Math.random);
      save("decks");
    }
    S.inflight = null;
    store.remove("inflight");
  }

  function endGame() {
    const g = App.game;
    if (!g) return home();
    stopQTimer();
    E.finish(g);
    if (g.outcome === "win" && S.settings.modules.goodieCodes) g.code = E.makeCode(S.log.map((r) => r.code).filter(Boolean));
    const rec = E.logRecord(g);
    S.log.push(rec);
    saveLog();
    returnInflight();
    App.record = rec;
    Backup.write();
    setLive({ state: "free" });
    if (g.outcome === "win" && App.pickOn && E.pickEarned(g, S.settings) && stickerChoices().length) showPick(g, rec);
    else if (g.outcome === "win") showWin(g, rec);
    else showOver(g, rec);
  }

  function abandonGame() {
    const g = App.game;
    App.busy = false;
    if (!g) return;
    stopQTimer();
    if (!g.outcome && g.results.length) {
      g.outcome = "left";
      S.log.push(E.logRecord(g));
      saveLog();
      Backup.write();
    }
    returnInflight();
    App.game = null;
    App.q = null;
  }

  function habitTip(g) {
    const missed = g.results.filter((r) => !r.correct).map((r) => App.byId[r.qid]).filter((q) => q && q.tip);
    const pickQ = missed.length ? missed[missed.length - 1] : App.byId[g.results[g.results.length - 1].qid];
    return pickQ && pickQ.tip ? pickQ.tip : S.tips[0] || "";
  }

  function resbar(g) {
    return '<div class="resbar" aria-hidden="true">' + g.slots.map((_, i) => {
      const r = g.results[i];
      return '<span class="' + (r ? (r.correct ? "right" : "wrong") : "") + '" style="--i:' + i + '"></span>';
    }).join("") + "</div>";
  }

  function feedbackMarkup() {
    if (!S.settings.modules.feedback) return "";
    return '<div class="fb" data-fb><span>' + esc(t("fb.q")) + '</span><button data-fb-v="yes">' + esc(t("fb.yes")) + '</button><button data-fb-v="no">' + esc(t("fb.no")) + "</button></div>";
  }
  function bindFeedback(el, rec) {
    $$("[data-fb-v]", el).forEach((b) => b.addEventListener("click", () => {
      rec.fb = b.dataset.fbV;
      saveLog();
      const box = $("[data-fb]", el);
      if (box) box.innerHTML = "<span>" + esc(t("fb.thanks")) + "</span>";
    }));
  }

  // Counts down to the start screen (or, with `key`, to whatever onDone does). Until `showFrom` seconds remain,
  // the header keeps its own text.
  function backCountdown(el, sec, onDone, showFrom, key) {
    const span = $("[data-back]", el);
    const idleText = span ? span.innerHTML : "";
    let left = sec;
    const draw = () => {
      if (!span) return;
      span.innerHTML = left <= (showFrom || sec)
        ? esc(t(key || "end.backIn", { s: "\u0001" })).replace("\u0001", '<b style="font-family:var(--f-mono);color:var(--soft)">' + left + "</b>")
        : idleText;
    };
    draw();
    every(() => {
      // Someone is still using the screen: give them at least ten more seconds.
      if (Date.now() - App.lastInput < 1500) left = Math.max(left, Math.min(sec, 10));
      left--;
      if (left <= 0) { onDone(); return; }
      draw();
    }, 1000);
  }

  function showWin(g, rec) {
    const m = S.settings.modules, num = S.settings.numbers;
    const name = g.name;
    const boss = g.slots.filter((s) => s.stage === "boss").length;
    const bossBeat = g.results.filter((r, i) => r.correct && g.slots[i].stage === "boss").length;
    const R = E.cap(E.word(g.right));
    const stockOut = m.stock && goodiesLeft() <= 0;
    const st = rec.sticker ? stickerById(rec.sticker) : null;
    const pickline = st ? '<div class="pickline">' + stickerImg(st) + '<div class="col" style="gap:2px;min-width:0"><span class="label warn">' + esc(t("win.sticker")) + "</span><b>" + esc(st.name) +
      "</b><span>" + esc(stickerWhere(st)) + "</span></div></div>" : "";
    const detail = t("win.detail", { q: g.goodieAtQ }) + (boss ? " · " + t("win.bossDetail", { b: bossBeat, B: boss }) : "");
    const code = m.goodieCodes && g.code
      ? '<span class="label warn">' + esc(t("win.show")) + '</span><div class="code">' + esc(g.code) + "</div>"
      : '<span class="label warn">' + esc(t("win.show")) + '</span><div class="code word">' + esc(t("win.noCode")) + "</div>";
    const html =
      '<header class="abs row" style="left:72px;right:72px;top:40px;justify-content:space-between">' + brandMarkup("") +
      '<span style="font-size:15px;color:var(--dim)" data-back>' + esc(t("end.gameOver", { played: g.results.length, n: g.slots.length })) + "</span></header>" +
      '<section class="lead"><span class="label warn rise" style="--i:0">' + esc(t("win.label")) + "</span>" +
      '<h1 class="rise" style="--i:1">' + esc(name ? t("win.title", { name }) : t("win.titleNoName")) + "</h1>" +
      '<p class="lede rise" style="--i:2">' + esc(m.outRule && m.shields ? t("win.subShields", { R }) : t("win.sub", { R })) + "</p>" +
      '<div class="scorebox rise" style="--i:3">' + (st ? '<div class="won-sticker">' + stickerImg(st) + "</div>" : K.giftBox(220)) +
      '<div class="col" style="gap:12px"><div class="score"><span class="big">' + g.right +
      '</span><span class="of">' + esc(t("win.ofRight", { n: g.slots.length })) + "</span></div>" + resbar(g) +
      '<span style="font-size:15px;color:var(--muted)">' + esc(detail) + "</span>" +
      (st ? '<button class="btn btn-ghost change" data-act="change">' + icon("replay", 18, { sw: 2.2 }) + esc(t("win.change")) + "</button>" : "") + "</div></div>" +
      '<div class="habit rise" style="--i:4"><span class="label good">' + esc(t("win.habit")) + "</span><p>" + rich(habitTip(g)) + "</p></div></section>" +
      '<aside><section class="codecard rise" style="--i:1">' + code + "<p>" + esc(stockOut ? t("win.outOfStock") : m.goodieCodes ? t("win.codeNote") : t("win.noCodeNote")) + "</p>" + pickline + "</section>" +
      '<section class="vol-card rise" style="--i:2"><span class="label">' + esc(t("win.forVolunteers")) + "</span>" +
      '<button class="holdbtn" data-act="hold" aria-label="Press and hold for two seconds to confirm the goodie was handed over">' +
      '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--track)" stroke-width="4"/>' +
      '<circle class="ring" cx="22" cy="22" r="18" stroke-dasharray="113.1" stroke-dashoffset="113.1" transform="rotate(-90 22 22)"/>' +
      '<path d="M15 22.5 20 27.5 29 17.5" fill="none" stroke="var(--good)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span><span class="t1">' + esc(t("win.hold")) + '</span><span class="t2">' + esc(t("win.holdSub")) + "</span></span></button></section>" +
      (m.mascot ? '<div class="row rise" style="--i:3;justify-content:center;align-items:flex-end;gap:12px;margin-top:6px">' + K.kavach("dance", 104, "Kavach dancing") +
        '<span class="bubble tail-left" style="margin-bottom:40px;padding:10px 14px"><p style="font-size:16px;font-weight:600">' + esc(name ? t("win.mascot", { name }) : t("win.mascotNoName")) + "</p></span></div>" : "") +
      "</aside>" +
      (m.feedback ? '<div class="endfoot">' + feedbackMarkup() + "</div>" : "");
    const el = mount("results win", html, { mood: "win" });
    bindFeedback(el, rec);
    // Coming back from changing the sticker doesn't replay the fanfare.
    const again = App.winShown === g.id;
    App.winShown = g.id;
    if (m.celebrations && !again) {
      Sound.play("fanfare");
      const mo = motion();
      if (mo !== "none") K.Confetti.burst(mo === "reduced" ? 60 : 200);
    }
    const change = $('[data-act="change"]', el);
    if (change) change.addEventListener("click", () => {
      Sound.play("tap");
      if (rec.stickerTook) E.returnSticker(S.stickers, rec.sticker);
      rec.sticker = null;
      rec.stickerTook = false;
      save("stickers");
      saveLog();
      showPick(g, rec);
    });
    bindHold($('[data-act="hold"]', el), () => {
      if (change) change.disabled = true;
      rec.handed = Date.now();
      if (m.stock) { S.goodies.left = Math.max(0, goodiesLeft() - 1); save("goodies"); }
      saveLog();
      Backup.write();
      const b = $('[data-act="hold"]', el);
      b.classList.add("done");
      $(".t1", b).textContent = t("win.handed");
      $(".t2", b).textContent = "";
      Sound.play("repair");
      later(home, 1200);
    });
    backCountdown(el, num.winIdleSec, home, 20);
  }

  // ---------- Sticker pick ----------

  // Shown before the win screen to a player who reached the sticker number. Running out of time goes on to the
  // win screen without a pick, so a volunteer chooses.
  function showPick(g, rec) {
    const num = S.settings.numbers;
    const name = g.name;
    const list = E.shuffle(stickerChoices(), Math.random);
    const html =
      '<header class="abs row" style="left:72px;right:72px;top:40px;justify-content:space-between">' + brandMarkup("") +
      '<span style="font-size:15px;color:var(--dim)" data-back>' + esc(t("end.gameOver", { played: g.results.length, n: g.slots.length })) + "</span></header>" +
      '<section class="pick-lead"><span class="label warn rise" style="--i:0">' + esc(t("pick.label", { r: g.right, n: g.slots.length })) + "</span>" +
      '<h1 class="rise" style="--i:1">' + esc(name ? t("pick.title", { name }) : t("pick.titleNoName")) + "</h1>" +
      '<p class="lede rise" style="--i:2">' + esc(t("pick.sub", { confirm: t("pick.confirm") })) + "</p>" +
      '<div class="pick-card rise" style="--i:3"><div class="pick-prev empty" data-prev><span>' + esc(t("pick.empty")) + "</span></div>" +
      '<b class="pick-name" data-prev-name></b><div class="pick-acts">' +
      '<button class="btn btn-primary" data-act="confirm" disabled>' + esc(t("pick.confirm")) + icon("check", 24, { sw: 2.6 }) + "</button>" +
      '<button class="btn btn-soft" data-act="surprise">' + esc(t("pick.surprise")) + "</button></div></div></section>" +
      '<section class="pick-wrap rise" style="--i:2"><div class="pick-grid" role="listbox" aria-label="' + esc(t("pick.titleNoName")) + '">' +
      list.map((d, i) => '<button class="stile" role="option" aria-selected="false" aria-label="' + esc(d.name) + '" data-st="' + esc(d.id) + '" style="--i:' + i + '">' + stickerImg(d) + "</button>").join("") +
      "</div></section>";
    const el = mount("results pick", html, { mood: "win" });
    const tiles = $$(".stile", el);
    const grid = $(".pick-grid", el), prev = $("[data-prev]", el), prevName = $("[data-prev-name]", el), ok = $('[data-act="confirm"]', el);
    let chosen = null, spin = 0;
    const select = (id, quiet) => {
      chosen = id;
      tiles.forEach((b) => { const on = b.dataset.st === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
      const d = stickerById(id);
      prev.classList.remove("empty");
      prev.innerHTML = stickerImg(d, quiet ? "" : "pop");
      prevName.textContent = d.name;
      ok.disabled = false;
      if (!quiet) Sound.play("tap");
    };
    // Scrolls the grid itself, never the stage around it.
    const scrollToTile = (b) => {
      if (b.offsetTop < grid.scrollTop) grid.scrollTop = b.offsetTop - 8;
      else if (b.offsetTop + b.offsetHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = b.offsetTop + b.offsetHeight - grid.clientHeight + 8;
    };
    tiles.forEach((b) => b.addEventListener("click", () => { if (!spin) select(b.dataset.st); }));
    $('[data-act="surprise"]', el).addEventListener("click", () => {
      if (spin || !list.length) return;
      const rnd = () => list[Math.floor(Math.random() * list.length)].id;
      const final = rnd();
      if (motion() === "none") { select(final); scrollToTile(tiles.find((b) => b.dataset.st === final)); return; }
      let n = 0;
      ok.disabled = true;
      spin = every(() => {
        n++;
        if (n < 10) { select(rnd(), true); ok.disabled = true; Sound.play("tick"); return; }
        clearInterval(spin);
        spin = 0;
        select(final);
        Sound.play("spark");
        scrollToTile(tiles.find((b) => b.dataset.st === final));
      }, 90);
    });
    ok.addEventListener("click", () => {
      if (!chosen || spin) return;
      rec.sticker = chosen;
      rec.stickerTook = E.takeSticker(S.stickers, chosen);
      save("stickers");
      saveLog();
      Backup.write();
      Sound.play("repair");
      showWin(g, rec);
    });
    App.pickConfirm = () => ok.click();
    backCountdown(el, num.winIdleSec, () => showWin(g, rec), 20, "pick.timeLeft");
  }

  function bindHold(btn, onDone) {
    if (!btn) return;
    const ring = $(".ring", btn);
    let raf = 0, start = 0, done = false;
    const DUR = 2000;
    const step = (now) => {
      const p = Math.min(1, (now - start) / DUR);
      ring.style.strokeDashoffset = String(113.1 * (1 - p));
      if (p >= 1) { done = true; btn.classList.remove("holding"); onDone(); return; }
      raf = requestAnimationFrame(step);
    };
    const begin = (e) => {
      if (done || start) return;
      if (e && e.pointerId != null) { try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
      start = performance.now();
      btn.classList.add("holding");
      raf = requestAnimationFrame(step);
    };
    const cancel = () => {
      if (done) return;
      cancelAnimationFrame(raf);
      start = 0;
      btn.classList.remove("holding");
      ring.style.strokeDashoffset = "113.1";
    };
    btn.addEventListener("pointerdown", begin);
    btn.addEventListener("pointerup", cancel);
    btn.addEventListener("pointercancel", cancel);
    btn.addEventListener("lostpointercapture", cancel);
    btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); } });
    btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") cancel(); });
    btn.addEventListener("click", (e) => e.preventDefault());
  }

  function showOver(g, rec) {
    const m = S.settings.modules, num = S.settings.numbers;
    const name = g.name;
    const isOut = g.outcome === "out";
    let label, title, sub, mascotLine, pose;
    if (isOut) {
      label = t("out.label", { q: g.results.length });
      title = name ? t("out.title", { name }) : t("out.titleNoName");
      sub = t("out.sub", { O: E.cap(E.word(num.outAfter)) });
      mascotLine = t("out.mascot");
      pose = "dazed";
    } else {
      label = t("done.label", { r: g.right, n: g.slots.length });
      const close = m.goodieRule && g.right === num.goodieAt - 1;
      title = close ? (name ? t("done.titleClose", { name }) : t("done.titleCloseNoName")) : name ? t("done.title", { name }) : t("done.titleNoName");
      sub = m.goodieRule ? t("done.sub") : t("done.subNoGoodie", { r: g.right, n: g.slots.length });
      mascotLine = t("done.mascot");
      pose = "calm";
    }
    const streakText = g.right === 0 ? t("out.streakNone") : g.right === 1 ? t("out.streakOne") : t("out.streak", { r: g.right });
    const middle = isOut
      ? (m.shields ? '<div class="cracked" role="img" aria-label="All ' + num.outAfter + ' shields cracked">' +
          Array.from({ length: num.outAfter }, (_, i) => '<span class="s" style="--i:' + i + '">' + K.crackedShield(i % 2 === 1, 64) + "</span>").join("") + "</div>" : "") +
        '<div class="row rise" style="--i:3;margin-top:26px;gap:18px">' + resbar(g) + '<span style="font-size:16px;color:var(--muted)">' + esc(streakText) + "</span></div>"
      : '<div class="scorebox rise" style="--i:3"><div class="score"><span class="big">' + g.right + '</span><span class="of">' + esc(t("win.ofRight", { n: g.slots.length })) + "</span></div>" + resbar(g) + "</div>";
    const html =
      '<header class="abs row" style="left:72px;right:72px;top:40px;justify-content:space-between">' + brandMarkup("") +
      '<span style="font-size:15px;color:var(--dim)" data-back></span></header>' +
      '<section class="lead" style="top:136px"><span class="label ' + (isOut ? "bad" : "accent") + ' rise" style="--i:0">' + esc(label) + "</span>" +
      '<h1 class="rise" style="--i:1">' + esc(title) + '</h1><p class="lede rise" style="--i:2">' + esc(sub) + "</p>" + middle +
      '<div class="habit rise" style="--i:4;margin-top:30px"><span class="label good">' + esc(t("out.takeHome")) + "</span><p>" + rich(habitTip(g)) + "</p></div></section>" +
      (m.mascot ? '<aside class="right-mascot" style="top:150px"><div class="bubble big tail-down pop" style="padding:20px 24px;border-radius:24px"><p style="font-size:22px">' + esc(mascotLine) + "</p></div>" +
        '<div style="margin-top:30px">' + K.kavach(pose, 200, isOut ? "Kavach looking a little dazed but kind, with a bandage" : "Kavach smiling") + "</div></aside>" : "") +
      '<footer class="endfoot"><button class="btn btn-primary" style="height:76px;padding:0 32px 0 30px;border-radius:22px;font-size:24px;gap:14px" data-act="again">' +
      icon("replay", 24, { sw: 2.4 }) + esc(t("out.again")) + '</button><button class="btn btn-soft" data-act="home">' + esc(t("out.start")) + "</button>" + feedbackMarkup() + "</footer>";
    const el = mount("results over", html, { mood: isOut ? "out" : "" });
    if (isOut) Sound.play("out");
    bindFeedback(el, rec);
    $('[data-act="again"]', el).addEventListener("click", () => { Sound.play("tap"); showStart(App.lastName); });
    $('[data-act="home"]', el).addEventListener("click", () => { Sound.play("tap"); home(); });
    setTimeout(() => { const b = $('[data-act="again"]', el); if (b) b.focus({ preventScroll: true }); }, 400);
    backCountdown(el, num.resultSec, home);
  }

  function home() {
    abandonGame();
    closeOverlay();
    App.busy = false;
    setLive({ state: "free" });
    if (S.settings.modules.attract) showAttract();
    else showStart();
  }

  // ---------- Idle reset ----------

  function idleApplies() {
    if (!S.settings.modules.idleReset || App.inAdmin || App.queue || App.busy || App.overlay) return false;
    if (App.screen === "start") return true;
    if (App.screen === "play" && App.q) {
      if (App.q.phase === "question") return !S.settings.modules.timer;
      return App.q.phase === "reveal" || App.q.phase === "locked";
    }
    return false;
  }
  function checkIdle() {
    if (!idleApplies()) { hideIdle(); return; }
    const limit = Math.max(10, S.settings.numbers.idleSec);
    const quiet = (Date.now() - Math.max(App.lastInput, App.phaseAt)) / 1000;
    if (quiet >= limit) { hideIdle(); home(); return; }
    if (quiet >= limit - 8) {
      const left = Math.ceil(limit - quiet);
      if (!App.idleEl) {
        App.idleEl = document.createElement("div");
        App.idleEl.className = "overlay dim";
        App.idleEl.innerHTML = '<div class="idlewarn" role="alertdialog" aria-live="assertive"><h2>' + esc(t("idle.title")) + "</h2><p>" + esc(t("idle.sub")) + '</p><div class="cnt"></div></div>';
        stage().appendChild(App.idleEl);
      }
      $(".cnt", App.idleEl).textContent = t("idle.count", { s: left });
    } else hideIdle();
  }
  function hideIdle() { if (App.idleEl) { App.idleEl.remove(); App.idleEl = null; } }

  // ---------- Kiosk lock and fullscreen ----------

  function enterFullscreen() {
    if (!S.settings.modules.kioskLock || document.fullscreenElement) return;
    const d = document.documentElement;
    if (!d.requestFullscreen) return;
    d.requestFullscreen({ navigationUI: "hide" }).then(() => { App.wantFullscreen = true; }).catch(() => { /* the browser said no */ });
  }
  function onFullscreenChange() {
    if (document.fullscreenElement) { if (App.kioskEl) { App.kioskEl.remove(); App.kioskEl = null; } return; }
    if (!App.wantFullscreen || !S.settings.modules.kioskLock || App.inAdmin || App.queue) return;
    if (App.kioskEl) return;
    App.kioskEl = document.createElement("div");
    App.kioskEl.className = "overlay dim";
    App.kioskEl.style.zIndex = "40";
    App.kioskEl.innerHTML = '<div class="lockpanel" role="alertdialog">' + icon("lock", 40, { color: "var(--accent-2)" }) + "<h2>" + esc(t("kiosk.title")) + "</h2><p>" + esc(t("kiosk.sub")) + "</p>" +
      '<button class="btn btn-primary" data-act="fs">' + esc(t("kiosk.back")) + '</button><button class="btn btn-ghost" data-act="vol" style="margin-top:6px">' + esc(t("kiosk.volunteer")) + "</button></div>";
    stage().appendChild(App.kioskEl);
    $('[data-act="fs"]', App.kioskEl).addEventListener("click", () => {
      document.documentElement.requestFullscreen().catch(() => {});
    });
    $('[data-act="vol"]', App.kioskEl).addEventListener("click", () => {
      openPin(() => { App.wantFullscreen = false; if (App.kioskEl) { App.kioskEl.remove(); App.kioskEl = null; } });
    });
  }

  // ---------- PIN pad ----------

  const pinState = { fails: 0, lockedUntil: 0 };
  function openPin(onOk) {
    if (App.overlay) return;
    stopQTimer();
    let entry = "";
    const len = E.pinLength(S.settings.event);
    const ov = document.createElement("div");
    ov.className = "overlay dim";
    ov.style.zIndex = "45";
    ov.innerHTML = '<div class="pinpad" role="dialog" aria-label="' + esc(t("pin.title")) + '"><h2>' + esc(t("pin.title")) + '</h2><p class="sub">' + esc(t("pin.sub", { len })) + "</p>" +
      '<div class="pindots" aria-hidden="true">' + "<span></span>".repeat(len) + '</div><div class="pinkeys">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => '<button data-d="' + d + '">' + d + "</button>").join("") +
      '<button class="fn" data-k="cancel">' + esc(t("pin.cancel")) + '</button><button data-d="0">0</button><button class="fn" data-k="del" aria-label="Delete">' + icon("arrowL", 22) + "</button></div></div>";
    stage().appendChild(ov);
    const dots = $$(".pindots span", ov), sub = $(".sub", ov);
    const draw = () => dots.forEach((d, i) => d.classList.toggle("on", i < entry.length));
    const close = () => {
      ov.remove();
      App.overlay = null;
      // Resume a paused question timer.
      if (App.screen === "play" && App.q && App.q.phase === "question" && QT.total && QT.left > 0 && !App.inAdmin) {
        QT.running = true; QT.last = performance.now(); QT.raf = requestAnimationFrame(tickQT);
      }
    };
    const press = (d) => {
      if (Date.now() < pinState.lockedUntil) {
        sub.textContent = t("pin.locked", { s: Math.ceil((pinState.lockedUntil - Date.now()) / 1000) });
        sub.classList.add("err");
        return;
      }
      if (entry.length >= len) return;
      entry += d;
      draw();
      if (entry.length === len) {
        if (E.pinMatches(S.settings.event, entry)) {
          pinState.fails = 0;
          close();
          onOk();
        } else {
          pinState.fails++;
          if (pinState.fails >= 5) { pinState.lockedUntil = Date.now() + 30000; pinState.fails = 0; }
          const box = $(".pindots", ov);
          box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
          sub.textContent = t("pin.wrong");
          sub.classList.add("err");
          setTimeout(() => { entry = ""; draw(); }, 350);
        }
      }
    };
    App.overlay = {
      key(e) {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === "Backspace") { entry = entry.slice(0, -1); draw(); }
        else if (e.key === "Escape") close();
        e.preventDefault();
      },
      close,
    };
    $$("[data-d]", ov).forEach((b) => b.addEventListener("click", () => press(b.dataset.d)));
    $('[data-k="del"]', ov).addEventListener("click", () => { entry = entry.slice(0, -1); draw(); });
    $('[data-k="cancel"]', ov).addEventListener("click", close);
  }
  function closeOverlay() { if (App.overlay) App.overlay.close(); }

  // ---------- Admin entry ----------

  let logoTaps = [];
  function bindLogo(btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const now = Date.now();
      logoTaps = logoTaps.filter((x) => now - x < 2500);
      logoTaps.push(now);
      if (logoTaps.length >= 5) { logoTaps = []; requestAdmin(); }
    });
  }
  function requestAdmin() {
    if (App.inAdmin || App.queue) return;
    openPin(enterAdmin);
  }
  function enterAdmin() {
    abandonGame();
    clearScreenTimers();
    hideIdle();
    App.inAdmin = true;
    document.body.classList.add("is-admin");
    $("#stage").hidden = true;
    $("#bg").hidden = true;
    $("#admin").hidden = false;
    setLive({ state: "free" });
    if (window.QN_Admin) window.QN_Admin.open();
  }
  function exitAdmin() {
    if (window.QN_Admin) window.QN_Admin.close();
    App.inAdmin = false;
    document.body.classList.remove("is-admin");
    $("#admin").hidden = true;
    $("#stage").hidden = false;
    $("#bg").hidden = false;
    applyLook();
    reindex();
    window.scrollTo(0, 0);
    home();
  }

  // ---------- Keyboard ----------

  function onKey(e) {
    App.lastInput = Date.now();
    if (App.idleEl) hideIdle();
    if (App.overlay) { App.overlay.key(e); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) { e.preventDefault(); requestAdmin(); return; }
    if (App.inAdmin) return;
    if (S.settings.modules.kioskLock && !App.queue) {
      const k = e.key.toLowerCase();
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && ["r", "p", "s", "o", "u", "w", "n", "t"].includes(k)) || (e.altKey && (e.key === "ArrowLeft" || e.key === "Home"))) {
        e.preventDefault();
        return;
      }
    }
    if (App.queue || App.busy) return;
    const inInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    switch (App.screen) {
      case "attract":
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (E.canPlay(S.bank, S.packs, S.settings)) startFlow(); }
        break;
      case "start":
        if (e.key === "Escape") { e.preventDefault(); home(); }
        else if (e.key === "Enter" && !inInput && App.startReady) { e.preventDefault(); App.startReady(); }
        break;
      case "play": {
        const cq = App.q;
        if (!cq) break;
        if (cq.phase === "question") {
          if (/^[1-9]$/.test(e.key)) { e.preventDefault(); pick(parseInt(e.key, 10) - 1); }
          else if (e.key === "h" || e.key === "H") { e.preventDefault(); useHint(); }
          else if ((e.key === "f" || e.key === "F") && !e.ctrlKey) { e.preventDefault(); useFifty(); }
        } else if (cq.phase === "locked") {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(cq.picked); }
        } else if (cq.phase === "reveal") {
          // Handled here even when Next has focus; next() ignores a second call for the same answer.
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); next(); }
        }
        break;
      }
      case "results over":
        if (e.key === "Escape") { e.preventDefault(); home(); }
        break;
      case "results pick":
        // Enter on a sticker selects it (the button's own click); Enter anywhere else confirms the choice.
        if (e.key === "Enter" && !(e.target && e.target.closest && e.target.closest(".stile")) && App.pickConfirm) { e.preventDefault(); App.pickConfirm(); }
        break;
    }
  }

  // ---------- Live status for the queue screen ----------

  let liveBC = null;
  try { liveBC = new BroadcastChannel("quiztopher-nolan"); } catch (e) { liveBC = null; }
  function setLive(v) {
    if (App.queue) return;
    const payload = Object.assign({ ts: Date.now() }, v);
    store.set("live", payload);
    if (liveBC) try { liveBC.postMessage({ type: "live", v: payload }); } catch (e) { /* ignore */ }
  }

  // ---------- Queue screen (second window on a TV) ----------

  function showQueue() {
    App.queue = true;
    document.body.classList.add("is-queue");
    const draw = () => {
      load(true);
      applyLook();
      const m = S.settings.modules;
      const tips = S.tips.filter((x) => x.trim());
      const rules = rulesList().map((r) => '<div class="rule-row"><span class="icon-tile ' + r.tone + '">' + r.ico + '</span><div class="col"><span class="t">' + esc(r.t) + '</span><span class="s">' + esc(r.s) + "</span></div></div>").join("");
      const html =
        '<header class="abs row" style="left:96px;right:96px;top:48px;justify-content:space-between">' + brandMarkup((S.settings.event.club ? S.settings.event.club + " · " : "") + S.settings.event.tagline) + "</header>" +
        '<main class="hero"><div class="chip accent mono"><span class="dot"></span>' + esc(m.ladder ? t("attract.badge") : t("attract.badgeFlat")) + "</div>" +
        "<h1>" + esc(t("attract.title")) + ' <span class="accent">' + esc(t("attract.titleAccent")) + "</span></h1>" +
        '<p class="lede" style="font-size:26px;color:var(--muted);margin-top:24px;max-width:700px;line-height:1.45">' + esc(t("queue.sub")) + "</p>" +
        '<div class="status"><span class="live"></span><span data-status>' + esc(t("queue.free")) + "</span></div>" +
        (m.mascot ? '<div style="margin-top:40px">' + K.kavach("wave", 150) + "</div>" : "") + "</main>" +
        '<aside><section class="card lift"><h2>' + esc(t("attract.howTo")) + '</h2><div class="rules">' + rules + "</div></section>" +
        (tips.length ? '<section class="card warm tip-card"><div class="row" style="gap:10px">' + icon("bulb", 18, { color: "var(--warn)" }) + '<span class="label warn">' + esc(t("attract.didYouKnow")) + '</span></div><p class="tip"></p></section>' : "") +
        teamMarkup(0) + "</aside><footer>" + tr("attract.footer") + "</footer>";
      const el = mount("queue", html);
      let i = Math.floor(Math.random() * Math.max(1, tips.length));
      const showTip = () => {
        const p = $(".tip", el);
        if (!p || !tips.length) return;
        p.classList.remove("swap"); void p.offsetWidth; p.classList.add("swap");
        p.innerHTML = rich(tips[i % tips.length]);
        i++;
      };
      showTip();
      every(showTip, 8000);
      updateStatus(store.get("live", null));
    };
    const updateStatus = (v) => {
      const s = $("[data-status]", App.el);
      if (!s) return;
      if (v && v.state === "playing" && Date.now() - v.ts < 10 * 60 * 1000) s.textContent = t("queue.live", { i: v.i, n: v.n });
      else s.textContent = t("queue.free");
    };
    draw();
    window.addEventListener("storage", (e) => {
      if (!e.key) return;
      if (e.key === "qn.v1.live") updateStatus(store.get("live", null));
      else if (/^qn\.v1\.(settings|tips|strings)$/.test(e.key)) draw();
    });
    if (liveBC) liveBC.onmessage = (e) => { if (e.data && e.data.type === "live") updateStatus(e.data.v); };
  }

  // ---------- Backup file (Chrome and Edge) ----------

  const IDB = {
    db() {
      return new Promise((res, rej) => {
        const r = indexedDB.open("quiztopher-nolan", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(k) {
      const db = await this.db();
      return new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
    },
    async set(k, v) {
      const db = await this.db();
      return new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
    },
    async del(k) {
      const db = await this.db();
      return new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").delete(k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
    },
  };

  const Backup = {
    handle: null, status: "off", lastSaved: null, error: "",
    get supported() { return typeof window.showSaveFilePicker === "function"; },
    async init() {
      if (!this.supported) { this.status = "unsupported"; return; }
      try {
        this.handle = await IDB.get("backupHandle");
        this.lastSaved = store.get("backupSaved", null);
        if (!this.handle) { this.status = "off"; return; }
        const p = await this.handle.queryPermission({ mode: "readwrite" });
        this.status = p === "granted" ? "ok" : "paused";
      } catch (e) { this.status = "off"; }
    },
    snapshot() {
      return {
        app: "Quiztopher Nolan", kind: "backup", version: 1, savedAt: new Date().toISOString(),
        log: S.log, goodies: S.goodies, stickers: S.stickers, decks: S.decks, settings: S.settings, packs: S.packs,
        bank: store.get("bank", null), strings: S.strings, tips: S.tips, presets: S.presets,
      };
    },
    async pick() {
      const h = await window.showSaveFilePicker({ suggestedName: "quiztopher-nolan-backup.json", types: [{ description: "Backup file", accept: { "application/json": [".json"] } }] });
      this.handle = h;
      await IDB.set("backupHandle", h);
      this.status = "ok";
      await this.write(true);
    },
    async reconnect() {
      if (!this.handle) return;
      const p = await this.handle.requestPermission({ mode: "readwrite" });
      this.status = p === "granted" ? "ok" : "paused";
      if (this.status === "ok") await this.write(true);
    },
    async forget() { await IDB.del("backupHandle"); this.handle = null; this.status = "off"; },
    async write(force) {
      if (!this.handle || (this.status !== "ok" && !force)) return false;
      try {
        const w = await this.handle.createWritable();
        await w.write(JSON.stringify(this.snapshot()));
        await w.close();
        this.lastSaved = Date.now();
        store.set("backupSaved", this.lastSaved);
        this.error = "";
        return true;
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
        if (e && e.name === "NotAllowedError") this.status = "paused";
        return false;
      }
    },
  };

  // ---------- Look ----------

  function applyLook() {
    const look = S.settings.look;
    const html = document.documentElement;
    html.dataset.qnTheme = look.theme === "paper" ? "paper" : "midnight";
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    html.dataset.motion = look.motion === "none" ? "none" : look.motion === "reduced" || reduce ? "reduced" : "full";
    Sound.enabled = !!S.settings.modules.sound;
    Sound.setVolume(Math.max(0, Math.min(1, +S.settings.numbers.volume || 0)));
    document.title = S.settings.event.name || "Quiztopher Nolan";
    buildFloaters();
  }

  let floatersBuilt = "";
  function buildFloaters() {
    const host = $("#floaters");
    const mode = document.documentElement.dataset.motion;
    if (!host || floatersBuilt === mode) return;
    floatersBuilt = mode;
    if (mode !== "full") { host.innerHTML = ""; return; }
    const kinds = ["lock", "shieldLogo", "mail", "lock", "shieldCheck", "mail"];
    let h = "";
    for (let i = 0; i < 16; i++) {
      const size = 36 + Math.round(Math.random() * 100);
      const dur = 70 - size * 0.32 + Math.random() * 12;
      h += '<span class="floater" style="left:' + Math.round(Math.random() * 96) + "vw;width:" + size + "px;height:" + size + "px;animation-duration:" + dur.toFixed(1) +
        "s;animation-delay:-" + (Math.random() * dur).toFixed(1) + "s;--dx:" + Math.round((Math.random() - 0.5) * 160) + "px;--r0:" + Math.round((Math.random() - 0.5) * 30) +
        "deg;--r1:" + Math.round((Math.random() - 0.5) * 60) + 'deg">' + icon(kinds[i % kinds.length], size, { sw: 1.2 }) + "</span>";
    }
    host.innerHTML = h;
  }

  // ---------- Safety net ----------

  let crashes = [];
  function onCrash(err) {
    console.error(err);
    if (App.inAdmin || App.queue) return;
    const now = Date.now();
    crashes = crashes.filter((x) => now - x < 60000);
    crashes.push(now);
    if (crashes.length > 3) return;
    setTimeout(() => { try { home(); } catch (e) { console.error(e); } }, 400);
  }

  // ---------- Boot ----------

  async function boot() {
    const queue = location.hash === "#queue";
    load(queue);
    applyLook();
    fit();
    window.addEventListener("resize", fit);
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fonts are embedded */ }
    if (queue) { showQueue(); return; }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", () => { App.lastInput = Date.now(); if (App.idleEl) hideIdle(); Sound.init(); }, true);
    document.addEventListener("contextmenu", (e) => { if (!App.inAdmin) e.preventDefault(); });
    document.addEventListener("dragstart", (e) => { if (!App.inAdmin) e.preventDefault(); });
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("beforeunload", (e) => {
      if (S.settings.modules.kioskLock && !App.inAdmin && App.wantFullscreen) { e.preventDefault(); e.returnValue = ""; }
    });
    window.addEventListener("error", (e) => onCrash(e.error || e.message));
    window.addEventListener("unhandledrejection", (e) => console.error(e.reason));
    window.addEventListener("storage", (e) => { if (e.key === "qn.v1.settings" && !App.inAdmin) { load(); applyLook(); } });
    setInterval(checkIdle, 500);
    await Backup.init();
    home();
  }

  // ---------- For the admin panel and tests ----------

  window.QN = {
    S, App, store, save, saveLog, load, reindex, t, tr, baseVars, home, exitAdmin, applyLook, Backup,
    stickerImg, stickerWhere, stickerChoices, pickOffered,
    playMarkup, questionCtx, pictureMarkup, optionText, rulesList, fitPlay, mergePacks,
    // Test hooks: drive the game without the pointer.
    test: {
      start: (name) => { Sound.init(); countdown(() => beginGame(name || "")); },
      pick, next, reveal: (i) => reveal(i), useFifty, useHint, endGame,
      state: () => ({ screen: App.screen, phase: App.q && App.q.phase, idx: App.game && App.game.idx, game: App.game }),
      right: () => App.q && App.q.order.indexOf(App.q.q.ans),
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
