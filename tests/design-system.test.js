import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = {
  design: fs.readFileSync('styles/design-system.css', 'utf8'),
  compat: fs.readFileSync('styles/theme-compat.css', 'utf8'),
  problem: fs.readFileSync('problem.html', 'utf8'),
  robot: fs.readFileSync('robot.html', 'utf8'),
  oyna: fs.readFileSync('oyna.html', 'utf8'),
  problemPage: fs.readFileSync('styles/problem-page.css', 'utf8'),
  robotPage: fs.readFileSync('styles/robot-page.css', 'utf8'),
  playPage: fs.readFileSync('styles/play-page.css', 'utf8')
};

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function countStyleBlocks(text) {
  return count(text, /<style\b/gi);
}

function countStyleLines(text) {
  return [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .reduce((sum, match) => sum + match[1].split(/\r?\n/).length, 0);
}

const metrics = {
  problemInline: count(files.problem, /style="/g),
  robotInline: count(files.robot, /style="/g),
  oynaInline: count(files.oyna, /style="/g),
  problemStyleWrites: count(files.problem, /\.style\./g),
  robotStyleWrites: count(files.robot, /\.style\./g),
  oynaStyleWrites: count(files.oyna, /\.style\./g),
  compatSelectors: count(files.compat, /^\s*\.app-shell-theme/gm),
  compatImportant: count(files.compat, /!important/g),
  htmlStyleBlocks: {
    problem: countStyleBlocks(files.problem),
    robot: countStyleBlocks(files.robot),
    oyna: countStyleBlocks(files.oyna)
  },
  htmlStyleLines: {
    problem: countStyleLines(files.problem),
    robot: countStyleLines(files.robot),
    oyna: countStyleLines(files.oyna)
  }
};

for (const [name, value] of Object.entries(metrics.htmlStyleBlocks)) {
  assert.equal(value, 0, `${name} still contains embedded <style>`);
}
for (const [name, value] of Object.entries(metrics.htmlStyleLines)) {
  assert.equal(value, 0, `${name} still contains embedded style lines`);
}

for (const [htmlName, html, pageCss] of [
  ['problem', files.problem, 'styles/problem-page.css'],
  ['robot', files.robot, 'styles/robot-page.css'],
  ['oyna', files.oyna, 'styles/play-page.css']
]) {
  assert(html.includes('styles/design-system.css'), `${htmlName} missing design-system.css`);
  assert(html.includes('styles/theme-compat.css'), `${htmlName} missing theme-compat.css`);
  assert(html.includes(pageCss), `${htmlName} missing ${pageCss}`);
  assert(html.includes('core/theme.js'), `${htmlName} missing core/theme.js`);
  assert(html.includes('data-theme-toggle'), `${htmlName} missing theme toggle`);
  assert(html.indexOf('styles/design-system.css') < html.indexOf('styles/theme-compat.css'), `${htmlName} CSS order wrong`);
  assert(html.indexOf('styles/theme-compat.css') < html.indexOf(pageCss), `${htmlName} page CSS order wrong`);
  assert(html.includes('page-shell app-shell-theme'), `${htmlName} page shell missing`);
  for (const bad of ['\u00c3', '\u00c4', '\u00c5', '\u00c2']) {
    assert(!html.includes(bad), `${htmlName} contains mojibake marker ${bad}`);
  }
}

for (const needle of [
  '--surface-border:', '--surface-border-strong:', '--surface-soft:', '--surface-hover:',
  '--text-primary:', '--text-secondary:', '--text-muted:', '--heading:', '--border:',
  '--border-strong:', '--primary:', '--primary-hover:', '--primary-active:', '--secondary:',
  '--accent:', '--success:', '--warning:', '--danger:', '--focus-ring:', '--shadow-sm:',
  '--shadow-md:', '--shadow-lg:', '--board-surround:'
]) {
  assert(files.design.includes(needle), `design-system token missing: ${needle}`);
}

for (const selector of [
  '.button-primary', '.button-secondary', '.button-ghost', '.card', '.card-interactive',
  '.badge', '.status-message', '.progress', '.modal-surface', '.section-label',
  '.page-shell', '.content-container', '.form-field', '.form-control', '.segmented-control',
  '.theme-toggle', '.site-header', '.site-nav'
]) {
  assert(files.design.includes(selector), `shared selector missing: ${selector}`);
}

for (const fragment of [
  'background: var(--primary);',
  'background: var(--surface-raised);',
  'border: 1px solid var(--border);',
  'box-shadow: var(--shadow-md);',
  'color: var(--text-primary);'
]) {
  assert(files.design.includes(fragment), `semantic token usage missing: ${fragment}`);
}

for (const frag of [
  '--gold: var(--primary);',
  '--wood: var(--primary);',
  '--wood-board: var(--board-surround);',
  '--border: var(--surface-border);',
  '--border-strong: var(--surface-border-strong);'
]) {
  assert(files.compat.includes(frag), `compat mapping missing: ${frag}`);
}

for (const [name, css] of Object.entries({ problemPage: files.problemPage, robotPage: files.robotPage, playPage: files.playPage })) {
  for (const banned of ['#d4a84b', '#b8861a', '#e0be68', '#c8a84b', 'rgba(200,168,75', 'rgba(212,168,75', 'rgba(184,134,26']) {
    assert(!css.includes(banned), `${name} contains banned literal ${banned}`);
  }
  assert(css.includes('var(--page-bg)') || css.includes('var(--surface-raised)'), `${name} should use semantic tokens`);
}

for (const selector of [
  '.problem-header', '.prob-item', '#hint-box', '#solution-area', '#feedback', '#gameover',
  '#chat-log', '#move-list', '.room-tag', '.room-badge', '.type-badge', '.level-badge',
  '.engine-badge', '.stat-box', '.club-card'
]) {
  assert(!files.compat.includes(selector), `compat still contains removed selector: ${selector}`);
}

assert(files.problem.includes('panel card'), 'problem.html shared card missing');
assert(files.problem.includes('button button-primary'), 'problem.html shared button missing');
assert(files.problem.includes('status-message'), 'problem.html status message missing');
assert(files.robot.includes('button button-secondary'), 'robot.html shared button missing');
assert(files.robot.includes('status-message'), 'robot.html status message missing');
assert(files.oyna.includes('card modal-surface'), 'oyna.html shared modal/card missing');
assert(files.oyna.includes('button button-primary'), 'oyna.html shared primary button missing');
assert(files.oyna.includes('badge'), 'oyna.html shared badge missing');

assert(metrics.problemInline <= 1, `problem.html inline style budget exceeded: ${metrics.problemInline}`);
assert(metrics.robotInline <= 0, `robot.html inline style budget exceeded: ${metrics.robotInline}`);
assert(metrics.oynaInline <= 0, `oyna.html inline style budget exceeded: ${metrics.oynaInline}`);
assert(metrics.problemStyleWrites <= 1, `problem.html direct style writes too high: ${metrics.problemStyleWrites}`);
assert(metrics.robotStyleWrites <= 4, `robot.html direct style writes too high: ${metrics.robotStyleWrites}`);
assert(metrics.oynaStyleWrites <= 0, `oyna.html direct style writes too high: ${metrics.oynaStyleWrites}`);
assert(metrics.compatImportant <= 2, `theme-compat !important budget exceeded: ${metrics.compatImportant}`);
assert(metrics.compatSelectors <= 120, `theme-compat selector budget exceeded: ${metrics.compatSelectors}`);
assert(!files.problem.includes('style.display'), 'problem.html should not use style.display');
assert(!files.robot.includes('style.display'), 'robot.html should not use style.display');
assert(!files.robot.includes('style.cursor'), 'robot.html should not use style.cursor');
assert(!files.oyna.includes('style.display'), 'oyna.html should not use style.display');
assert(!files.oyna.includes('style.cursor'), 'oyna.html should not use style.cursor');

console.log(`inline style counts: problem=${metrics.problemInline}, robot=${metrics.robotInline}, oyna=${metrics.oynaInline}`);
console.log(`direct style writes: problem=${metrics.problemStyleWrites}, robot=${metrics.robotStyleWrites}, oyna=${metrics.oynaStyleWrites}`);
console.log(`theme-compat selector lines: ${metrics.compatSelectors}`);
console.log(`theme-compat !important count: ${metrics.compatImportant}`);
console.log('design-system token and shared component contract passed');
