// The one place the litter page is connected to its backend.
// API_URL is the litter Apps Script web app's /exec URL; while it's empty the
// page shows its "coming soon" state instead of calling a backend. Opened on
// the web app's own link, the page calls the backend directly and this isn't
// used.
window.LITTER_CONFIG = {
  API_URL: ''
};
