// Shared helpers for the site's pages. Load config.js before this file.
(function () {
  'use strict';

  var config = window.APP_CONFIG || {};

  // Calls one backend action and resolves with its data. The JSON body is
  // sent as text/plain because Apps Script web apps can't answer the CORS
  // preflight that a JSON content type would trigger.
  function api(action, data) {
    if (!config.API_URL) return Promise.reject(new Error('Backend not configured'));
    return fetch(config.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, data || {}))
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Server error (' + res.status + ')');
        return res.json();
      })
      .then(function (res) {
        if (!res.success) throw new Error(res.error || 'Request failed');
        return res.data;
      });
  }

  // Escapes text for HTML, including attribute values.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.App = { isConfigured: !!config.API_URL, api: api, esc: esc };
})();
