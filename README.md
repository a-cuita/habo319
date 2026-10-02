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

### Sheet tabs

The backend creates these on first use; all of them can be edited by hand.

- **Settings**: `Preview access code` (the code that unlocks the preview questions; clear it to turn preview access off) and `Preview intro`.
- **Preview Questions**: one question per row; answer choices separated by `|`, or blank for a written answer.
- **Preview Responses**: one row per answered question, with who answered and when.

## Deploying

**Site:** merge to `main`; GitHub Pages republishes within a couple of minutes.

**Backend:** run from the repo root. `.clasp.json` points clasp at the Sheet's script, with `backend/` as its source folder.

```sh
clasp push        # upload backend/ to the script
clasp redeploy AKfycbwQa-dTjs1ZBjkP4-bTE9Ktsxrp7j45A55sIg_nt0EWIjENT3C7kLvXKyo6qDM-Dg4V
                  # move the live web app to the new code
```

Updating that existing deployment, rather than creating a new one, keeps the web app URL the same, so `config.js` doesn't change.

The script is bound to the program's Sheet (its ID is `parentId` in `.clasp.json`), and its web app runs as the Sheet's owner, open to anyone. Opening the web app URL in a browser runs a health check.

## History

Until October 2026 this repo held the CMRA litter-tracking app (volunteers, team leaders, GPS-tracked legs, maps). Its backend lived in an account this project no longer controls, so it was removed. The last version is commit `611e626`, kept for the planned litter-tracking rebuild.
