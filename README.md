# habo319 — Volunteer Check-in

A simple site where volunteers in the 319 grant program check in, record attendance, and log hours.

**Status:** under construction. The live site shows a "coming soon" page.

## How it fits together

| Part | What it is | Where it runs |
|---|---|---|
| Site: `index.html`, `assets/`, `config.js` | Static pages volunteers use on their phones | GitHub Pages, from the `main` branch: https://a-cuita.github.io/habo319/ |
| Backend: `backend/` | An Apps Script web app **bound to a Google Sheet**. The Sheet holds all data, so it can be read, audited, and hand-edited directly. | Google Apps Script, under the project owner's Google account |

`config.js` holds the backend's web app URL, the only link between the two.

Admin tools (planned) will live in the Sheet itself: a custom menu that opens a modal dialog.

## Deploying

**Site:** merge to `main`; GitHub Pages republishes within a couple of minutes.

**Backend:** run from the repo root. `.clasp.json` points clasp at the Sheet's script, with `backend/` as its source folder.

```sh
clasp push                      # upload backend/ to the script
clasp redeploy <deploymentId>   # move the live web app to the new code
```

Updating the existing deployment, rather than creating a new one, keeps the web app URL the same, so `config.js` doesn't change.

## History

Until October 2026 this repo held the CMRA litter-tracking app (volunteers, team leaders, GPS-tracked legs, maps). Its backend lived in an account this project no longer controls, so it was removed. The last version is commit `611e626`, kept for the planned litter-tracking rebuild.
