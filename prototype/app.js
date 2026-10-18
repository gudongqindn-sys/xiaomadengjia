// 首关交互原型（阶段一）。
// 语音输入是模拟的：孩子说的话由孩子或家长打字输入，记录里一律标 simulated，不算真实口语证据。
// 角色台词播预先生成的配音（scripts/gen_voices.py），缺的退回浏览器自带合成声音。
(function () {
  'use strict';

  const E = window.BBEngine;
  const LEVEL = window.LEVEL_DATA;
  const VOICE = window.VOICE_SRC || {};
  const Art = window.Art;
  const Sfx = window.Sfx;
  const Fx = window.Fx;
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
  const ASR_LINE = "Sorry, I didn't catch that. Can you say it again?";

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
      settings: { subtitles: false, minutes: 12, sound: true },
      totals: { playMs: 0, runsDone: 0 },
      run: null,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.version !== 1) return null;
      const f = fresh();
      return Object.assign(f, s, { settings: Object.assign(f.settings, s.settings) });
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 隐私模式等，不保存 */ }
  }
  let S = load() || fresh();
  let view = 'today';
  Sfx.setEnabled(S.settings.sound);

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
  function fmtDate(t) { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; }
  function char(id) { return LEVEL.characters[id] || { name: id === 'me' ? '你' : id }; }
  function stepAt(i) { return LEVEL.steps[i]; }
  function target(id) { return LEVEL.targets.find((t) => t.id === id); }
  function rewardSpec() { return LEVEL.steps.find((s) => s.type === 'reward').reward; }
  function jerseyHex(id) { const rw = rewardSpec(); return (rw.colors.find((c) => c.id === id) || rw.colors[0]).hex; }
  function myLook() {
    const j = S.game.jersey;
    return j ? { jersey: jerseyHex(j.color), num: j.number } : {};
  }
  function face(id, cls) { return Art.face(id, id === 'me' ? myLook() : null, cls); }

  // ---------- 配音 ----------
  const canSynth = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  let voiceEl = null;
  let talkingWho = null;
  function setTalking(who) {
    talkingWho = who;
    app.querySelectorAll('.line.cur .face').forEach((f) => f.classList.toggle('talking', !!who && f.getAttribute('data-who') === who));
  }
  function hasVoice(who, text) { return !!VOICE[who + '|' + text] || canSynth; }
  function say(text, slow, who) {
    const src = VOICE[who + '|' + text];
    if (src) {
      try {
        if (!voiceEl) {
          voiceEl = new Audio();
          voiceEl.addEventListener('ended', () => setTalking(null));
          voiceEl.addEventListener('pause', () => setTalking(null));
        }
        voiceEl.pause();
        voiceEl.src = src;
        voiceEl.playbackRate = slow ? 0.72 : 1;
        const p = voiceEl.play();
        setTalking(who);
        if (p && p.catch) p.catch(() => setTalking(null));
        return;
      } catch (e) { /* 退回合成声音 */ }
    }
    if (!canSynth) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = slow ? 0.65 : 0.92;
      const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang));
      if (v) u.voice = v;
      u.onend = () => setTalking(null);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTalking(who);
    } catch (e) { /* 没有声音就只看字幕 */ }
  }

  // ---------- 一局的状态 ----------
  function startRun() {
    Sfx.unlock();
    S.run = {
      id: 'run' + Date.now(), levelId: LEVEL.id, stepIndex: 0, startedAt: Date.now(),
      playMs: 0, score: 0, opp: 0, plays: 0, sub: null,
    };
    enterStep();
  }
  function enterStep() {
    const st = stepAt(S.run.stepIndex);
    const prev = stepAt(S.run.stepIndex - 1);
    S.run.sub = { phase: st.type === 'court' ? 'choose' : 'main', hint: 0, log: [], awaiting: true, done: false };
    const sub = S.run.sub;
    if (!prev || prev.chapter !== st.chapter) {
      Fx.splash(st.chapterEn || st.chapter, st.chapter);
      if (st.type === 'court') Sfx.whistle();
    }
    if (st.type === 'court' && prev && prev.type === 'court') {
      sub.fromPositions = prev.positions;
      if (!S.run.opp) S.run.opp = 2; // 暂停前对手得了 2 分
    }
    if (st.type === 'speak') pushLine(sub, st.speaker, st.line, st.lineZh, 900);
    if (st.type === 'court') pushSys(sub, st.situation);
    if (st.type === 'listen') sub.heard = {};
    save();
  }
  function nextStep() {
    S.run.stepIndex += 1;
    if (S.run.stepIndex >= LEVEL.steps.length) return finishRun();
    enterStep();
    render();
    window.scrollTo(0, 0);
  }
  function finishRun() {
    tickTime();
    const r = S.run;
    S.progress[LEVEL.id] = {
      status: 'done', completedAt: Date.now(), lastScore: r.score, lastPlays: r.plays,
      lastMs: r.playMs, times: ((S.progress[LEVEL.id] || {}).times || 0) + 1,
    };
    S.totals.runsDone += 1;
    S.lastFinished = { score: r.score, opp: r.opp, plays: r.plays, ms: r.playMs, granted: r.rewardGranted };
    S.run = null;
    save();
    view = 'finished';
    render();
    Sfx.fanfare();
    Fx.confetti(2200);
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
  function pushLine(sub, who, text, zh, delay) {
    sub.log.push({ who, text, zh });
    if (who !== 'me') {
      if (delay) setTimeout(() => say(text, false, who), delay);
      else say(text, false, who);
    }
  }
  function pushSys(sub, text) { sub.log.push({ who: 'sys', text }); }

  // ---------- 作答 ----------
  function currentSpec() {
    const st = stepAt(S.run.stepIndex);
    return S.run.sub.phase === 'follow' ? st.followUp : st;
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
    const host = st.type === 'court' ? 'coach' : st.speaker;

    if (ev.result === 'asr_uncertain') {
      Sfx.boop();
      pushLine(sub, host, ASR_LINE, '抱歉，没听清。能再说一遍吗？（不算你说错）');
      return afterAnswer();
    }
    if (ev.result === 'empty') { pushSys(sub, '还没有内容，先说一句再点「说完了」。'); return afterAnswer(); }
    if (!E.advancesStory(ev.result)) {
      Sfx.boop();
      pushLine(sub, host, match.reply);
      return afterAnswer();
    }

    // 剧情推进：意思清楚、看提示、看答案、点击继续都推进；只是学习记录不同
    let intent = match ? match.intent : null;
    if (mode === 'click') {
      intent = st.type === 'court' && sub.phase === 'speak'
        ? (spec.intents.find((i) => i.option === sub.chosen) || spec.intents[0])
        : spec.intents[0];
    }
    if (match && match.slots && match.slots.skill && sub.phase !== 'follow') S.player.skill = match.slots.skill;
    if (st.type === 'speak' && sub.phase === 'main' && intent.slot && !S.player.skill) S.player.skill = intent.slot.default;

    if (ev.result === 'independent') Sfx.ding(); else Sfx.tap();
    const replyWho = intent.speaker || host;
    const reply = (ev.result === 'keyword' || (match && match.quality === 'partial')) && intent.replyKeyword
      ? intent.replyKeyword : intent.reply;
    if (mode === 'click') pushSys(sub, '剧情继续（这一句没有算作口语练习，之后会再练）');

    if (st.type === 'court' && sub.phase === 'speak') {
      sub.executed = intent.option;
      pushLine(sub, replyWho, fill(reply, vars()));
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

    pushLine(sub, replyWho, fill(reply, vars()));
    // 成句、没看提示，才进追问（挑战层）；其余直接收尾
    if (sub.phase === 'main' && st.followUp && st.followUp.when === 'sentence' && ev.result === 'independent') {
      startFollow(st, 1800);
    } else {
      sub.awaiting = false;
      sub.done = true;
    }
    afterAnswer();
  }
  function startFollow(st, delay) {
    const sub = S.run.sub;
    sub.phase = 'follow';
    sub.hint = 0;
    sub.awaiting = true;
    sub.done = false;
    const v = vars();
    pushLine(sub, st.type === 'court' ? 'coach' : st.speaker, fill(st.followUp.line, v), fill(st.followUp.lineZh, v), delay);
  }
  function afterAnswer() { save(); render(); }

  // ---------- 渲染：外壳 ----------
  let resetArmed = false;
  function render() {
    acts = {};
    if (view !== 'parent') resetArmed = false;
    stopMeter();
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
      if (fn) el.addEventListener('click', (e) => { e.preventDefault(); if (el.classList.contains('btn') || el.classList.contains('opt')) Sfx.tap(); fn(el, e); });
    });
    app.querySelectorAll('[data-change]').forEach((el) => {
      const fn = acts[el.getAttribute('data-change')];
      if (fn) el.addEventListener('change', () => fn(el));
    });
    if (talkingWho) setTalking(talkingWho);
    if (view === 'play' && S.run) afterPlayRender();
  }
  function go(v) { tickTime(); view = v; if (v === 'play' && S.run) resumedAt = Date.now(); render(); window.scrollTo(0, 0); }

  function renderNav() {
    const items = [['today', 'ball', '今日'], ['team', 'shirt', '球队'], ['growth', 'chart', '成长']];
    return `<nav class="tabbar">${items.map(([k, ico, label]) =>
      `<button class="${view === k || (k === 'growth' && view === 'parent') || (k === 'today' && view === 'finished') ? 'on' : ''}" data-act="${act(() => go(k))}">${Art.ICONS[ico]}${label}</button>`
    ).join('')}</nav>`;
  }

  // ---------- 今日 ----------
  function renderToday() {
    const p = S.progress[LEVEL.id];
    const r = S.run;
    const total = LEVEL.steps.length;
    let main;
    if (r) {
      main = `<p class="muted" style="margin-bottom:10px">上次停在第 ${r.stepIndex + 1}/${total} 段：${esc(stepAt(r.stepIndex).chapter)}</p>
        <button class="btn go big block" data-act="${act(() => go('play'))}">继续上次进度</button>`;
    } else if (p && p.status === 'done') {
      main = `<p style="margin-bottom:10px"><b>今天的任务完成了</b> <span class="muted">${fmtDate(p.completedAt)}</span></p>
        <button class="btn block" data-act="${act(() => { startRun(); go('play'); })}">再玩一次（不会重复发奖励）</button>`;
    } else {
      main = `<button class="btn go big block" data-act="${act(() => { startRun(); go('play'); })}">开始比赛</button>`;
    }
    return `<div class="page">
      <div class="badge-hero">${Art.badge(S.team.name, S.game.jersey ? jerseyHex(S.game.jersey.color) : null)}
        <div><div class="team">${esc(S.team.name)}</div><div class="on-sky small">你是队长 · 三对三</div></div></div>
      <div class="panel mission">
        <span class="stamp">${p && p.status === 'done' ? 'CLEAR!' : 'TODAY'}</span>
        <div class="day">DAY 1 · ${esc(LEVEL.scene)}</div>
        <div class="name">${esc(LEVEL.title)}</div>
        <p class="muted" style="margin-bottom:12px">${esc(LEVEL.goal)}。约 ${LEVEL.estimatedMinutes} 分钟，随时能离开，进度会保存。</p>
        ${main}
      </div>
      <div class="panel soft">
        <h3>YOUR SQUAD</h3>
        <div class="squad">
          <div class="m">${face('me')}你</div>
          <div class="m">${face('alex')}Alex<span class="muted small">擅长传球</span></div>
          <div class="m">${face('ben')}Ben<span class="muted small">擅长投篮</span></div>
          <div class="m">${Art.face('hawk')}<span class="chip cpu">对手·电脑</span></div>
        </div>
      </div>
      <div class="sim-note">原型版：孩子开口说完，把他说的话打进输入框。这样的记录不算真实口语。</div>
    </div>`;
  }

  // ---------- 一局 ----------
  function renderPlay() {
    const r = S.run;
    const st = stepAt(r.stepIndex);
    const chapters = [];
    for (const s of LEVEL.steps) if (!chapters.includes(s.chapter)) chapters.push(s.chapter);
    const ci = chapters.indexOf(st.chapter);
    const head = `<div class="hud">
        <button class="icon-btn" aria-label="先离开" title="先离开，进度会保存" data-act="${act(() => { save(); go('today'); })}">${Art.ICONS.pause}</button>
        <div class="score">
          <div class="side us">SPARKS <b>${r.score}</b></div>
          <div class="mid">Q1</div>
          <div class="side them"><b>${r.opp}</b> HAWKS</div>
        </div>
        <button class="icon-btn" aria-label="音效开关" data-act="${act(() => { S.settings.sound = !S.settings.sound; Sfx.setEnabled(S.settings.sound); save(); render(); })}">${S.settings.sound ? Art.ICONS.sound : Art.ICONS.mute}</button>
      </div>
      <div class="steps">${chapters.map((_, i) => `<i class="${i < ci ? 'done' : i === ci ? 'now' : ''}"></i>`).join('')}</div>
      <div class="chapter-tag">${esc(st.chapterEn || '')}<small>${esc(st.chapter)}</small></div>`;
    let body = '';
    if (st.type === 'speak') body = renderSpeak(st);
    else if (st.type === 'listen') body = renderListen(st);
    else if (st.type === 'court') body = renderCourt(st);
    else if (st.type === 'feedback') body = renderFeedback();
    else if (st.type === 'reward') body = renderReward(st);
    return `<div class="page play">${head}${body}</div>`;
  }

  function lastNpcIndex(log) {
    for (let i = log.length - 1; i >= 0; i--) if (log[i].who !== 'me' && log[i].who !== 'sys') return i;
    return -1;
  }
  function renderLine(m, i, cur) {
    if (m.who === 'sys') return `<div class="sysline">${esc(m.text)}</div>`;
    if (m.who === 'me') {
      return `<div class="line me ${cur ? '' : 'old'}"><div class="pic">${face('me')}</div>
        <div class="bub"><div class="who">YOU <span class="chip sim">模拟语音</span></div>${esc(m.text)}</div></div>`;
    }
    const c = char(m.who);
    const sub = S.run.sub;
    const shown = !hasVoice(m.who, m.text) || S.settings.subtitles || (sub.reveal && sub.reveal[i]) || !cur;
    const content = shown ? esc(m.text) : `<span class="wave">${'<i></i>'.repeat(9)}</span>`;
    return `<div class="line ${cur ? 'cur' : 'old'}"><div class="pic">${face(m.who)}</div>
      <div class="bub"><div class="who">${esc(c.name.toUpperCase())} ${cur ? '<span class="chip cpu">虚构角色</span>' : ''}</div>
      <div>${content}</div>
      ${shown && cur && m.zh && sub.zh && sub.zh[i] ? `<div class="zh">${esc(m.zh)}</div>` : ''}
      ${cur ? `<div class="tools">
        <button data-act="${act(() => say(m.text, false, m.who))}">▶ 再听</button>
        <button data-act="${act(() => say(m.text, true, m.who))}">慢速</button>
        ${shown ? (m.zh ? `<button data-act="${act(() => toggle('zh', i))}">中文</button>` : '') : `<button data-act="${act(() => toggle('reveal', i))}">字幕</button>`}
      </div>` : ''}</div></div>`;
  }
  function renderTalk(sub) {
    const cur = lastNpcIndex(sub.log);
    // 只留最近几句，旧的淡一点
    const start = Math.max(0, sub.log.length - 5);
    return `<div class="talk">${sub.log.slice(start).map((m, k) => renderLine(m, start + k, start + k === cur || (m.who === 'me' && start + k > cur))).join('')}</div>`;
  }
  function toggle(key, i) {
    const sub = S.run.sub;
    sub[key] = sub[key] || {};
    sub[key][i] = !sub[key][i];
    save();
    render();
  }

  function renderHints(spec, level) {
    return spec.hints.filter((h) => h.level <= level).map((h) => {
      if (h.words) return `<div class="hint"><b>KEY WORDS</b>${h.words.map(esc).join(' · ')}</div>`;
      if (h.pattern) return `<div class="hint"><b>PATTERN</b>${esc(h.pattern)}</div>`;
      return `<div class="hint"><b>ANSWER</b>${esc(h.full)}<span class="note">照着说也能继续，但这句不算自己说出</span></div>`;
    }).join('');
  }

  function renderMic(spec, optional) {
    const sub = S.run.sub;
    const maxHint = spec.hints.length;
    const id = 'say-box';
    const send = act(() => {
      const el = document.getElementById(id);
      submit('simulated', el ? el.value : '', false);
    });
    return `<div class="mic-panel">
      <div class="head"><span class="dot"></span>YOUR TURN <span class="chip sim">模拟录音</span></div>
      ${renderHints(spec, sub.hint)}
      <textarea id="${id}" placeholder="开口说，说完把说的英文打在这里" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <button class="btn go block" data-act="${send}">说完了</button>
      <div class="row">
        ${sub.hint < maxHint ? `<button class="btn slim" data-act="${act(() => { sub.hint += 1; Sfx.hint(); save(); render(); })}">${sub.hint === 0 ? '要一点提示' : '再多一点'}</button>` : ''}
        ${sub.hint >= maxHint ? `<button class="btn slim" data-act="${act(() => submit('click', '', false))}">点击继续（这句之后再练）</button>` : ''}
        <button class="btn sim" data-act="${act(() => submit('simulated', '', true))}">模拟：没听清</button>
        ${optional ? `<button class="btn slim" data-act="${act(skipOptional)}">先跳过这个问题</button>` : ''}
      </div>
    </div>`;
  }
  function skipOptional() {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    sub.awaiting = false;
    sub.done = true;
    pushSys(sub, '跳过了追问，没关系。');
    if (st.type === 'court') sub.phase = 'result';
    save();
    render();
  }

  function renderSpeak(st) {
    const sub = S.run.sub;
    const spec = currentSpec();
    const tail = sub.awaiting
      ? renderMic(spec, sub.phase === 'follow' && st.followUp.optional)
      : `<button class="btn go block" data-act="${act(nextStep)}">继续</button>`;
    return renderTalk(sub) + tail;
  }

  // ---------- 听队友 ----------
  function renderListen(st) {
    const sub = S.run.sub;
    const heardAll = st.messages.every((_, i) => sub.heard[i]);
    const msgs = st.messages.map((m, i) => {
      const c = char(m.from);
      const shown = !hasVoice(m.from, m.text) || S.settings.subtitles || (sub.reveal && sub.reveal[i]);
      return `<div class="line cur"><div class="pic">${face(m.from)}</div>
        <div class="bub"><div class="who">${esc(c.name.toUpperCase())} <span class="chip">${esc(c.role)}</span></div>
        <div>${shown ? esc(m.text) : `<span class="wave">${'<i></i>'.repeat(9)}</span>`}</div>
        ${shown && sub.zh && sub.zh[i] ? `<div class="zh">${esc(m.textZh)}</div>` : ''}
        <div class="tools">
          <button data-act="${act(() => { say(m.text, false, m.from); sub.heard[i] = true; save(); render(); })}">▶ ${sub.heard[i] ? '再听' : '听语音'}</button>
          <button data-act="${act(() => { say(m.text, true, m.from); sub.heard[i] = true; save(); render(); })}">慢速</button>
          ${shown ? `<button data-act="${act(() => toggle('zh', i))}">中文</button>` : `<button data-act="${act(() => toggle('reveal', i))}">字幕</button>`}
        </div></div></div>`;
    }).join('');
    const ready = heardAll || st.messages.every((m) => !hasVoice(m.from, m.text)) || (sub.reveal && Object.keys(sub.reveal).length);
    const check = ready
      ? `<div class="panel"><h3>QUICK CHECK</h3><p style="font-weight:800;margin-bottom:10px">${esc(st.check.question)}</p>
          <div class="opts">${st.check.options.map((id) =>
            `<button class="opt" style="align-items:center" data-act="${act(() => answerCheck(st, id))}">${face(id)}<b>${esc(char(id).name)}</b></button>`).join('')}</div>
          ${sub.checkMsg ? `<p class="muted" style="margin-top:8px">${esc(sub.checkMsg)}</p>` : ''}</div>`
      : `<div class="sysline">先点「听语音」，听听两位队友说了什么</div>`;
    return `<div class="situation">队友给你发来了语音消息：</div><div class="talk">${msgs}</div>${check}`;
  }
  function answerCheck(st, id) {
    const sub = S.run.sub;
    if (id === st.check.answer) {
      Sfx.ding();
      S.learning[st.target] = E.markUnderstood(S.learning[st.target], st.target, Date.now());
      save();
      nextStep();
    } else {
      Sfx.boop();
      sub.checkMsg = st.check.wrongReply;
      save();
      render();
    }
  }

  // ---------- 球场 ----------
  const HOOP = [50, 9];
  function tr(p, s) { return `translate(${p[0]}px, ${p[1]}px)${s ? ` scale(${s})` : ''}`; }
  function courtSvg(st, sub) {
    const P = sub.fromPositions || st.positions;
    const pickable = sub.phase === 'choose';
    const ids = st.options.map((o) => o.id);
    const players = [['me', 'me'], ['alex', 'alex'], ['ben', 'ben'], ['o1', 'hawk'], ['o2', 'hawk'], ['o3', 'hawk']];
    const toks = players.map(([pid, look]) => {
      const canPick = pickable && ids.includes(pid);
      const ring = canPick || sub.chosen === pid;
      const opts = Object.assign({ key: pid }, pid === 'me' ? myLook() : {});
      const label = pid === 'me' ? 'YOU' : pid === 'alex' ? 'ALEX' : pid === 'ben' ? 'BEN' : '';
      return `<g class="tok ${canPick ? 'pick' : ''}" data-pid="${pid}" style="transform:${tr(P[pid])}" ${canPick ? `data-act="${act(() => choose(pid))}"` : ''}>
        ${Art.token(look, opts, ring)}
        ${label ? `<text y="12.4" text-anchor="middle" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="4.2" fill="#fff" stroke="#18173a" stroke-width="1.2" paint-order="stroke">${label}</text>` : ''}
      </g>`;
    }).join('');
    let planks = '';
    for (let x = 0; x < 100; x += 8) planks += `<line x1="${x}" y1="0" x2="${x}" y2="80" stroke="var(--wood-line)" stroke-width=".5"/>`;
    return `<div class="court" id="court"><svg viewBox="0 0 100 80" role="img" aria-label="三对三半场">
      <rect width="100" height="80" fill="var(--wood)"/>${planks}
      <rect x="33" y="0" width="34" height="27" fill="#2d4bd8" opacity=".85" stroke="#fff" stroke-width=".8"/>
      <circle cx="50" cy="27" r="9" fill="none" stroke="#fff" stroke-width=".8"/>
      <path d="M7 0 L7 13 A43 43 0 0 0 93 13 L93 0" fill="none" stroke="#fff" stroke-width=".8"/>
      <circle cx="50" cy="80" r="11" fill="#ff7a1a" opacity=".6" stroke="#fff" stroke-width=".8"/>
      <rect x="41" y="2" width="18" height="2.2" rx="1" fill="#fff" stroke="#18173a" stroke-width=".5"/>
      <circle cx="${HOOP[0]}" cy="${HOOP[1]}" r="3.2" fill="none" stroke="#ff4d1a" stroke-width="1.2"/>
      <path d="M47 9.5 L48.5 13 M50 9.8 L50 13.4 M53 9.5 L51.5 13" stroke="#fff" stroke-width=".4"/>
      ${toks}
      <g id="ball" style="transform:${tr(sub.ballPos || [P.me[0] + 4, P.me[1] - 4])}">
        <circle r="2.8" fill="#ff7a1a" stroke="#18173a" stroke-width=".7"/>
        <path d="M-2.8 0 H2.8 M0 -2.8 V2.8" stroke="#18173a" stroke-width=".4"/>
      </g>
    </svg></div>
    <div class="legend"><span><i style="background:#ff7a1a"></i>你</span><span><i style="background:#2d8cff"></i>Alex</span><span><i style="background:#31d17c"></i>Ben</span><span><i style="background:#ff4d5e"></i>Red Hawks（电脑）</span></div>`;
  }
  function choose(id) { S.run.sub.chosen = id; save(); render(); }

  function renderCourt(st) {
    const sub = S.run.sub;
    let html = courtSvg(st, sub);
    if (sub.phase === 'choose') {
      html += `<div class="situation">${esc(st.situation)}</div>
        <div class="sysline">先定战术：点场上发光的人，或点下面的卡片。两种都说得通。</div>
        <div class="opts">${st.options.map((o) => `<button class="opt ${sub.chosen === o.id ? 'on' : ''}" data-act="${act(() => choose(o.id))}">
          <b>${esc(o.label)}</b><span class="why">${esc(o.why)}</span></button>`).join('')}</div>
        <button class="btn go block" ${sub.chosen ? '' : 'disabled'} data-act="${act(() => {
          if (!sub.chosen) return;
          sub.phase = 'speak';
          pushLine(sub, 'coach', st.coachLine, st.coachLineZh);
          save(); render();
        })}">想好了，告诉队友</button>`;
      return html;
    }
    html += renderTalk(sub);
    if (sub.phase === 'speak') {
      html += renderMic(st, false);
    } else if (sub.phase === 'action') {
      const shoot = sub.executed === 'me';
      html += `<div class="panel meter-panel"><h3>${shoot ? 'SHOOT!' : 'PASS!'} <span class="muted small" style="font-family:var(--body)">指针到绿色时按</span></h3>
        <div class="meter"><div class="marker" id="marker"></div></div>
        <button class="shoot-btn" id="go-btn">${shoot ? 'SHOOT' : 'PASS'}</button></div>`;
    } else if (sub.phase === 'result') {
      html += `<div class="panel result-card"><div class="big">${esc(sub.outcomeTitle || '')}</div><p>${esc(sub.outcome)}</p></div>
        <button class="btn go block" data-act="${act(nextStep)}">继续</button>`;
    } else if (sub.phase === 'follow') {
      html += sub.awaiting ? renderMic(st.followUp, st.followUp.optional)
        : `<button class="btn go block" data-act="${act(() => { sub.phase = 'result'; save(); render(); })}">继续</button>`;
    } else if (sub.phase === 'flying') {
      html += `<div class="sysline">球在空中……</div>`;
    }
    return html;
  }

  function afterPlayRender() {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    if (st.type === 'court' && sub.fromPositions) {
      delete sub.fromPositions;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        app.querySelectorAll('.tok').forEach((g) => { g.style.transform = tr(st.positions[g.getAttribute('data-pid')]); });
        const ball = document.getElementById('ball');
        if (ball) ball.style.transform = tr([st.positions.me[0] + 4, st.positions.me[1] - 4]);
      }));
    }
    if (st.type === 'court' && sub.phase === 'action') startMeter();
  }

  // 出手力度条
  let raf = null;
  function stopMeter() { if (raf) cancelAnimationFrame(raf); raf = null; }
  function startMeter() {
    const marker = document.getElementById('marker');
    const btn = document.getElementById('go-btn');
    if (!marker || !btn) return;
    const t0 = performance.now();
    let pos = 0;
    const loop = (t) => {
      const ph = ((t - t0) / 1300) % 2;
      pos = ph < 1 ? ph : 2 - ph;
      marker.style.left = (pos * 100) + '%';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    btn.addEventListener('click', () => { stopMeter(); btn.disabled = true; resolvePlay(E.timingGrade(pos)); });
  }
  function flyBall(points, done) {
    const ball = document.getElementById('ball');
    const frames = [{ transform: tr(points[0], 1) }];
    let prev = points[0];
    for (const p of points.slice(1)) {
      frames.push({ transform: tr([(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2 - 9], 1.8) });
      frames.push({ transform: tr(p, 1) });
      prev = p;
    }
    if (ball && typeof ball.animate === 'function') {
      Sfx.whoosh();
      const an = ball.animate(frames, { duration: (points.length - 1) * 620, easing: 'ease-in-out', fill: 'forwards' });
      an.onfinish = done;
    } else {
      setTimeout(done, 60);
    }
  }
  function resolvePlay(grade) {
    const st = stepAt(S.run.stepIndex);
    const sub = S.run.sub;
    const opt = st.options.find((o) => o.id === sub.executed);
    const P = st.positions;
    const off = (p) => [p[0] + 4, p[1] - 4];
    const paths = {
      ben_shoots: [off(P.me), off(P.ben), HOOP], alex_relay: [off(P.me), off(P.alex), off(P.ben), HOOP],
      alex_shoots: [off(P.me), off(P.alex), HOOP], me_shoots: [off(P.me), HOOP],
    };
    const outcome = E.playOutcome(grade);
    sub.phase = 'flying';
    save();
    flyBall(paths[opt.result] || [off(P.me), HOOP], () => {
      S.run.score += outcome.score;
      // 进了球落在篮下，没进弹到篮筐边
      sub.ballPos = outcome.score ? [HOOP[0], HOOP[1] + 7] : [HOOP[0] + 9, HOOP[1] + 9];
      const gradeZh = { great: '时机完美', good: '时机不错', miss: '时机偏了一点' }[grade];
      sub.outcome = `${gradeZh}。${outcome.text}`;
      sub.outcomeTitle = outcome.score ? (grade === 'great' ? 'SWISH!' : 'SCORE!') : 'SO CLOSE!';
      if (outcome.score) {
        Sfx.swish(); setTimeout(() => Sfx.cheer(), 150);
        Fx.banner(sub.outcomeTitle, '+' + outcome.score); Fx.confetti(1500);
      } else {
        Sfx.clank();
        Fx.banner('CLANK!', '差一点', '#ffffff');
        const c = document.getElementById('court'); if (c) c.classList.add('shake');
      }
      if (st.followUp && sub.firstQuality === 'independent') { pushSys(sub, sub.outcome); startFollow(st, 1500); }
      else sub.phase = 'result';
      save();
      setTimeout(render, outcome.score ? 900 : 600);
    });
  }

  // ---------- 收尾 ----------
  function renderFeedback() {
    const runEv = S.evidence.filter((e) => e.runId === S.run.id);
    const fb = E.pickFeedback(runEv, LEVEL);
    return `<div class="talk"><div class="line cur"><div class="pic">${face('coach')}</div>
      <div class="bub"><div class="who">COACH LEE</div><div>Good job today! 今天只说一个小建议：</div></div></div></div>
      <div class="panel"><h3>COACH'S TIP</h3><p style="font-size:17px;font-weight:700">${esc(fb.text)}</p></div>
      <button class="btn go block" data-act="${act(nextStep)}">好的</button>`;
  }

  function renderReward(st) {
    const rw = st.reward;
    const sub = S.run.sub;
    const already = !!S.game.rewards[rw.id];
    const cur = sub.jersey || S.game.jersey || { number: rw.numbers[0], color: rw.colors[0].id };
    sub.jersey = cur;
    return `<div class="panel" style="text-align:center">
        <h3>${already ? '改一改队服' : 'NEW JERSEY!'}</h3>
        <div class="reward-stage"><div class="rays"></div>${Art.jersey(jerseyHex(cur.color), cur.number, S.team.name)}</div>
        <p class="muted">${already ? '队服已经领过，可以改号码和颜色，不再新增成果' : esc(rw.label) + '：选你的号码和颜色'}</p>
      </div>
      <div class="panel"><h3>NUMBER</h3>
        <div class="pick-grid">${rw.numbers.map((n) => `<button class="${cur.number === n ? 'on' : ''}" data-act="${act(() => { Sfx.tap(); sub.jersey = Object.assign({}, cur, { number: n }); save(); render(); })}">${n}</button>`).join('')}</div>
        <h3 style="margin-top:12px">COLOR</h3>
        <div class="pick-grid">${rw.colors.map((c) => `<button class="${cur.color === c.id ? 'on' : ''}" data-act="${act(() => { Sfx.tap(); sub.jersey = Object.assign({}, cur, { color: c.id }); save(); render(); })}"><span class="sw" style="background:${c.hex}"></span><span class="lbl">${esc(c.label)}</span></button>`).join('')}</div>
      </div>
      <button class="btn go big block" data-act="${act(() => {
        const res = E.grantOnce(S.game, rw.id, Date.now());
        S.game = res.game;
        S.game.jersey = sub.jersey;
        S.run.rewardGranted = res.granted;
        nextStep();
      })}">${already ? '保存队服' : '领取队服'}</button>`;
  }

  function renderFinished() {
    const f = S.lastFinished || {};
    const p = S.progress[LEVEL.id] || {};
    const title = f.score > f.opp ? 'YOU WIN!' : f.score === f.opp ? 'TIE GAME!' : 'NICE TRY!';
    return `<div class="page">
      <div class="page-title" style="text-align:center">${title}</div>
      <div class="panel">
        <div class="score" style="margin-bottom:12px"><div class="side us">SPARKS <b>${f.score || 0}</b></div><div class="mid">FINAL</div><div class="side them"><b>${f.opp || 0}</b> HAWKS</div></div>
        <div class="stats">
          <div class="stat"><b>${f.plays || 0}</b><span>次沟通配合</span></div>
          <div class="stat"><b>${Math.max(1, Math.round((f.ms || 0) / 60000))}</b><span>分钟</span></div>
          <div class="stat"><b>${p.times || 1}</b><span>第几次玩</span></div>
        </div>
        <p class="muted" style="margin-top:10px">${f.granted === false ? '这是重玩：队服奖励只发一次，这次没有新增成果。' : '球队记住了你今天的表现。'}</p>
      </div>
      ${S.game.jersey ? `<div class="panel" style="text-align:center"><div class="reward-stage"><div class="rays"></div>${Art.jersey(jerseyHex(S.game.jersey.color), S.game.jersey.number, S.team.name)}</div></div>` : ''}
      <div class="sysline">过两天，Alex 和 Ben 会换位置，看你还能不能用今天的说法</div>
      <button class="btn go block" data-act="${act(() => go('growth'))}">看看成长</button>
    </div>`;
  }

  // ---------- 球队 ----------
  function renderTeam() {
    const skill = S.player.skill;
    const nameId = 'team-name';
    const members = [
      { id: 'me', name: '你（队长）', role: skill ? `擅长${SKILL_ZH[skill] || skill}` : '还没向教练介绍自己', num: S.game.jersey ? '#' + S.game.jersey.number : '' },
      { id: 'alex', name: 'Alex', role: `${char('alex').role} · ${char('alex').trait}`, num: '#5', virtual: true },
      { id: 'ben', name: 'Ben', role: `${char('ben').role} · ${char('ben').trait}`, num: '#9', virtual: true },
    ];
    return `<div class="page"><div class="page-title">TEAM</div>
      <div class="panel">
        <h3>队名</h3>
        <div class="row"><input type="text" id="${nameId}" class="grow" value="${esc(S.team.name)}" maxlength="24">
        <button class="btn slim" data-act="${act(() => { const v = document.getElementById(nameId).value.trim(); if (v) { S.team.name = v; save(); render(); } })}">保存</button></div>
      </div>
      ${S.game.jersey ? `<div class="panel" style="text-align:center"><div class="reward-stage"><div class="rays"></div>${Art.jersey(jerseyHex(S.game.jersey.color), S.game.jersey.number, S.team.name)}</div></div>`
        : '<div class="panel soft muted">完成第一次训练赛，就能选队服号码和颜色。</div>'}
      <div class="panel roster"><h3>ROSTER · 三对三</h3>${members.map((m) => `<div class="member">
        ${face(m.id)}
        <div><b>${esc(m.name)}</b> <span class="muted">${esc(m.num)}</span> ${m.virtual ? '<span class="chip cpu">虚构角色</span>' : ''}<div class="muted small">${esc(m.role)}</div></div>
      </div>`).join('')}</div>
      <div class="panel member">${Art.face('hawk')}<div><b>对手：Red Hawks</b> <span class="chip cpu">电脑角色</span><div class="muted small">三名虚构对手，只在球场上出现。</div></div></div>
    </div>`;
  }

  // ---------- 成长 ----------
  function abilityStatus(targetId) {
    const s = S.learning[targetId];
    if (!s) return ['未开始', '', false];
    if (s.spacedAt) return ['间隔后仍能用', 'ok', true];
    if (s.independentAt) return ['独立能用', 'ok', true];
    if (s.simulatedIndependentAt) return ['自己说出（模拟）', 'sim', true];
    if (s.promptedAt) return ['提示后能说', 'hint', true];
    if (s.lastResult === 'full_answer' || s.lastResult === 'click_continue') return ['看过答案', 'hint', true];
    if (s.lastResult === 'keyword') return ['能说关键词', 'hint', true];
    if (s.understoodAt) return ['听懂', '', true];
    return ['练过', '', true];
  }
  function renderGrowth() {
    const p = S.progress[LEVEL.id];
    const colors = ['#ff7a1a', '#2d8cff', '#31d17c', '#ff6fb5'];
    return `<div class="page"><div class="page-title">GROWTH</div>
      <div class="panel"><h3>SEASON</h3>
        <div class="listrow"><span>DAY 1 · ${esc(LEVEL.title)}</span><span class="state ${p ? 'ok' : ''}">${p ? '已完成' : '未完成'}</span></div>
        <div class="listrow muted"><span>DAY 2 · 约队友训练</span><span class="state">之后开放</span></div>
      </div>
      <div class="badges">
        ${LEVEL.abilities.map((a, i) => {
          const [label, cls, on] = abilityStatus(a.target);
          const s = S.learning[a.target];
          return `<div class="badge ${on ? '' : 'locked'}">${Art.star(colors[i % colors.length])}<b>${esc(a.label)}</b>
            <span class="muted small">${esc(target(a.target).text)}</span>
            <span class="state ${cls}">${label}</span>
            ${s && s.nextReviewAt ? `<span class="muted small">${fmtDate(s.nextReviewAt)}再练</span>` : ''}</div>`;
        }).join('')}
      </div>
      <div class="sysline">成长只看能用什么说法，不换算成词汇量，比分也不算进来</div>
      <button class="btn block" data-act="${act(() => go('parent'))}">家长入口</button>
    </div>`;
  }

  // ---------- 家长 ----------
  function renderParent() {
    const ev = S.evidence;
    const count = (r) => ev.filter((e) => e.result === r).length;
    const recent = ev.slice(-30).reverse();
    return `<div class="page"><div class="page-title">家长</div>
      <div class="sim-note">原型没有家长验证。正式版要由服务端校验家长身份，前端隐藏入口不算。</div>
      <div class="panel"><h3>参与情况</h3>
        <div class="stats">
          <div class="stat"><b>${S.totals.runsDone}</b><span>完成次数</span></div>
          <div class="stat"><b>${Math.round(S.totals.playMs / 60000)}</b><span>累计分钟</span></div>
          <div class="stat"><b>${ev.length}</b><span>作答条数</span></div>
        </div></div>
      <div class="panel"><h3>表达与提示</h3>
        <div class="stats">
          <div class="stat"><b>${count('independent')}</b><span>自己成句</span></div>
          <div class="stat"><b>${count('keyword')}</b><span>只说关键词</span></div>
          <div class="stat"><b>${count('with_hint')}</b><span>看提示后</span></div>
          <div class="stat"><b>${count('full_answer') + count('click_continue')}</b><span>看答案/点击</span></div>
          <div class="stat"><b>${count('asr_uncertain')}</b><span>没听清</span></div>
          <div class="stat"><b>${ev.filter((e) => e.spokenEvidence).length}</b><span>真实口语证据</span></div>
        </div>
        <p class="muted small" style="margin-top:8px">原型里都是模拟输入，「真实口语证据」会一直是 0，这是对的。</p></div>
      <div class="panel"><h3>最近作答</h3>
        ${recent.length ? `<div class="table-wrap"><table><tr><th>说了什么</th><th>结果</th><th>提示</th><th>方式</th></tr>
          ${recent.map((e) => `<tr><td>${esc(e.text || '—')}<div class="muted">${esc(target(e.targetId) ? target(e.targetId).text : '')}</div></td>
            <td>${esc(RESULT_ZH[e.result] || e.result)}</td><td>${e.hintLevel ? ['', '关键词', '句型', '完整答案'][e.hintLevel] : '无'}</td>
            <td>${esc(MODE_ZH[e.inputMode] || e.inputMode)}</td></tr>`).join('')}</table></div>` : '<p class="muted">还没有作答。</p>'}
      </div>
      <div class="panel"><h3>设置</h3>
        <label class="switch"><span>字幕默认打开<div class="muted small">关着时先听，想看再点「字幕」</div></span>
          <input type="checkbox" id="opt-subs" ${S.settings.subtitles ? 'checked' : ''} data-change="${act((el) => { S.settings.subtitles = el.checked; save(); })}"></label>
        <label class="switch"><span>音效<div class="muted small">传球、进球、哨声；角色配音不受影响</div></span>
          <input type="checkbox" id="opt-sound" ${S.settings.sound ? 'checked' : ''} data-change="${act((el) => { S.settings.sound = el.checked; Sfx.setEnabled(el.checked); save(); })}"></label>
        <label class="switch"><span>录音保留<div class="muted small">原型不录音。正式版默认处理后删除，只保留你们主动选的片段。</div></span><span class="muted">—</span></label>
        <button class="btn block" data-act="${act(() => {
          if (resetArmed) { resetArmed = false; S = fresh(); save(); view = 'today'; render(); }
          else { resetArmed = true; render(); }
        })}">${resetArmed ? '再点一次，确认清空这台设备上的原型数据' : '清空原型数据'}</button>
      </div>
    </div>`;
  }

  // ---------- 启动 ----------
  if (canSynth) { try { speechSynthesis.getVoices(); } catch (e) { /* 忽略 */ } }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { tickTime(); save(); if (voiceEl) voiceEl.pause(); }
    else if (view === 'play' && S.run) resumedAt = Date.now();
  });
  render();
})();
