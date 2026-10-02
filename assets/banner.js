// Draws a banner card (Banner Cards tab) the same way on the event iPad and
// in the admin modal's preview; tools/build-banner-view.sh copies this file
// into the backend for the modal. A card's title and text are formatted text
// from the modal's editor, or plain text typed into the Sheet. Formatted text
// is cleaned down to a short list of formatting tags and styles before it is
// shown, so nothing else in it can run or load.
window.BannerView = (function () {
  'use strict';

  var LAYOUTS = ['text', 'left', 'right', 'top', 'background', 'image'];
  var POSITIONS = ['top', 'middle', 'bottom'];
  var IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/;
  var COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;

  // Tags kept as they are; anything else not in DROP is replaced by its text.
  var KEEP = { b: 1, strong: 1, i: 1, em: 1, u: 1, s: 1, strike: 1, del: 1, br: 1, p: 1, div: 1, span: 1,
    ul: 1, ol: 1, li: 1, h1: 1, h2: 1, h3: 1, font: 1 };
  var DROP = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, template: 1, img: 1, svg: 1, math: 1,
    link: 1, meta: 1, title: 1, head: 1, noscript: 1, video: 1, audio: 1, canvas: 1, form: 1, input: 1,
    button: 1, select: 1, textarea: 1 };
  // Text sizes from the editor, relative to the card's normal text size.
  var SIZES = { 'x-small': '0.75em', small: '0.875em', medium: '1em', large: '1.25em', 'x-large': '1.5em',
    'xx-large': '2em', 'xxx-large': '2.5em' };
  var FONT_SIZES = ['0.75em', '0.875em', '1em', '1.25em', '1.5em', '2em', '2.5em'];

  // Each allowed style property, with the cleaned value or '' to drop it.
  var STYLES = {
    'text-align': function (v) { return /^(left|center|right|justify|start|end)$/.test(v) ? v : ''; },
    'font-weight': function (v) { return /^(bold|bolder|normal|[1-9]00)$/.test(v) ? v : ''; },
    'font-style': function (v) { return /^(italic|normal|oblique)$/.test(v) ? v : ''; },
    'text-decoration': decoration,
    'text-decoration-line': decoration,
    'color': function (v) { return COLOR.test(v) ? v : ''; },
    'font-size': function (v) { return SIZES[v] || (/^\d+(\.\d+)?(em|rem|%)$/.test(v) ? v : ''); }
  };
  function decoration(v) {
    var words = v.split(/\s+/).filter(function (w) { return /^(underline|line-through|none)$/.test(w); });
    return words.join(' ');
  }

  function cleanStyle(node) {
    var out = [];
    String(node.getAttribute('style') || '').split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var prop = decl.slice(0, i).trim().toLowerCase();
      var value = decl.slice(i + 1).trim().toLowerCase().replace(/\s*!important$/, '');
      var ok = STYLES[prop] ? STYLES[prop](value) : '';
      if (ok) out.push(prop + ': ' + ok);
    });
    var align = String(node.getAttribute('align') || '').toLowerCase();
    if (STYLES['text-align'](align)) out.push('text-align: ' + align);
    if (node.tagName.toLowerCase() === 'font') {
      var color = String(node.getAttribute('color') || '').trim();
      if (COLOR.test(color)) out.push('color: ' + color);
      var size = Number(node.getAttribute('size'));
      if (size >= 1 && size <= 7) out.push('font-size: ' + FONT_SIZES[size - 1]);
    }
    return out.join('; ');
  }

  function copyClean(from, to) {
    Array.prototype.forEach.call(from.childNodes, function (n) {
      if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (DROP[tag]) return;
      if (!KEEP[tag]) { copyClean(n, to); return; }
      var el = document.createElement(tag === 'font' ? 'span' : tag);
      var style = cleanStyle(n);
      if (style) el.setAttribute('style', style);
      copyClean(n, el);
      to.appendChild(el);
    });
  }

  // Formatted text with only the allowed tags and styles. The text is parsed
  // inside a <template>, where nothing runs or loads.
  function sanitize(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    var box = document.createElement('div');
    copyClean(tpl.content, box);
    return box.innerHTML;
  }

  function looksFormatted(s) {
    return /<\/?(b|strong|i|em|u|s|strike|del|br|p|div|span|ul|ol|li|h[1-3]|font)\b[^>]*>/i.test(s);
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The text without formatting, e.g. for a list of cards.
  function plain(value) {
    var s = String(value || '');
    if (!looksFormatted(s)) return s.trim();
    var tpl = document.createElement('template');
    tpl.innerHTML = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-3])>/gi, '\n');
    return tpl.content.textContent.replace(/ /g, ' ').replace(/\n{2,}/g, '\n').trim();
  }

  // Display HTML for a title or text cell: cleaned formatted text, or plain
  // text with its line breaks kept. '' when there's nothing to show.
  function html(value) {
    var s = String(value || '');
    if (!plain(s)) return '';
    return looksFormatted(s) ? sanitize(s) : escape(s.trim()).replace(/\r?\n/g, '<br>');
  }

  function isDark(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return false;
    var lum = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
    return lum < 0.55;
  }

  // card: { title, text, layout, position, background, image (data URL) }.
  // A layout that needs an image falls back to text only without one.
  function render(card) {
    card = card || {};
    var image = IMAGE.test(card.image || '') ? card.image : '';
    var layout = LAYOUTS.indexOf(card.layout) !== -1 && image ? card.layout : 'text';
    var position = POSITIONS.indexOf(card.position) !== -1 ? card.position : 'middle';
    var bg = /^#[0-9a-f]{6}$/i.test(card.background || '') ? card.background : '#ffffff';
    var dark = layout === 'background' || isDark(bg);
    var title = html(card.title), text = html(card.text);
    var img = !image ? ''
      : layout === 'image' ? '<img class="bv-full" src="' + image + '" alt="">'
      : '<div class="bv-img" style="background-image: url(' + image + ')"></div>';
    var body = layout === 'image' ? '' :
      '<div class="bv-body bv-p-' + position + '">' +
        (title ? '<div class="bv-title">' + title + '</div>' : '') +
        (text ? '<div class="bv-text">' + text + '</div>' : '') +
      '</div>';
    return '<div class="bv bv-l-' + layout + (dark ? ' bv-dark' : '') + '" style="background-color: ' + bg + '">' +
      img + (layout === 'background' ? '<div class="bv-shade"></div>' : '') + body + '</div>';
  }

  return { render: render, sanitize: sanitize, plain: plain, html: html, LAYOUTS: LAYOUTS };
})();
