(function () {
  if (typeof mermaid === 'undefined') { return; }

  function themeVariables() {
    var s = getComputedStyle(document.documentElement);
    var v = function (name) { return s.getPropertyValue(name).trim(); };
    return {
      background:         v('--sheet'),
      primaryColor:       v('--code-bg'),
      primaryTextColor:   v('--ink'),
      primaryBorderColor: v('--ink-2'),
      secondaryColor:     v('--code-bg'),
      tertiaryColor:      v('--sheet'),
      lineColor:          v('--ink-2'),
      textColor:          v('--ink'),
      fontFamily:         "'Plex Mono', ui-monospace, monospace",
      fontSize:           '13px'
    };
  }

  function draw() {
    // securityLevel 'strict' keeps mermaid from rendering HTML inside diagram labels.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables()
    });
    mermaid.run({ querySelector: '.mermaid' });
  }

  document.querySelectorAll('.mermaid').forEach(function (el) {
    el.dataset.source = el.textContent;
  });

  window.__redrawMermaid = function () {
    document.querySelectorAll('.mermaid').forEach(function (el) {
      el.removeAttribute('data-processed');
      el.innerHTML = el.dataset.source;
    });
    draw();
  };

  draw();
})();
