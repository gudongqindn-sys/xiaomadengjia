const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const level = require('../content/level-01.json');

const step = (id) => level.steps.find((s) => s.id === id);
const m = (spec, text) => E.matchUtterance(spec, text);

test('首关：不同的正确说法都能推进', () => {
  const play1 = step('s_play1');
  for (const t of ['Pass to Ben.', "Let's pass the ball to Ben.", 'Give the ball to Ben!', 'pass it to ben please']) {
    const r = m(play1, t);
    assert.equal(r.status, 'matched', t);
    assert.equal(r.intent.option, 'ben', t);
    assert.equal(r.quality, 'sentence', t);
  }
  assert.equal(m(play1, 'Pass to Alex').intent.option, 'alex');
});

test('只说关键词：承接意思，但记成关键词', () => {
  const r = m(step('s_play1'), 'Ben!');
  assert.equal(r.status, 'matched');
  assert.equal(r.quality, 'keyword');
  const ev = E.makeEvidence({ levelId: level.id, stepId: 's_play1', targetId: 't_pass_to', text: 'Ben!', match: r, hintLevel: 0, inputMode: 'simulated', now: 1 });
  assert.equal(ev.result, 'keyword');
});

test('说了句子但只踩到关键词（Ben is open）算 partial，照样能推进', () => {
  const r = m(step('s_play1'), 'Ben is open');
  assert.equal(r.status, 'matched');
  assert.equal(r.quality, 'partial');
  assert.equal(E.classify({ match: r, hintLevel: 0, inputMode: 'simulated' }), 'keyword');
});

test('语义不明确先追问，不推进', () => {
  const r = m(step('s_play1'), 'Pass the ball');
  assert.equal(r.status, 'ambiguous');
  assert.match(r.reply, /Ben or Alex/);
  assert.equal(E.advancesStory(E.classify({ match: r, hintLevel: 0, inputMode: 'simulated' })), false);
});

test('当前做不了的做法：说明原因，允许重说', () => {
  assert.equal(m(step('s_play1'), "I'll shoot").status, 'redirect');
  assert.equal(m(step('s_play2'), 'Pass to Ben').status, 'redirect');
  assert.equal(m(step('s_play2'), 'Pass to Alex').intent.option, 'alex');
  assert.equal(m(step('s_play2'), 'I can shoot').intent.option, 'me');
});

test('和任务无关：不判成功', () => {
  const r = m(step('s_play1'), 'I like pizza');
  assert.equal(r.status, 'off_task');
  assert.equal(E.advancesStory(E.classify({ match: r, hintLevel: 0, inputMode: 'simulated' })), false);
});

test('自我介绍取出擅长的能力', () => {
  const intro = step('s_intro');
  assert.equal(m(intro, "I'm good at shooting.").slots.skill, 'shooting');
  assert.equal(m(intro, 'I like dribbling').slots.skill, 'dribbling');
  assert.equal(m(intro, 'Passing').quality, 'keyword');
  assert.equal(m(intro, "I'm good").status, 'ambiguous');
});

test('看完整答案、点击继续：剧情推进，但不算独立口语', () => {
  const r = m(step('s_play1'), 'Pass to Ben.');
  const full = E.makeEvidence({ levelId: level.id, stepId: 's', targetId: 't_pass_to', text: 'Pass to Ben.', match: r, hintLevel: 3, inputMode: 'simulated', now: 1 });
  assert.equal(full.result, 'full_answer');
  assert.equal(full.spokenEvidence, false);
  assert.equal(E.advancesStory(full.result), true);
  const click = E.makeEvidence({ levelId: level.id, stepId: 's', targetId: 't_pass_to', text: '', match: null, hintLevel: 3, inputMode: 'click', now: 1 });
  assert.equal(click.result, 'click_continue');
  assert.equal(click.spokenEvidence, false);
});

test('原型的模拟输入即使成句也不算真实口语证据', () => {
  const r = m(step('s_play1'), 'Pass to Ben.');
  const ev = E.makeEvidence({ levelId: level.id, stepId: 's', targetId: 't_pass_to', text: 'x', match: r, hintLevel: 0, inputMode: 'simulated', now: 1 });
  assert.equal(ev.result, 'independent');
  assert.equal(ev.spokenEvidence, false);
  assert.equal(ev.recognitionReliable, null);
  const s = E.updateLearning(undefined, ev);
  assert.equal(s.independentAt, undefined);
  assert.equal(s.simulatedIndependentAt, 1);
});

test('真实录音：没有可靠度就不算，有可靠度才算，隔天再用记为间隔后仍能用', () => {
  const base = { result: 'independent', inputMode: 'voice', targetId: 't_pass_to' };
  assert.equal(E.countsAsSpokenEvidence({ ...base, recognitionReliable: null }), false);
  let s = E.updateLearning(undefined, { ...base, recognitionReliable: true, spokenEvidence: true, at: 0 });
  assert.equal(s.independentAt, 0);
  assert.equal(s.spacedAt, undefined);
  s = E.updateLearning(s, { ...base, recognitionReliable: true, spokenEvidence: true, at: 2 * E.DAY });
  assert.equal(s.spacedAt, 2 * E.DAY);
});

test('没听清不记为孩子的错误，也不改学习状态', () => {
  const ev = E.makeEvidence({ levelId: level.id, stepId: 's', targetId: 't_pass_to', text: '', match: null, hintLevel: 0, inputMode: 'simulated', asrUncertain: true, now: 5 });
  assert.equal(ev.result, 'asr_uncertain');
  const s = E.updateLearning({ targetId: 't_pass_to', attempts: 2, lastResult: 'independent' }, ev);
  assert.equal(s.attempts, 2);
  assert.equal(s.lastResult, 'independent');
});

test('奖励只发一次', () => {
  let g = { rewards: {} };
  const a = E.grantOnce(g, 'r1', 10);
  assert.equal(a.granted, true);
  const b = E.grantOnce(a.game, 'r1', 20);
  assert.equal(b.granted, false);
  assert.equal(b.game.rewards.r1, 10);
});

test('手感：中间区域进球，偏了不进但不扣成长', () => {
  assert.equal(E.timingGrade(0.5), 'great');
  assert.equal(E.timingGrade(0.6), 'good');
  assert.equal(E.timingGrade(0.95), 'miss');
  assert.equal(E.playOutcome('miss').score, 0);
});

test('当天只挑一个反馈点，关键词优先', () => {
  const evs = [
    { levelId: level.id, targetId: 't_pass_to', result: 'keyword', text: 'Ben' },
    { levelId: level.id, targetId: 't_well', result: 'full_answer', text: '' },
  ];
  const fb = E.pickFeedback(evs, level);
  assert.equal(fb.kind, 'pattern');
  assert.match(fb.text, /Pass to/);
});
