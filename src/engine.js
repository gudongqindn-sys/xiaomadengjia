// 规则引擎：意图匹配、练习证据、学习状态、奖励只发一次。
// 纯函数，不碰 DOM，浏览器和 node 测试共用。
// 关键通关条件、奖励和复习更新都在这里由明确规则决定，不交给 AI 临场判断。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BBEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;

  const CONTRACTIONS = [
    [/\bi'm\b/g, 'i am'], [/\blet's\b/g, 'let us'], [/\bhe's\b/g, 'he is'],
    [/\bshe's\b/g, 'she is'], [/\bit's\b/g, 'it is'], [/\bi'll\b/g, 'i will'],
    [/\bwe'll\b/g, 'we will'], [/\bcan't\b/g, 'cannot'], [/\bdon't\b/g, 'do not'],
    [/\bwhat's\b/g, 'what is'], [/\bthat's\b/g, 'that is'],
  ];

  function normalize(text) {
    let t = String(text || '').toLowerCase().replace(/[’‘`]/g, "'");
    for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
    return t.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 按整词匹配："pass" 不会命中 "passing"，两种形式要分别写进词表
  function has(norm, phrase) {
    const p = normalize(phrase);
    return p.length > 0 && (' ' + norm + ' ').includes(' ' + p + ' ');
  }

  function firstHit(norm, list) {
    for (const w of list || []) if (has(norm, w)) return w;
    return null;
  }

  function fullMatch(norm, intent) {
    const groups = intent.all || [];
    if (!groups.length) return null;
    const hits = [];
    for (const g of groups) {
      const h = firstHit(norm, g);
      if (!h) return null;
      hits.push(h);
    }
    return hits;
  }

  function slotValue(intent, norm, hits) {
    const s = intent.slot;
    if (!s) return {};
    const words = Object.keys(s.map);
    const fromHits = (hits || []).find((h) => s.map[normalize(h)]);
    const found = fromHits ? normalize(fromHits) : firstHit(norm, words);
    return { [s.name]: found ? s.map[normalize(found)] : s.default };
  }

  /**
   * 判断一句话在当前任务里是什么意思。
   * 返回 status：
   *   matched   意思清楚（quality: sentence 成句 / keyword 只说了关键词 / partial 说了句子但只踩到关键词）
   *   redirect  听懂了，但这个做法当前不可行（例：篮下被盯防）——说明原因，允许重说
   *   ambiguous 语义不明确，先追问，确认前不推进关键动作
   *   off_task  和当前任务无关，说明还缺什么
   *   empty     没有内容
   */
  function matchUtterance(spec, text) {
    const norm = normalize(text);
    if (!norm) return { status: 'empty' };
    const tokens = norm.split(' ').length;
    const intents = spec.intents || [];

    for (const intent of intents) {
      const hits = fullMatch(norm, intent);
      if (hits) {
        return {
          status: 'matched', intent, quality: tokens >= 3 ? 'sentence' : 'keyword',
          slots: slotValue(intent, norm, hits),
        };
      }
    }
    for (const r of spec.redirects || []) {
      if (firstHit(norm, r.any)) return { status: 'redirect', reply: r.reply };
    }
    for (const intent of intents) {
      if (firstHit(norm, intent.keyword)) {
        return {
          status: 'matched', intent, quality: tokens <= 2 ? 'keyword' : 'partial',
          slots: slotValue(intent, norm, null),
        };
      }
    }
    for (const a of spec.ambiguous || []) {
      if (firstHit(norm, a.any)) return { status: 'ambiguous', reply: a.clarify };
    }
    return { status: 'off_task', reply: spec.offTask || 'Can you tell me again?' };
  }

  /**
   * 把一次作答归成学习记录里的结果。
   * hintLevel：0 没看提示，1 关键词，2 句型，3 完整答案。
   * inputMode：voice 真实录音 / simulated 原型模拟输入 / click 点击继续。
   */
  function classify({ match, hintLevel, inputMode, asrUncertain }) {
    if (asrUncertain) return 'asr_uncertain';
    if (inputMode === 'click') return 'click_continue';
    if (!match || match.status === 'empty') return 'empty';
    if (match.status === 'ambiguous') return 'clarify';
    if (match.status === 'redirect') return 'redirect';
    if (match.status === 'off_task') return 'off_task';
    if (hintLevel >= 3) return 'full_answer';
    if (hintLevel >= 1) return 'with_hint';
    return match.quality === 'sentence' ? 'independent' : 'keyword';
  }

  // 只有真实录音、识别可靠、没看提示、意思成句，才算独立口语证据。
  // 原型模拟输入一律不算；识别服务没有给可靠度时（null）也不算，不编造。
  function countsAsSpokenEvidence(ev) {
    return ev.inputMode === 'voice' && ev.recognitionReliable === true && ev.result === 'independent';
  }

  const PROGRESS_RESULTS = new Set(['independent', 'keyword', 'with_hint', 'full_answer', 'click_continue']);
  function advancesStory(result) {
    return PROGRESS_RESULTS.has(result);
  }

  function makeEvidence({ levelId, stepId, targetId, text, match, hintLevel, inputMode, asrUncertain, now }) {
    const result = classify({ match, hintLevel, inputMode, asrUncertain });
    const ev = {
      at: now,
      levelId, stepId, targetId,
      text: inputMode === 'click' ? '' : String(text || ''),
      intentId: match && match.intent ? match.intent.id : null,
      hintLevel: hintLevel || 0,
      inputMode,
      validRecording: inputMode === 'voice',
      // 原型没有识别服务，可靠度未知，记 null 而不是猜一个数
      recognitionReliable: null,
      result,
    };
    ev.spokenEvidence = countsAsSpokenEvidence(ev);
    return ev;
  }

  // 首轮参数：到期间隔随表现调整，不用固定复现次数宣称掌握
  const REVIEW_DAYS = {
    independent: 2, keyword: 1, with_hint: 1, full_answer: 1, click_continue: 1,
  };

  /**
   * 更新一个目标表达的学习状态。
   * 字段：understoodAt 听懂、promptedAt 提示后能说、independentAt 独立能用、spacedAt 间隔后仍能用、
   * simulatedIndependentAt 原型里模拟输入成句（单独记，不冒充真实口语）。
   */
  function updateLearning(state, ev) {
    const s = Object.assign({ targetId: ev.targetId, attempts: 0 }, state || {});
    if (!advancesStory(ev.result)) return s; // 误听、追问、跑题不改学习状态
    s.attempts += 1;
    s.lastResult = ev.result;
    if (ev.result === 'with_hint') s.promptedAt = s.promptedAt ?? ev.at;
    if (ev.result === 'independent' || ev.result === 'keyword') {
      if (ev.spokenEvidence) {
        if (s.independentAt != null && ev.at - s.independentAt >= DAY) s.spacedAt = s.spacedAt ?? ev.at;
        s.independentAt = s.independentAt ?? ev.at;
      } else if (ev.inputMode === 'simulated' && ev.result === 'independent') {
        s.simulatedIndependentAt = s.simulatedIndependentAt ?? ev.at;
      }
    }
    const days = s.spacedAt ? 4 : (REVIEW_DAYS[ev.result] || 1);
    s.nextReviewAt = ev.at + days * DAY;
    return s;
  }

  function markUnderstood(state, targetId, now) {
    const s = Object.assign({ targetId, attempts: 0 }, state || {});
    s.understoodAt = s.understoodAt ?? now;
    return s;
  }

  // 奖励只发一次：重复刷同一段不再增加成果
  function grantOnce(game, rewardId, now) {
    const granted = Object.assign({}, game.rewards || {});
    if (granted[rewardId]) return { game, granted: false };
    granted[rewardId] = now;
    return { game: Object.assign({}, game, { rewards: granted }), granted: true };
  }

  // 球场行动：战术选择 + 操作手感共同决定结果。识别问题不进这里。
  function playOutcome(timing) {
    if (timing === 'great') return { score: 2, text: '漂亮！球进了！' };
    if (timing === 'good') return { score: 2, text: '进了！' };
    return { score: 0, text: '球弹框而出，差一点。配合是对的，下次手感会更好。' };
  }

  function timingGrade(pos) {
    const d = Math.abs(pos - 0.5);
    if (d <= 0.06) return 'great';
    if (d <= 0.14) return 'good';
    return 'miss';
  }

  /**
   * 当天只挑一个点反馈：优先“只说关键词”的一句给完整句型；
   * 都成句了，就给一个稍进阶的说法；用过完整答案的，鼓励下次先自己试。
   */
  function pickFeedback(evidence, level) {
    const done = evidence.filter((e) => e.levelId === level.id && advancesStory(e.result));
    const targets = Object.fromEntries(level.targets.map((t) => [t.id, t]));
    const kw = done.find((e) => e.result === 'keyword');
    if (kw) {
      const t = targets[kw.targetId];
      return { kind: 'pattern', targetId: kw.targetId, text: `你说了 "${kw.text}"，意思队友懂了。下次试着说完整：${t ? t.text : ''}` };
    }
    const full = done.find((e) => e.result === 'full_answer' || e.result === 'click_continue');
    if (full) {
      const t = targets[full.targetId];
      return { kind: 'retry', targetId: full.targetId, text: `「${t ? t.text : ''}」这句今天看了答案，过两天换个情境再自己说一次。` };
    }
    return { kind: 'stretch', targetId: 't_because', text: '今天每句都是自己说的！下次可以多加一句理由：Pass to Ben, because he is open.' };
  }

  return {
    normalize, matchUtterance, classify, makeEvidence, countsAsSpokenEvidence, advancesStory,
    updateLearning, markUnderstood, grantOnce, playOutcome, timingGrade, pickFeedback, DAY,
  };
});
