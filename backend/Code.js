/**
 * Backend for the volunteer check-in site: an Apps Script web app bound to
 * the program's Google Sheet, which holds all of the data so it can be read,
 * audited, and hand-edited directly. Deployed with clasp (see README.md).
 *
 * The site POSTs JSON (sent as text/plain) and gets back either
 * { success: true, data } or { success: false, error }.
 */

var SERVICE_NAME = 'Volunteer Check-in';

// Actions the site can call, by name. Each handler gets the parsed request.
var ACTIONS = {
  health: health_
};

// Opening the web app URL in a browser runs the health check, which confirms
// the deployment is live and can reach the Sheet.
function doGet() {
  return respond_(health_);
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ success: false, error: 'Request body must be JSON' });
  }
  var action = req && req.action;
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
    return json_({ success: false, error: 'Unknown action: ' + action });
  }
  return respond_(function () { return ACTIONS[action](req); });
}

function health_() {
  getDb_();
  return { service: SERVICE_NAME, storage: 'connected', time: new Date().toISOString() };
}

// The Sheet this script is bound to.
function getDb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script is not bound to a spreadsheet');
  return ss;
}

function respond_(fn) {
  try {
    return json_({ success: true, data: fn() });
  } catch (err) {
    console.error(err);
    return json_({ success: false, error: err.message || String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
