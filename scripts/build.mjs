// 从 content/level-01.json 生成原型用的数据脚本，并打一个单文件版本方便发到手机上直接打开。
//   node scripts/build.mjs
// content/ 下的 JSON 是唯一的内容来源；prototype/level-data.js 和 dist/ 都是生成的，不要手改。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

export function levelDataJs() {
  const level = JSON.parse(read('content/level-01.json'));
  return '// 由 scripts/build.mjs 从 content/level-01.json 生成，不要手改\n'
    + 'window.LEVEL_DATA = ' + JSON.stringify(level, null, 2) + ';\n';
}

export function singleFileHtml() {
  const scripts = {
    '../src/engine.js': read('src/engine.js'),
    'level-data.js': levelDataJs(),
    'app.js': read('prototype/app.js'),
  };
  let html = read('prototype/index.html');
  html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('prototype/style.css')}</style>`);
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
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/basketball-english.html'), singleFileHtml());
  writeFileSync(join(root, 'dist/artifact.html'), artifactHtml());
  console.log('已生成 prototype/level-data.js、dist/basketball-english.html、dist/artifact.html');
}
