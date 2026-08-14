(function () {
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', function () {
    var root = document.documentElement;
    var current = root.getAttribute('data-theme');
    if (!current) {
      current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}

    // Mermaid bakes colours into the SVG it produces, so a theme switch means redraw.
    if (window.__redrawMermaid) { window.__redrawMermaid(); }
  });
})();
