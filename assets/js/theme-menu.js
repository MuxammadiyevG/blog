(function () {
  var menu = document.querySelector('.theme-menu');
  if (!menu) return;

  var buttons = menu.querySelectorAll('[data-theme-set]');

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'default';
  }

  function mark() {
    var now = current();
    buttons.forEach(function (b) {
      var on = b.getAttribute('data-theme-set') === now;
      b.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var choice = btn.getAttribute('data-theme-set');
      var root = document.documentElement;

      if (choice === 'default') {
        root.removeAttribute('data-theme');
        try { localStorage.removeItem('theme'); } catch (e) {}
      } else {
        root.setAttribute('data-theme', choice);
        try { localStorage.setItem('theme', choice); } catch (e) {}
      }

      mark();
      menu.removeAttribute('open');

      // Mermaid bakes colours into the SVG it produces, so a theme change means redraw.
      if (window.__redrawMermaid) { window.__redrawMermaid(); }
    });
  });

  // Clicking anywhere else closes the menu.
  document.addEventListener('click', function (e) {
    if (menu.hasAttribute('open') && !menu.contains(e.target)) {
      menu.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { menu.removeAttribute('open'); }
  });

  mark();
})();
