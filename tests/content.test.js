// 关卡内容的结构检查：进入孩子可玩的内容库之前，机器先挡住明显的不一致。
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const E = require('../src/engine.js');
const level = require('../content/level-01.json');

const targetIds = new Set(level.targets.map((t) => t.id));
const speakSpecs = [];
for (const s of level.steps) {
  if (s.type === 'speak' || s.type === 'court') speakSpecs.push([s.id, s]);
  if (s.followUp) speakSpecs.push([s.id + ':follow', s.followUp]);
}

test('每段口语任务都有目标、意图、三层提示', () => {
  for (const [id, spec] of speakSpecs) {
    assert.ok(targetIds.has(spec.target || level.steps.find((s) => id.startsWith(s.id)).target), id + ' 目标表达不存在');
    assert.ok(spec.intents && spec.intents.length, id + ' 没有意图');
    assert.deepEqual(spec.hints.map((h) => h.level), [1, 2, 3], id + ' 提示层级不对');
    assert.ok(spec.offTask, id + ' 缺少跑题时的说明');
  }
});

test('完整答案本身能被自己的意图识别（答案与任务条件一致）', () => {
  for (const [id, spec] of speakSpecs) {
    for (const full of spec.hints[2].full.split(' / ')) {
      const r = E.matchUtterance(spec, full);
      assert.equal(r.status, 'matched', `${id} 的完整答案「${full}」识别不了`);
    }
  }
});

test('至少一个决定有两个合理方案，且每个方案都有能说出来的意图', () => {
  const courts = level.steps.filter((s) => s.type === 'court');
  assert.ok(courts.some((s) => s.options.length >= 2));
  for (const s of courts) {
    for (const o of s.options) {
      assert.ok(s.intents.some((i) => i.option === o.id), `${s.id} 方案 ${o.id} 没有对应意图`);
      assert.ok(s.positions[o.id] || o.id === 'me', `${s.id} 方案 ${o.id} 没有站位`);
    }
  }
});

test('新目标表达不超过 5 个', () => {
  assert.ok(level.targets.filter((t) => t.isNew).length <= 5);
});

test('队友和对手都标成虚构角色', () => {
  for (const c of Object.values(level.characters)) assert.equal(c.virtual, true);
});

test('prototype/level-data.js 与 content/level-01.json 一致（改了 JSON 要跑 npm run build）', async () => {
  const { levelDataJs } = await import('../scripts/build.mjs');
  const onDisk = readFileSync(join(__dirname, '../prototype/level-data.js'), 'utf8');
  assert.equal(onDisk, levelDataJs());
});
