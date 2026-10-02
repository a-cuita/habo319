# habo319 — Volunteer Check-in

A simple site where volunteers in the 319 grant program check in, record attendance, and log hours.

**Status:** check-in works end to end. The home page is the check-in for whichever event is open right now.

## Pages

- **Home page** https://a-cuita.github.io/habo319/: the check-in for whichever event's check-in is open right now (if two overlap, the one that started first). On a wide screen like the event iPad it's the iPad layout below; on a phone, the phone layout. When nothing is open it shows the next event and when its check-in opens, and switches over on its own once it does.
- **Event check-in** `?e=CODE`: what an event's QR code opens. A volunteer enters their name and email or phone, agrees to the event's waivers, signs with a finger, and is checked in. Their phone remembers their details for next time.
- **Event iPad** `?e=CODE&kiosk=1`: for the check-in table. The event's QR code, and a rotating banner (the event's hosts and any banner cards) in the event's card, beside a sign-in form for people without phones. It resets after each check-in (and after a few idle minutes) and never remembers anyone.
- **Staff**: the small "Staff" link at the bottom of every check-in screen, including the home page when nothing is open. It takes two kinds of code:
  - **Admin PIN** (each admin's own, on the People tab): works any time. It opens the same admin tools as the Sheet's modal (events, people, waivers, cards), full screen. During an event it also opens the head count. On the event iPad, 3 idle minutes sign the admin out; elsewhere a sign-in ends after 2 idle hours or on Sign out.
  - **Event staff code** (per event, for co-hosts and helpers): opens that event's head count, only while its check-in is open. The head count shows how many have checked in and who, and lets staff record the number they counted on site.
- **Preview questions** `?questions`: the reviewer questions from the Preview Questions tab, behind the preview access code.
- Add `&preview=1` to an event page to see it with saving turned off; the admin modal's preview does this.

Check-in is open from 60 minutes before an event starts until 60 minutes after it ends (both adjustable in Settings). Volunteers are matched by first and last name plus email or phone, so family members who share a phone or email keep separate hours. Returning volunteers are welcomed back with their event count and total hours.

Wrong codes lock for 15 minutes after 5 tries: all staff sign-ins share one count, and the preview code has its own.

## How it fits together

| Part | What it is | Where it runs |
|---|---|---|
| Site: `index.html`, `assets/`, `config.js` | Static pages volunteers use on their phones | GitHub Pages, from the `main` branch: https://a-cuita.github.io/habo319/ |
| Backend: `backend/` | An Apps Script web app **bound to a Google Sheet**. The Sheet holds all data, so it can be read, audited, and hand-edited directly. | Google Apps Script, under the project owner's Google account |

`config.js` holds the backend's web app URL, the only link between the two.

Admin tools live in the Sheet itself: the **HABO 319 Admin** menu opens a modal with four views. **Events**: create and edit events, pick their waivers, assign a host and co-hosts, and see a live phone/iPad preview of the event's check-in pages, its QR code, and the link for the event iPad. **People**: profiles for staff and hosts (title, short bio, headshot), with a preview of how each person appears on public screens. **Waivers**: the waiver texts events can use, each Required or Optional, and which upcoming events use them. **Cards**: short messages for the iPad banner. Only people who can edit the Sheet see the menu. Admins can also open the same tools from the site, with their admin PIN under "Staff".

Drawn signatures are saved as images in a private **Signatures** Drive folder next to the Sheet, linked from the Waiver Signatures tab.

Headshots are kept in a private **Headshots** Drive folder next to the Sheet. Upload one from the modal, or drop images into the folder and pick them there; either way the modal crops it to a 512px square. Public pages will get photos through the backend, so the folder never needs to be shared.

### Sheet tabs

The backend creates these on first use; all of them can be edited by hand.

- **Events**: one row per event. Waivers lists the waivers volunteers sign, as `Title (W001)`. Staff code unlocks the event's staff head count. Hosts on confirmation / Hosts in banner choose where the hosts appear (blank counts as yes). A row typed in by hand gets its Event ID and Check-in code the next time the admin modal opens. Hours is a formula over Start and End, so fixing an event's times updates its hours; don't type into that column. Host and Co-hosts name people as `Name (P001)`, with co-hosts separated by `;`; a name typed without its ID is matched by name. With one person on an event, they're the host.
- **People**: one row per staff member or host. A blank Active cell counts as active; a blank "Show publicly" cell counts as no. Photo is a link to the person's headshot in Drive. **Admin PIN** (6 to 8 digits, different for each admin and from every event's staff code) lets that person use the admin tools from the site; set it here or in the modal, which never shows it.
- **Waivers**: one row per waiver. Type is Required (must agree to check in) or Optional (agree or decline, e.g. a photo release). Only Active waivers are shown; the seeded placeholders stay inactive until their text is replaced.
- **Volunteers**: one row per volunteer, created at their first check-in. Check-ins and Total hours are live formulas over the Check-ins tab.
- **Check-ins**: one row per volunteer per event. Event hours comes live from the event; type into **Adjusted hours** for exceptions (late arrival, left early) and **Hours** uses it instead. Total Hours for in-kind match reporting.
- **Banner Cards**: short messages that rotate in the iPad banner after the event's hosts. A blank Active cell counts as active.
- **Head Counts**: every head count staff record on site, with the number checked in at that moment and the difference.
- **Waiver Signatures**: every waiver decision at check-in, with the volunteer's name, a link to the signature they drew, and a fingerprint of the exact text shown (the same text always gives the same fingerprint).
- **Settings**: `Preview access code` (the code that unlocks the preview questions; clear it to turn preview access off), `Preview intro`, `Public site URL` (where event QR codes point), `Headshots folder` and `Signatures folder` (filled in when each folder is first created), the check-in window (`Check-in opens (minutes before start)`, `Check-in closes (minutes after end)`), and `Banner seconds per card` (3 to 120).
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
