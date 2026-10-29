// Drives the built app in headless Chromium over the DevTools protocol, plays through every screen and
// screenshots each state. Run: deno run -A tests/browser.js <app url> <out dir> <width> <height> [cdp port]
const [url, outDir, W = "1366", H = "768", port = "9333"] = Deno.args;
const width = +W, height = +H;
await Deno.mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) problems.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + expr + "\n" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
let shot = 0;
const snap = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = outDir + "/" + String(++shot).padStart(2, "0") + "-" + name + ".png";
  await Deno.writeFile(file, Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  // Layout check: nothing on the stage may spill outside it.
  const spill = await js(`(() => {
    const st = document.querySelector('#stage'); if (!st || st.hidden) return [];
    const r = st.getBoundingClientRect(), out = [];
    for (const el of st.querySelectorAll('.screen:not(.leave) *')) {
      // .pick-grid scrolls, so stickers below its fold are meant to be out of view.
      if (el.closest('.floater, .glow, [aria-hidden="true"] .glow, .react, .goodie-burst, .pick-grid')) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      if (b.right > r.right + 2 || b.bottom > r.bottom + 2 || b.left < r.left - 2) out.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' ' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
    }
    // Text cut off inside fixed boxes.
    for (const el of st.querySelectorAll('.screen:not(.leave) .qtext, .screen:not(.leave) .picside, .screen:not(.leave) .opt .txt, .screen:not(.leave) .tipcard')) {
      if (el.scrollHeight > el.clientHeight + 2) out.push('clipped ' + el.className + ' ' + el.scrollHeight + '>' + el.clientHeight);
    }
    return out.slice(0, 8);
  })()`);
  if (spill.length) problems.push(name + " overflow: " + spill.join(" | "));
  console.log("  shot", file.split("/").pop());
};
const key = async (k, mods = 0, code) => {
  const text = k.length === 1 ? k : undefined;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: code || (k.length === 1 ? "Key" + k.toUpperCase() : k), text, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: code || (k.length === 1 ? "Key" + k.toUpperCase() : k), modifiers: mods });
};
const click = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no ' + ${JSON.stringify(sel)}); e.click(); return true; })()`);
const state = () => js("QN.test.state && (({screen, phase, idx}) => ({screen, phase, idx}))(QN.test.state())");
const waitFor = async (cond, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await js(cond)) return true; await sleep(100); }
  const st = await js("JSON.stringify({ screen: QN.App.screen, phase: QN.App.q && QN.App.q.phase, idx: QN.App.game && QN.App.game.idx, busy: QN.App.busy, overlay: !!QN.App.overlay, idle: !!QN.App.idleEl, active: document.activeElement && document.activeElement.outerHTML.slice(0, 80) })");
  throw new Error("timed out waiting for " + cond + "\nstate " + st + "\nproblems " + problems.join(" | "));
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(800);
await js("localStorage.clear(); true");
await send("Page.reload", { ignoreCache: true });
await waitFor("window.QN && QN.App.screen === 'attract'");
await sleep(1200);
const tag = width + "x" + height;
console.log("viewport", tag);

// 1. Attract
await snap("attract");

// 2. Start screen with a long name
await click('[data-act="play"]');
await waitFor("QN.App.screen === 'start'");
await js("const i = document.querySelector('#player-name'); i.value = 'Riya'; i.dispatchEvent(new Event('input')); true");
await sleep(700);
await snap("start");

// 3. Countdown, then questions. Answer the first three right.
await click('[data-act="ready"]');
await sleep(900);
await snap("countdown");
await waitFor("QN.App.screen === 'play' && QN.App.q && QN.App.q.phase === 'question'", 9000);
await sleep(900);
await snap("question-1");
for (let i = 0; i < 3; i++) {
  await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy");
  await sleep(500);
  const r = await js("QN.test.right()");
  await key(String(r + 1), 0, "Digit" + (r + 1));
  await sleep(900);
  if (i === 1) await snap("reveal-right");
  await key("Enter", 0, "Enter");
  await sleep(300);
}
// Stage card into "Getting tricky"
await sleep(500);
await snap("stage-card");
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 6000);
await sleep(900);
// Q4: use 50:50 and answer wrong
await key("f");
await sleep(900);
await snap("question-4-fifty");
await js("(() => { const q = QN.App.q; const si = q.order.findIndex((o, i) => o !== q.q.ans && !document.querySelector('.opt[data-si=\"' + i + '\"]').disabled); QN.test.pick(si); return si; })()");
await sleep(1000);
await snap("reveal-wrong");
await key("Enter", 0, "Enter");
// Q5 right
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy");
await sleep(700);
await snap("question-5");
await js("QN.test.pick(QN.test.right())");
await sleep(900);
await snap("reveal-repaired");
await key("Enter", 0, "Enter");
// Q6 picture with the hint
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy");
await sleep(2300);
await key("h");
await sleep(900);
await snap("picture-hint");
await js("QN.test.pick(QN.test.right())");
await sleep(1100);
await snap("picture-reveal");
await key("Enter", 0, "Enter");
// Q7 right: the goodie unlocks at 6 right? (right so far: 3 + Q5 + Q6 = 5) -> Q7 makes 6
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy");
await sleep(600);
await js("QN.test.pick(QN.test.right())");
await sleep(1300);
await snap("goodie-unlocked");
await sleep(2200);
await key("Enter", 0, "Enter");
// Q8 onwards: wait for the timer on one, then right answers to the end
await sleep(400);
await snap("stage-final");
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 6000);
await sleep(900);
await snap("question-8");
await js("QN.test.pick(QN.test.right())");
await sleep(500);
await key("Enter", 0, "Enter");
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 6000);
await sleep(900);
await snap("boss-question");
// Q9 right makes 8: the sticker pick unlocks
await js("QN.test.pick(QN.test.right())");
await sleep(1300);
await snap("pick-unlocked");
await sleep(2200);
await key("Enter", 0, "Enter");
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy");
await sleep(500);
await js("QN.test.pick(QN.test.right())");
await sleep(900);
await snap("last-reveal");
await key("Enter", 0, "Enter");
// 9 right: choose a sticker first
await waitFor("QN.App.screen === 'results pick'");
await sleep(1400);
await snap("sticker-pick");
const tiles = await js("document.querySelectorAll('.stile').length");
if (tiles !== 47) problems.push("the pick screen shows " + tiles + " stickers, not 47");
if (!(await js("document.querySelector('[data-act=\"confirm\"]').disabled"))) problems.push("This one is enabled before a sticker is chosen");
await click('.stile[data-st="2-03"]');
await sleep(600);
await snap("sticker-chosen");
await click('[data-act="confirm"]');
await waitFor("QN.App.screen === 'results win'");
if (!(await js("QN.S.stickers.items['2-03'].left === 0 && QN.S.log[QN.S.log.length - 1].sticker === '2-03'"))) problems.push("picking did not take the sticker off its count");
if (await js("QN.stickerChoices().some((d) => d.id === '2-03')")) problems.push("a taken sticker is still offered");
// Change of mind: the sticker goes back, then Surprise me picks another
await sleep(900);
await click('[data-act="change"]');
await waitFor("QN.App.screen === 'results pick'");
if (!(await js("QN.S.stickers.items['2-03'].left === 1 && !QN.S.log[QN.S.log.length - 1].sticker"))) problems.push("changing the sticker did not put it back");
await sleep(600);
await click('[data-act="surprise"]');
await sleep(1500);
if (!(await js("!document.querySelector('[data-act=\"confirm\"]').disabled && document.querySelectorAll('.stile.on').length === 1"))) problems.push("Surprise me did not choose a sticker");
await snap("sticker-surprise");
await key("Enter", 0, "Enter");
await waitFor("QN.App.screen === 'results win'");
await sleep(1600);
await snap("win");
if (!(await js("!!document.querySelector('.won-sticker img') && !!document.querySelector('.pickline b')"))) problems.push("the win screen does not show the chosen sticker");
// Volunteer hold
await js(`(() => { const b = document.querySelector('[data-act="hold"]'); const r = b.getBoundingClientRect(); window.__hold = [r.x + 30, r.y + 30]; return true; })()`);
const [hx, hy] = await js("window.__hold");
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: hx, y: hy, button: "left", clickCount: 1 });
await sleep(1000);
await snap("win-holding");
await sleep(1300);
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: hx, y: hy, button: "left", clickCount: 1 });
await waitFor("QN.App.screen === 'attract'", 4000);
const handed = await js("QN.S.log[QN.S.log.length - 1].handed > 0 && QN.S.goodies.left === 49");
if (!handed) problems.push("hold-to-confirm did not log the handover or reduce stock");

// 4. Out: four wrong in a row, with no name and a timeout on the first
await js("QN.test.start('')");
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 9000);
await js("QN.S.settings.numbers.timerSec = 30; true");
// Let the timer run out on question 1 by fast-forwarding it.
await js("(() => { const t = document.querySelector('.timer'); return !!t; })()");
await sleep(300);
await snap("timer-running");
for (let i = 0; i < 4; i++) {
  await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy");
  await sleep(400);
  await js("(() => { const q = QN.App.q; QN.test.pick(q.order.findIndex((o) => o !== q.q.ans)); })()");
  await sleep(700);
  if (i === 2) await snap("last-shield");
  await key("Enter", 0, "Enter");
}
await waitFor("QN.App.screen === 'results over'");
await sleep(1400);
await snap("out");

// 5. Finished without the goodie (5 right, alternating so nobody gets out)
await click('[data-act="again"]');
await waitFor("QN.App.screen === 'start'");
await click('[data-act="ready"]');
const pattern = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
for (let i = 0; i < 10; i++) {
  await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 9000);
  await sleep(250);
  await js(pattern[i] ? "QN.test.pick(QN.test.right())" : "(() => { const q = QN.App.q; QN.test.pick(q.order.findIndex((o) => o !== q.q.ans)); })()");
  await sleep(250);
  await js("QN.test.next(); true");
}
await waitFor("QN.App.screen === 'results over'");
await sleep(1400);
await snap("done-no-goodie");

// 5b. Seven right wins a goodie but no pick; with the pick switched off, even ten right goes straight to the win screen
const playAll = async (pat) => {
  await js("QN.home(); QN.test.start('')");
  for (let i = 0; i < pat.length; i++) {
    await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 9000);
    await sleep(200);
    await js(pat[i] ? "QN.test.pick(QN.test.right())" : "(() => { const q = QN.App.q; QN.test.pick(q.order.findIndex((o) => o !== q.q.ans)); })()");
    await sleep(200);
    await js("QN.test.next(); true");
  }
  await waitFor("QN.App.screen === 'results win' || QN.App.screen === 'results pick'");
  return js("QN.App.screen");
};
if ((await playAll([1, 1, 1, 1, 1, 1, 1, 0, 0, 0])) !== "results win") problems.push("7 right was offered the sticker pick");
if (await js("!!document.querySelector('.won-sticker, [data-act=\"change\"]')")) problems.push("7 right shows a sticker on the win screen");
await js("QN.S.settings.modules.stickerPick = false; QN.save('settings'); true");
if ((await playAll([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])) !== "results win") problems.push("the pick still showed with its switch off");
await js("QN.S.settings.modules.stickerPick = true; QN.save('settings'); QN.home(); true");
await sleep(800);

// 6. Admin: Ctrl+Shift+A, PIN 1234, each tab
await key("A", 10, "KeyA");
await sleep(500);
await snap("pin-pad");
for (const d of "12345678") { await key(d, 0, "Digit" + d); await sleep(60); }
await waitFor("QN.App.inAdmin");
await sleep(500);
await snap("admin-modules");
for (const t of ["questions", "goodies", "stickers", "stats", "look", "event"]) {
  await click('[data-tab="' + t + '"]');
  await sleep(500);
  await snap("admin-" + t);
}
// Stickers tab: hide a sheet, take one off by hand, switch automatic removal off
await click('[data-tab="stickers"]');
await sleep(300);
await click('[data-sheet="1"][data-on="0"]');
await sleep(200);
await click('[data-stk="4-15"] [data-stk-d="-1"]');
await sleep(200);
await click('[data-st-auto]');
await sleep(300);
if (!(await js("!QN.stickerChoices().some((d) => d.sheet === '1' || d.id === '4-15') && QN.S.stickers.auto === false && JSON.parse(localStorage.getItem('qn.v1.stickers')).items['4-15'].left === 0"))) problems.push("sticker admin changes did not apply or save");
await js("window.scrollTo(0, 900); true");
await sleep(200);
await snap("admin-stickers-edited");
await click('[data-st-auto]');
await sleep(200);
// After testing: Reset stickers puts every picked one back, shows the hidden ones again and empties Recent picks
if (!(await js("document.querySelectorAll('.qtable tbody .stk-cell').length > 0"))) problems.push("Recent picks is empty before the reset");
await click('.adm-head [data-act="reset-stickers"]');
await sleep(300);
await snap("admin-stickers-reset-box");
await js("document.querySelector('[data-show-every]').click(); true");
await click('.adm-modal [data-m="ok"]');
await sleep(400);
if (!(await js("QN_STICKERS.every((d) => QN.S.stickers.items[d.id].show && QN.S.stickers.items[d.id].left === d.spots.length) && QN.stickerChoices().length === 47 && QN.S.stickers.since > 0 && JSON.parse(localStorage.getItem('qn.v1.stickers')).since === QN.S.stickers.since"))) problems.push("Reset stickers did not put every sticker back");
if (await js("document.querySelectorAll('.qtable tbody .stk-cell').length")) problems.push("Recent picks still lists picks from before the reset");
if (!(await js("QN.S.log.some((g) => g.sticker)"))) problems.push("Reset stickers wiped the game log's picks");
await js("window.scrollTo(0, 0); true");
await sleep(200);
await snap("admin-stickers-reset");
await click('[data-tab="event"]');
await sleep(300);
if (!(await js("!!document.querySelector('[data-act=\"reset-stickers\"]') && /51 of 51 left/.test(document.querySelector('.adm-main').textContent)"))) problems.push("Event and kiosk has no Reset stickers, or the wrong count");
// Question editor with a live preview
await click('[data-tab="questions"]');
await sleep(300);
await click('[data-edit="q18"]');
await sleep(700);
await snap("admin-editor");
await click('[data-ed="cancel"]');
// Team members and a new PIN
await click('[data-tab="event"]');
await sleep(300);
await js(`(() => { const t = document.querySelector('[data-ev="team"]'); t.value = "Harshit Kumar\\nIsha Sharma\\nJummana Fatima\\nVaishnavi Reddy\\nAarav Mehta\\nRiya Nair"; t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const setPin = (a, b) => js(`(() => { const x = document.querySelector('[data-pin1]'), y = document.querySelector('[data-pin2]'); const masked = x.type === 'password' && y.type === 'password'; x.value = '${a}'; y.value = '${b}'; document.querySelector('[data-act="pin"]').click(); return masked; })()`);
if (!(await setPin("40917263", "40917236"))) problems.push("PIN fields are not masked");
if (await js("!!QN.S.settings.event.pinHash")) problems.push("mismatched PINs were accepted");
await setPin("11111111", "11111111");
if (await js("!!QN.S.settings.event.pinHash")) problems.push("a weak PIN was accepted");
await setPin("40917263", "40917263");
await sleep(500);
if (!(await js("!!QN.S.settings.event.pinHash && QN.S.settings.event.pin === null && !localStorage.getItem('qn.v1.settings').includes('40917263')"))) problems.push("the PIN was not stored as a salted hash");
await snap("admin-event-pin");
// Paper theme and back to the quiz
await click('[data-tab="look"]');
await sleep(200);
await click('[data-path="look.theme"][data-val="paper"]');
await sleep(400);
await click("[data-exit]");
await waitFor("QN.App.screen === 'attract'");
await sleep(1200);
await snap("paper-attract");
// The old default no longer opens the admin panel; the new PIN does.
await key("A", 10, "KeyA");
await sleep(400);
for (const d of "12345678") { await key(d, 0, "Digit" + d); await sleep(40); }
await sleep(600);
if (await js("QN.App.inAdmin")) problems.push("the old default PIN still opens the admin panel");
for (const d of "40917263") { await key(d, 0, "Digit" + d); await sleep(40); }
await waitFor("QN.App.inAdmin");
await click("[data-exit]");
await waitFor("QN.App.screen === 'attract'");
await sleep(800);
await js("QN.test.start('Aarav')");
await waitFor("QN.App.q && QN.App.q.phase === 'question' && !QN.App.busy", 9000);
await sleep(900);
await snap("paper-question");
await js("QN.test.pick(QN.test.right())");
await sleep(900);
await snap("paper-reveal");
// The pick and win screens in the Paper theme
if ((await playAll([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])) !== "results pick") problems.push("10 right was not offered the sticker pick");
await sleep(1400);
await click('.stile[data-st="4-17"]');
await sleep(500);
await snap("paper-pick");
await click('[data-act="confirm"]');
await waitFor("QN.App.screen === 'results win'");
if (!(await js("QN.S.stickers.items['4-17'].left === 1"))) problems.push("a design printed twice did not go from 2 to 1");
await sleep(1600);
await snap("paper-win");

// 7. Every pack off: the attract screen explains instead of breaking
await js("QN.S.packs.forEach((p) => { p.on = false; }); QN.save('packs'); QN.home(); true");
await sleep(1000);
await snap("no-packs");
await js("QN.S.packs.forEach((p) => { p.on = true; }); QN.S.settings.look.theme = 'midnight'; QN.save('packs', 'settings'); QN.applyLook(); true");

// 8. Queue screen (a hash change alone would not reload the page)
await send("Page.navigate", { url: "about:blank" });
await sleep(300);
await send("Page.navigate", { url: url.split("#")[0] + "#queue" });
await waitFor("window.QN && QN.App.queue && QN.App.screen === 'queue'");
await sleep(1500);
await snap("queue");

console.log(problems.length ? "PROBLEMS:\n  " + [...new Set(problems)].join("\n  ") : "no console errors or overflow");
ws.close();
Deno.exit(0);
