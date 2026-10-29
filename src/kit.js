// Shared UI pieces: text helpers, icons, the Kavach mascot, sound and confetti.
(function (global) {
  "use strict";

  // ---------- Text ----------

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Escapes, then turns `code` into mono, **bold** into bold and ______ into a blank.
  function rich(s, opts) {
    let h = esc(s);
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    if (opts && opts.blank != null) h = h.replace(/_{3,}/, opts.blank);
    else h = h.replace(/_{3,}/g, '<span class="blank" aria-label="blank"></span>');
    return h;
  }
  const plain = (s) => String(s == null ? "" : s).replace(/`/g, "").replace(/\*\*/g, "").replace(/_{3,}/g, "blank");

  // ---------- Icons (24px stroke icons) ----------

  const P = {
    shieldLogo: '<path d="M12 2.5 4.5 5.3v6.2c0 4.9 3.2 8.6 7.5 10 4.3-1.4 7.5-5.1 7.5-10V5.3L12 2.5ZM12 9v4"/><circle cx="12" cy="9" r="1.6"/>',
    gift: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    bulb: '<path d="M9 18h6M10 22h4M15.1 14c.2-1 .7-1.7 1.4-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.2 1.5 1.4 2.5"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowL: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    lock: '<path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4"/>',
    mail: '<path d="M3 6h18v12H3zM3 6l9 7 9-7"/>',
    image: '<path d="M3 3h18v18H3zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM21 15l-5-5L5 21"/>',
    replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    chart: '<path d="M3 3v18h18M7 15l4-4 3 3 6-6"/>',
    palette: '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22ZM7.5 10.5h.01M10.5 7h.01M15.5 7.5h.01"/>',
    calendar: '<path d="M3 5h18v16H3zM16 3v4M8 3v4M3 10h18"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    chevU: '<path d="m18 15-6-6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
    copy: '<path d="M9 9h12v12H9zM5 15H3V3h12v2"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
    download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    pin: '<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4-1-6Z"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    warning: '<path d="M12 3 2 20h20L12 3ZM12 10v4M12 17h.01"/>',
    shieldCheck: '<path d="M12 2.5 4.5 5.3v6.2c0 4.9 3.2 8.6 7.5 10 4.3-1.4 7.5-5.1 7.5-10V5.3L12 2.5Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>',
    monitor: '<path d="M3 4h18v12H3zM8 20h8M12 16v4"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
    save: '<path d="M5 3h11l3 3v15H5zM8 3v6h8M8 21v-7h8v7"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    power: '<path d="M12 3v9M6.3 7a8 8 0 1 0 11.4 0"/>',
    file: '<path d="M14 3H6v18h12V7l-4-4ZM14 3v4h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  };
  function icon(name, size, opts) {
    const o = opts || {};
    const sw = o.sw || 2;
    return '<svg width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 24 24" fill="none" stroke="' + (o.color || "currentColor") +
      '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (o.cls ? ' class="' + o.cls + '"' : "") + ">" + P[name] + "</svg>";
  }

  const SHIELD_PATH = "M12 2.5 4.5 5.3v6.2c0 4.9 3.2 8.6 7.5 10 4.3-1.4 7.5-5.1 7.5-10V5.3L12 2.5Z";
  const CRACK_PATH = "M12.5 5.5 10.5 10l3 2-2.5 5";
  function shieldIcon(broken, size) {
    return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path class="fill" d="' + SHIELD_PATH + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path class="crack" d="' + CRACK_PATH + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function crackedShield(variant, size) {
    const crack = variant ? "M11 5 13 9.5l-3 2.5 2.5 4.5" : CRACK_PATH;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + SHIELD_PATH +
      '" fill="var(--bad-tint)" stroke="var(--bad)" stroke-width="1.2" stroke-linejoin="round"/><path d="' + crack +
      '" fill="none" stroke="var(--bad)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  const bars = (h) => '<span class="bars" aria-hidden="true">' + h.map((x) => '<span style="height:' + x + 'px"></span>').join("") + "</span>";

  // ---------- Kavach, the mascot ----------

  let kvId = 0;
  const BODY = "M60 6 L104 22 V62 C104 98 84 122 60 134 C36 122 16 98 16 62 V22 Z";
  function kavach(pose, w, label) {
    const id = "kv" + ++kvId;
    const h = Math.round((w * 140) / 120);
    const arms = {
      wave: '<path class="arm-l" d="M22 84 L12 102" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle class="arm-l" cx="12" cy="103" r="6" fill="#A9BBFF"/>' +
        '<g class="arm-r"><path d="M98 66 L114 40" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="115" cy="38" r="6" fill="#A9BBFF"/></g>',
      up: '<g class="arm-l"><path d="M22 66 L6 40" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="5" cy="38" r="6" fill="#A9BBFF"/></g>' +
        '<g class="arm-r"><path d="M98 66 L114 40" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="115" cy="38" r="6" fill="#A9BBFF"/></g>',
      down: '<path d="M22 84 L14 104" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="13" cy="106" r="6" fill="#A9BBFF"/>' +
        '<path d="M98 84 L106 104" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="107" cy="106" r="6" fill="#A9BBFF"/>',
      cheeks: '<path d="M22 70 L8 60" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="7" cy="59" r="6" fill="#A9BBFF"/>' +
        '<path d="M98 70 L112 60" stroke="#7F93FF" stroke-width="7" stroke-linecap="round"/><circle cx="113" cy="59" r="6" fill="#A9BBFF"/>',
    };
    const eyesOpen = '<g class="blink"><ellipse cx="46" cy="60" rx="8" ry="9" fill="#FFFFFF"/><ellipse cx="74" cy="60" rx="8" ry="9" fill="#FFFFFF"/>' +
      '<circle cx="47.5" cy="61" r="4" fill="#0B1020"/><circle cx="75.5" cy="61" r="4" fill="#0B1020"/>' +
      '<circle cx="49" cy="59.5" r="1.4" fill="#FFFFFF"/><circle cx="77" cy="59.5" r="1.4" fill="#FFFFFF"/></g>';
    const eyesHappy = '<path d="M39 60 Q46 52 53 60" fill="none" stroke="#0B1020" stroke-width="3.5" stroke-linecap="round"/>' +
      '<path d="M67 60 Q74 52 81 60" fill="none" stroke="#0B1020" stroke-width="3.5" stroke-linecap="round"/>';
    const eyesWide = '<ellipse cx="46" cy="60" rx="9" ry="10" fill="#FFFFFF"/><ellipse cx="74" cy="60" rx="9" ry="10" fill="#FFFFFF"/>' +
      '<circle cx="46" cy="61" r="3" fill="#0B1020"/><circle cx="74" cy="61" r="3" fill="#0B1020"/>' +
      '<path d="M37 47 L52 50" stroke="#0B1020" stroke-width="3" stroke-linecap="round"/><path d="M83 47 L68 50" stroke="#0B1020" stroke-width="3" stroke-linecap="round"/>';
    const eyesDazed = '<path d="M38 52 L52 56" stroke="#0B1020" stroke-width="3" stroke-linecap="round"/><path d="M82 52 L68 56" stroke="#0B1020" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="46" cy="64" rx="7" ry="8" fill="#FFFFFF"/><ellipse cx="74" cy="64" rx="7" ry="8" fill="#FFFFFF"/>' +
      '<circle cx="46" cy="67" r="3.6" fill="#0B1020"/><circle cx="74" cy="67" r="3.6" fill="#0B1020"/>';
    const cheeks = '<circle cx="36" cy="77" r="5" fill="#FF8FA3" fill-opacity="0.55"/><circle cx="84" cy="77" r="5" fill="#FF8FA3" fill-opacity="0.55"/>';
    const smile = '<path d="M48 83 Q60 94 72 83" fill="none" stroke="#0B1020" stroke-width="3.5" stroke-linecap="round"/>';
    const grin = '<path d="M45 78 Q60 100 75 78 Z" fill="#0B1020"/><path d="M52 87 Q60 94 68 87 Q60 84 52 87 Z" fill="#FF8FA3"/>';
    const oMouth = '<ellipse cx="60" cy="88" rx="6" ry="7.5" fill="#0B1020"/>';
    const frown = '<path d="M48 90 Q60 83 72 90" fill="none" stroke="#0B1020" stroke-width="3.5" stroke-linecap="round"/>';
    const sparkles = '<path d="M10 14 Q10 20 16 20 Q10 20 10 26 Q10 20 4 20 Q10 20 10 14 Z" fill="#FFB547"/>' +
      '<path d="M108 4 Q108 9 113 9 Q108 9 108 14 Q108 9 103 9 Q108 9 108 4 Z" fill="#3DDC97"/>';
    const sweat = '<path d="M98 34 Q102 42 98 46 Q94 42 98 34 Z" fill="#9FE7F5"/>';
    const bandage = '<g transform="rotate(-24 78 36)"><rect x="62" y="30" width="32" height="12" rx="4" fill="#FFE2B5" stroke="#E8C48C" stroke-width="1.5"/>' +
      '<circle cx="74" cy="36" r="1.2" fill="#E8C48C"/><circle cx="82" cy="36" r="1.2" fill="#E8C48C"/></g>';
    const faces = {
      wave: [arms.wave, eyesOpen + cheeks + smile, ""],
      idle: [arms.wave, eyesOpen + cheeks + smile, ""],
      cheer: [arms.up, eyesHappy + cheeks + grin, sparkles],
      dance: [arms.up, eyesHappy + cheeks + grin, ""],
      gasp: [arms.cheeks, eyesWide + oMouth, sweat],
      dazed: [arms.down, bandage + eyesDazed + frown, ""],
      calm: [arms.down, eyesOpen + cheeks + smile, ""],
    };
    const f = faces[pose] || faces.wave;
    const cls = { wave: "wave idle", idle: "idle", cheer: "cheer", dance: "dance", gasp: "gasp", dazed: "dazed", calm: "idle" }[pose] || "";
    return '<svg class="kavach ' + cls + '" width="' + w + '" height="' + h + '" viewBox="0 0 120 140" role="img" aria-label="' + esc(label || "Kavach, the quiz mascot") + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A9BBFF"/><stop offset="1" stop-color="#5B6CF0"/></linearGradient></defs>' +
      '<ellipse cx="60" cy="137" rx="34" ry="3" fill="rgba(0,0,0,0.3)"/>' + f[0] +
      '<g class="body"><path d="' + BODY + '" fill="url(#' + id + ')" stroke="#C9D4FF" stroke-width="2"/>' +
      '<path d="M60 16 L94 28 V60 C94 88 80 108 60 120" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="3" stroke-linecap="round"/>' +
      f[1] + "</g>" + f[2] + "</svg>";
  }

  function giftBox(w) {
    return '<svg width="' + w + '" height="' + Math.round(w * 200 / 220) + '" viewBox="0 0 220 200" role="img" aria-label="An open gift box with light rays">' +
      '<g opacity="0.55" stroke="#FFD38A" stroke-width="3" stroke-linecap="round"><path d="M110 92 L60 10"/><path d="M110 92 L110 0"/><path d="M110 92 L160 10"/><path d="M110 92 L26 52"/><path d="M110 92 L194 52"/></g>' +
      '<rect x="46" y="100" width="128" height="92" rx="10" fill="#FFB547" stroke="#FFE2B5" stroke-width="2"/><rect x="100" y="100" width="20" height="92" fill="#FF8FA3"/>' +
      '<g class="lid" transform="rotate(-14 60 86)"><rect x="34" y="70" width="152" height="32" rx="8" fill="#FFC979" stroke="#FFE2B5" stroke-width="2"/><rect x="100" y="70" width="20" height="32" fill="#FF8FA3"/>' +
      '<path d="M110 70 C92 46 72 52 82 66 C88 74 104 72 110 70 C116 72 132 74 138 66 C148 52 128 46 110 70 Z" fill="#FF8FA3" stroke="#FFD0DA" stroke-width="2"/></g>' +
      '<path d="M30 30 Q30 38 38 38 Q30 38 30 46 Q30 38 22 38 Q30 38 30 30 Z" fill="#FFE2B5"/><path d="M190 22 Q190 28 196 28 Q190 28 190 34 Q190 28 184 28 Q190 28 190 22 Z" fill="#B7C5FF"/></svg>';
  }

  function giftClosed(w) {
    return '<svg width="' + w + '" height="' + w + '" viewBox="0 0 120 120" aria-hidden="true">' +
      '<rect x="22" y="52" width="76" height="56" rx="8" fill="#FFB547" stroke="#FFE2B5" stroke-width="2"/><rect x="54" y="52" width="12" height="56" fill="#FF8FA3"/>' +
      '<g class="lid"><rect x="14" y="36" width="92" height="20" rx="6" fill="#FFC979" stroke="#FFE2B5" stroke-width="2"/><rect x="54" y="36" width="12" height="20" fill="#FF8FA3"/>' +
      '<path d="M60 36 C48 18 34 22 41 32 C45 38 56 37 60 36 C64 37 75 38 79 32 C86 22 72 18 60 36 Z" fill="#FF8FA3" stroke="#FFD0DA" stroke-width="2"/></g></svg>';
  }

  // ---------- Sound (made in the browser, no audio files) ----------

  const Sound = {
    ctx: null, master: null, volume: 0.35, enabled: true,
    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
    tone(freq, t0, dur, type, gain, endFreq) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t0);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    noise(t0, dur, gain, hp) {
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 2000;
      const g = c.createGain(); g.gain.value = gain || 0.2;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0);
    },
    play(name) {
      if (!this.enabled || !this.ctx || this.volume <= 0) return;
      const t = this.ctx.currentTime + 0.01;
      switch (name) {
        case "tap": this.tone(660, t, 0.06, "sine", 0.18); break;
        case "right": this.tone(659, t, 0.35, "triangle", 0.3); this.tone(988, t + 0.09, 0.5, "triangle", 0.28); this.tone(1319, t + 0.18, 0.6, "sine", 0.14); break;
        case "wrong": this.tone(180, t, 0.32, "square", 0.08, 120); this.tone(140, t + 0.02, 0.34, "sawtooth", 0.05, 100); break;
        case "tick": this.tone(1200, t, 0.04, "square", 0.05); break;
        case "crack": this.noise(t, 0.25, 0.25, 3000); this.tone(2400, t, 0.12, "triangle", 0.06, 1400); this.tone(3100, t + 0.04, 0.1, "sine", 0.04, 1800); break;
        case "repair": [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, "sine", 0.12)); break;
        case "spark": this.tone(880, t, 0.18, "sine", 0.16, 1760); break;
        case "thump": this.tone(110, t, 0.22, "sine", 0.4, 50); break;
        case "whoosh": this.noise(t, 0.4, 0.08, 800); break;
        case "count": this.tone(520, t, 0.16, "triangle", 0.25); break;
        case "go": this.tone(784, t, 0.3, "triangle", 0.28); this.tone(1046, t + 0.05, 0.35, "triangle", 0.2); break;
        case "hint": this.tone(740, t, 0.12, "sine", 0.14); this.tone(988, t + 0.08, 0.18, "sine", 0.12); break;
        case "fifty": this.noise(t, 0.2, 0.08, 1200); this.tone(400, t, 0.18, "triangle", 0.12, 200); break;
        case "fanfare": {
          const notes = [523, 659, 784, 1046];
          notes.forEach((f, i) => this.tone(f, t + i * 0.11, 0.3, "triangle", 0.26));
          [523, 659, 784, 1046].forEach((f) => this.tone(f, t + 0.5, 0.9, "triangle", 0.12));
          break;
        }
        case "out": this.tone(392, t, 0.3, "triangle", 0.2); this.tone(330, t + 0.22, 0.3, "triangle", 0.2); this.tone(262, t + 0.44, 0.5, "triangle", 0.2); break;
      }
    },
  };

  // ---------- Confetti ----------

  const Confetti = {
    canvas: null, parts: [], raf: 0,
    burst(count) {
      const cv = this.canvas || (this.canvas = document.getElementById("confetti"));
      if (!cv) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      const colors = ["#FFB547", "#6C8CFF", "#3DDC97", "#FF8FA3", "#6FE3F2", "#C7A2FF", "#FFE2B5"];
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1;
        this.parts.push({
          x: innerWidth / 2 + side * innerWidth * 0.22 * Math.random(), y: innerHeight * 0.55,
          vx: (Math.random() - 0.5) * 16 + side * 2, vy: -(Math.random() * 16 + 10),
          w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
          c: colors[i % colors.length], life: 0, max: 140 + Math.random() * 60, round: Math.random() < 0.25,
        });
      }
      if (!this.raf) this.loop(dpr);
    },
    loop(dpr) {
      const cv = this.canvas, ctx = cv.getContext("2d");
      const step = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        this.parts = this.parts.filter((p) => p.life < p.max && p.y < innerHeight + 40);
        for (const p of this.parts) {
          p.life++; p.vy += 0.42; p.vx *= 0.985; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save(); ctx.globalAlpha = Math.min(1, (p.max - p.life) / 30);
          ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
          if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
          else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life / 9)) + 2);
          ctx.restore();
        }
        if (this.parts.length) this.raf = requestAnimationFrame(step);
        else { this.raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
      };
      this.raf = requestAnimationFrame(step);
    },
  };

  global.QN_Kit = { esc, rich, plain, icon, shieldIcon, crackedShield, bars, kavach, giftBox, giftClosed, Sound, Confetti, SHIELD_PATH };
})(window);
