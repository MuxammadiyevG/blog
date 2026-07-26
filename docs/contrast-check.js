// WCAG 2.1 relative luminance + contrast ratio check for both palettes.
const hex = (h) => {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lum = (h) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const light = {
  sheet: '#f4f7fa', ink: '#0a1830', ink2: '#22304a', muted: '#4e5f78', dim: '#77869c',
  link: '#1a52c4', code: '#a02d00', tag: '#276044', codebg: '#e7edf4',
  synKey: '#6d2b9c', synStr: '#276044', synCom: '#586880', synNum: '#a02d00',
  synFn: '#1a52c4', synTag: '#0a5f59', synBuiltin: '#7a4100',
};
const dark = {
  sheet: '#14110c', ink: '#ffb642', ink2: '#e6a83f', muted: '#b28a4e', dim: '#8a6c3d',
  link: '#ff9440', code: '#ff8a5c', tag: '#a8cf6a', codebg: '#0a0806',
  synKey: '#ff9a52', synStr: '#cddc86', synCom: '#9b7f52', synNum: '#ffd479',
  synFn: '#ffc247', synTag: '#ffab63', synBuiltin: '#ff8a3d',
};

// [token, background token, WCAG floor]
const checks = [
  ['ink', 'sheet', 4.5], ['ink2', 'sheet', 4.5], ['muted', 'sheet', 4.5],
  ['dim', 'sheet', 3.0], ['link', 'sheet', 4.5], ['tag', 'sheet', 4.5],
  ['code', 'codebg', 4.5],
  ['synKey', 'codebg', 4.5], ['synStr', 'codebg', 4.5], ['synCom', 'codebg', 4.5],
  ['synNum', 'codebg', 4.5], ['synFn', 'codebg', 4.5], ['synTag', 'codebg', 4.5],
  ['synBuiltin', 'codebg', 4.5],
];

let failed = 0;
for (const [name, palette] of [['LIGHT', light], ['DARK', dark]]) {
  console.log(`\n${name}`);
  for (const [fg, bg, floor] of checks) {
    const r = ratio(palette[fg], palette[bg]);
    const ok = r >= floor;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${fg.padEnd(11)} on ${bg.padEnd(7)} ` +
      `${r.toFixed(2)}:1  (min ${floor})`
    );
  }
}
console.log(`\n${failed} failing pair(s)`);
process.exit(failed ? 1 : 0);
