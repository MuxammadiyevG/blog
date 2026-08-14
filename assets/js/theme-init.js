/* Runs before the stylesheet so the stored theme is already on <html> when the first
   paint happens. Must stay a blocking, synchronous script in <head> — defer or async
   would let the page draw in the wrong theme first. */
(function () {
  var THEMES = ['blueprint', 'amber', 'neon', 'phosphor', 'paper', 'mono'];

  // The site shipped with a two-theme toggle before the palettes were named.
  var LEGACY = { light: 'blueprint', dark: 'amber' };

  try {
    var t = localStorage.getItem('theme');
    if (LEGACY[t]) {
      t = LEGACY[t];
      localStorage.setItem('theme', t);
    }
    if (THEMES.indexOf(t) !== -1) {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
