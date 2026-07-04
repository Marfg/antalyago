import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = {
  design: fs.readFileSync('styles/design-system.css', 'utf8'),
  compat: fs.readFileSync('styles/theme-compat.css', 'utf8'),
  problem: fs.readFileSync('problem.html', 'utf8'),
  robot: fs.readFileSync('robot.html', 'utf8'),
  oyna: fs.readFileSync('oyna.html', 'utf8')
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
  compatOverrides: count(files.compat, /^\s*\.app-shell-theme/gm),
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

for (const banned of ['#d4a84b', '#b8861a', '#e0be68', '#c8a84b', 'rgba(200,168,75']) {
  assert(!files.design.includes(banned), `design system contains banned literal ${banned}`);
  assert(!files.compat.includes(banned), `compat layer contains banned literal ${banned}`);
}

for (const [name, html] of Object.entries(files)) {
  if (name === 'design' || name === 'compat') continue;
  assert(html.includes('styles/design-system.css'), `${name} missing design-system.css`);
  assert(html.includes('styles/theme-compat.css'), `${name} missing theme-compat.css`);
  assert(html.includes('core/theme.js'), `${name} missing core/theme.js`);
  assert(html.includes('data-theme-toggle'), `${name} missing theme toggle`);
}

for (const [name, html] of Object.entries({ problem: files.problem, robot: files.robot, oyna: files.oyna })) {
  for (const bad of ['\u00c3', '\u00c4', '\u00c5', '\u00c2']) {
    assert(!html.includes(bad), `${name} contains mojibake marker ${bad}`);
  }
}

assert(files.problem.includes('page-shell app-shell-theme'), 'problem.html page shell missing');
assert(files.problem.includes('panel card'), 'problem.html shared card missing');
assert(files.problem.includes('button button-primary'), 'problem.html shared button missing');
assert(files.problem.includes('status-message'), 'problem.html status message missing');
assert(files.robot.includes('page-shell app-shell-theme'), 'robot.html page shell missing');
assert(files.robot.includes('button button-secondary'), 'robot.html shared button missing');
assert(files.robot.includes('status-message'), 'robot.html status message missing');
assert(files.oyna.includes('page-shell app-shell-theme'), 'oyna.html page shell missing');
assert(files.oyna.includes('card modal-surface'), 'oyna.html shared modal/card missing');
assert(files.oyna.includes('button button-primary'), 'oyna.html shared primary button missing');
assert(files.oyna.includes('badge'), 'oyna.html shared badge missing');


assert(metrics.problemInline <= 1, `problem.html presentation inline styles too high: ${metrics.problemInline}`);
assert(metrics.robotInline <= 0, `robot.html presentation inline styles too high: ${metrics.robotInline}`);
assert(metrics.oynaInline <= 0, `oyna.html presentation inline styles too high: ${metrics.oynaInline}`);
assert(metrics.problemStyleWrites <= 1, `problem.html direct style writes should stay functional-only: ${metrics.problemStyleWrites}`);
assert(metrics.robotStyleWrites <= 4, `robot.html direct style writes should stay functional-only: ${metrics.robotStyleWrites}`);
assert(metrics.oynaStyleWrites <= 0, `oyna.html should not use direct style writes for presentation: ${metrics.oynaStyleWrites}`);
assert(!files.problem.includes('style.display'), 'problem.html should not use style.display');
assert(!files.robot.includes('style.display'), 'robot.html should not use style.display');
assert(!files.robot.includes('style.cursor'), 'robot.html should not use style.cursor');
assert(!files.oyna.includes('style.display'), 'oyna.html should not use style.display');
assert(!files.oyna.includes('style.cursor'), 'oyna.html should not use style.cursor');
console.log(`inline style say?lar?: problem=${metrics.problemInline}, robot=${metrics.robotInline}, oyna=${metrics.oynaInline}`);
console.log(`direct style yaz?mlar?: problem=${metrics.problemStyleWrites}, robot=${metrics.robotStyleWrites}, oyna=${metrics.oynaStyleWrites}`);
console.log(`theme-compat override sat?rlar?: ${metrics.compatOverrides}`);
console.log('  ? tasar?m sistemi tokenlar? ve ortak s?zle?me denetimi ge?ti');
