/**
 * Simulated walks, kept apart and easy to find (S5-U2, Nov 3, 2026).
 *
 * - The Simulations tab lists every simulated walk with the ids of its rows
 *   on the other tabs, and those rows are coloured orange on every tab, so
 *   they can be found and deleted by hand. The app keeps both up to date.
 * - Each admin's simulated walks are their own: another admin's count in
 *   your simulated world only once they're shared (Shared with admins).
 */

var SIM_ROW_COLOUR = '#fed7aa';   // orange, light enough to read through

// The simulated walks one admin may see: their own, and any shared.
function simAllowed_(accountId, q) {
  return q.get('simulated') === 'Yes' && (q.get('account') === accountId || /^\s*y/i.test(q.get('shared')));
}

// Rebuilds the Simulations tab and colours the simulated rows orange (and
// every other row plain) on Collections, Stretches, Segment rates and
// Changes. Call while holding the lock.
function refreshSimulations_() {
  var db = getDb_();
  var cols = readRows_(TABS.collections);
  var simIds = {};
  cols.forEach(function (q) { if (q.get('simulated') === 'Yes') simIds[q.get('id')] = q; });
  var stretches = readRows_(TABS.stretches), rates = readRows_(TABS.rates);
  var changes = db.getSheetByName(TABS.changes.name), chLast = changes.getLastRow();
  var chRows = chLast >= 2 ? changes.getRange(2, 1, chLast - 1, TABS.changes.header.length).getValues() : [];
  var simChange = function (v) { var item = String(v[3] || ''); return Object.keys(simIds).some(function (id) { return item === id || item.indexOf('(' + id + ')') !== -1; }); };
  // The tab.
  var out = Object.keys(simIds).sort().map(function (id) {
    var q = simIds[id];
    var st = stretches.filter(function (s) { return s.get('collection') === id; }).map(function (s) { return s.get('id'); });
    var rt = rates.filter(function (r) { return r.get('collection') === id; }).map(function (r) { return r.get('segment'); });
    var ch = [];
    chRows.forEach(function (v, i) { if (String(v[3] || '') === id || String(v[3] || '').indexOf('(' + id + ')') !== -1) ch.push(i + 2); });
    return [id, q.get('account'), q.get('started') || '', q.get('status'), /^\s*y/i.test(q.get('shared')) ? 'Yes' : '', st.join(' '), rt.join(' '),
      ch.length ? 'Rows ' + ch.join(', ') : '', new Date()];
  });
  var sheet = db.getSheetByName(TABS.simulations.name);
  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, TABS.simulations.header.length).clearContent();
  if (out.length) sheet.getRange(2, 1, out.length, TABS.simulations.header.length).setValues(out);
  // The colours, tab by tab: every row plain first, then the simulated ones orange.
  var paint = function (tab, rows, isSim) {
    var sh = db.getSheetByName(tab.name), n = sh.getLastRow();
    if (n < 2) return;
    sh.getRange(2, 1, n - 1, tab.header.length).setBackground(null);
    rows.forEach(function (r, i) { if (isSim(r)) sh.getRange(r.row || i + 2, 1, 1, tab.header.length).setBackground(SIM_ROW_COLOUR); });
  };
  paint(TABS.collections, cols, function (q) { return !!simIds[q.get('id')]; });
  paint(TABS.stretches, stretches, function (s) { return !!simIds[s.get('collection')]; });
  paint(TABS.rates, rates, function (r) { return !!simIds[r.get('collection')]; });
  paint(TABS.changes, chRows.map(function (v, i) { return { row: i + 2, v: v }; }), function (x) { return simChange(x.v); });
}

// Share one of your simulated walks with the other admins, or stop sharing it.
function simShare_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var col = readCollection_(clean_(req.collectionId, 20));
    if (!col || col.account !== account.id || !col.simulated) throw new Error('That simulated walk isn\'t yours, or isn\'t here any more.');
    getDb_().getSheetByName(TABS.collections.name).getRange(col.row, COLLECTION_COL.shared).setValue(req.shared === true ? 'Yes' : '');
    refreshSimulations_();
    return { collectionId: col.id, shared: req.shared === true };
  });
}

// Once: the Simulations tab filled and the rows coloured for the simulated
// walks already in the Sheet.
function simulationsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SIMULATIONS_TAB')) return;
  refreshSimulations_();
  props.setProperty('SIMULATIONS_TAB', new Date().toISOString());
}
