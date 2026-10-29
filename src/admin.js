// The PIN-locked admin panel: modules, questions and packs, goodies, stickers, stats, look and text, event and kiosk.
(function () {
  "use strict";
  const E = window.QN_Engine, K = window.QN_Kit;
  const { esc, rich, icon } = K;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let QN, S, root, main;
  let tab = "modules";
  const undo = [];
  const qFilter = { text: "", pack: "", diff: "", fmt: "", hidden: false };
  let statsRange = "today";

  // ---------- Small helpers ----------

  function saveSettings() { QN.save("settings"); QN.applyLook(); savedNote(); }
  function savedNote(text) {
    const el = $("[data-saved]", root);
    if (!el) return;
    el.innerHTML = '<span class="dot ok"></span>' + esc(text || "All changes saved on this laptop");
    if (QN.App.storageWarn) el.innerHTML = '<span class="dot bad"></span>Storage is full. Export the log and end the event, or remove uploaded pictures.';
  }
  function getPath(path) { return path.split(".").reduce((o, k) => (o ? o[k] : undefined), S.settings); }
  function setPath(path, value) {
    const parts = path.split(".");
    let o = S.settings;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
    clampSettings();
    S.activePreset = "";
    QN.store.set("activePreset", "");
    saveSettings();
    refreshControls();
  }
  function clampSettings() {
    const n = S.settings.numbers;
    n.questions = Math.max(3, Math.min(15, n.questions | 0));
    n.goodieAt = Math.max(1, Math.min(n.questions, n.goodieAt | 0));
    n.stickerAt = Math.max(n.goodieAt, Math.min(n.questions, n.stickerAt | 0));
    n.outAfter = Math.max(1, Math.min(n.questions, n.outAfter | 0));
    n.hardCap = Math.max(0, Math.min(n.questions - 1, n.hardCap | 0));
  }

  function toast(text, kind) {
    $$(".adm-toast", root).forEach((x) => x.remove());
    const el = document.createElement("div");
    el.className = "adm-toast " + (kind || "");
    el.textContent = text;
    root.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const stamp = () => { const d = new Date(); return E.dayKey(d) + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0"); };
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtDay = (d) => new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  function modal(html, opts) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "adm-modal-wrap";
      ov.innerHTML = '<div class="adm-modal ' + ((opts && opts.cls) || "") + '" role="dialog" aria-modal="true">' + html + "</div>";
      root.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); };
      ov.addEventListener("click", (e) => {
        if (e.target === ov && !(opts && opts.sticky)) done(null);
        const b = e.target.closest("[data-m]");
        if (b) done(b.dataset.m === "cancel" ? null : { action: b.dataset.m, el: ov });
      });
      ov.addEventListener("keydown", (e) => { if (e.key === "Escape") done(null); });
      if (opts && opts.onOpen) opts.onOpen(ov, done);
      const f = $("input, textarea, select, button.primary", ov);
      if (f) setTimeout(() => f.focus(), 30);
    });
  }
  async function confirmBox(title, text, ok, danger) {
    const r = await modal("<h2>" + esc(title) + "</h2><p>" + esc(text) + '</p><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn ' +
      (danger ? "danger" : "primary") + '" data-m="ok">' + esc(ok) + "</button></div>");
    return !!r;
  }

  // ---------- Controls ----------

  const sw = (path, label) => '<button class="sw" role="switch" aria-checked="' + !!getPath(path) + '" data-path="' + path + '" aria-label="' + esc(label) + '"><span></span></button>';
  const stepper = (path, min, max, label, suffix) => '<span class="step" data-path="' + path + '" data-min="' + min + '" data-max="' + max + '" data-suffix="' + esc(suffix || "") + '">' +
    '<button data-d="-1" aria-label="Less ' + esc(label) + '">' + icon("minus", 14, { sw: 2.4 }) + '</button><span class="v">' + getPath(path) + esc(suffix || "") + '</span><button data-d="1" aria-label="More ' + esc(label) + '">' + icon("plus", 14, { sw: 2.4 }) + "</button></span>";
  const select = (path, options, label) => '<select class="asel" data-path="' + path + '" aria-label="' + esc(label) + '">' +
    options.map((o) => '<option value="' + esc(o[0]) + '"' + (String(getPath(path)) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>";
  const radios = (path, options, label) => '<div class="seg-ctl" role="radiogroup" aria-label="' + esc(label) + '">' +
    options.map((o) => '<button role="radio" data-path="' + path + '" data-val="' + esc(o[0]) + '" aria-checked="' + (String(getPath(path)) === String(o[0])) + '">' + esc(o[1]) + "</button>").join("") + "</div>";
  const row = (label, ctl, sub) => '<div class="arow"><span class="al"><span>' + esc(label) + "</span>" + (sub ? '<span class="as">' + sub + "</span>" : "") + '</span><span class="ac">' + ctl + "</span></div>";

  function refreshControls() {
    $$("[data-path]", main).forEach((el) => {
      const v = getPath(el.dataset.path);
      if (el.classList.contains("sw")) el.setAttribute("aria-checked", String(!!v));
      else if (el.classList.contains("step")) $(".v", el).textContent = v + (el.dataset.suffix || "");
      else if (el.tagName === "SELECT") el.value = String(v);
      else if (el.type === "range") el.value = v;
      else if (el.getAttribute("role") === "radio") el.setAttribute("aria-checked", String(String(v) === el.dataset.val));
    });
    $$("[data-dep]", main).forEach((el) => { el.classList.toggle("off", !getPath(el.dataset.dep)); });
    const pl = $("[data-preset-label]", root);
    if (pl) pl.textContent = S.activePreset || "Custom";
    const pc = $("[data-packs-on]", main);
    if (pc) pc.textContent = S.packs.filter((p) => p.on).length + " of " + S.packs.length + " on";
    renderNavCard();
    renderWarnings();
  }

  function bindControls() {
    main.addEventListener("click", (e) => {
      const swb = e.target.closest(".sw[data-path]");
      if (swb) { setPath(swb.dataset.path, !getPath(swb.dataset.path)); return; }
      const st = e.target.closest(".step [data-d]");
      if (st) {
        const box = st.closest(".step");
        const v = Math.max(+box.dataset.min, Math.min(+box.dataset.max, (+getPath(box.dataset.path) || 0) + +st.dataset.d));
        setPath(box.dataset.path, v);
        return;
      }
      const rd = e.target.closest('[role="radio"][data-path]');
      if (rd) { setPath(rd.dataset.path, isNaN(+rd.dataset.val) || rd.dataset.val === "" ? rd.dataset.val : +rd.dataset.val); return; }
    });
    main.addEventListener("change", (e) => {
      const el = e.target;
      if (el.tagName === "SELECT" && el.dataset.path) setPath(el.dataset.path, isNaN(+el.value) || el.value === "" ? el.value : +el.value);
    });
    main.addEventListener("input", (e) => {
      const el = e.target;
      if (el.type === "range" && el.dataset.path) setPath(el.dataset.path, +el.value);
    });
  }

  // ---------- Shell ----------

  const TABS = [
    ["modules", "Modules", "list"],
    ["questions", "Questions and packs", "book"],
    ["goodies", "Goodies", "gift"],
    ["stickers", "Stickers", "image"],
    ["stats", "Stats", "chart"],
    ["look", "Look and text", "palette"],
    ["event", "Event and kiosk", "calendar"],
  ];

  function open() {
    QN = window.QN; S = QN.S;
    root = $("#admin");
    root.innerHTML =
      '<div class="adm"><nav class="adm-nav" aria-label="Admin sections"><div class="adm-brand"><span class="logo sm">' + icon("shieldLogo", 22, { color: "#0B1020", sw: 2.2 }) +
      '</span><span class="col"><b>' + esc(S.settings.event.name) + '</b><span class="as">Admin</span></span></div>' +
      TABS.map((x) => '<button class="adm-tab" data-tab="' + x[0] + '">' + icon(x[2], 18) + "<span>" + esc(x[1]) + "</span></button>").join("") +
      '<div class="adm-navfoot"><div data-navcard></div><span class="as row" style="gap:8px">' + icon("lock", 15) + 'PIN protected</span><button class="abtn" data-exit>' + icon("play", 16) + "Back to the quiz</button></div></nav>" +
      '<main class="adm-main" id="adm-main"></main></div><div class="adm-tipbox" hidden></div>';
    main = $("#adm-main", root);
    $$(".adm-tab", root).forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
    $("[data-exit]", root).addEventListener("click", () => QN.exitAdmin());
    show(tab);
  }
  function close() { if (root) root.innerHTML = ""; }

  function show(name) {
    tab = name;
    $$(".adm-tab", root).forEach((b) => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
    const r = { modules: renderModules, questions: renderQuestions, goodies: renderGoodies, stickers: renderStickers, stats: renderStats, look: renderLook, event: renderEvent }[name];
    // A fresh element per render, so each tab's listeners are bound exactly once.
    const fresh = main.cloneNode(false);
    main.replaceWith(fresh);
    main = fresh;
    bindControls();
    main.innerHTML = r();
    afterRender[name] && afterRender[name]();
    renderNavCard();
    renderWarnings();
    savedNote();
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  const afterRender = {};

  function renderNavCard() {
    const box = $("[data-navcard]", root);
    if (!box) return;
    if (!S.settings.modules.stock) { box.innerHTML = ""; return; }
    const g = S.goodies, pct = g.stock ? Math.round((100 * g.left) / g.stock) : 0;
    const low = g.left <= S.settings.numbers.lowStockAt;
    box.innerHTML = '<div class="navcard' + (low ? " low" : "") + '"><div class="row" style="justify-content:space-between"><span>Goodies left</span><b class="mono">' + g.left + " / " + g.stock +
      '</b></div><div class="bar"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div>' + (low ? '<span class="as">' + icon("warning", 13) + " Running low</span>" : "") + "</div>";
  }

  function renderWarnings() {
    const box = $("[data-warn]", main);
    if (!box) return;
    const w = [];
    const ev = S.settings.event;
    if (!ev.pinChanged && !ev.pinHash) w.push(["warn", "The PIN is still the default " + E.DEFAULT_PIN + ". Change it in Event and kiosk before the stall opens.", "event"]);
    else if (!ev.pinHash && E.pinLength(ev) < 8) w.push(["warn", "The PIN has only " + E.pinLength(ev) + " digits. Set an 8-digit PIN in Event and kiosk.", "event"]);
    if (QN.App.storageWarn) w.push(["bad", "The browser’s storage is full. Export the game log and end the event, or remove uploaded pictures.", "goodies"]);
    if (QN.Backup.status === "paused") w.push(["warn", "The backup file needs reconnecting after the restart.", "event"]);
    if (S.settings.modules.stock && S.goodies.left <= S.settings.numbers.lowStockAt) w.push(["warn", "Only " + S.goodies.left + " goodies left.", "goodies"]);
    const m = S.settings.modules;
    if (m.stickerPick && !m.goodieRule) w.push(["warn", "The sticker pick is on, but it needs the goodie rule, which is off.", "modules"]);
    else if (m.stickerPick && QN.stickerChoices().length === 0) w.push(["warn", "The sticker pick is on, but no stickers are shown or left, so players get a goodie a volunteer picks.", "stickers"]);
    if (!E.canPlay(S.bank, S.packs, S.settings)) w.push(["bad", "No questions can be played: every pack is switched off or every question is hidden.", "questions"]);
    box.innerHTML = w.map((x) => '<div class="banner ' + x[0] + '">' + icon(x[0] === "bad" ? "warning" : "info", 18) + "<span>" + esc(x[1]) + '</span><button class="link" data-goto="' + x[2] + '">Open</button></div>').join("");
    $$("[data-goto]", box).forEach((b) => b.addEventListener("click", () => show(b.dataset.goto)));
  }

  const head = (title, sub, right) => '<div class="adm-head"><div><h1>' + esc(title) + "</h1><p>" + sub + '</p></div><div class="row" style="gap:10px;flex-wrap:wrap">' + (right || "") + '</div></div><div data-warn class="banners"></div>';
  const foot = () => '<div class="adm-foot"><span data-saved></span><span>Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd> or tap the logo five times to come back here.</span></div>';

  // ---------- Modules ----------

  function renderModules() {
    const presets = Object.keys(E.BUILTIN_PRESETS).concat(Object.keys(S.presets));
    const right = '<div class="preset"><span class="as">Preset</span><b data-preset-label>' + esc(S.activePreset || "Custom") + '</b><select class="asel" data-preset-load aria-label="Load a preset"><option value="">Load…</option>' +
      presets.map((p) => '<option value="' + esc(p) + '">' + esc(p) + "</option>").join("") + "</select></div>" +
      '<button class="abtn primary" data-act="save-preset">' + icon("save", 16) + "Save as preset</button>" +
      (Object.keys(S.presets).length ? '<button class="abtn" data-act="del-preset">' + icon("trash", 16) + "Delete a preset</button>" : "");
    const timers = [[15, "15 s"], [20, "20 s"], [30, "30 s"], [45, "45 s"], [60, "60 s"]];
    const html = head("Modules", "Switch any part of the quiz on or off and set the rules. Changes apply from the next game.", right) +
      '<div class="cards3">' +
      card("Game rules",
        row("Questions per game", stepper("numbers.questions", 3, 15, "questions")) +
        row("Out after wrong in a row", '<span data-dep="modules.outRule">' + stepper("numbers.outAfter", 1, 15, "wrong answers") + "</span>" + sw("modules.outRule", "Out rule")) +
        row("Goodie at right answers", '<span data-dep="modules.goodieRule">' + stepper("numbers.goodieAt", 1, 15, "right answers") + "</span>" + sw("modules.goodieRule", "Goodie rule")) +
        row("Sticker pick at right answers", '<span data-dep="modules.stickerPick">' + stepper("numbers.stickerAt", 1, 15, "right answers for the sticker pick") + "</span>" + sw("modules.stickerPick", "Sticker pick"), "They choose their own sticker. Set them up in Stickers") +
        row("Timer", '<span data-dep="modules.timer">' + select("numbers.timerSec", timers, "Timer length") + "</span>" + sw("modules.timer", "Timer"), "Running out counts as wrong") +
        row("Ask for a name", sw("modules.name", "Ask for a name"), "Optional, never saved")) +
      card("Question flow",
        row("Easy-to-hard ladder", sw("modules.ladder", "Easy-to-hard ladder")) +
        row("Stage cards", sw("modules.stageCards", "Stage cards"), "Getting tricky, Final stretch, Boss") +
        row("Boss questions at the end", '<span data-dep="modules.hardCap">' + stepper("numbers.hardCap", 0, 14, "boss questions") + "</span>" + sw("modules.hardCap", "Hard-question cap"), "From the challenge round, Q61 to 90") +
        row("Picture clues", '<span data-dep="modules.pictures">' + select("numbers.pictures", [["1", "1 a game"], ["1-2", "1 or 2"], ["2", "2 a game"]], "Picture clues per game") + "</span>" + sw("modules.pictures", "Picture clues")) +
        row("No repeats until all used", sw("modules.noRepeats", "No repeats until all used")) +
        '<div class="arow"><span class="as" data-decks>' + deckLine() + '</span><button class="abtn sm" data-act="reset-decks">Reset decks</button></div>') +
      card("Lifelines and answers",
        row("50:50", '<span data-dep="modules.fifty">' + stepper("numbers.fiftyPerGame", 1, 5, "50:50 uses", " a game") + "</span>" + sw("modules.fifty", "50:50 lifeline")) +
        row("Hint", '<span data-dep="modules.hint">' + stepper("numbers.hintsPerGame", 1, 5, "hints", " a game") + "</span>" + sw("modules.hint", "Hint lifeline")) +
        row("Show the right answer", sw("modules.showRight", "Show the right answer"), "Lights it up after a wrong pick") +
        row("Shuffle options", sw("modules.shuffle", "Shuffle options")) +
        row("Reveal the answer", select("numbers.revealMode", [["auto", "Straight away"], ["volunteer", "When a volunteer taps"]], "Reveal the answer"))) +
      card("Tips",
        row("Tip after each answer", sw("modules.tips", "Tip after each answer"), "The “Tell them” line") +
        row("Show it after", '<span data-dep="modules.tips">' + select("numbers.tipAfter", [["both", "Every answer"], ["right", "Right answers"], ["wrong", "Wrong answers"]], "Show the tip after") + "</span>") +
        row("Next question", select("numbers.tipAutoSec", [[0, "Waits for a tap"], [6, "Moves on after 6 s"], [10, "Moves on after 10 s"], [15, "Moves on after 15 s"]], "Next question"))) +
      card("Question packs", '<div class="pack-chips">' + S.packs.map((p) =>
        '<button class="pchip' + (p.challenge ? " warm" : "") + '" aria-pressed="' + p.on + '" data-pack-toggle="' + esc(p.id) + '">' + icon(p.on ? "check" : "plus", 14, { sw: 3 }) + esc(p.short || p.name) + "</button>").join("") +
        '</div><div class="arow"><span class="as" data-packs-on>' + S.packs.filter((p) => p.on).length + " of " + S.packs.length + ' on</span><button class="abtn sm" data-goto-tab="questions">Edit packs</button></div>', "") +
      card("Goodies",
        row("Goodie codes", sw("modules.goodieCodes", "Goodie codes"), "A short code a volunteer checks") +
        row("Track stock", sw("modules.stock", "Track goodie stock")) +
        row("Low-stock warning", '<span data-dep="modules.stock">' + stepper("numbers.lowStockAt", 0, 100, "low-stock level", " left") + "</span>") +
        row("Goodies-left counter", sw("modules.goodiesLeft", "Goodies-left counter"), "On the attract screen") +
        row("End-of-game feedback", sw("modules.feedback", "End-of-game feedback"), "“Learned something new?”")) +
      card("Fun and feel",
        row("Kavach the mascot", sw("modules.mascot", "Kavach the mascot")) +
        row("Shields and goodie meters", sw("modules.shields", "Shields meter") + sw("modules.goodieMeter", "Goodie meter"), "Shields, then goodie") +
        row("Confetti and fanfare", sw("modules.celebrations", "Confetti and fanfare")) +
        row("Sound", '<input type="range" class="arange" min="0" max="1" step="0.05" data-path="numbers.volume" aria-label="Volume">' + sw("modules.sound", "Sound")) +
        row("Animations", radios("look.motion", [["full", "Full"], ["reduced", "Reduced"], ["none", "None"]], "Animations"))) +
      card("Attract and kiosk",
        row("Attract screen", sw("modules.attract", "Attract screen"), "Rules and tips while nobody plays") +
        row("Idle reset", '<span data-dep="modules.idleReset">' + select("numbers.idleSec", [[20, "20 s"], [30, "30 s"], [45, "45 s"], [60, "60 s"], [90, "90 s"]], "Idle reset after") + "</span>" + sw("modules.idleReset", "Idle reset")) +
        row("Kiosk lock", sw("modules.kioskLock", "Kiosk lock"), "Full screen; leaving needs the PIN")) +
      "</div>" + foot();
    return html;
  }
  function card(title, body, cls) { return '<section class="acard ' + (cls || "") + '"><h2>' + esc(title) + "</h2>" + body + "</section>"; }
  function deckLine() {
    const elig = E.eligibleMap(S.bank, S.packs, S.settings);
    return E.deckSummary(S.decks, elig).filter((d) => d.total).map((d) => '<span class="nowrap">' + esc(d.tier[0].toUpperCase() + d.tier.slice(1)) + " " + d.used + "/" + d.total + "</span>").join(" · ") + " used";
  }

  afterRender.modules = () => {
    $("[data-preset-load]", main).addEventListener("change", async (e) => {
      const name = e.target.value;
      if (!name) return;
      let next = E.presetSettings(name, S.settings);
      if (!next && S.presets[name]) {
        next = E.deepMerge(E.DEFAULT_SETTINGS, {});
        next.modules = Object.assign(next.modules, S.presets[name].modules);
        next.numbers = Object.assign(next.numbers, S.presets[name].numbers);
        next.look = S.settings.look;
        next.event = S.settings.event;
      }
      if (!next) return;
      Object.keys(S.settings).forEach((k) => { S.settings[k] = next[k]; });
      S.activePreset = name;
      QN.store.set("activePreset", name);
      saveSettings();
      show("modules");
      toast("Loaded “" + name + "”");
    });
    main.addEventListener("click", onModulesClick);
  };
  async function onModulesClick(e) {
    if (tab !== "modules") return;
    const b = e.target.closest("[data-act], [data-pack-toggle], [data-goto-tab]");
    if (!b) return;
    if (b.dataset.packToggle) {
      const p = S.packs.find((x) => x.id === b.dataset.packToggle);
      p.on = !p.on;
      QN.save("packs");
      b.setAttribute("aria-pressed", p.on);
      b.innerHTML = icon(p.on ? "check" : "plus", 14, { sw: 3 }) + esc(p.short || p.name);
      refreshControls();
      $("[data-decks]", main).innerHTML = deckLine();
      return;
    }
    if (b.dataset.gotoTab) { show(b.dataset.gotoTab); return; }
    if (b.dataset.act === "reset-decks") {
      if (!(await confirmBox("Reset the decks?", "Every question becomes fresh again, so recent ones can come back straight away.", "Reset decks"))) return;
      S.decks = {}; QN.save("decks");
      $("[data-decks]", main).innerHTML = deckLine();
      toast("Decks reset");
    }
    if (b.dataset.act === "save-preset") {
      const r = await modal('<h2>Save as preset</h2><p>Saves every switch and number on this page. Look, event details and the PIN are not included.</p><label class="afield"><span>Preset name</span><input class="ainput" data-name maxlength="30" placeholder="For example: Workshop"></label><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn primary" data-m="ok">Save preset</button></div>');
      if (!r) return;
      const name = $("[data-name]", r.el).value.trim();
      if (!name) return;
      if (E.BUILTIN_PRESETS[name]) { toast("That name belongs to a built-in preset", "bad"); return; }
      S.presets[name] = { modules: Object.assign({}, S.settings.modules), numbers: Object.assign({}, S.settings.numbers) };
      QN.save("presets");
      S.activePreset = name; QN.store.set("activePreset", name);
      show("modules");
      toast("Saved “" + name + "”");
    }
    if (b.dataset.act === "del-preset") {
      const names = Object.keys(S.presets);
      const r = await modal('<h2>Delete a preset</h2><label class="afield"><span>Preset</span><select class="asel" data-name>' + names.map((n) => "<option>" + esc(n) + "</option>").join("") +
        '</select></label><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn danger" data-m="ok">Delete</button></div>');
      if (!r) return;
      const name = $("[data-name]", r.el).value;
      delete S.presets[name];
      QN.save("presets");
      show("modules");
    }
  }

  // ---------- Questions and packs ----------

  const FMT_LABEL = { mcq: "MCQ", tf: "True / False", ss: "Scam or Safe", fill: "Fill in", ff: "Full form", pic: "Picture" };
  const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", challenge: "Boss" };

  function pushUndo(label) {
    undo.push({ label, bank: JSON.stringify(S.bank), packs: JSON.stringify(S.packs), images: JSON.stringify(S.images) });
    if (undo.length > 25) undo.shift();
  }
  function commitBank() {
    QN.save("bank", "packs", "images");
    QN.reindex();
  }

  function renderQuestions() {
    const right = '<button class="abtn primary" data-act="add-q">' + icon("plus", 16) + 'Add question</button><label class="abtn">' + icon("upload", 16) + 'Import spreadsheet<input type="file" accept=".csv,text/csv" data-import hidden></label>' +
      '<button class="abtn" data-act="export-all">' + icon("download", 16) + "Export all</button>" +
      '<button class="abtn" data-act="undo"' + (undo.length ? "" : " disabled") + ">" + icon("undo", 16) + (undo.length ? "Undo " + esc(undo[undo.length - 1].label) : "Undo") + "</button>";
    const packs = S.packs.map((p, i) => {
      const qs = S.bank.filter((q) => q.pack === p.id);
      const hidden = qs.filter((q) => q.hidden).length;
      return '<section class="pack' + (p.on ? "" : " off") + '"><div class="row" style="justify-content:space-between;gap:10px"><b>' + esc(p.name) + "</b>" + sw2("pack-on", p.id, p.on, "Pack " + p.name) + "</div>" +
        '<span class="as">' + qs.length + " questions" + (hidden ? " · " + hidden + " hidden" : "") + (p.custom ? " · your pack" : "") + "</span>" +
        '<div class="row" style="justify-content:space-between;margin-top:4px"><span class="as">Hints</span>' + sw2("pack-hints", p.id, p.hints !== false, "Hints in " + p.name) + "</div>" +
        '<div class="pack-acts"><button class="ibtn" data-pack-act="rename" data-id="' + p.id + '" title="Rename" aria-label="Rename ' + esc(p.name) + '">' + icon("edit", 16) + "</button>" +
        '<button class="ibtn" data-pack-act="dup" data-id="' + p.id + '" title="Duplicate" aria-label="Duplicate ' + esc(p.name) + '">' + icon("copy", 16) + "</button>" +
        '<button class="ibtn" data-pack-act="export" data-id="' + p.id + '" title="Export as spreadsheet" aria-label="Export ' + esc(p.name) + '">' + icon("download", 16) + "</button>" +
        '<button class="ibtn" data-pack-act="up" data-id="' + p.id + '" title="Move up" aria-label="Move ' + esc(p.name) + ' up"' + (i === 0 ? " disabled" : "") + ">" + icon("chevU", 16) + "</button>" +
        '<button class="ibtn" data-pack-act="down" data-id="' + p.id + '" title="Move down" aria-label="Move ' + esc(p.name) + ' down"' + (i === S.packs.length - 1 ? " disabled" : "") + ">" + icon("chevD", 16) + "</button>" +
        (p.custom ? '<button class="ibtn danger" data-pack-act="del" data-id="' + p.id + '" title="Delete pack" aria-label="Delete ' + esc(p.name) + '">' + icon("trash", 16) + "</button>" : "") + "</div></section>";
    }).join("") + '<button class="pack add" data-act="new-pack">' + icon("plus", 22) + "<b>New pack</b><span class=\"as\">Start empty, or import a spreadsheet</span></button>";
    const filters = '<div class="qfilters"><label class="search">' + icon("search", 16) + '<input class="ainput" data-qf="text" placeholder="Search questions, answers, tips" value="' + esc(qFilter.text) + '"></label>' +
      '<select class="asel" data-qf="pack" aria-label="Pack"><option value="">All packs</option>' + S.packs.map((p) => '<option value="' + p.id + '"' + (qFilter.pack === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select>" +
      '<select class="asel" data-qf="diff" aria-label="Difficulty"><option value="">Any difficulty</option>' + E.TIERS.map((d) => '<option value="' + d + '"' + (qFilter.diff === d ? " selected" : "") + ">" + DIFF_LABEL[d] + "</option>").join("") + "</select>" +
      '<select class="asel" data-qf="fmt" aria-label="Format"><option value="">Any format</option>' + Object.keys(FMT_LABEL).map((f) => '<option value="' + f + '"' + (qFilter.fmt === f ? " selected" : "") + ">" + FMT_LABEL[f] + "</option>").join("") + "</select>" +
      '<label class="check"><input type="checkbox" data-qf="hidden"' + (qFilter.hidden ? " checked" : "") + "> Hidden only</label></div>";
    return head("Questions and packs", "Each round is a pack. Packs and questions save the moment you change them, and the last 25 changes can be undone.", right) +
      '<div class="packs">' + packs + "</div><h2 class=\"sect\">Questions</h2>" + filters + '<div class="qtable-wrap"><table class="qtable qlist"><thead><tr><th>#</th><th>Question</th><th>Format</th><th>Difficulty</th><th>Pin</th><th>Show</th><th></th></tr></thead><tbody data-qrows></tbody></table></div><p class="as" data-qcount></p>' + foot();
  }
  const sw2 = (kind, id, on, label) => '<button class="sw" role="switch" aria-checked="' + on + '" data-' + kind + '="' + esc(id) + '" aria-label="' + esc(label) + '"><span></span></button>';

  function filteredQuestions() {
    const tx = qFilter.text.trim().toLowerCase();
    return S.bank.filter((q) => {
      if (qFilter.pack && q.pack !== qFilter.pack) return false;
      if (qFilter.diff && q.diff !== qFilter.diff) return false;
      if (qFilter.fmt && q.fmt !== qFilter.fmt) return false;
      if (qFilter.hidden && !q.hidden) return false;
      if (tx) {
        const hay = (q.n + " " + q.q + " " + q.opts.join(" ") + " " + q.hint + " " + q.tip).toLowerCase();
        if (!hay.includes(tx)) return false;
      }
      return true;
    });
  }
  function renderRows() {
    const body = $("[data-qrows]", main);
    if (!body) return;
    const list = filteredQuestions();
    body.innerHTML = list.map((q) => {
      const pack = QN.App.packById[q.pack];
      const errs = E.validateQuestion(q);
      return '<tr class="' + (q.hidden ? "hidden-q" : "") + '"><td class="mono">' + q.n + '</td><td><button class="qlink" data-edit="' + q.id + '">' + esc(K.plain(q.fmt === "pic" ? "Picture: " + q.q : q.q)) + "</button>" +
        '<span class="as">' + esc(pack ? pack.name : "No pack") + " · Answer: " + esc(K.plain(QN.optionText(q, q.ans) || "?")) + (errs.length ? ' · <b class="bad">' + esc(errs[0]) + "</b>" : "") + "</span></td>" +
        '<td><span class="fchip">' + FMT_LABEL[q.fmt] + "</span></td>" +
        '<td><select class="asel sm" data-diff="' + q.id + '" aria-label="Difficulty of question ' + q.n + '">' + E.TIERS.map((d) => '<option value="' + d + '"' + (q.diff === d ? " selected" : "") + ">" + DIFF_LABEL[d] + "</option>").join("") + "</select></td>" +
        "<td>" + sw2("pin", q.id, q.pinned, "Pin question " + q.n) + "</td><td>" + sw2("show", q.id, !q.hidden, "Show question " + q.n) + "</td>" +
        '<td><button class="ibtn" data-edit="' + q.id + '" aria-label="Edit question ' + q.n + '">' + icon("edit", 16) + "</button></td></tr>";
    }).join("") || '<tr><td colspan="7" class="as" style="padding:24px">No questions match.</td></tr>';
    $("[data-qcount]", main).textContent = list.length + " of " + S.bank.length + " questions shown · " + S.bank.filter((q) => q.pinned).length + " pinned · " + S.bank.filter((q) => q.hidden).length + " hidden";
  }

  afterRender.questions = () => {
    renderRows();
    main.addEventListener("input", onQInput);
    main.addEventListener("change", onQChange);
    main.addEventListener("click", onQClick);
  };
  function onQInput(e) {
    if (tab !== "questions") return;
    const f = e.target.dataset.qf;
    if (f === "text") { qFilter.text = e.target.value; renderRows(); }
  }
  async function onQChange(e) {
    if (tab !== "questions") return;
    const el = e.target;
    if (el.dataset.qf && el.dataset.qf !== "text") { qFilter[el.dataset.qf] = el.type === "checkbox" ? el.checked : el.value; renderRows(); return; }
    if (el.dataset.diff) {
      const q = QN.App.byId[el.dataset.diff];
      pushUndo("difficulty change");
      q.diff = el.value;
      commitBank();
      toast("Question " + q.n + " is now " + DIFF_LABEL[q.diff]);
      return;
    }
    if (el.dataset.import !== undefined && el.files && el.files[0]) {
      const file = el.files[0];
      el.value = "";
      importCSV(file);
    }
  }
  async function onQClick(e) {
    if (tab !== "questions") return;
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.packOn) { const p = QN.App.packById[t.dataset.packOn]; pushUndo("pack switch"); p.on = !p.on; commitBank(); show("questions"); return; }
    if (t.dataset.packHints) { const p = QN.App.packById[t.dataset.packHints]; pushUndo("pack hints"); p.hints = p.hints === false; commitBank(); t.setAttribute("aria-checked", p.hints !== false); return; }
    if (t.dataset.pin) { const q = QN.App.byId[t.dataset.pin]; pushUndo("pin"); q.pinned = !q.pinned; commitBank(); t.setAttribute("aria-checked", q.pinned); renderRows(); return; }
    if (t.dataset.show) { const q = QN.App.byId[t.dataset.show]; pushUndo(q.hidden ? "show" : "hide"); q.hidden = !q.hidden; commitBank(); renderRows(); refreshControls(); return; }
    if (t.dataset.edit) { editQuestion(QN.App.byId[t.dataset.edit]); return; }
    if (t.dataset.packAct) { packAction(t.dataset.packAct, t.dataset.id); return; }
    switch (t.dataset.act) {
      case "add-q": editQuestion(null); break;
      case "export-all": download("quiztopher-questions-" + stamp() + ".csv", E.bankToCSV(S.bank, S.packs)); toast("Exported " + S.bank.length + " questions"); break;
      case "undo": {
        const u = undo.pop();
        if (!u) return;
        S.bank.splice(0, S.bank.length, ...JSON.parse(u.bank));
        S.packs.splice(0, S.packs.length, ...JSON.parse(u.packs));
        Object.keys(S.images).forEach((k) => delete S.images[k]);
        Object.assign(S.images, JSON.parse(u.images));
        commitBank();
        show("questions");
        toast("Undone: " + u.label);
        break;
      }
      case "new-pack": {
        const r = await modal('<h2>New pack</h2><label class="afield"><span>Pack name</span><input class="ainput" data-name maxlength="40" placeholder="For example: Workshop"></label><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn primary" data-m="ok">Create pack</button></div>');
        if (!r) return;
        const name = $("[data-name]", r.el).value.trim();
        if (!name) return;
        pushUndo("new pack");
        S.packs.push({ id: "p" + Date.now().toString(36), name, short: name, on: true, hints: true, order: S.packs.length, custom: true });
        commitBank();
        show("questions");
        break;
      }
    }
  }

  async function packAction(act, id) {
    const p = QN.App.packById[id];
    const i = S.packs.indexOf(p);
    if (act === "rename") {
      const r = await modal('<h2>Rename pack</h2><label class="afield"><span>Name shown on questions</span><input class="ainput" data-name maxlength="40" value="' + esc(p.name) + '"></label>' +
        '<label class="afield"><span>Short name (admin chips)</span><input class="ainput" data-short maxlength="20" value="' + esc(p.short || "") + '"></label><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn primary" data-m="ok">Save</button></div>');
      if (!r) return;
      const name = $("[data-name]", r.el).value.trim();
      if (!name) return;
      pushUndo("rename");
      p.name = name;
      p.short = $("[data-short]", r.el).value.trim() || name;
    } else if (act === "dup") {
      pushUndo("duplicate pack");
      const nid = "p" + Date.now().toString(36);
      S.packs.splice(i + 1, 0, Object.assign({}, p, { id: nid, name: p.name + " (copy)", short: (p.short || p.name) + " copy", on: false, custom: true }));
      let n = maxN();
      S.bank.filter((q) => q.pack === id).forEach((q) => {
        n++;
        S.bank.push(Object.assign({}, q, { id: "c" + n + Date.now().toString(36).slice(-3), n, pack: nid, opts: q.opts.slice(), pinned: false }));
      });
      toast("Copied, and switched off so it doesn’t double up");
    } else if (act === "export") {
      download(slug(p.name) + "-" + stamp() + ".csv", E.bankToCSV(S.bank.filter((q) => q.pack === id), S.packs));
      return;
    } else if (act === "up" || act === "down") {
      const j = act === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= S.packs.length) return;
      pushUndo("reorder");
      [S.packs[i], S.packs[j]] = [S.packs[j], S.packs[i]];
    } else if (act === "del") {
      const count = S.bank.filter((q) => q.pack === id).length;
      if (!(await confirmBox("Delete “" + p.name + "”?", "Its " + count + " questions go too. You can undo this.", "Delete pack", true))) return;
      pushUndo("delete pack");
      S.packs.splice(i, 1);
      for (let k = S.bank.length - 1; k >= 0; k--) if (S.bank[k].pack === id) S.bank.splice(k, 1);
    }
    S.packs.forEach((x, k) => { x.order = k; });
    commitBank();
    show("questions");
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack";
  const maxN = () => S.bank.reduce((a, q) => Math.max(a, q.n || 0), 0);

  async function importCSV(file) {
    const text = await file.text();
    const res = E.csvToQuestions(text);
    if (!res.questions.length) {
      await modal("<h2>Nothing to import</h2><p>" + esc(res.errors.slice(0, 6).join(" · ") || "No questions were found.") + '</p><div class="adm-actions"><button class="abtn primary" data-m="ok">OK</button></div>');
      return;
    }
    const matching = res.questions.filter((q) => q.id && QN.App.byId[q.id]).length;
    const r = await modal("<h2>Import " + res.questions.length + " questions</h2>" +
      (res.errors.length ? '<p class="bad">' + res.errors.length + " rows were skipped: " + esc(res.errors.slice(0, 3).join(" · ")) + (res.errors.length > 3 ? " …" : "") + "</p>" : "") +
      '<label class="radio"><input type="radio" name="mode" value="new" checked> Add them as a new pack</label>' +
      '<label class="afield" style="margin-left:28px"><span>Pack name</span><input class="ainput" data-name value="' + esc(file.name.replace(/\.csv$/i, "")) + '"></label>' +
      '<label class="radio"><input type="radio" name="mode" value="merge"' + (matching ? "" : " disabled") + "> Update the " + matching + " questions whose id matches, and add the rest to their named pack</label>" +
      '<div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn primary" data-m="ok">Import</button></div>');
    if (!r) return;
    const mode = $('input[name="mode"]:checked', r.el).value;
    pushUndo("import");
    let n = maxN();
    let added = 0, updated = 0;
    const packByName = {};
    S.packs.forEach((p) => { packByName[p.name.toLowerCase()] = p.id; });
    let newPack = null;
    const ensurePack = (name) => {
      const key = (name || "Imported").toLowerCase();
      if (packByName[key]) return packByName[key];
      const id = "p" + Date.now().toString(36) + Math.floor(Math.random() * 100);
      S.packs.push({ id, name: name || "Imported", short: name || "Imported", on: true, hints: true, order: S.packs.length, custom: true });
      packByName[key] = id;
      return id;
    };
    if (mode === "new") newPack = ensurePack($("[data-name]", r.el).value.trim() || "Imported");
    for (const q of res.questions) {
      const rec = { fmt: q.fmt, diff: q.diff, q: q.q, opts: q.opts, ans: q.ans, hint: q.hint, tip: q.tip, pic: q.pic, hidden: q.hidden, pinned: q.pinned, timer: q.timer };
      if (mode === "merge" && q.id && QN.App.byId[q.id]) {
        Object.assign(QN.App.byId[q.id], rec);
        updated++;
      } else {
        n++;
        S.bank.push(Object.assign(rec, { id: "c" + n + Date.now().toString(36).slice(-4), n, pack: newPack || ensurePack(q.packName) }));
        added++;
      }
    }
    commitBank();
    show("questions");
    toast((added ? added + " added" : "") + (added && updated ? ", " : "") + (updated ? updated + " updated" : ""));
  }

  // The question editor, with a live preview of the play screen.
  function editQuestion(orig) {
    const isNew = !orig;
    const draft = orig ? JSON.parse(JSON.stringify(orig)) : { id: null, n: maxN() + 1, pack: (S.packs.find((p) => p.custom) || S.packs[0]).id, fmt: "mcq", diff: "medium", q: "", opts: ["", "", "", ""], ans: 0, hint: "", tip: "", pic: null, hidden: false, pinned: false, timer: null };
    while (draft.opts.length < 4 && draft.fmt !== "tf" && draft.fmt !== "ss") draft.opts.push("");
    let pendingImage;
    const wrap = document.createElement("div");
    wrap.className = "adm-modal-wrap";
    wrap.innerHTML = '<div class="adm-editor" role="dialog" aria-modal="true" aria-label="Edit question"><div class="ed-form"></div><div class="ed-side"><span class="as">Live preview, as players will see it</span><div class="adm-preview"><div class="adm-preview-stage"></div></div><p class="as" data-ed-errs></p></div></div>';
    root.appendChild(wrap);
    const form = $(".ed-form", wrap);
    const draw = () => {
      const fixed = draft.fmt === "tf" || draft.fmt === "ss";
      const opts = fixed ? (draft.fmt === "tf" ? ["True", "False"] : ["Scam", "Safe"]) : draft.opts;
      const picSrc = pendingImage !== undefined ? pendingImage : draft.pic ? S.images[draft.pic] || (window.QN_PICTURES[draft.pic] ? "drawing" : null) : null;
      form.innerHTML = "<h2>" + (isNew ? "Add a question" : "Question " + draft.n) + "</h2>" +
        '<div class="ed-grid"><label class="afield"><span>Pack</span><select class="asel" data-f="pack">' + S.packs.map((p) => '<option value="' + p.id + '"' + (p.id === draft.pack ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select></label>" +
        '<label class="afield"><span>Format</span><select class="asel" data-f="fmt">' + Object.keys(FMT_LABEL).map((f) => '<option value="' + f + '"' + (f === draft.fmt ? " selected" : "") + ">" + FMT_LABEL[f] + "</option>").join("") + "</select></label>" +
        '<label class="afield"><span>Difficulty</span><select class="asel" data-f="diff">' + E.TIERS.map((d) => '<option value="' + d + '"' + (d === draft.diff ? " selected" : "") + ">" + DIFF_LABEL[d] + "</option>").join("") + "</select></label></div>" +
        '<label class="afield"><span>' + (draft.fmt === "pic" ? "What the picture shows (read aloud by screen readers)" : "Question") + '</span><textarea class="ainput" rows="3" data-f="q">' + esc(draft.q) + "</textarea>" +
        '<em class="as">Wrap web addresses in `backticks` for the code font. Type ______ for a blank.</em></label>' +
        '<fieldset class="afield"><legend>Options · pick the right one</legend>' + opts.map((o, i) =>
          '<div class="optrow"><input type="radio" name="ans" value="' + i + '"' + (draft.ans === i ? " checked" : "") + ' aria-label="Option ' + (i + 1) + ' is right">' +
          (fixed ? '<span class="fixed">' + esc(o) + "</span>" : '<input class="ainput" data-opt="' + i + '" value="' + esc(o) + '" placeholder="Option ' + (i + 1) + (i >= 2 ? " (optional)" : "") + '">') + "</div>").join("") + "</fieldset>" +
        '<label class="afield"><span>Hint</span><textarea class="ainput" rows="2" data-f="hint">' + esc(draft.hint) + "</textarea></label>" +
        '<label class="afield"><span>Tip after the answer (“Tell them”)</span><textarea class="ainput" rows="2" data-f="tip">' + esc(draft.tip) + "</textarea></label>" +
        '<div class="ed-grid"><label class="afield"><span>Own timer (seconds)</span><input class="ainput" type="number" min="5" max="120" data-f="timer" value="' + (draft.timer || "") + '" placeholder="Default"></label>' +
        '<label class="check"><input type="checkbox" data-f="pinned"' + (draft.pinned ? " checked" : "") + "> Pin, so it comes up every game</label>" +
        '<label class="check"><input type="checkbox" data-f="hidden"' + (draft.hidden ? " checked" : "") + "> Hide</label></div>" +
        '<div class="afield"><span>Picture</span><div class="row" style="gap:10px;flex-wrap:wrap">' +
        '<label class="abtn sm">' + icon("upload", 15) + (picSrc ? "Swap for an image" : "Add an image") + '<input type="file" accept="image/*" data-img hidden></label>' +
        (draft.pic && window.QN_PICTURES[draft.pic] && (S.images[draft.pic] || pendingImage) ? '<button class="abtn sm" data-ed="drawing">Use the original drawing</button>' : "") +
        (picSrc && !(draft.fmt === "pic") ? '<button class="abtn sm" data-ed="nopic">Remove picture</button>' : "") +
        '<span class="as">' + (picSrc === "drawing" ? "Using drawing " + esc(draft.pic) : picSrc ? "Using your image" : "No picture") + "</span></div></div>" +
        '<div class="adm-actions spread">' + (!isNew && String(orig.id).startsWith("c") ? '<button class="abtn danger" data-ed="delete">' + icon("trash", 15) + "Delete</button>" : "<span></span>") +
        '<span class="row" style="gap:10px"><button class="abtn" data-ed="cancel">Cancel</button><button class="abtn primary" data-ed="save">' + (isNew ? "Add question" : "Save") + "</button></span></div>";
      preview();
    };
    const current = () => {
      const q = Object.assign({}, draft);
      if (q.fmt === "tf") q.opts = ["True", "False"];
      else if (q.fmt === "ss") q.opts = ["Scam", "Safe"];
      else {
        // Drop empty options, keeping the right answer pointing at the same text.
        const keep = draft.opts.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
        q.ans = keep.findIndex((x) => x.i === draft.ans);
        q.opts = keep.map((x) => x.o);
      }
      return q;
    };
    const preview = () => {
      const q = current();
      const errs = E.validateQuestion(q);
      if (q.fmt === "pic" && !(q.pic && (S.images[q.pic] || window.QN_PICTURES[q.pic])) && !pendingImage) errs.push("Add an image for a picture question");
      $("[data-ed-errs]", wrap).innerHTML = errs.length ? '<b class="bad">' + esc(errs.join(" · ")) + "</b>" : "";
      const pq = Object.assign({}, q);
      if (!pq.q) pq.q = "Your question appears here";
      if (pq.opts.length < 2) pq.opts = pq.opts.concat(["Option", "Option"]).slice(0, 2);
      if (pq.ans < 0) pq.ans = 0;
      if (pendingImage) { pq.pic = "__preview"; S.images.__preview = pendingImage; }
      const n = S.settings.numbers.questions;
      const slots = Array.from({ length: n }, (_, i) => ({ qid: "x", stage: i < 3 ? "warm" : i < n - 3 ? "tricky" : i < n - 2 ? "final" : "boss", pic: false }));
      const idx = pq.diff === "challenge" ? n - 1 : pq.diff === "hard" ? n - 3 : pq.diff === "easy" ? 1 : 4;
      const ctx = { idx, slots, results: Array.from({ length: idx }, (_, i) => ({ correct: i !== 1 })), right: idx - 1, streak: 0, name: "Riya", stage: slots[idx].stage,
        fiftyLeft: 1, hintLeft: 1, goodieWon: false, timerOn: S.settings.modules.timer, timerSec: pq.timer || S.settings.numbers.timerSec };
      const order = pq.opts.map((_, i) => i);
      const st = $(".adm-preview-stage", wrap);
      st.innerHTML = '<div class="screen play">' + QN.playMarkup(pq, order, ctx) + "</div>";
      delete S.images.__preview;
      $$(".opts", st).forEach((o) => o.classList.remove("deal", "thump"));
      QN.fitPlay($(".screen", st));
      const box = $(".adm-preview", wrap);
      st.style.transform = "scale(" + box.clientWidth / 1440 + ")";
    };
    const close = () => wrap.remove();
    form.addEventListener("input", (e) => {
      const el = e.target;
      if (el.dataset.f && el.tagName !== "SELECT" && el.type !== "checkbox") draft[el.dataset.f] = el.dataset.f === "timer" ? parseInt(el.value, 10) || null : el.value;
      if (el.dataset.opt != null) draft.opts[+el.dataset.opt] = el.value;
      preview();
    });
    form.addEventListener("change", async (e) => {
      const el = e.target;
      if (el.name === "ans") { draft.ans = +el.value; preview(); return; }
      if (el.type === "checkbox" && el.dataset.f) { draft[el.dataset.f] = el.checked; return; }
      if (el.tagName === "SELECT" && el.dataset.f) {
        draft[el.dataset.f] = el.value;
        if (el.dataset.f === "fmt") {
          if (el.value === "tf" || el.value === "ss") draft.ans = Math.min(draft.ans, 1);
          else while (draft.opts.length < 4) draft.opts.push("");
          if (el.value === "pic" && !draft.pic) draft.pic = "img-" + (draft.id || "new" + Date.now().toString(36));
          draw();
        } else preview();
        return;
      }
      if (el.dataset.img !== undefined && el.files && el.files[0]) {
        try { pendingImage = await shrinkImage(el.files[0], 1200, 600); }
        catch (x) { toast("That image couldn’t be read", "bad"); }
        if (!draft.pic) draft.pic = "img-" + (draft.id || "new" + Date.now().toString(36));
        draw();
      }
    });
    form.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-ed]");
      if (!b) return;
      const act = b.dataset.ed;
      if (act === "cancel") return close();
      if (act === "drawing") { pendingImage = null; draft._dropImage = true; draw(); return; }
      if (act === "nopic") { pendingImage = null; draft._dropImage = true; draft.pic = null; draw(); return; }
      if (act === "delete") {
        if (!(await confirmBox("Delete question " + draft.n + "?", "You can undo this from the Questions page.", "Delete", true))) return;
        pushUndo("delete question");
        const i = S.bank.indexOf(orig);
        if (i >= 0) S.bank.splice(i, 1);
        commitBank(); close(); show("questions");
        return;
      }
      if (act === "save") {
        const q = current();
        const errs = E.validateQuestion(q);
        if (errs.length) { toast(errs[0], "bad"); return; }
        pushUndo(isNew ? "add question" : "edit");
        const oldPic = orig && orig.pic;
        if (draft._dropImage && oldPic) delete S.images[oldPic];
        if (pendingImage && q.pic) S.images[q.pic] = pendingImage;
        if (!q.pic && oldPic && oldPic.startsWith("img-")) delete S.images[oldPic];
        delete q._dropImage;
        if (isNew) {
          q.id = "c" + q.n + Date.now().toString(36).slice(-4);
          if (q.pic && q.pic.startsWith("img-new")) { const pid = "img-" + q.id; if (S.images[q.pic]) { S.images[pid] = S.images[q.pic]; delete S.images[q.pic]; } q.pic = pid; }
          S.bank.push(q);
        } else Object.keys(q).forEach((k) => { orig[k] = q[k]; });
        commitBank();
        close();
        show("questions");
        toast(isNew ? "Question added" : "Saved");
      }
    });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    window.addEventListener("resize", preview, { once: true });
    draw();
    setTimeout(() => { const ta = $('[data-f="q"]', form); if (ta) ta.focus(); }, 40);
  }

  function shrinkImage(file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const s = Math.min(1, maxW / img.width, maxH / img.height);
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------- Goodies ----------

  function renderGoodies() {
    const today = E.dayKey(Date.now());
    const wins = S.log.filter((g) => g.outcome === "win");
    const todayWins = wins.filter((g) => E.dayKey(g.t) === today);
    const handedToday = todayWins.filter((g) => g.handed).length;
    const unclaimed = todayWins.filter((g) => !g.handed).length;
    const g = S.goodies;
    const right = '<button class="abtn" data-act="export-goodies">' + icon("download", 16) + 'Export goodie log</button><button class="abtn danger" data-act="end-event">' + icon("power", 16) + "End event</button>";
    const tiles = '<div class="tiles">' + tile("Goodies left", S.settings.modules.stock ? g.left : "Not tracked", S.settings.modules.stock ? "of " + g.stock + " at the start" : "Turn on Track stock in Modules", g.left <= S.settings.numbers.lowStockAt && S.settings.modules.stock ? "low" : "") +
      tile("Won today", todayWins.length, wins.length + " all time") + tile("Handed over today", handedToday, "") + tile("Not collected yet", unclaimed, "Today") + "</div>";
    const rows = wins.slice().reverse().slice(0, 200).map((w) =>
      "<tr><td>" + fmtDay(E.dayKey(w.t)) + ", " + fmtTime(w.t) + '</td><td class="mono"><b>' + esc(w.code || "No code") + "</b></td><td>" + w.right + " of " + w.n + "</td><td>" + stickerCell(w.sticker) + "</td><td>" +
      (w.handed ? '<span class="good">' + icon("check", 14, { sw: 3 }) + " " + fmtTime(w.handed) + "</span>" : '<button class="abtn sm" data-hand="' + esc(w.id) + '">Hand over</button>') + "</td></tr>").join("");
    return head("Goodies", "Set the stock at the start of the day, check codes, and export the log for the report.", right) +
      tiles +
      '<div class="cards2"><section class="acard"><h2>Stock</h2>' +
      '<div class="arow"><span class="al"><span>Goodies at the start of the day</span></span><span class="ac"><input class="ainput num" type="number" min="0" max="9999" data-stock value="' + g.stock + '"><button class="abtn sm primary" data-act="set-stock">Set</button></span></div>' +
      '<div class="arow"><span class="al"><span>Adjust what’s left</span><span class="as">For a goodie given out by hand</span></span><span class="ac"><button class="abtn sm" data-act="left-minus">' + icon("minus", 14) + '</button><b class="mono" style="min-width:3ch;text-align:center">' + g.left + '</b><button class="abtn sm" data-act="left-plus">' + icon("plus", 14) + "</button></span></div>" +
      row("Low-stock warning", stepper("numbers.lowStockAt", 0, 100, "low-stock level", " left")) + "</section>" +
      '<section class="acard"><h2>Check a code</h2><div class="row" style="gap:10px"><input class="ainput mono" data-code placeholder="KV-48Q2" maxlength="7" style="text-transform:uppercase"><button class="abtn primary" data-act="check-code">Check</button></div><div data-code-result class="code-result"></div></section></div>' +
      '<h2 class="sect">Winners</h2><div class="qtable-wrap"><table class="qtable"><thead><tr><th>When</th><th>Code</th><th>Right</th><th>Sticker</th><th>Handed over</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="as" style="padding:24px">No goodies won yet.</td></tr>') + "</tbody></table></div>" + foot();
  }
  function stickerLine() {
    const cat = window.QN_STICKERS || [], st = S.stickers;
    const left = cat.reduce((a, d) => a + st.items[d.id].left, 0), all = cat.reduce((a, d) => a + d.spots.length * st.sets, 0);
    const picks = E.stickerPicks(S.log, st).length;
    return left + " of " + all + " left · " + picks + (picks === 1 ? " pick" : " picks") + (st.since ? " since the last reset" : " so far");
  }
  function stickerById(id) { return (window.QN_STICKERS || []).find((d) => d.id === id) || null; }
  function stickerCell(id) {
    const d = id && stickerById(id);
    if (!d) return '<span class="as">' + (id ? esc(id) : "Volunteer’s choice") + "</span>";
    return '<span class="stk-cell">' + QN.stickerImg(d) + "<span>" + esc(d.name) + '<span class="as">' + esc(QN.stickerWhere(d)) + "</span></span></span>";
  }
  function tile(label, value, sub, cls) { return '<div class="tile ' + (cls || "") + '"><span class="as">' + esc(label) + '</span><b>' + esc(value) + "</b>" + (sub ? '<span class="as">' + esc(sub) + "</span>" : "") + "</div>"; }

  function handOver(rec) {
    rec.handed = Date.now();
    if (S.settings.modules.stock) S.goodies.left = Math.max(0, S.goodies.left - 1);
    QN.saveLog(); QN.save("goodies"); QN.Backup.write();
  }
  afterRender.goodies = () => {
    main.addEventListener("click", onGoodiesClick);
    const ci = $("[data-code]", main);
    ci.addEventListener("keydown", (e) => { if (e.key === "Enter") $('[data-act="check-code"]', main).click(); });
  };
  async function onGoodiesClick(e) {
    if (tab !== "goodies") return;
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.hand) { const rec = S.log.find((x) => x.id === b.dataset.hand); if (rec && !rec.handed) { handOver(rec); show("goodies"); toast("Marked as handed over"); } return; }
    const g = S.goodies;
    switch (b.dataset.act) {
      case "set-stock": {
        const v = Math.max(0, parseInt($("[data-stock]", main).value, 10) || 0);
        g.stock = v; g.left = v; g.setAt = Date.now();
        QN.save("goodies"); show("goodies"); toast("Stock set to " + v);
        break;
      }
      case "left-minus": g.left = Math.max(0, g.left - 1); QN.save("goodies"); show("goodies"); break;
      case "left-plus": g.left = g.left + 1; QN.save("goodies"); show("goodies"); break;
      case "check-code": {
        const code = $("[data-code]", main).value.trim().toUpperCase().replace(/^KV-?/, "KV-");
        const box = $("[data-code-result]", main);
        const rec = S.log.find((x) => x.code === code);
        if (!rec) { box.innerHTML = '<p class="bad">' + icon("x", 16, { sw: 3 }) + " No goodie was won with " + esc(code || "that code") + ".</p>"; return; }
        if (rec.handed) { box.innerHTML = '<p class="warn">' + icon("warning", 16) + " " + esc(code) + " was already handed over at " + fmtTime(rec.handed) + " on " + fmtDay(E.dayKey(rec.handed)) + ".</p>"; return; }
        const sd = rec.sticker && stickerById(rec.sticker);
        box.innerHTML = '<p class="good">' + icon("check", 16, { sw: 3 }) + " " + esc(code) + " is good: won at " + fmtTime(rec.t) + ", " + rec.right + " of " + rec.n + " right" +
          (sd ? ". Sticker: " + esc(sd.name) + " (" + esc(QN.stickerWhere(sd)) + ")" : "") + '.</p><button class="abtn primary" data-hand="' + esc(rec.id) + '">Mark as handed over</button>';
        break;
      }
      case "export-goodies": {
        const rows = [["date", "time", "code", "right", "questions", "sticker", "handed_over"]];
        S.log.filter((x) => x.outcome === "win").forEach((w) => rows.push([E.dayKey(w.t), fmtTime(w.t), w.code || "", w.right, w.n, stickerName(w.sticker),
          w.handed ? new Date(w.handed).toLocaleString() : ""]));
        download("quiztopher-goodies-" + stamp() + ".csv", E.toCSV(rows));
        break;
      }
      case "end-event": {
        const r = await modal('<h2>End the event?</h2><p>This downloads the final spreadsheet of every game, then clears the game log and goodie records from this laptop. Settings, questions and decks stay.</p>' +
          '<label class="afield"><span>Type END to confirm</span><input class="ainput" data-confirm autocomplete="off"></label><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn danger" data-m="ok">Export and clear</button></div>');
        if (!r || $("[data-confirm]", r.el).value.trim().toUpperCase() !== "END") return;
        download("quiztopher-final-" + stamp() + ".csv", gamesCSV());
        S.log.splice(0, S.log.length);
        QN.saveLog();
        QN.Backup.write();
        show("goodies");
        toast("Event ended. The spreadsheet is in your downloads.");
        break;
      }
    }
  }

  function stickerName(id) { const d = id && stickerById(id); return d ? d.name + " (" + id + ")" : id || ""; }
  function gamesCSV() {
    const rows = [["date", "start", "end", "seconds", "outcome", "right", "questions_played", "questions_per_game", "out_on_question", "goodie_on_question", "goodie_code", "sticker", "handed_over", "used_50_50", "used_hint", "feedback", "questions", "results"]];
    for (const g of S.log) {
      rows.push([E.dayKey(g.t), fmtTime(g.t), fmtTime(g.end), Math.round((g.end - g.t) / 1000), g.outcome, g.right, g.qs.length, g.n, g.outAt || "", g.goodieAt || "", g.code || "", stickerName(g.sticker),
        g.handed ? new Date(g.handed).toLocaleString() : "", g.fifty ? "yes" : "", g.hint ? "yes" : "", g.fb || "",
        g.qs.map((id) => (QN.App.byId[id] ? QN.App.byId[id].n : id)).join(" "), g.res.map((r) => (r === 1 ? "R" : r === -1 ? "T" : "W")).join("")]);
    }
    return E.toCSV(rows);
  }

  // ---------- Stickers ----------

  function renderStickers() {
    const cat = window.QN_STICKERS || [], st = S.stickers, n = S.settings.numbers;
    const offered = QN.stickerChoices();
    const left = offered.reduce((a, d) => a + st.items[d.id].left, 0);
    const today = E.dayKey(Date.now());
    const picks = E.stickerPicks(S.log, st);
    const gone = cat.filter((d) => st.items[d.id].left <= 0).length;
    const right = '<button class="abtn" data-act="show-all">' + icon("eye", 16) + 'Show all</button><button class="abtn" data-act="hide-all">' + icon("eyeOff", 16) + "Hide all</button>" +
      '<button class="abtn" data-act="reset-stickers">' + icon("undo", 16) + "Reset stickers</button>";
    const sub = "Players who get " + n.stickerAt + " or more right choose their own sticker after the game, from the ones shown here." +
      (n.stickerAt > n.goodieAt ? " With " + n.goodieAt + (n.stickerAt - 1 > n.goodieAt ? " to " + (n.stickerAt - 1) : "") + " right, a volunteer picks one for them." : "");
    const tiles = '<div class="tiles">' + tile("Shown to players", offered.length, "of " + cat.length + " designs") + tile("Stickers left", left, "in the designs shown") +
      tile("Picked today", picks.filter((g) => E.dayKey(g.t) === today).length, picks.length + (st.since ? " since the reset" : " all time")) + tile("All taken", gone, gone === 1 ? "design at 0" : "designs at 0", gone ? "low" : "") + "</div>";
    const settings = '<div class="cards2"><section class="acard"><h2>Sticker pick</h2>' +
      row("Sticker pick at right answers", '<span data-dep="modules.stickerPick">' + stepper("numbers.stickerAt", 1, 15, "right answers for the sticker pick") + "</span>" + sw("modules.stickerPick", "Sticker pick"),
        "Turn it off and every winner gets a goodie a volunteer picks") +
      row("Remove a sticker once it’s picked", '<button class="sw" role="switch" aria-checked="' + st.auto + '" data-st-auto aria-label="Remove a sticker once it’s picked"><span></span></button>',
        st.auto ? "Each pick takes one off its count. At 0 it leaves the list." : "Counts stay as they are. Take stickers off below yourself.") + "</section>" +
      '<section class="acard"><h2>Counts</h2>' +
      row("Copies printed of each sheet", '<input class="ainput num" type="number" min="1" max="99" data-sets value="' + st.sets + '"><button class="abtn sm" data-act="reset-stickers">Reset stickers</button>',
        "Resetting fills every count from this") +
      '<p class="as" style="margin-top:10px">Pink hearts, Graduation loading, Pink bow and In my tech girl era are on the sheets twice, so they start at 2 for each copy.</p></section></div>';
    const sheets = (window.QN_STICKER_SHEETS || []).map((sh) => {
      const ds = cat.filter((d) => d.sheet === sh.id);
      const on = ds.filter((d) => st.items[d.id].show).length;
      return '<section class="acard"><div class="row stk-head"><h2>' + esc(sh.name) + " · " + esc(sh.file) + '</h2><span class="row" style="gap:8px"><span class="as">' + on + " of " + ds.length + " shown</span>" +
        '<button class="abtn sm" data-sheet="' + sh.id + '" data-on="1">Show sheet</button><button class="abtn sm" data-sheet="' + sh.id + '" data-on="0">Hide sheet</button></span></div>' +
        '<div class="stk-grid">' + ds.map(stickerCard).join("") + "</div></section>";
    }).join("");
    const recent = picks.slice().reverse().slice(0, 12).map((g) => "<tr><td>" + fmtDay(E.dayKey(g.t)) + ", " + fmtTime(g.t) + '</td><td class="mono"><b>' + esc(g.code || "No code") + "</b></td><td>" + stickerCell(g.sticker) + "</td><td>" +
      (g.handed ? '<span class="good">' + icon("check", 14, { sw: 3 }) + " " + fmtTime(g.handed) + "</span>" : '<span class="as">Not yet</span>') + "</td></tr>").join("");
    return head("Stickers", esc(sub), right) + tiles + settings + sheets +
      '<h2 class="sect">Recent picks' + (st.since ? '<span class="as" style="text-transform:none;letter-spacing:0;font-family:var(--f-body);font-weight:500"> · since the reset on ' +
        fmtDay(E.dayKey(st.since)) + ", " + fmtTime(st.since) + "</span>" : "") + '</h2><div class="qtable-wrap"><table class="qtable"><thead><tr><th>When</th><th>Code</th><th>Sticker</th><th>Handed over</th></tr></thead><tbody>' +
      (recent || '<tr><td colspan="4" class="as" style="padding:24px">' + (st.since ? "No stickers picked since the reset." : "No stickers picked yet.") + "</td></tr>") + "</tbody></table></div>" + foot();
  }
  function stickerCard(d) {
    const it = S.stickers.items[d.id];
    const badge = it.left <= 0 ? "All taken" : !it.show ? "Hidden" : "";
    return '<div class="stk' + (it.show && it.left > 0 ? "" : " off") + '" data-stk="' + esc(d.id) + '"><div class="stk-img">' + QN.stickerImg(d) + (badge ? '<span class="stk-badge">' + badge + "</span>" : "") + "</div>" +
      "<b>" + esc(d.name) + '</b><span class="as">' + esc(QN.stickerWhere(d)) + "</span>" +
      '<div class="stk-ctl"><button class="pchip" aria-pressed="' + it.show + '" data-stk-show aria-label="Show ' + esc(d.name) + ' to players">' + icon(it.show ? "eye" : "eyeOff", 14) + (it.show ? "Shown" : "Hidden") + "</button>" +
      '<span class="step"><button data-stk-d="-1" aria-label="One fewer ' + esc(d.name) + '">' + icon("minus", 14, { sw: 2.4 }) + '</button><span class="v">' + it.left + ' left</span><button data-stk-d="1" aria-label="One more ' + esc(d.name) + '">' +
      icon("plus", 14, { sw: 2.4 }) + "</button></span></div></div>";
  }
  // Re-renders the tab where it was scrolled to, so a change halfway down the list doesn't jump to the top.
  function rerenderStickers() {
    const y = window.scrollY, my = main.scrollTop;
    show("stickers");
    window.scrollTo(0, y);
    main.scrollTop = my;
  }
  afterRender.stickers = () => {
    main.addEventListener("click", async (e) => {
      if (tab !== "stickers") return;
      const b = e.target.closest("button");
      if (!b) return;
      // The shared switch and stepper have already saved; redraw so the counts and wording follow.
      if (b.dataset.path || b.closest(".step[data-path]")) { rerenderStickers(); return; }
      const st = S.stickers, cat = window.QN_STICKERS || [];
      const card = b.closest("[data-stk]");
      const it = card && st.items[card.dataset.stk];
      if (it && b.dataset.stkShow !== undefined) it.show = !it.show;
      else if (it && b.dataset.stkD) it.left = Math.max(0, Math.min(999, it.left + +b.dataset.stkD));
      else if (b.dataset.stAuto !== undefined) st.auto = !st.auto;
      else if (b.dataset.sheet) cat.filter((d) => d.sheet === b.dataset.sheet).forEach((d) => { st.items[d.id].show = b.dataset.on === "1"; });
      else if (b.dataset.act === "show-all" || b.dataset.act === "hide-all") cat.forEach((d) => { st.items[d.id].show = b.dataset.act === "show-all"; });
      else if (b.dataset.act === "reset-stickers") {
        if (!(await resetStickers(parseInt($("[data-sets]", main).value, 10)))) return;
      } else return;
      QN.save("stickers");
      rerenderStickers();
    });
    const sets = $("[data-sets]", main);
    sets.addEventListener("keydown", (e) => { if (e.key === "Enter") $('.acard [data-act="reset-stickers"]', main).click(); });
  };

  // Puts every picked sticker back and starts Recent picks again (after testing, or for a new print run).
  // The game log keeps who picked what. Used from the Stickers tab and from Event and kiosk.
  async function resetStickers(sets) {
    const st = S.stickers, cat = window.QN_STICKERS || [];
    const r = await modal("<h2>Reset the stickers?</h2><p>Every sticker goes back to a full count, as if none had been picked, and Recent picks starts again. " +
      "The Goodies log and the spreadsheets still show who picked what.</p>" +
      '<label class="afield"><span>Copies printed of each sheet</span><input class="ainput num" style="align-self:flex-start;width:110px" type="number" min="1" max="99" data-sets-m value="' + (sets > 0 ? sets : st.sets) + '"></label>' +
      '<label class="check"><input type="checkbox" data-show-every> Show every sticker again, including ones you hid</label>' +
      '<div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn primary" data-m="ok">Reset stickers</button></div>');
    if (!r) return false;
    const n = Math.max(1, Math.min(99, parseInt($("[data-sets-m]", r.el).value, 10) || 1));
    E.resetStickers(st, cat, n, $("[data-show-every]", r.el).checked, Date.now());
    QN.save("stickers");
    QN.Backup.write();
    toast("Stickers reset: " + QN.stickerChoices().reduce((a, d) => a + st.items[d.id].left, 0) + " ready to pick");
    return true;
  }

  // ---------- Stats ----------

  function renderStats() {
    const today = E.dayKey(Date.now());
    const log = statsRange === "today" ? S.log.filter((g) => E.dayKey(g.t) === today) : S.log;
    const st = E.stats(log, S.bank);
    const right = '<div class="seg-ctl" role="radiogroup" aria-label="Range"><button role="radio" data-range="today" aria-checked="' + (statsRange === "today") + '">Today</button><button role="radio" data-range="all" aria-checked="' + (statsRange === "all") + '">All time</button></div>' +
      '<button class="abtn" data-act="export-games">' + icon("download", 16) + "Export games</button>";
    const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "–");
    const tiles = '<div class="tiles">' + tile("Players", st.players, statsRange === "today" ? "Today" : "All time") + tile("Goodies won", st.wins, pct(st.wins, st.players) + " of players") +
      tile("Got out", st.outs, pct(st.outs, st.players) + " of players") + tile("Finished, no goodie", st.done, "") + tile("Left early", st.left, "Walked away mid-game") +
      (S.settings.modules.feedback || st.fbYes + st.fbNo ? tile("Learned something", pct(st.fbYes, st.fbYes + st.fbNo), st.fbYes + st.fbNo + " answers") : "") + "</div>";
    // Where players got out: one bar per question number.
    const n = Math.max(S.settings.numbers.questions, ...Object.keys(st.outAt).map(Number).filter(Boolean), 1);
    const counts = Array.from({ length: n }, (_, i) => st.outAt[i + 1] || 0);
    const max = Math.max(1, ...counts);
    const peak = counts.indexOf(Math.max(...counts));
    const ticks = niceTicks(max);
    const outChart = '<section class="acard"><h2>Where players got out</h2><p class="as">Players knocked out on each question number. Hover a bar for the count.</p>' +
      (st.outs ? '<div class="vchart" role="img" aria-label="Bar chart of players who got out on each question"><div class="vgrid">' + ticks.map((tk) => '<span style="bottom:' + (100 * tk) / ticks[ticks.length - 1] + '%"><i>' + tk + "</i></span>").join("") + "</div>" +
        '<div class="vbars">' + counts.map((c, i) => '<div class="vcol" data-tip="Question ' + (i + 1) + ": " + c + " player" + (c === 1 ? "" : "s") + ' got out"><div class="vb" style="height:' + (100 * c) / ticks[ticks.length - 1] + '%">' +
          (i === peak && c ? '<span class="vlabel">' + c + "</span>" : "") + '</div><span class="vx">' + (i + 1) + "</span></div>").join("") + "</div></div>" : '<p class="empty">Nobody has got out yet.</p>') + "</section>";
    // Questions missed most: ranked bars.
    const hard = st.hardest;
    const hardChart = '<section class="acard"><h2>Questions people miss most</h2><p class="as">Share of players who got it wrong or ran out of time. Questions seen at least twice.</p>' +
      (hard.length ? '<div class="hbars">' + hard.map((h) => '<div class="hrow" data-tip="' + esc("Q" + (h.q ? h.q.n : "?") + ": missed by " + h.missed + " of " + h.seen) + '"><span class="hl"><b class="mono">Q' + (h.q ? h.q.n : "?") + "</b> " + esc(h.q ? K.plain(h.q.fmt === "pic" ? h.q.opts[h.q.ans] + " (picture)" : h.q.q) : "Removed question") +
        '</span><span class="ht"><span class="hb" style="width:' + Math.round(h.rate * 100) + '%"></span></span><span class="hv mono">' + Math.round(h.rate * 100) + "% · " + h.missed + "/" + h.seen + "</span></div>").join("") + "</div>" : '<p class="empty">Not enough games yet.</p>') + "</section>";
    const days = '<section class="acard"><h2>By day</h2><div class="qtable-wrap"><table class="qtable"><thead><tr><th>Day</th><th>Players</th><th>Goodies won</th><th>Handed over</th><th>Got out</th><th>No goodie</th><th>Left early</th></tr></thead><tbody>' +
      (E.stats(S.log, S.bank).days.map((d) => "<tr><td>" + fmtDay(d.day) + "</td><td>" + d.players + "</td><td>" + d.wins + "</td><td>" + d.handed + "</td><td>" + d.outs + "</td><td>" + d.done + "</td><td>" + d.left + "</td></tr>").join("") ||
        '<tr><td colspan="7" class="as" style="padding:20px">No games yet.</td></tr>') + "</tbody></table></div></section>";
    return head("Stats", "Everything stays on this laptop. Nothing here identifies a player.", right) + tiles + '<div class="cards2">' + outChart + hardChart + "</div>" + days + foot();
  }
  function niceTicks(max) {
    const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
    const out = [];
    for (let v = step; v < max + step; v += step) out.push(v);
    return out;
  }
  afterRender.stats = () => {
    main.addEventListener("click", (e) => {
      if (tab !== "stats") return;
      const r = e.target.closest("[data-range]");
      if (r) { statsRange = r.dataset.range; show("stats"); return; }
      const b = e.target.closest('[data-act="export-games"]');
      if (b) download("quiztopher-games-" + stamp() + ".csv", gamesCSV());
    });
    const tipbox = $(".adm-tipbox", root);
    main.addEventListener("pointermove", (e) => {
      const el = e.target.closest("[data-tip]");
      if (!el || tab !== "stats") { tipbox.hidden = true; return; }
      tipbox.textContent = el.dataset.tip;
      tipbox.hidden = false;
      const x = Math.min(innerWidth - tipbox.offsetWidth - 12, e.clientX + 14);
      tipbox.style.left = x + "px";
      tipbox.style.top = Math.max(8, e.clientY - tipbox.offsetHeight - 12) + "px";
    });
    main.addEventListener("pointerleave", () => { tipbox.hidden = true; });
  };

  // ---------- Look and text ----------

  const STRING_GROUPS = [
    ["attract", "Attract screen"], ["rule", "How to play"], ["start", "Before you start"], ["countdown", "Countdown"], ["stage", "Stages"], ["stageCard", "Stage cards"],
    ["q", "Question screen"], ["r", "After an answer"], ["mascot", "Kavach’s lines"], ["goodie", "Goodie unlocked"], ["pick", "Sticker pick"], ["win", "Goodie won screen"], ["end", "Endings"],
    ["out", "Out this time"], ["done", "Game over, no goodie"], ["fb", "Feedback"], ["idle", "Still there?"], ["kiosk", "Kiosk lock"], ["pin", "PIN pad"], ["a11y", "Screen reader"], ["queue", "Queue screen"],
  ];
  let textFilter = "";
  function renderLook() {
    const L = S.settings.look;
    const themes = '<div class="themes">' + [["midnight", "Midnight glass", "Dark navy with a soft glow. Best indoors."], ["paper", "Paper", "Light, like the printed chits. For bright daylight."]].map((x) =>
      '<button class="theme ' + x[0] + '" role="radio" data-path="look.theme" data-val="' + x[0] + '" aria-checked="' + (L.theme === x[0]) + '"><span class="sw-prev"><i></i><i></i><i></i></span><b>' + x[1] + '</b><span class="as">' + x[2] + "</span></button>").join("") + "</div>";
    const html = head("Look and text", "Theme, motion and sound, plus every word visitors see.", "") +
      '<div class="cards2"><section class="acard"><h2>Theme</h2>' + themes + "</section>" +
      '<section class="acard"><h2>Motion and sound</h2>' +
      row("Animations", radios("look.motion", [["full", "Full"], ["reduced", "Reduced"], ["none", "None"]], "Animations"), "Laptops set to reduce motion get Reduced automatically") +
      row("Sound", '<input type="range" class="arange" min="0" max="1" step="0.05" data-path="numbers.volume" aria-label="Volume">' + sw("modules.sound", "Sound")) +
      row("Try the sounds", '<button class="abtn sm" data-snd="right">Right</button><button class="abtn sm" data-snd="wrong">Wrong</button><button class="abtn sm" data-snd="fanfare">Fanfare</button>') +
      row("Timer length", select("numbers.timerSec", [[15, "15 s"], [20, "20 s"], [30, "30 s"], [45, "45 s"], [60, "60 s"]], "Timer length")) + "</section></div>" +
      '<section class="acard"><div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><h2 style="margin:0">Safety tips on the attract screen</h2><span class="row" style="gap:8px"><button class="abtn sm" data-act="add-tip">' + icon("plus", 14) + 'Add a tip</button><button class="abtn sm" data-act="reset-tips">Reset to the original 12</button></span></div>' +
      '<div class="tips-list">' + S.tips.map((x, i) => '<div class="tiprow"><span class="mono as">' + (i + 1) + '</span><textarea class="ainput" rows="2" data-tip-i="' + i + '">' + esc(x) + '</textarea><button class="ibtn danger" data-del-tip="' + i + '" aria-label="Remove tip ' + (i + 1) + '">' + icon("trash", 16) + "</button></div>").join("") + "</div></section>" +
      '<section class="acard"><div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><h2 style="margin:0">Wording</h2><label class="search" style="max-width:360px">' + icon("search", 16) +
      '<input class="ainput" data-text-filter placeholder="Find a word or phrase" value="' + esc(textFilter) + '"></label></div>' +
      '<p class="as">Leave a box empty to use the original. {placeholders} are filled in by the app, **stars** make bold text, and lines with | between them are picked at random. Changed lines are marked.</p><div data-strings></div></section>' + foot();
    return html;
  }
  function renderStrings() {
    const box = $("[data-strings]", main);
    if (!box) return;
    const f = textFilter.trim().toLowerCase();
    const keys = Object.keys(window.QN_STRINGS);
    box.innerHTML = STRING_GROUPS.map((g) => {
      const ks = keys.filter((k) => k.split(".")[0] === g[0]).filter((k) => !f || k.toLowerCase().includes(f) || window.QN_STRINGS[k].toLowerCase().includes(f) || (S.strings[k] || "").toLowerCase().includes(f));
      if (!ks.length) return "";
      return '<h3 class="sgroup">' + esc(g[1]) + "</h3>" + ks.map((k) => {
        const own = S.strings[k];
        return '<div class="srow' + (own ? " changed" : "") + '"><span class="mono as">' + esc(k) + '</span><input class="ainput" data-str="' + esc(k) + '" value="' + esc(own || "") + '" placeholder="' + esc(window.QN_STRINGS[k]) + '">' +
          (own ? '<button class="ibtn" data-reset-str="' + esc(k) + '" aria-label="Reset ' + esc(k) + '">' + icon("undo", 15) + "</button>" : "<span></span>") + "</div>";
      }).join("");
    }).join("") || '<p class="empty">Nothing matches.</p>';
  }
  afterRender.look = () => {
    renderStrings();
    let tipTimer = 0, strTimer = 0;
    main.addEventListener("input", (e) => {
      if (tab !== "look") return;
      const el = e.target;
      if (el.dataset.textFilter !== undefined) { textFilter = el.value; renderStrings(); return; }
      if (el.dataset.tipI !== undefined) {
        S.tips[+el.dataset.tipI] = el.value;
        clearTimeout(tipTimer); tipTimer = setTimeout(() => { QN.save("tips"); savedNote(); }, 300);
      }
      if (el.dataset.str) {
        const k = el.dataset.str;
        if (el.value.trim()) S.strings[k] = el.value; else delete S.strings[k];
        el.closest(".srow").classList.toggle("changed", !!S.strings[k]);
        clearTimeout(strTimer); strTimer = setTimeout(() => { QN.save("strings"); savedNote(); }, 300);
      }
    });
    main.addEventListener("click", async (e) => {
      if (tab !== "look") return;
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.snd) { K.Sound.init(); K.Sound.play(b.dataset.snd); return; }
      if (b.dataset.resetStr) { delete S.strings[b.dataset.resetStr]; QN.save("strings"); renderStrings(); return; }
      if (b.dataset.delTip !== undefined) { S.tips.splice(+b.dataset.delTip, 1); QN.save("tips"); show("look"); return; }
      if (b.dataset.act === "add-tip") { S.tips.push(""); QN.save("tips"); show("look"); const all = $$("[data-tip-i]", main); if (all.length) all[all.length - 1].focus(); return; }
      if (b.dataset.act === "reset-tips") {
        if (!(await confirmBox("Reset the tips?", "Your tips are replaced by the original 12.", "Reset tips"))) return;
        S.tips.splice(0, S.tips.length, ...window.QN_TIPS);
        QN.save("tips"); show("look");
      }
    });
  };

  // ---------- Event and kiosk ----------

  function renderEvent() {
    const ev = S.settings.event, B = QN.Backup;
    const backupState = !B.supported ? '<p class="as">Automatic backup needs Chrome or Edge. Use “Download a backup” instead.</p>'
      : B.status === "ok" ? '<p class="good">' + icon("check", 15, { sw: 3 }) + " Saving after every game" + (B.lastSaved ? ", last at " + fmtTime(B.lastSaved) : "") + ".</p>"
      : B.status === "paused" ? '<p class="warn">' + icon("warning", 15) + " The browser needs permission again after a restart.</p>"
      : '<p class="as">Pick a file once and the app saves to it after every game.</p>';
    const backupBtns = !B.supported ? "" : B.status === "ok" ? '<button class="abtn" data-act="backup-now">Save now</button><button class="abtn" data-act="backup-stop">Stop</button>'
      : B.status === "paused" ? '<button class="abtn primary" data-act="backup-reconnect">Reconnect the backup</button><button class="abtn" data-act="backup-stop">Stop</button>'
      : '<button class="abtn primary" data-act="backup-pick">' + icon("file", 16) + "Choose a backup file</button>";
    const elig = E.eligibleMap(S.bank, S.packs, S.settings);
    const decks = E.deckSummary(S.decks, elig);
    return head("Event and kiosk", "Event details, the PIN, backups, the queue screen and stall setup.", "") +
      '<div class="cards2"><section class="acard"><h2>Event</h2>' +
      '<label class="afield"><span>Quiz name</span><input class="ainput" data-ev="name" maxlength="40" value="' + esc(ev.name) + '"></label>' +
      '<label class="afield"><span>Club name</span><input class="ainput" data-ev="club" maxlength="60" value="' + esc(ev.club) + '" placeholder="Shown next to the tagline"></label>' +
      '<label class="afield"><span>Tagline</span><input class="ainput" data-ev="tagline" maxlength="60" value="' + esc(ev.tagline) + '"></label>' +
      '<label class="afield"><span>Team members</span><textarea class="ainput" rows="8" data-ev="team" maxlength="400" spellcheck="false" placeholder="One name per line, up to 8">' + esc(ev.team || "") + "</textarea>" +
      '<em class="as">Shown under “Made by” on the attract screen and the queue screen. Full names fit.</em></label>' +
      '<div class="afield"><span>Club logo</span><div class="row" style="gap:12px">' + (S.clubLogo ? '<img src="' + S.clubLogo + '" alt="Club logo" class="logo-prev">' : "") +
      '<label class="abtn sm">' + icon("upload", 15) + (S.clubLogo ? "Replace" : "Add a logo") + '<input type="file" accept="image/*" data-logo hidden></label>' + (S.clubLogo ? '<button class="abtn sm" data-act="logo-remove">Remove</button>' : "") + "</div></div></section>" +
      '<section class="acard"><h2>PIN</h2>' + pinStatus(ev) +
      '<div class="ed-grid"><label class="afield"><span>New 8-digit PIN</span><input class="ainput mono" type="password" data-pin1 inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" spellcheck="false"></label>' +
      '<label class="afield"><span>Type it again</span><input class="ainput mono" type="password" data-pin2 inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" spellcheck="false"></label></div>' +
      '<p class="as">Avoid one digit repeated or a run like 12345678. The app keeps only a salted hash of the PIN, so it never appears in a backup file.</p>' +
      '<button class="abtn primary" data-act="pin">Change PIN</button>' +
      "<h2 style=\"margin-top:26px\">Kiosk</h2>" + row("Kiosk lock", sw("modules.kioskLock", "Kiosk lock"), "Opens full screen; leaving it asks for the PIN") +
      row("Back to start after", select("numbers.idleSec", [[20, "20 s"], [30, "30 s"], [45, "45 s"], [60, "60 s"], [90, "90 s"]], "Idle reset after"), "Untouched mid-game") +
      row("Ending screen stays for", select("numbers.resultSec", [[10, "10 s"], [15, "15 s"], [20, "20 s"], [30, "30 s"], [45, "45 s"]], "Ending screen time")) +
      row("Winning screen stays for", select("numbers.winIdleSec", [[60, "1 min"], [120, "2 min"], [180, "3 min"], [300, "5 min"]], "Winning screen time"), "If nobody confirms the goodie") + "</section></div>" +
      '<div class="cards2"><section class="acard"><h2>Backup</h2>' + backupState + '<div class="row" style="gap:10px;flex-wrap:wrap">' + backupBtns +
      '<button class="abtn" data-act="backup-download">' + icon("download", 16) + 'Download a backup</button><label class="abtn">' + icon("upload", 16) + 'Restore a backup<input type="file" accept=".json,application/json" data-restore hidden></label></div>' +
      '<p class="as">Clearing the browser’s history also clears the game log, so turn the backup on on day one.</p></section>' +
      '<section class="acard"><h2>Queue screen</h2><p class="as">Show the rules and tips on a TV for people waiting. It runs from this laptop, with no internet.</p>' +
      '<button class="abtn primary" data-act="queue">' + icon("monitor", 16) + 'Open the queue screen</button><p class="as">Drag the new window onto the TV, click inside it and press F11.</p>' +
      "<h2 style=\"margin-top:22px\">Decks</h2><p class=\"as\">" + decks.filter((d) => d.total).map((d) => esc(d.tier[0].toUpperCase() + d.tier.slice(1)) + ": " + d.used + " of " + d.total + " used").join(" · ") + "</p>" +
      '<button class="abtn" data-act="reset-decks">Reset decks</button>' +
      "<h2 style=\"margin-top:22px\">Stickers</h2><p class=\"as\">" + stickerLine() + "</p>" +
      '<button class="abtn" data-act="reset-stickers">Reset stickers</button></section></div>' +
      '<section class="acard"><h2>Setting up the stall (about five minutes)</h2><ol class="steps">' +
      "<li>Plug the laptop in and turn off sleep and screen timeout.</li><li>Open this file in Chrome or Edge and press F11, or start the browser in kiosk mode.</li>" +
      "<li>Optional: connect a TV over HDMI and open the queue screen on it.</li><li>Set the volume low, play one test game and check the PIN works.</li>" +
      "<li>Keep a copy of the app file on a pen drive in case the laptop needs swapping.</li></ol></section>" +
      '<section class="acard danger-zone"><h2>Start over</h2><p class="as">Clears everything on this laptop: settings, edited questions, decks, the game log, goodies and sticker counts. Download a backup first.</p><button class="abtn danger" data-act="factory">Reset everything</button></section>' + foot();
  }
  function pinStatus(ev) {
    if (ev.pinHash) return '<p class="good">' + icon("check", 15, { sw: 3 }) + " Your own " + E.pinLength(ev) + "-digit PIN is set.</p>";
    if (ev.pinChanged) return '<p class="warn">' + icon("warning", 15) + " Your PIN has only " + E.pinLength(ev) + " digits. Set an 8-digit one.</p>";
    return '<p class="warn">' + icon("warning", 15) + " Still the default PIN, " + E.DEFAULT_PIN + ".</p>";
  }
  afterRender.event = () => {
    let evTimer = 0;
    main.addEventListener("input", (e) => {
      if (tab !== "event") return;
      const el = e.target;
      if (el.dataset.ev) {
        S.settings.event[el.dataset.ev] = el.value.trim() || (el.dataset.ev === "name" ? "Quiztopher Nolan" : "");
        clearTimeout(evTimer); evTimer = setTimeout(() => { saveSettings(); }, 300);
      }
      if (el.dataset.pin1 !== undefined || el.dataset.pin2 !== undefined) el.value = el.value.replace(/\D/g, "").slice(0, 8);
    });
    main.addEventListener("keydown", (e) => {
      if (tab === "event" && e.key === "Enter" && e.target.dataset.pin2 !== undefined) $('[data-act="pin"]', main).click();
    });
    main.addEventListener("change", async (e) => {
      if (tab !== "event") return;
      const el = e.target;
      if (el.dataset.logo !== undefined && el.files && el.files[0]) {
        try { S.clubLogo = await shrinkPng(el.files[0], 400, 160); QN.save("clubLogo"); show("event"); }
        catch (x) { toast("That image couldn’t be read", "bad"); }
      }
      if (el.dataset.restore !== undefined && el.files && el.files[0]) restore(el.files[0]);
    });
    main.addEventListener("click", async (e) => {
      if (tab !== "event") return;
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const B = QN.Backup;
      try {
        switch (b.dataset.act) {
          case "pin": {
            const f1 = $("[data-pin1]", main), f2 = $("[data-pin2]", main);
            const p1 = f1.value, p2 = f2.value;
            const retry = (msg) => { f1.value = ""; f2.value = ""; f1.focus(); toast(msg, "bad"); };
            if (!/^\d{8}$/.test(p1)) { f1.focus(); toast("The PIN needs 8 digits", "bad"); return; }
            if (p1 !== p2) { retry("The two PINs didn’t match. Type them both again."); return; }
            if (E.weakPin(p1)) { retry("That PIN is too easy to guess. Avoid one digit repeated or a run like 12345678."); return; }
            Object.assign(S.settings.event, E.hashPin(p1));
            saveSettings(); show("event"); toast("PIN changed");
            break;
          }
          case "logo-remove": S.clubLogo = null; QN.save("clubLogo"); show("event"); break;
          case "backup-pick": await B.pick(); show("event"); toast("Backup is on"); break;
          case "backup-reconnect": await B.reconnect(); show("event"); break;
          case "backup-now": (await B.write(true)) ? toast("Saved to the backup file") : toast("Couldn’t save: " + B.error, "bad"); show("event"); break;
          case "backup-stop": await B.forget(); show("event"); break;
          case "backup-download": download("quiztopher-backup-" + stamp() + ".json", JSON.stringify(B.snapshot()), "application/json"); break;
          case "queue": {
            const w = window.open(location.href.split("#")[0] + "#queue", "quiztopher-queue", "popup,width=1280,height=720");
            if (!w) toast("The browser blocked the new window. Allow pop-ups for this file.", "bad");
            break;
          }
          case "reset-decks":
            if (!(await confirmBox("Reset the decks?", "Every question becomes fresh again, so recent ones can come back straight away.", "Reset decks"))) return;
            S.decks = {}; QN.save("decks"); show("event"); break;
          case "reset-stickers":
            if (await resetStickers()) show("event");
            break;
          case "factory": {
            const r = await modal('<h2>Reset everything?</h2><p>Everything on this laptop goes back to how it was when the file was first opened.</p><label class="afield"><span>Type RESET to confirm</span><input class="ainput" data-confirm autocomplete="off"></label><div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn danger" data-m="ok">Reset everything</button></div>');
            if (!r || $("[data-confirm]", r.el).value.trim().toUpperCase() !== "RESET") return;
            Object.keys(localStorage).filter((k) => k.startsWith("qn.v1.")).forEach((k) => localStorage.removeItem(k));
            await B.forget();
            location.reload();
            break;
          }
        }
      } catch (x) {
        if (x && x.name === "AbortError") return;
        toast(x && x.message ? x.message : "That didn’t work", "bad");
      }
    });
  };
  function shrinkPng(file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const s = Math.min(1, maxW / img.width, maxH / img.height);
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png"));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function restore(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { toast("That isn’t a backup file", "bad"); return; }
    if (!data || data.kind !== "backup") { toast("That isn’t a Quiztopher Nolan backup", "bad"); return; }
    const r = await modal("<h2>Restore this backup?</h2><p>Saved " + esc(new Date(data.savedAt).toLocaleString()) + " with " + (data.log || []).length + " games. Games already on this laptop are kept and the backup’s games are added. Settings, questions and decks are replaced by the backup’s.</p>" +
      '<div class="adm-actions"><button class="abtn" data-m="cancel">Cancel</button><button class="abtn primary" data-m="ok">Restore</button></div>');
    if (!r) return;
    const have = new Set(S.log.map((g) => g.id));
    (data.log || []).forEach((g) => { if (!have.has(g.id)) S.log.push(g); });
    S.log.sort((a, b) => a.t - b.t);
    if (data.settings) Object.assign(S.settings, E.deepMerge(E.DEFAULT_SETTINGS, data.settings));
    if (data.packs) S.packs.splice(0, S.packs.length, ...QN.mergePacks(data.packs));
    if (data.bank) S.bank.splice(0, S.bank.length, ...data.bank);
    if (data.strings) { Object.keys(S.strings).forEach((k) => delete S.strings[k]); Object.assign(S.strings, data.strings); }
    if (data.tips) S.tips.splice(0, S.tips.length, ...data.tips);
    if (data.presets) Object.assign(S.presets, data.presets);
    if (data.decks) S.decks = data.decks;
    if (data.goodies) S.goodies = Object.assign(S.goodies, data.goodies);
    if (data.stickers) S.stickers = E.stickerState(data.stickers, window.QN_STICKERS || []);
    QN.saveLog();
    QN.save("settings", "packs", "bank", "strings", "tips", "presets", "decks", "goodies", "stickers");
    QN.reindex();
    QN.applyLook();
    show("event");
    toast("Backup restored");
  }

  window.QN_Admin = { open, close };
})();
