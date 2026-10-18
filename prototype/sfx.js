// 音效（Web Audio 现场合成，不用音频文件）和特效层（章节开场、大字、彩带）。
(function (root) {
  'use strict';
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!enabled) return null;
    if (!ctx) {
      try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, opt) {
    const a = ac(); if (!a) return;
    const o = Object.assign({ type: 'sine', vol: 0.2, at: 0, to: null }, opt);
    const t = a.currentTime + o.at;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }

  let noiseBuf = null;
  function noise(dur, opt) {
    const a = ac(); if (!a) return;
    const o = Object.assign({ vol: 0.2, at: 0, freq: 1000, q: 1, type: 'bandpass', to: null, attack: 0.01 }, opt);
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + o.at;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = o.type; f.Q.value = o.q;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const Sfx = {
    setEnabled(v) { enabled = !!v; },
    unlock() { ac(); },
    tap() { tone(700, 0.07, { type: 'triangle', vol: 0.12, to: 900 }); },
    ding() { tone(988, 0.14, { vol: 0.16 }); tone(1480, 0.22, { vol: 0.14, at: 0.09 }); },
    boop() { tone(360, 0.18, { type: 'triangle', vol: 0.14, to: 240 }); },
    hint() { tone(1320, 0.1, { type: 'sine', vol: 0.1 }); tone(1760, 0.16, { vol: 0.08, at: 0.06 }); },
    whistle() {
      const a = ac(); if (!a) return;
      for (const [f, at] of [[2350, 0], [2350, 0.32]]) {
        const osc = tone(f, 0.24, { type: 'square', vol: 0.05, at });
        if (osc) {
          const lfo = a.createOscillator(); const lg = a.createGain();
          lfo.frequency.value = 38; lg.gain.value = 120;
          lfo.connect(lg).connect(osc.frequency);
          lfo.start(a.currentTime + at); lfo.stop(a.currentTime + at + 0.26);
        }
      }
    },
    dribble() { for (let i = 0; i < 3; i++) tone(130, 0.09, { vol: 0.35, at: i * 0.28, to: 60 }); },
    whoosh() { noise(0.32, { vol: 0.18, freq: 500, to: 2500, q: 0.8 }); },
    swish() { noise(0.4, { vol: 0.28, freq: 5000, to: 2500, q: 0.7, type: 'highpass' }); },
    clank() { tone(520, 0.3, { type: 'square', vol: 0.07 }); tone(790, 0.24, { type: 'square', vol: 0.05, at: 0.01 }); tone(130, 0.12, { vol: 0.3, at: 0.25, to: 70 }); },
    cheer() { noise(1.6, { vol: 0.16, freq: 1100, q: 0.5, attack: 0.25 }); noise(1.2, { vol: 0.08, freq: 2600, q: 0.9, attack: 0.2, at: 0.1 }); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.16, { type: 'triangle', vol: 0.16, at: i * 0.12 })); },
  };

  // ---------- 特效层 ----------
  function layer() {
    let el = document.getElementById('fx');
    if (!el) { el = document.createElement('div'); el.id = 'fx'; document.body.appendChild(el); }
    return el;
  }
  function splash(title, sub) {
    const el = document.createElement('div');
    el.className = 'splash';
    el.innerHTML = `<div><div class="t"></div><div class="s"></div></div>`;
    el.querySelector('.t').textContent = title;
    el.querySelector('.s').textContent = sub || '';
    layer().appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
  function banner(text, sub, color) {
    const el = document.createElement('div');
    el.className = 'banner';
    el.textContent = text;
    if (color) el.style.color = color;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
    layer().appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
  function confetti(ms) {
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    const W = c.width = root.innerWidth, H = c.height = root.innerHeight;
    layer().appendChild(c);
    const g = c.getContext && c.getContext('2d');
    if (!g) { c.remove(); return; }
    const colors = ['#ffd23f', '#ff7a1a', '#31d17c', '#38cfff', '#ff6fb5', '#ffffff'];
    const parts = Array.from({ length: 110 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 13 - 4,
      r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
    }));
    const end = performance.now() + (ms || 1800);
    const frame = (t) => {
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); g.restore();
      }
      if (t < end) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }

  root.Sfx = Sfx;
  root.Fx = { splash, banner, confetti };
})(typeof self !== 'undefined' ? self : this);
