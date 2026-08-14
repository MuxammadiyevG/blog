// WCAG 2.1 contrast check for every theme in the stylesheet.
//
// The palettes are read straight out of assets/css/style.css, so this file cannot drift
// away from what the site actually ships. Run it after touching any colour:
//
//   node docs/contrast-check.js
//
// Exit code is non-zero if any pair falls below its floor.

const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'assets', 'css', 'style.css');

const hex = (h) => {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const luminance = (h) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, floor]  — 3:1 is for decorative marks, not body text.
const CHECKS = [
  ['--ink', '--sheet', 4.5],
  ['--ink-2', '--sheet', 4.5],
  ['--muted', '--sheet', 4.5],
  ['--dim', '--sheet', 3.0],
  ['--link', '--sheet', 4.5],
  ['--link-hi', '--sheet', 4.5],
  ['--tag', '--sheet', 4.5],
  ['--rule', '--sheet', 1.8],
  ['--code', '--code-bg', 4.5],
  ['--syn-key', '--code-bg', 4.5],
  ['--syn-str', '--code-bg', 4.5],
  ['--syn-com', '--code-bg', 4.5],
  ['--syn-num', '--code-bg', 4.5],
  ['--syn-fn', '--code-bg', 4.5],
  ['--syn-tag', '--code-bg', 4.5],
  ['--syn-op', '--code-bg', 4.5],
  ['--syn-builtin', '--code-bg', 4.5],
  ['--syn-del', '--code-bg', 4.5],
  ['--syn-add', '--code-bg', 4.5],
];

function parseThemes(css) {
  const themes = {};

  // Every block whose selector mentions :root, minus the prefers-color-scheme copy
  // (identical to the amber theme by construction).
  const blockRe = /(:root[^{]*)\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const selector = m[1].trim();
    if (selector.includes(':not(')) continue; // the media-query duplicate

    const nameMatch = selector.match(/data-theme="([a-z]+)"/);
    const name = nameMatch ? nameMatch[1] : 'blueprint';

    const vars = themes[name] || (themes[name] = {});
    const varRe = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
    let v;
    while ((v = varRe.exec(m[2])) !== null) vars[v[1]] = v[2];
  }
  return themes;
}

const themes = parseThemes(fs.readFileSync(CSS, 'utf8'));
const names = Object.keys(themes);

if (names.length === 0) {
  console.error('No themes found in', CSS);
  process.exit(2);
}

let failed = 0;
let checked = 0;

for (const name of names) {
  const p = themes[name];
  const rows = [];

  for (const [fg, bg, floor] of CHECKS) {
    if (!p[fg] || !p[bg]) {
      console.error(`  ${name}: missing ${!p[fg] ? fg : bg}`);
      failed++;
      continue;
    }
    const r = ratio(p[fg], p[bg]);
    checked++;
    if (r < floor) {
      failed++;
      rows.push(`  FAIL  ${fg.padEnd(14)} on ${bg.padEnd(12)} ${r.toFixed(2)}:1  (min ${floor})`);
    }
  }

  if (rows.length) {
    console.log(`\n${name}`);
    rows.forEach((r) => console.log(r));
  } else {
    console.log(`ok    ${name.padEnd(11)} ${CHECKS.length} pairs`);
  }
}

console.log(`\n${checked} pairs checked across ${names.length} themes, ${failed} failing`);
process.exit(failed ? 1 : 0);
