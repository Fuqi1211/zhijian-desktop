const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function extractFunction(name) {
  const pattern = new RegExp(`function ${name}\\([^]*?\\n      \\}`);
  const source = script?.match(pattern)?.[0];
  assert.ok(source, `Expected to find ${name} in index.html`);
  return source;
}

test('page script has valid JavaScript syntax', () => {
  assert.ok(script, 'Expected an inline page script');
  assert.doesNotThrow(() => new Function(script));
});

test('time-aware mode switches at 06:00 and 18:00', () => {
  const getTimedThemeSource = extractFunction('getTimedTheme');
  const resolveThemeSource = extractFunction('resolveTheme');
  const { getTimedTheme, resolveTheme } = new Function(`
    ${getTimedThemeSource}
    ${resolveThemeSource}
    return { getTimedTheme, resolveTheme };
  `)();

  const at = (hour, minute) => new Date(2026, 0, 1, hour, minute);
  assert.equal(getTimedTheme(at(5, 59)), 'dark');
  assert.equal(getTimedTheme(at(6, 0)), 'light');
  assert.equal(getTimedTheme(at(17, 59)), 'light');
  assert.equal(getTimedTheme(at(18, 0)), 'dark');
  assert.equal(resolveTheme('light', at(23, 0)), 'light');
  assert.equal(resolveTheme('dark', at(12, 0)), 'dark');
});

test('manual mode updates the page control and persisted preference', () => {
  const sources = ['getTimedTheme', 'resolveTheme', 'applyTheme', 'setThemeMode']
    .map(extractFunction)
    .join('\n');
  const harness = new Function(`
    let themeMode = 'auto';
    const document = { documentElement: { dataset: {} } };
    const elements = { themeSelect: { value: '', title: '' } };
    const writes = [];
    const localStorage = { setItem: (key, value) => writes.push([key, value]) };
    const THEME_MODE_KEY = 'zhijian.theme.mode.v2';
    ${sources}
    return {
      setThemeMode,
      state: () => ({ themeMode, theme: document.documentElement.dataset.theme, selectValue: elements.themeSelect.value, writes })
    };
  `)();

  harness.setThemeMode('dark');
  assert.deepEqual(harness.state(), {
    themeMode: 'dark',
    theme: 'dark',
    selectValue: 'dark',
    writes: [['zhijian.theme.mode.v2', 'dark']]
  });
});

test('footer exposes accessible automatic, light, and dark options', () => {
  assert.match(html, /<select id="themeSelect" aria-label="主题模式">/);
  assert.match(html, /<option value="auto">随时间<\/option>/);
  assert.match(html, /<option value="light">浅色<\/option>/);
  assert.match(html, /<option value="dark">深色<\/option>/);
  assert.doesNotMatch(html, /id="themeButton"/);
});
