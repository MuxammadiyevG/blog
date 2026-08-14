/* Runs before the stylesheet so the stored theme is already on <html> when the first
   paint happens. Must stay a blocking, synchronous script in <head> — defer or async
   would let the page draw in the wrong theme first. */
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
