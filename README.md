# habo319 — Volunteer Check-in

A simple site where volunteers in the 319 grant program check in, record attendance, and log hours.

**Status:** check-in works end to end; the home page still shows "coming soon" (with reviewer questions behind an access code).

## Pages

- **Event check-in** `?e=CODE`: what an event's QR code opens. A volunteer enters their name and email or phone, agrees to the event's waivers, and is checked in. Their phone remembers their details for next time.
- **Event iPad** `?e=CODE&kiosk=1`: for the check-in table. The event's QR code, big, beside a sign-in form for people without phones. It resets after each check-in (and after a few idle minutes) and never remembers anyone.
- Add `&preview=1` to either to see it with saving turned off; the admin modal's preview does this.

Check-in is open from 60 minutes before an event starts until 60 minutes after it ends (both adjustable in Settings). Volunteers are matched by first and last name plus email or phone, so family members who share a phone or email keep separate hours.

## How it fits together

| Part | What it is | Where it runs |
|---|---|---|
| Site: `index.html`, `assets/`, `config.js` | Static pages volunteers use on their phones | GitHub Pages, from the `main` branch: https://a-cuita.github.io/habo319/ |
| Backend: `backend/` | An Apps Script web app **bound to a Google Sheet**. The Sheet holds all data, so it can be read, audited, and hand-edited directly. | Google Apps Script, under the project owner's Google account |

`config.js` holds the backend's web app URL, the only link between the two.

Admin tools live in the Sheet itself: the **HABO 319 Admin** menu opens a modal with three views. **Events**: create and edit events, pick their waivers, assign a host and co-hosts, and see a live phone/iPad preview of the event's check-in pages, its QR code, and the link for the event iPad. **People**: profiles for staff and hosts (title, short bio, headshot), with a preview of how each person appears on public screens. **Waivers**: the waiver texts events can use, each Required or Optional. Only people who can edit the Sheet see the menu.

Headshots are kept in a private **Headshots** Drive folder next to the Sheet. Upload one from the modal, or drop images into the folder and pick them there; either way the modal crops it to a 512px square. Public pages will get photos through the backend, so the folder never needs to be shared.

### Sheet tabs

The backend creates these on first use; all of them can be edited by hand.

- **Events**: one row per event. A row typed in by hand gets its Event ID and Check-in code the next time the admin modal opens. Hours is a formula over Start and End, so fixing an event's times updates its hours; don't type into that column. Host and Co-hosts name people as `Name (P001)`, with co-hosts separated by `;`; a name typed without its ID is matched by name. With one person on an event, they're the host.
- **People**: one row per staff member or host. A blank Active cell counts as active; a blank "Show publicly" cell counts as no. Photo is a link to the person's headshot in Drive.
- **Waivers**: one row per waiver. Type is Required (must agree to check in) or Optional (agree or decline, e.g. a photo release). Only Active waivers are shown; the seeded placeholders stay inactive until their text is replaced.
- **Volunteers**: one row per volunteer, created at their first check-in. Check-ins and Total hours are live formulas over the Check-ins tab.
- **Check-ins**: one row per volunteer per event. Event hours comes live from the event; type into **Adjusted hours** for exceptions (late arrival, left early) and **Hours** uses it instead. Total Hours for in-kind match reporting.
- **Waiver Signatures**: every waiver decision at check-in, with the typed signature and a fingerprint of the exact text shown (the same text always gives the same fingerprint).
- **Settings**: `Preview access code` (the code that unlocks the preview questions; clear it to turn preview access off), `Preview intro`, `Public site URL` (where event QR codes point), `Headshots folder` (filled in when the folder is first created), and the check-in window (`Check-in opens (minutes before start)`, `Check-in closes (minutes after end)`).
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
