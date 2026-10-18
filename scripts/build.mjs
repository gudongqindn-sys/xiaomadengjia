// 从 content/ 和 audio/ 生成原型用的数据脚本，并打单文件版本方便发到手机上直接打开。
//   node scripts/build.mjs
// content/level-01.json 是唯一的内容来源；prototype/level-data.js、prototype/voice-data.js 和 dist/ 都是生成的，不要手改。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const HEADER = '// 由 scripts/build.mjs 生成，不要手改\n';

export function level() { return JSON.parse(read('content/level-01.json')); }
export function voiceManifest() {
  return existsSync(join(root, 'audio/manifest.json')) ? JSON.parse(read('audio/manifest.json')) : {};
}

export function levelDataJs() {
  return HEADER + 'window.LEVEL_DATA = ' + JSON.stringify(level(), null, 2) + ';\n';
}

// 开发版引用 ../audio/ 下的文件；单文件版把音频直接嵌进去
export function voiceDataJs(inline) {
  const m = voiceManifest();
  const out = {};
  for (const [k, p] of Object.entries(m)) {
    out[k] = inline ? 'data:audio/mpeg;base64,' + readFileSync(join(root, p)).toString('base64') : '../' + p;
  }
  return HEADER + 'window.VOICE_SRC = ' + JSON.stringify(out, null, inline ? 0 : 2) + ';\n';
}

// 页面上角色会说的每一句（谁说、说什么），和 prototype/app.js 的 say() 调用一致。
// scripts/gen_voices.py 里有同样的列表；测试会比对两边，缺配音的句子会报出来。
export function voiceLines() {
  const L = level();
  const ASR = "Sorry, I didn't catch that. Can you say it again?";
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const skills = [...new Set(L.steps.flatMap((s) => (s.intents || []).filter((i) => i.slot).flatMap((i) => Object.values(i.slot.map))))].sort();
  const out = new Set();
  const add = (who, tpl, step) => {
    let list = [tpl];
    if (tpl.includes('{skill}')) list = list.flatMap((t) => skills.map((v) => t.replaceAll('{skill}', v)));
    if (tpl.includes('{optionName}')) {
      const names = (step.options || []).map((o) => (o.id === 'me' ? 'yourself' : L.characters[o.id].name));
      list = list.flatMap((t) => names.map((v) => t.replaceAll('{optionName}', v)));
    }
    for (const t of list) out.add(who + '|' + cap(t));
  };
  for (const st of L.steps) {
    if (st.type === 'listen') { for (const m of st.messages) add(m.from, m.text, st); continue; }
    if (st.type !== 'speak' && st.type !== 'court') continue;
    const host = st.type === 'speak' ? st.speaker : 'coach';
    add(host, st.type === 'court' ? st.coachLine : st.line, st);
    add(host, ASR, st);
    add(host, st.offTask, st);
    for (const r of st.redirects || []) add(host, r.reply, st);
    for (const a of st.ambiguous || []) add(host, a.clarify, st);
    for (const i of st.intents) {
      add(i.speaker || host, i.reply, st);
      if (i.replyKeyword) add(i.speaker || host, i.replyKeyword, st);
    }
    const f = st.followUp;
    if (f) {
      add(host, f.line, st);
      add(host, f.offTask, st);
      for (const i of f.intents) {
        add(i.speaker || host, i.reply, st);
        if (i.replyKeyword) add(i.speaker || host, i.replyKeyword, st);
      }
    }
  }
  return [...out];
}

function inlineCss() {
  const font = readFileSync(join(root, 'prototype/fonts/LilitaOne.woff2')).toString('base64');
  return read('prototype/style.css').replace("url('fonts/LilitaOne.woff2')", `url(data:font/woff2;base64,${font})`);
}

export function singleFileHtml() {
  const scripts = {
    '../src/engine.js': read('src/engine.js'),
    'level-data.js': levelDataJs(),
    'voice-data.js': voiceDataJs(true),
    'art.js': read('prototype/art.js'),
    'sfx.js': read('prototype/sfx.js'),
    'app.js': read('prototype/app.js'),
  };
  let html = read('prototype/index.html');
  html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${inlineCss()}</style>`);
  for (const [src, code] of Object.entries(scripts)) {
    html = html.replace(`<script src="${src}"></script>`, () => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  return html;
}

// 发成 claude.ai Artifact 用：外壳由平台补，这里只要 <title>、样式和正文
export function artifactHtml() {
  const html = singleFileHtml();
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  return '<title>篮球英语首关</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + style + '\n' + body.trim() + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(root, 'prototype/level-data.js'), levelDataJs());
  writeFileSync(join(root, 'prototype/voice-data.js'), voiceDataJs(false));
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/basketball-english.html'), singleFileHtml());
  writeFileSync(join(root, 'dist/artifact.html'), artifactHtml());
  const m = voiceManifest();
  const missing = voiceLines().filter((k) => !m[k]);
  console.log('已生成 prototype/level-data.js、prototype/voice-data.js、dist/basketball-english.html、dist/artifact.html');
  if (missing.length) console.log(`有 ${missing.length} 句没有配音（会用浏览器合成声音），跑 scripts/gen_voices.py 补：\n  ` + missing.join('\n  '));
}
