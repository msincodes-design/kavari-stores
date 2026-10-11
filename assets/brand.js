/* Kavari Stores — the golden hanger, drawn once and used everywhere. */
(function (g) {
  'use strict';
  var HANGER =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 6.6V5.9"/>' +
    '<circle cx="12" cy="4.1" r="1.6"/>' +
    '<path d="M12 6.6 3.4 12.9c-.9.6-.5 2 .6 2h16c1.1 0 1.5-1.4.6-2L12 6.6z"/>' +
    '</svg>';

  /** Paint every .brand__mark on the page with the logo. */
  function drawHanger(root) {
    var marks = (root || document).querySelectorAll('.brand__mark');
    for (var i = 0; i < marks.length; i++) {
      if (!marks[i].dataset.drawn) { marks[i].innerHTML = HANGER; marks[i].dataset.drawn = '1'; }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { drawHanger(); });
  else drawHanger();

  g.KavariBrand = { HANGER: HANGER, drawHanger: drawHanger };
})(window);
