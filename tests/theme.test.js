import assert from 'node:assert/strict';
import { isTheme, resolveTheme, safeStoredTheme, persistTheme, THEME_KEY } from '../core/theme.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log('  \u2713', name);
};

test('yaln\u0131z light ve dark ge\u00e7erlidir', () => {
  assert(isTheme('light'));
  assert(isTheme('dark'));
  assert(!isTheme('sepia'));
});

test('kay\u0131tl\u0131 light uygulan\u0131r', () => assert.equal(resolveTheme('light'), 'light'));
test('kay\u0131tl\u0131 dark uygulan\u0131r', () => assert.equal(resolveTheme('dark'), 'dark'));
test('tercih yoksa dark kullan\u0131l\u0131r', () => assert.equal(resolveTheme(null), 'dark'));
test('ge\u00e7ersiz kay\u0131t dark olur', () => assert.equal(resolveTheme('x'), 'dark'));
test('okuma hatas\u0131 g\u00fcvenlidir', () => assert.equal(safeStoredTheme({ getItem() { throw Error(); } }), null));
test('tercih saklan\u0131r', () => {
  let value;
  assert(persistTheme('dark', { setItem(key, next) { assert.equal(key, THEME_KEY); value = next; } }));
  assert.equal(value, 'dark');
});
test('yazma hatas\u0131 g\u00fcvenlidir', () => assert.equal(persistTheme('light', { setItem() { throw Error(); } }), false));
test('storage hatas\u0131nda dark ile ba\u015flan\u0131r', () => assert.equal(resolveTheme(safeStoredTheme({ getItem() { throw Error(); } })), 'dark'));

console.log(`\nTema birim testleri: ${passed}/${passed}`);
