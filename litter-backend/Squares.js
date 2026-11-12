/**
 * Squares written compactly (S6-P1, |Q662 (a), |M860, |M869): a run of
 * squares each one step from the last, in the same direction, is written as
 * its step and how many: "~357696_-805872 w7 357697_-805872 w7". n, s, e and
 * w are a square north, south, east and west; a, b, c and d the diagonals.
 * The order is kept exactly, and a list that wouldn't come out shorter stays
 * as it was. Kept in the same columns (Plans' Cells, Segments' Squares,
 * Stretches' Cells, Segment additions' Squares), and read back as the plain
 * list wherever it's read (readRows_ in Collect.js), so nothing that uses
 * squares changes. On the live Sheet, Nov 11: 348,902 characters to 51,662,
 * and the largest plan's cell from 34,561 to 5,187 (a cell holds 50,000).
 */
// Off until S7 (|Q759 (a), Nov 12): squares and tracks are written as before,
// and nothing already written is packed. Reading either form stays on, so a
// packed value, if one is ever written, still reads back the same.
var SQUARES_PACK_ON = false;
var SQ_STEPS = { n: [1, 0], s: [-1, 0], e: [0, 1], w: [0, -1], a: [1, 1], b: [1, -1], c: [-1, 1], d: [-1, -1] };
// A plan's stretches, " / " between them, are each packed on their own.
function squaresPack_(text) {
  var t = String(text == null ? '' : text);
  if (!SQUARES_PACK_ON) return t;
  if (t.indexOf('/') !== -1) return t.split(/\s*\/\s*/).map(squaresPackOne_).join(' / ');
  return squaresPackOne_(t);
}
function squaresUnpack_(text) {
  var t = String(text == null ? '' : text);
  if (t.indexOf('~') === -1) return t;
  if (t.indexOf('/') !== -1) return t.split(/\s*\/\s*/).map(squaresUnpackOne_).join(' / ');
  return squaresUnpackOne_(t);
}
function squaresPackOne_(text) {
  var list = String(text || '').split(/\s+/).filter(String);
  if (list.length < 3 || /^~/.test(String(text))) return String(text || '').trim();
  var parse = function (c) { var m = /^(-?\d+)_(-?\d+)$/.exec(c); return m ? [Number(m[1]), Number(m[2])] : null; };
  var out = [], prev = null, run = null;
  var flush = function () { if (run) { out.push(run.k + (run.n > 1 ? run.n : '')); run = null; } };
  for (var i = 0; i < list.length; i++) {
    var p = parse(list[i]);
    if (!p) return String(text).trim();   // not squares: left as it is
    var k = null;
    if (prev) Object.keys(SQ_STEPS).forEach(function (key) { if (SQ_STEPS[key][0] === p[0] - prev[0] && SQ_STEPS[key][1] === p[1] - prev[1]) k = key; });
    if (k && run && run.k === k) run.n++;
    else if (k) { flush(); run = { k: k, n: 1 }; }
    else { flush(); out.push(list[i]); }
    prev = p;
  }
  flush();
  var packed = '~' + out.join(' ');
  return packed.length < list.join(' ').length ? packed : list.join(' ');
}
function squaresUnpackOne_(text) {
  var t = String(text == null ? '' : text).trim();
  if (t.charAt(0) !== '~') return t;
  var out = [], at = null;
  t.slice(1).split(/\s+/).filter(String).forEach(function (tok) {
    var m = /^([nsewabcd])(\d*)$/.exec(tok);
    if (m && at) {
      var st = SQ_STEPS[m[1]], n = m[2] === '' ? 1 : Number(m[2]);
      for (var k = 0; k < n; k++) { at = [at[0] + st[0], at[1] + st[1]]; out.push(at[0] + '_' + at[1]); }
      return;
    }
    var p = /^(-?\d+)_(-?\d+)$/.exec(tok);
    if (p) { at = [Number(p[1]), Number(p[2])]; out.push(tok); }
  });
  return out.join(' ');
}

// Once: what's there now, packed.
function squaresPackOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (!SQUARES_PACK_ON || props.getProperty('SQUARES_PACKED')) return;
  // And each walk's GPX track (|M869).
  [[TABS.plans, PLAN_COL.cells, squaresPack_], [TABS.segments, SEGMENT_COL.squares, squaresPack_], [TABS.stretches, STRETCH_COL.cells, squaresPack_],
   [TABS.additions, ADDITION_COL.squares, squaresPack_], [TABS.collections, COLLECTION_COL.track, trackPack_]].forEach(function (x) {
    var sheet = getDb_().getSheetByName(x[0].name);
    var last = sheet ? sheet.getLastRow() : 0;
    if (last < 2) return;
    var range = sheet.getRange(2, x[1], last - 1, 1), values = range.getValues(), changed = false;
    var out = values.map(function (r) {
      var v = String(r[0] == null ? '' : r[0]);
      var p = v.trim() ? x[2](v) : v;
      if (p !== v) changed = true;
      return [p];
    });
    if (changed) { range.setNumberFormat('@'); range.setValues(out); }
  });
  forgetReads_();
  props.setProperty('SQUARES_PACKED', new Date().toISOString());
}

/**
 * GPX tracks written compactly (S6-P1, |M869): "~" and the first point in
 * hundred-thousandths of a degree, then each point as its step from the last,
 * "p" after a point inside a pause: "~3236985,-8629055;20,70;25,80p". The
 * points are exactly the ones kept before (5 decimal places), and
 * parseTrack_ reads either form, so nothing that uses a track changes.
 */
function trackPack_(text) {
  if (!SQUARES_PACK_ON) return String(text == null ? '' : text);
  var t = String(text == null ? '' : text).trim();
  if (!t || t.charAt(0) === '~') return t;
  var out = [], prev = null;
  var pts = t.split(';');
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i].split(',');
    var la = Math.round(Number(a[0]) * 1e5), lo = Math.round(Number(a[1]) * 1e5);
    if (!isFinite(la) || !isFinite(lo)) return t;   // not a track as the app writes it: left as it is
    var p = a[2] === 'p' ? 'p' : '';
    out.push(prev ? (la - prev[0]) + ',' + (lo - prev[1]) + p : la + ',' + lo + p);
    prev = [la, lo];
  }
  var packed = '~' + out.join(';');
  return packed.length < t.length ? packed : t;
}
function trackUnpack_(text) {
  var t = String(text == null ? '' : text).trim();
  if (t.charAt(0) !== '~') return t;
  var at = null, out = [];
  t.slice(1).split(';').forEach(function (s) {
    var m = /^(-?\d+),(-?\d+)(p?)$/.exec(s.trim());
    if (!m) return;
    var d = [Number(m[1]), Number(m[2])];
    at = at ? [at[0] + d[0], at[1] + d[1]] : d;
    out.push((at[0] / 1e5).toFixed(5) + ',' + (at[1] / 1e5).toFixed(5) + (m[3] ? ',p' : ''));
  });
  return out.join(';');
}
