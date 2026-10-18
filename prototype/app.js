// 首关交互原型（阶段一）。
// 语音是模拟的：孩子说的话由孩子或家长打字输入，记录里一律标 simulated，不算真实口语证据。
(function () {
  'use strict';

  const E = window.BBEngine;
  const LEVEL = window.LEVEL_DATA;
  const STORE_KEY = 'bbe.prototype.v1';
  const SKILL_ZH = {
    passing: '传球', shooting: '投篮', defending: '防守', dribbling: '运球',
    running: '跑动', rebounding: '抢篮板', jumping: '弹跳',
  };
  const RESULT_ZH = {
    independent: '自己成句', keyword: '只说关键词', with_hint: '看提示后', full_answer: '看完整答案',
    click_continue: '点击继续', asr_uncertain: '没听清（不算错）', clarify: '意思不明确，已追问',
    redirect: '当前做不了，已说明', off_task: '和任务无关', empty: '没有内容',
  };
  const MODE_ZH = { simulated: '模拟输入', voice: '真实录音', click: '点击' };

  // ---------- 存储（读写失败时照常运行，只是不保存） ----------
  function fresh() {
    return {
      version: 1,
      team: { name: 'Suzhou Sparks' },
      player: { skill: null },
      game: { rewards: {}, jersey: null },
      progress: {},
      evidence: [],
      learning: {},
      settings: { subtitles: false, minutes: 12 },
      totals: { playMs: 0, runsDone: 0 },
      run: null,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.version === 1 ? Object.assign(fresh(), s) : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 隐私模式等，不保存 */ }
  }
  let S = load() || fresh();
  let view = 'today';

  // ---------- 小工具 ----------
  const app = document.getElementById('app');
  let acts = {};
  let actSeq = 0;
  function act(fn) { const k = 'a' + (++actSeq); acts[k] = fn; return k; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fill(tpl, vars) {
    return cap(String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')));
  }
  function fmtMin(ms) { return Math.max(0, Math.round(ms / 60000)) + ' 分钟'; }
  function fmtDate(t) { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; }
  function char(id) { return LEVEL.characters[id] || { name: id === 'me' ? '你' : id, color: '#ffd166' }; }
  function stepAt(i) { return LEVEL.steps[i]; }
  function target(id) { return LEVEL.targets.find((t) => t.id === id); }

  // ---------- 合成语音 ----------
  const canSpeak = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  function say(text, slow) {
    if (!canSpeak) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = slow ? 0.65 : 0.92;
      const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* 没有语音就只看字幕 */ }
  }

  // ---------- 一局的状态 ----------
  function startRun() {
    S.run = {
      id: 'run' + Date.now(), levelId: LEVEL.id, stepIndex: 0, startedAt: Date.now(),
      playMs: 0, score: 0, plays: 0, sub: null,
    };
    enterStep();
  }
  function enterStep() {
    const st = stepAt(S.run.stepIndex);
    S.run.sub = { phase: st.type === 'court' ? 'choose' : 'main', hint: 0, log: [], awaiting: true, done: false };
    const sub = S.run.sub;
    if (st.type === 'speak') pushLine(sub, st.speaker, st.line, st.lineZh);
    if (st.type === 'court') pushSys(sub, st.situation);
    if (st.type === 'listen') sub.heard = {};
    save();
  }
  function nextStep() {
    S.run.stepIndex += 1;
    if (S.run.stepIndex >= LEVEL.steps.length) return finishRun();
    enterStep();
    render();
  }
  function finishRun() {
    tickTime();
    const r = S.run;
    S.progress[LEVEL.id] = {
      status: 'done', completedAt: Date.now(), lastScore: r.score, lastPlays: r.plays,
      lastMs: r.playMs, times: ((S.progress[LEVEL.id] || {}).times || 0) + 1,
    };
    S.totals.runsDone += 1;
    S.lastFinished = { score: r.score, plays: r.plays, ms: r.playMs };
    S.run = null;
    save();
    view = 'finished';
    render();
  }
  let resumedAt = null;
  function tickTime() {
    if (S.run && resumedAt) {
      const d = Date.now() - resumedAt;
      S.run.playMs += d;
      S.totals.playMs += d;
    }
    resumedAt = null;
  }
  function pushLine(sub, who, text, zh) { sub.log.push({ who, text, zh }); if (who !== 'me') say(text); }
  function pushSys(sub, text) { sub.log.push({ who: 'sys', text }); }

  // ---------- 作答 ----------
  function currentSpec() {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    return sub.phase === 'follow' ? st.followUp : st;
  }
  function vars() {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    const skill = S.player.skill || 'passing';
    const opt = st.options && st.options.find((o) => o.id === sub.executed);
    return {
      skill, skillZh: SKILL_ZH[skill] || skill,
      optionName: opt ? (opt.id === 'me' ? 'yourself' : char(opt.id).name) : '',
    };
  }

  function submit(mode, text, asrUncertain) {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    const spec = currentSpec();
    const match = mode === 'click' ? null : E.matchUtterance(spec, text);
    const ev = E.makeEvidence({
      levelId: LEVEL.id, stepId: st.id + (sub.phase === 'follow' ? ':follow' : ''),
      targetId: spec.target || st.target, text, match, hintLevel: sub.hint,
      inputMode: mode, asrUncertain, now: Date.now(),
    });
    ev.runId = S.run.id;
    S.evidence.push(ev);
    S.learning[ev.targetId] = E.updateLearning(S.learning[ev.targetId], ev);

    if (mode !== 'click' && text) pushLine(sub, 'me', text);
    const speaker = st.type === 'court' ? null : st.speaker;

    if (ev.result === 'asr_uncertain') {
      pushLine(sub, speaker || 'coach', "Sorry, I didn't catch that. Can you say it again?", '抱歉，没听清。能再说一遍吗？（不算你说错）');
      return afterAnswer();
    }
    if (ev.result === 'empty') { pushSys(sub, '还没有内容。'); return afterAnswer(); }
    if (!E.advancesStory(ev.result)) {
      pushLine(sub, speaker || 'coach', match.reply);
      return afterAnswer();
    }

    // 剧情推进：意思清楚、看提示、看答案、点击继续都推进；只是学习记录不同
    let intent = match ? match.intent : null;
    if (mode === 'click') {
      intent = st.type === 'court'
        ? (spec.intents.find((i) => i.option === sub.chosen) || spec.intents[0])
        : spec.intents[0];
    }
    if (match && match.slots && match.slots.skill && sub.phase !== 'follow') S.player.skill = match.slots.skill;
    if (st.type === 'speak' && sub.phase === 'main' && intent.slot && !S.player.skill) S.player.skill = intent.slot.default;

    const v = vars();
    const replyWho = intent.speaker || speaker || 'coach';
    const reply = (ev.result === 'keyword' || (match && match.quality === 'partial')) && intent.replyKeyword
      ? intent.replyKeyword : intent.reply;
    if (mode === 'click') pushSys(sub, '剧情继续（这一句没有算作口语练习，之后会再练）');
    pushLine(sub, replyWho, fill(reply, v));

    if (st.type === 'court' && sub.phase === 'speak') {
      sub.executed = intent.option;
      if (sub.chosen && sub.executed !== sub.chosen) {
        const o = st.options.find((x) => x.id === sub.executed);
        pushSys(sub, `你说的是「${o.label}」，队友按你说的做。`);
      }
      sub.firstQuality = ev.result;
      S.run.plays += 1;
      sub.phase = 'action';
      sub.awaiting = false;
      save();
      return render();
    }

    // 成句、没看提示，才进追问（挑战层）；其余直接收尾
    if (sub.phase === 'main' && st.followUp && st.followUp.when === 'sentence' && ev.result === 'independent') {
      startFollow(st);
    } else {
      sub.awaiting = false;
      sub.done = true;
    }
    afterAnswer();
  }
  function startFollow(st) {
    const sub = S.run.sub;
    sub.phase = 'follow';
    sub.hint = 0;
    sub.awaiting = true;
    sub.done = false;
    const v = vars();
    pushLine(sub, st.type === 'court' ? 'coach' : st.speaker, fill(st.followUp.line, v), fill(st.followUp.lineZh, v));
  }
  function afterAnswer() { save(); render(); }

  // ---------- 渲染：外壳 ----------
  let resetArmed = false;
  function render() {
    acts = {};
    if (view !== 'parent') resetArmed = false;
    stopTiming();
    let html;
    if (view === 'play' && S.run) html = renderPlay();
    else if (view === 'finished') html = renderFinished();
    else if (view === 'team') html = renderTeam();
    else if (view === 'growth') html = renderGrowth();
    else if (view === 'parent') html = renderParent();
    else html = renderToday();
    const showNav = !(view === 'play' && S.run);
    app.innerHTML = html + (showNav ? renderNav() : '');
    app.querySelectorAll('[data-act]').forEach((el) => {
      const fn = acts[el.getAttribute('data-act')];
      if (fn) el.addEventListener('click', (e) => { e.preventDefault(); fn(el, e); });
    });
    app.querySelectorAll('[data-change]').forEach((el) => {
      const fn = acts[el.getAttribute('data-change')];
      if (fn) el.addEventListener('change', () => fn(el));
    });
    if (view === 'play' && S.run && S.run.sub && S.run.sub.phase === 'action') startTiming();
    const chat = app.querySelector('.chat');
    if (chat) chat.lastElementChild && chat.lastElementChild.scrollIntoView({ block: 'nearest' });
  }
  function go(v) { tickTime(); view = v; if (v === 'play' && S.run) resumedAt = Date.now(); render(); window.scrollTo(0, 0); }

  function renderNav() {
    const items = [['today', '🏀', '今日'], ['team', '👕', '球队'], ['growth', '📈', '成长']];
    return `<nav class="nav">${items.map(([k, ico, label]) =>
      `<button class="${view === k || (k === 'growth' && view === 'parent') ? 'on' : ''}" data-act="${act(() => go(k))}"><span class="ico">${ico}</span>${label}</button>`
    ).join('')}</nav>`;
  }

  // ---------- 今日 ----------
  function renderToday() {
    const p = S.progress[LEVEL.id];
    const r = S.run;
    const total = LEVEL.steps.length;
    let main;
    if (r) {
      main = `<p class="muted">上次停在第 ${r.stepIndex + 1}/${total} 段：${esc(stepAt(r.stepIndex).chapter)}</p>
        <button class="btn primary block" data-act="${act(() => go('play'))}">继续上次进度</button>`;
    } else if (p && p.status === 'done') {
      main = `<p>✅ 今天的任务完成了（${fmtDate(p.completedAt)}）</p>
        <button class="btn block" data-act="${act(() => { startRun(); go('play'); })}">再玩一次（不会重复发奖励）</button>`;
    } else {
      main = `<button class="btn primary block" data-act="${act(() => { startRun(); go('play'); })}">开始今日任务</button>`;
    }
    return `<div class="page">
      <h1>今日</h1>
      <div class="banner-sim">原型版：语音是模拟的——孩子说完，把他说的话打进输入框。这样的记录不算真实口语。</div>
      <div class="card hero">
        <div class="chapter">第 1 天 · ${esc(LEVEL.scene)}</div>
        <h2 style="margin-top:4px">${esc(LEVEL.title)} <span class="muted small">${esc(LEVEL.titleEn)}</span></h2>
        <p>${esc(LEVEL.goal)}</p>
        <p class="muted">预计 ${LEVEL.estimatedMinutes} 分钟 · 可以随时离开，进度会保存</p>
        ${main}
      </div>
      <div class="card">
        <div class="muted small">今天的队友</div>
        <div class="row" style="margin-top:6px">
          ${['alex', 'ben'].map((id) => `<span class="tag">${esc(char(id).name)} · ${esc(char(id).trait)}</span>`).join('')}
          <span class="tag virtual">对手 Red Hawks（电脑角色）</span>
        </div>
      </div>
    </div>`;
  }

  // ---------- 一局 ----------
  function renderPlay() {
    const r = S.run;
    const st = stepAt(r.stepIndex);
    const pct = Math.round((r.stepIndex / LEVEL.steps.length) * 100);
    const head = `<div class="topbar">
        <button class="btn ghost" data-act="${act(() => { save(); go('today'); })}">← 先离开</button>
        <div class="title">${esc(LEVEL.title)}</div>
        <span class="tag">比分 ${r.score}</span>
      </div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="chapter">${esc(st.chapter)}</div>`;
    let body = '';
    if (st.type === 'speak') body = renderSpeak(st);
    else if (st.type === 'listen') body = renderListen(st);
    else if (st.type === 'court') body = renderCourt(st);
    else if (st.type === 'feedback') body = renderFeedback();
    else if (st.type === 'reward') body = renderReward(st);
    return `<div class="page play">${head}${body}</div>`;
  }

  function renderBubble(m, i) {
    if (m.who === 'sys') return `<div class="bubble sys">${esc(m.text)}</div>`;
    if (m.who === 'me') return `<div class="bubble me"><div class="who">你 <span class="tag sim">模拟语音</span></div>${esc(m.text)}</div>`;
    const c = char(m.who);
    const sub = S.run && S.run.sub;
    const shown = !canSpeak || S.settings.subtitles || (sub && sub.reveal && sub.reveal[i]);
    const text = shown ? esc(m.text) : '<span class="hidden-text">（点「字幕」看文字）</span>';
    return `<div class="bubble"><div class="who"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${c.virtual ? ' <span class="tag virtual">虚构角色</span>' : ''}</div>
      ${text}${shown && m.zh && sub && sub.zh && sub.zh[i] ? `<div class="zh">${esc(m.zh)}</div>` : ''}
      <div class="audio">
        ${canSpeak ? `<button data-act="${act(() => say(m.text))}">▶ 听</button><button data-act="${act(() => say(m.text, true))}">🐢 慢速</button>` : ''}
        ${shown ? (m.zh ? `<button data-act="${act(() => toggle('zh', i))}">中文</button>` : '') : `<button data-act="${act(() => toggle('reveal', i))}">字幕</button>`}
      </div></div>`;
  }
  function toggle(key, i) {
    const sub = S.run.sub;
    sub[key] = sub[key] || {};
    sub[key][i] = !sub[key][i];
    save();
    render();
  }

  function renderChat(sub) {
    return `<div class="chat">${sub.log.map(renderBubble).join('')}</div>`;
  }

  function renderHints(spec, level) {
    return spec.hints.filter((h) => h.level <= level).map((h) => {
      if (h.words) return `<div class="hint"><b>${h.label}</b>：${h.words.map(esc).join(' · ')}</div>`;
      if (h.pattern) return `<div class="hint"><b>${h.label}</b>：${esc(h.pattern)}</div>`;
      return `<div class="hint"><b>${h.label}</b>：${esc(h.full)} <span class="muted small">（照着说也能继续，但这句不算自己说出）</span></div>`;
    }).join('');
  }

  function renderSpeakBox(spec, optional) {
    const sub = S.run.sub;
    const maxHint = spec.hints.length;
    const id = 'say-' + actSeq;
    const send = act(() => {
      const el = document.getElementById(id);
      const text = el ? el.value : '';
      submit('simulated', text, false);
    });
    return `<div class="speak-box">
      ${renderHints(spec, sub.hint)}
      <div class="muted small">🎤 孩子开口说，说完把他说的话打在下面（模拟录音）</div>
      <textarea id="${id}" placeholder="例如他说的英文…" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn primary grow" data-act="${send}">说完了</button>
        <button class="btn sim" data-act="${act(() => submit('simulated', '', true))}">模拟：没听清</button>
      </div>
      <div class="row" style="margin-top:8px">
        ${sub.hint < maxHint ? `<button class="btn" data-act="${act(() => { sub.hint += 1; save(); render(); })}">💡 ${sub.hint === 0 ? '要一点提示' : '再多一点'}</button>` : ''}
        ${sub.hint >= maxHint ? `<button class="btn" data-act="${act(() => submit('click', '', false))}">点击继续（这句之后再练）</button>` : ''}
        ${optional ? `<button class="btn ghost" data-act="${act(() => { sub.awaiting = false; sub.done = true; afterOptionalSkip(); })}">先跳过这个问题</button>` : ''}
      </div>
    </div>`;
  }
  function afterOptionalSkip() {
    const st = stepAt(S.run.stepIndex);
    pushSys(S.run.sub, '跳过了追问，没关系。');
    if (st.type === 'court') S.run.sub.phase = 'result';
    save();
    render();
  }

  function renderSpeak(st) {
    const sub = S.run.sub;
    const spec = currentSpec();
    let tail = '';
    if (sub.awaiting) tail = renderSpeakBox(spec, sub.phase === 'follow' && st.followUp.optional);
    else tail = `<button class="btn primary block" style="margin-top:12px" data-act="${act(nextStep)}">继续</button>`;
    return renderChat(sub) + tail;
  }

  // ---------- 听队友 ----------
  function renderListen(st) {
    const sub = S.run.sub;
    const heardAll = st.messages.every((_, i) => sub.heard[i]);
    const msgs = st.messages.map((m, i) => {
      const c = char(m.from);
      const shown = !canSpeak || S.settings.subtitles || (sub.reveal && sub.reveal[i]);
      return `<div class="bubble"><div class="who"><span class="dot" style="background:${c.color}"></span>${esc(c.name)} · ${esc(c.role)} <span class="tag virtual">虚构角色</span></div>
        ${shown ? esc(m.text) : '<span class="hidden-text">语音消息</span>'}
        ${shown && sub.zh && sub.zh[i] ? `<div class="zh">${esc(m.textZh)}</div>` : ''}
        <div class="audio">
          ${canSpeak ? `<button data-act="${act(() => { say(m.text); sub.heard[i] = true; save(); render(); })}">▶ ${sub.heard[i] ? '再听' : '听'}</button>
          <button data-act="${act(() => { say(m.text, true); sub.heard[i] = true; save(); render(); })}">🐢 慢速</button>` : ''}
          ${shown ? `<button data-act="${act(() => toggle('zh', i))}">中文</button>` : `<button data-act="${act(() => { toggle('reveal', i); })}">字幕</button>`}
        </div></div>`;
    }).join('');
    const ready = heardAll || !canSpeak || (sub.reveal && Object.keys(sub.reveal).length);
    let check = '';
    if (ready) {
      check = `<div class="card"><b>${esc(st.check.question)}</b>
        <div class="row" style="margin-top:8px">${st.check.options.map((id) =>
          `<button class="btn grow" data-act="${act(() => answerCheck(st, id))}">${esc(char(id).name)}</button>`).join('')}</div>
        ${sub.checkMsg ? `<p class="muted">${esc(sub.checkMsg)}</p>` : ''}</div>`;
    } else {
      check = `<p class="muted">先听一听两位队友的语音消息。</p>`;
    }
    return `<p class="muted">队友给你发来了消息：</p><div class="chat">${msgs}</div>${check}`;
  }
  function answerCheck(st, id) {
    const sub = S.run.sub;
    if (id === st.check.answer) {
      S.learning[st.target] = E.markUnderstood(S.learning[st.target], st.target, Date.now());
      save();
      nextStep();
    } else {
      sub.checkMsg = st.check.wrongReply;
      save();
      render();
    }
  }

  // ---------- 球场 ----------
  const HOOP = [50, 8];
  function courtSvg(st, sub) {
    const P = st.positions;
    const pickable = sub.phase === 'choose';
    const ids = st.options.map((o) => o.id);
    const ballAt = sub.ballPos || P.me;
    const players = [
      ['me', P.me, '#ffd166', '你'],
      ['alex', P.alex, char('alex').color, 'A'],
      ['ben', P.ben, char('ben').color, 'B'],
      ['o1', P.o1, char('opponents').color, ''],
      ['o2', P.o2, char('opponents').color, ''],
      ['o3', P.o3, char('opponents').color, ''],
    ];
    const circles = players.map(([id, [x, y], color, label]) => {
      const canPick = pickable && ids.includes(id);
      const on = sub.chosen === id;
      return `<g class="player ${canPick && !on ? 'pick' : ''}" ${canPick ? `data-act="${act(() => choose(id))}"` : ''}>
        ${on ? `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#ff8a2a" stroke-width="1.2"/>` : ''}
        <circle cx="${x}" cy="${y}" r="4.6" fill="${color}" stroke="#0b1428" stroke-width=".6"/>
        <text x="${x}" y="${y + 1.5}" text-anchor="middle" font-size="4" font-weight="700" fill="#0b1428">${label}</text>
      </g>`;
    }).join('');
    return `<div class="court-wrap"><svg viewBox="0 0 100 80" role="img" aria-label="三对三半场">
      <rect x="2" y="2" width="96" height="76" fill="none" stroke="var(--court-line)" stroke-width=".6"/>
      <rect x="34" y="2" width="32" height="26" fill="rgba(255,255,255,.08)" stroke="var(--court-line)" stroke-width=".6"/>
      <path d="M8 2 L8 14 A42 42 0 0 0 92 14 L92 2" fill="none" stroke="var(--court-line)" stroke-width=".6"/>
      <circle cx="50" cy="28" r="8" fill="none" stroke="var(--court-line)" stroke-width=".6"/>
      <line x1="44" y1="5" x2="56" y2="5" stroke="#fff" stroke-width=".8"/>
      <circle cx="${HOOP[0]}" cy="${HOOP[1]}" r="2.6" fill="none" stroke="#ff5a1f" stroke-width=".9"/>
      ${circles}
      <g id="ball" style="transform: translate(${ballAt[0] + 3.5}px, ${ballAt[1] - 3.5}px)">
        <circle cx="0" cy="0" r="2" fill="#ff7a1a" stroke="#3a1a00" stroke-width=".4"/>
      </g>
    </svg></div>
    <div class="row muted small" style="margin-top:6px"><span>🟡 你</span><span>🔵 Alex</span><span>🟢 Ben</span><span>🔴 Red Hawks（电脑）</span></div>`;
  }
  function choose(id) { S.run.sub.chosen = id; save(); render(); }

  function renderCourt(st) {
    const sub = S.run.sub;
    let html = courtSvg(st, sub);
    if (sub.phase === 'choose') {
      html += `<p>${esc(st.situation)}</p><p class="muted small">先想好战术：点场上的队友，或点下面的选项。两种都说得通。</p>
        <div class="opts">${st.options.map((o) => `<button class="opt ${sub.chosen === o.id ? 'on' : ''}" data-act="${act(() => choose(o.id))}">
          <b>${esc(o.label)}</b><div class="why">${esc(o.why)}</div></button>`).join('')}</div>
        <button class="btn primary block" ${sub.chosen ? '' : 'disabled'} data-act="${act(() => {
          if (!sub.chosen) return;
          sub.phase = 'speak';
          pushLine(sub, 'coach', st.coachLine, st.coachLineZh);
          save(); render();
        })}">想好了，告诉队友</button>`;
      return html;
    }
    html += renderChat(sub);
    if (sub.phase === 'speak') {
      html += `<p class="muted small">用英语告诉队友你的计划。队友会照你说的做。</p>` + renderSpeakBox(st, false);
    } else if (sub.phase === 'action') {
      const opt = st.options.find((o) => o.id === sub.executed);
      html += `<div class="card"><b>${esc(st.action.label)}！</b> <span class="muted small">指针走到绿色区域时点按钮</span>
        <div class="timing"><div class="zone"></div><div class="zone core"></div><div class="marker" id="marker"></div></div>
        <button class="btn primary block" id="go-btn">${opt && opt.id === 'me' ? '投篮' : '传球'}</button></div>`;
    } else if (sub.phase === 'result') {
      html += `<div class="result-big">${esc(sub.outcome)}</div>
        <button class="btn primary block" data-act="${act(nextStep)}">继续</button>`;
    } else if (sub.phase === 'follow') {
      html += sub.awaiting ? renderSpeakBox(st.followUp, st.followUp.optional)
        : `<button class="btn primary block" style="margin-top:12px" data-act="${act(() => { sub.phase = 'result'; save(); render(); })}">继续</button>`;
    }
    return html;
  }

  // 操作手感小条
  let raf = null;
  function stopTiming() { if (raf) cancelAnimationFrame(raf); raf = null; }
  function startTiming() {
    const marker = document.getElementById('marker');
    const btn = document.getElementById('go-btn');
    if (!marker || !btn) return;
    const t0 = performance.now();
    let pos = 0;
    const loop = (t) => {
      const ph = ((t - t0) / 1500) % 2;
      pos = ph < 1 ? ph : 2 - ph;
      marker.style.left = (pos * 100) + '%';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    btn.addEventListener('click', () => { stopTiming(); btn.disabled = true; resolvePlay(E.timingGrade(pos)); });
  }
  function resolvePlay(grade) {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    const opt = st.options.find((o) => o.id === sub.executed);
    const P = st.positions;
    const paths = {
      ben_shoots: [P.ben, HOOP], alex_relay: [P.alex, P.ben, HOOP],
      alex_shoots: [P.alex, HOOP], me_shoots: [HOOP],
    };
    const path = paths[opt.result] || [HOOP];
    const outcome = E.playOutcome(grade);
    const ball = document.getElementById('ball');
    let i = 0;
    const stepBall = () => {
      if (i >= path.length) {
        S.run.score += outcome.score;
        const gradeZh = { great: '时机完美', good: '时机不错', miss: '时机偏了一点' }[grade];
        sub.outcome = `${gradeZh}。${outcome.text}`;
        sub.ballPos = null;
        if (st.followUp && sub.firstQuality === 'independent') { pushSys(sub, sub.outcome); startFollow(st); }
        else sub.phase = 'result';
        save();
        render();
        return;
      }
      const [x, y] = path[i++];
      if (ball) ball.style.transform = `translate(${x + (i === path.length ? 0 : 3.5)}px, ${y - (i === path.length ? 0 : 3.5)}px)`;
      setTimeout(stepBall, 500);
    };
    stepBall();
  }

  // ---------- 收尾 ----------
  function renderFeedback() {
    const runEv = S.evidence.filter((e) => e.runId === S.run.id);
    const fb = E.pickFeedback(runEv, LEVEL);
    return `<div class="card hero"><div class="who"><b>Coach Lee</b> <span class="tag virtual">虚构角色</span></div>
      <p>Good job today! 今天只说一个小建议：</p>
      <p style="font-size:17px">${esc(fb.text)}</p></div>
      <button class="btn primary block" data-act="${act(nextStep)}">好的</button>`;
  }

  function renderReward(st) {
    const rw = st.reward;
    const sub = S.run.sub;
    const already = !!S.game.rewards[rw.id];
    const cur = sub.jersey || S.game.jersey || { number: rw.numbers[0], color: rw.colors[0].id };
    sub.jersey = cur;
    const color = rw.colors.find((c) => c.id === cur.color) || rw.colors[0];
    return `<div class="card hero" style="text-align:center">
        <div class="chapter">${already ? '队服已领过 · 可以改号码和颜色' : '首关奖励'}</div>
        <h2>${esc(rw.label)}</h2>
        ${jerseySvg(color.hex, cur.number)}
      </div>
      <b>选号码</b>
      <div class="grid-pick">${rw.numbers.map((n) => `<button class="${cur.number === n ? 'on' : ''}" data-act="${act(() => { sub.jersey = Object.assign({}, cur, { number: n }); save(); render(); })}">${n}</button>`).join('')}</div>
      <b>选颜色</b>
      <div class="grid-pick">${rw.colors.map((c) => `<button class="${cur.color === c.id ? 'on' : ''}" data-act="${act(() => { sub.jersey = Object.assign({}, cur, { color: c.id }); save(); render(); })}"><span class="swatch" style="background:${c.hex}"></span>${esc(c.label)}</button>`).join('')}</div>
      <button class="btn primary block" style="margin-top:12px" data-act="${act(() => {
        const res = E.grantOnce(S.game, rw.id, Date.now());
        S.game = res.game;
        S.game.jersey = sub.jersey;
        S.run.rewardGranted = res.granted;
        nextStep();
      })}">${already ? '保存队服' : '领取队服，完成今天'}</button>`;
  }
  function jerseySvg(hex, num) {
    return `<svg viewBox="0 0 100 90" width="150" height="135" aria-label="队服">
      <path d="M30 8 L42 4 Q50 12 58 4 L70 8 L90 22 L80 36 L72 30 L72 86 L28 86 L28 30 L20 36 L10 22 Z" fill="${hex}" stroke="#fff" stroke-width="1.5"/>
      <text x="50" y="66" text-anchor="middle" font-size="30" font-weight="800" fill="#fff">${num}</text>
      <text x="50" y="30" text-anchor="middle" font-size="7" fill="#fff">${esc(S.team.name.toUpperCase())}</text>
    </svg>`;
  }

  function renderFinished() {
    const f = S.lastFinished || {};
    const p = S.progress[LEVEL.id] || {};
    return `<div class="page"><h1>今天完成啦 🏆</h1>
      <div class="card hero">
        <div class="stat-row">
          <div class="stat"><b>${f.plays || 0}</b><span>次沟通配合</span></div>
          <div class="stat"><b>${f.score || 0}</b><span>比分</span></div>
          <div class="stat"><b>${fmtMin(f.ms || 0)}</b><span>用时</span></div>
        </div>
        <p class="muted" style="margin-top:10px">${p.times > 1 ? '这是重玩：队服奖励只发一次，这次没有新增成果。' : '球队记住了你今天的表现。'}</p>
      </div>
      ${S.game.jersey ? `<div class="card" style="text-align:center">${jerseySvg(colorHex(S.game.jersey.color), S.game.jersey.number)}</div>` : ''}
      <p class="muted">过两天，Alex 和 Ben 会换位置，再看你能不能用今天的说法。</p>
      <button class="btn primary block" data-act="${act(() => go('growth'))}">看看成长</button>
    </div>`;
  }
  function colorHex(id) {
    const rw = LEVEL.steps.find((s) => s.type === 'reward').reward;
    return (rw.colors.find((c) => c.id === id) || rw.colors[0]).hex;
  }

  // ---------- 球队 ----------
  function renderTeam() {
    const skill = S.player.skill;
    const nameId = 'team-name';
    const members = [
      { name: '你（队长）', color: '#ffd166', role: skill ? `擅长${SKILL_ZH[skill] || skill}` : '还没介绍自己', num: S.game.jersey ? S.game.jersey.number : '?' },
      { name: 'Alex', color: char('alex').color, role: `${char('alex').role} · ${char('alex').trait}`, num: char('alex').number, virtual: true },
      { name: 'Ben', color: char('ben').color, role: `${char('ben').role} · ${char('ben').trait}`, num: char('ben').number, virtual: true },
    ];
    return `<div class="page"><h1>球队</h1>
      <div class="card">
        <b>队名</b>
        <div class="row" style="margin-top:6px"><input type="text" id="${nameId}" class="grow" value="${esc(S.team.name)}" maxlength="24">
        <button class="btn" data-act="${act(() => { const v = document.getElementById(nameId).value.trim(); if (v) { S.team.name = v; save(); render(); } })}">保存</button></div>
      </div>
      ${S.game.jersey ? `<div class="card" style="text-align:center">${jerseySvg(colorHex(S.game.jersey.color), S.game.jersey.number)}</div>`
        : '<div class="card muted">完成第一次训练赛后，可以选队服号码和颜色。</div>'}
      <h2>阵容（三对三）</h2>
      <div class="card roster">${members.map((m) => `<div class="member">
        <div class="avatar" style="background:${m.color}">${esc(m.num)}</div>
        <div><b>${esc(m.name)}</b> ${m.virtual ? '<span class="tag virtual">虚构电脑角色</span>' : ''}<div class="muted small">${esc(m.role)}</div></div>
      </div>`).join('')}</div>
      <div class="card"><b>对手：Red Hawks</b> <span class="tag virtual">电脑角色</span><div class="muted small">三名虚构对手，只在球场上出现。</div></div>
    </div>`;
  }

  // ---------- 成长 ----------
  function abilityStatus(targetId) {
    const s = S.learning[targetId];
    if (!s) return ['未开始', ''];
    if (s.spacedAt) return ['间隔后仍能用', 'ok'];
    if (s.independentAt) return ['独立能用', 'ok'];
    if (s.simulatedIndependentAt) return ['自己说出（模拟输入）', 'sim'];
    if (s.promptedAt) return ['提示后能说', 'hint'];
    if (s.lastResult === 'full_answer' || s.lastResult === 'click_continue') return ['看过答案，待再练', 'hint'];
    if (s.lastResult === 'keyword') return ['能说关键词', 'hint'];
    if (s.understoodAt) return ['听懂', ''];
    return ['练过', ''];
  }
  function renderGrowth() {
    const p = S.progress[LEVEL.id];
    return `<div class="page"><h1>成长</h1>
      <div class="card"><b>章节</b>
        <div class="ability"><span>第 1 天 · ${esc(LEVEL.title)}</span><span class="status ${p ? 'ok' : ''}">${p ? '已完成' : '未完成'}</span></div>
        <div class="ability muted"><span>第 2 天 · 约队友训练</span><span class="status">之后开放</span></div>
      </div>
      <div class="card"><b>能力</b>
        ${LEVEL.abilities.map((a) => {
          const [label, cls] = abilityStatus(a.target);
          const s = S.learning[a.target];
          return `<div class="ability"><div>${esc(a.label)}<div class="muted small">${esc(target(a.target).text)}${s && s.nextReviewAt ? ` · ${fmtDate(s.nextReviewAt)}再见` : ''}</div></div>
            <span class="status ${cls}">${label}</span></div>`;
        }).join('')}
      </div>
      <p class="muted small">成长只看能用什么说法，不换算成词汇量；游戏比分也不算进来。</p>
      <button class="btn ghost block" data-act="${act(() => go('parent'))}">家长入口</button>
    </div>`;
  }

  // ---------- 家长 ----------
  function renderParent() {
    const ev = S.evidence;
    const count = (r) => ev.filter((e) => e.result === r).length;
    const recent = ev.slice(-30).reverse();
    return `<div class="page"><h1>家长</h1>
      <div class="banner-sim">原型没有家长验证。正式版要由服务端校验家长身份，前端隐藏入口不算。</div>
      <div class="card"><b>参与情况</b>
        <div class="stat-row" style="margin-top:8px">
          <div class="stat"><b>${S.totals.runsDone}</b><span>完成次数</span></div>
          <div class="stat"><b>${fmtMin(S.totals.playMs)}</b><span>累计用时</span></div>
          <div class="stat"><b>${ev.length}</b><span>作答条数</span></div>
        </div></div>
      <div class="card"><b>表达与提示</b>
        <div class="stat-row" style="margin-top:8px">
          <div class="stat"><b>${count('independent')}</b><span>自己成句</span></div>
          <div class="stat"><b>${count('keyword')}</b><span>只说关键词</span></div>
          <div class="stat"><b>${count('with_hint')}</b><span>看提示后</span></div>
          <div class="stat"><b>${count('full_answer') + count('click_continue')}</b><span>看答案 / 点击</span></div>
          <div class="stat"><b>${count('asr_uncertain')}</b><span>没听清</span></div>
          <div class="stat"><b>${ev.filter((e) => e.spokenEvidence).length}</b><span>真实口语证据</span></div>
        </div>
        <p class="muted small">原型里都是模拟输入，「真实口语证据」会一直是 0，这是对的。</p></div>
      <div class="card"><b>最近作答</b>
        ${recent.length ? `<table><tr><th>说了什么</th><th>结果</th><th>提示</th><th>方式</th></tr>
          ${recent.map((e) => `<tr><td>${esc(e.text || '—')}<div class="muted">${esc(target(e.targetId) ? target(e.targetId).text : '')}</div></td>
            <td>${esc(RESULT_ZH[e.result] || e.result)}</td><td>${e.hintLevel ? ['', '关键词', '句型', '完整答案'][e.hintLevel] : '无'}</td>
            <td>${esc(MODE_ZH[e.inputMode] || e.inputMode)}</td></tr>`).join('')}</table>` : '<p class="muted">还没有作答。</p>'}
      </div>
      <div class="card"><b>设置</b>
        <label class="switch"><span>字幕默认打开<div class="muted small">关着时先听，想看再点「字幕」</div></span>
          <input type="checkbox" ${S.settings.subtitles ? 'checked' : ''} data-change="${act((el) => { S.settings.subtitles = el.checked; save(); })}"></label>
        <label class="switch"><span>录音保留<div class="muted small">原型不录音。正式版默认处理后删除，只保留你们主动选的片段。</div></span><span class="muted">—</span></label>
        <button class="btn block" style="margin-top:8px" data-act="${act(() => {
          if (resetArmed) { resetArmed = false; S = fresh(); save(); view = 'today'; render(); }
          else { resetArmed = true; render(); }
        })}">${resetArmed ? '再点一次，确认清空这台设备上的原型数据' : '清空原型数据'}</button>
      </div>
    </div>`;
  }

  // ---------- 启动 ----------
  if (canSpeak) { try { speechSynthesis.getVoices(); } catch (e) { /* 忽略 */ } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { tickTime(); save(); } else if (view === 'play') resumedAt = Date.now(); });
  render();
})();
