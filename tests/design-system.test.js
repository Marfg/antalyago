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

const metrics = {
  problemInline: count(files.problem, /style="/g),
  robotInline: count(files.robot, /style="/g),
  oynaInline: count(files.oyna, /style="/g),
  problemStyleWrites: count(files.problem, /\.style\./g),
  robotStyleWrites: count(files.robot, /\.style\./g),
  oynaStyleWrites: count(files.oyna, /\.style\./g),
  compatSelectors: count(files.compat, /^\s*\.app-shell-theme/gm),
  compatImportant: count(files.compat, /!important/g),
};

const tokenGroups = [
  ['--surface-border:', 'surface-border token missing'],
  ['--surface-border-strong:', 'surface-border-strong token missing'],
  ['--surface-soft:', 'surface-soft token missing'],
  ['--surface-hover:', 'surface-hover token missing'],
  ['--text-primary:', 'text-primary token missing'],
  ['--text-secondary:', 'text-secondary token missing'],
  ['--text-muted:', 'text-muted token missing'],
  ['--heading:', 'heading token missing'],
  ['--border:', 'border token missing'],
  ['--border-strong:', 'border-strong token missing'],
  ['--primary:', 'primary token missing'],
  ['--primary-hover:', 'primary-hover token missing'],
  ['--primary-active:', 'primary-active token missing'],
  ['--secondary:', 'secondary token missing'],
  ['--accent:', 'accent token missing'],
  ['--success:', 'success token missing'],
  ['--warning:', 'warning token missing'],
  ['--danger:', 'danger token missing'],
  ['--focus-ring:', 'focus ring token missing'],
  ['--shadow-sm:', 'shadow-sm token missing'],
  ['--shadow-md:', 'shadow-md token missing'],
  ['--shadow-lg:', 'shadow-lg token missing'],
  ['--board-surround:', 'board surround token missing'],
];

for (const [needle, message] of tokenGroups) {
  assert(files.design.includes(needle), message);
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
  '--border: var(--surface-border);',
  '--border-strong: var(--surface-border-strong);'
]) {
  assert(files.compat.includes(frag), `compat mapping missing: ${frag}`);
}

for (const [name, html] of Object.entries({ problem: files.problem, robot: files.robot, oyna: files.oyna })) {
  assert(html.includes('styles/design-system.css'), `${name} missing design-system.css`);
  assert(html.includes('styles/theme-compat.css'), `${name} missing theme-compat.css`);
  assert(html.includes('core/theme.js'), `${name} missing core/theme.js`);
  assert(html.includes('data-theme-toggle'), `${name} missing theme toggle`);
  assert(html.includes('page-shell app-shell-theme'), `${name} page shell missing`);
  for (const bad of ['\u00c3', '\u00c4', '\u00c5', '\u00c2']) {
    assert(!html.includes(bad), `${name} contains mojibake marker ${bad}`);
  }
}

assert(files.problem.includes('styles/problem-page.css'), 'problem.html missing problem-page.css');
assert(files.robot.includes('styles/robot-page.css'), 'robot.html missing robot-page.css');
assert(files.oyna.includes('styles/play-page.css'), 'oyna.html missing play-page.css');

for (const [name, css] of Object.entries({ problemPage: files.problemPage, robotPage: files.robotPage, playPage: files.playPage })) {
  for (const banned of ['#d4a84b', '#b8861a', '#e0be68', '#c8a84b', 'rgba(200,168,75']) {
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

assert(metrics.problemInline <= 1, `problem.html presentation inline styles too high: ${metrics.problemInline}`);
assert(metrics.robotInline <= 0, `robot.html presentation inline styles too high: ${metrics.robotInline}`);
assert(metrics.oynaInline <= 0, `oyna.html presentation inline styles too high: ${metrics.oynaInline}`);
assert(metrics.problemStyleWrites <= 1, `problem.html direct style writes should stay functional-only: ${metrics.problemStyleWrites}`);
assert(metrics.robotStyleWrites <= 4, `robot.html direct style writes should stay functional-only: ${metrics.robotStyleWrites}`);
assert(metrics.oynaStyleWrites <= 0, `oyna.html should not use direct style writes for presentation: ${metrics.oynaStyleWrites}`);
assert(metrics.compatImportant <= 2, `theme-compat !important budget exceeded: ${metrics.compatImportant}`);
assert(metrics.compatSelectors <= 120, `theme-compat selector budget exceeded: ${metrics.compatSelectors}`);
assert(!files.problem.includes('style.display'), 'problem.html should not use style.display');
assert(!files.robot.includes('style.display'), 'robot.html should not use style.display');
assert(!files.robot.includes('style.cursor'), 'robot.html should not use style.cursor');
assert(!files.oyna.includes('style.display'), 'oyna.html should not use style.display');
assert(!files.oyna.includes('style.cursor'), 'oyna.html should not use style.cursor');

console.log(`inline style sayıları: problem=${metrics.problemInline}, robot=${metrics.robotInline}, oyna=${metrics.oynaInline}`);
console.log(`direct style yazımları: problem=${metrics.problemStyleWrites}, robot=${metrics.robotStyleWrites}, oyna=${metrics.oynaStyleWrites}`);
console.log(`theme-compat selector satırları: ${metrics.compatSelectors}`);
console.log(`theme-compat !important sayısı: ${metrics.compatImportant}`);
console.log('tasarım sistemi token ve ortak bileşen denetimi geçti');