/**
 * Email from HABO's address (Q384 (a)): the litter page's codes, and copies
 * of signed waivers. Sent through Gmail as the script's owner, from the
 * "Emails from" address in Settings, which has to be one of the owner's
 * Gmail "Send mail as" addresses.
 */

// Sends one email: { ok } or { ok: false, why }. `inline` is an optional
// picture the HTML shows by its cid, like the drawn signature.
function sendMail_(to, subject, plain, html, inline) {
  var from = getSetting_(SETTING_EMAILS_FROM).trim() || DEFAULT_EMAILS_FROM;
  try {
    Gmail.Users.Messages.send({ raw: mimeMessage_(from, to, subject, plain, html, inline) }, 'me');
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, why: String((e && e.message) || e).replace(/^.*?failed with error:\s*/, '') };
  }
}

// The email as Gmail's API takes it: a MIME message, plain and formatted,
// the formatted one with its picture beside it.
function mimeMessage_(from, to, subject, plain, html, inline) {
  var b = 'habo' + Utilities.getUuid().replace(/-/g, '');
  var word = function (s) { return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?='; };
  var b64 = function (s) { return Utilities.base64Encode(s, Utilities.Charset.UTF_8).replace(/(.{76})/g, '$1\r\n'); };
  var htmlPart = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html)];
  if (inline) {
    var r = 'habor' + Utilities.getUuid().replace(/-/g, '');
    htmlPart = ['Content-Type: multipart/related; boundary="' + r + '"', '', '--' + r].concat(htmlPart, ['--' + r,
      'Content-Type: ' + inline.type + '; name="' + inline.name + '"', 'Content-Transfer-Encoding: base64', 'Content-ID: <' + inline.cid + '>',
      'Content-Disposition: inline; filename="' + inline.name + '"', '', Utilities.base64Encode(inline.bytes).replace(/(.{76})/g, '$1\r\n'), '--' + r + '--']);
  }
  var mime = ['From: ' + word('Help A Brother Out Foundation') + ' <' + from + '>', 'To: ' + to, 'Subject: ' + word(subject),
    'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' + b + '"', '',
    '--' + b, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(plain),
    '--' + b].concat(htmlPart, ['--' + b + '--', '']).join('\r\n');
  return Utilities.base64EncodeWebSafe(mime);
}

function htmlEscape_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
