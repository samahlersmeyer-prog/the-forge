# The Forge — notes for Claude

Sam's strength + speed training app for himself (adult, former D3 athlete) and his 13-year-old son Max. Live at
https://samahlersmeyer-prog.github.io/the-forge/ (GitHub Pages from `main`, installed on iPhones as a home-screen app).
Pushing to `main` deploys. Built like Big Dawg Daily (`samahlersmeyer-prog/bigdawg`): static files + Google Sheet/Apps Script.

## Working rules
- After any change: `python3 tools/stamp.py`, then commit and push. It runs the engine checks (`node tools/test-engine.mjs`)
  and refuses to stamp if they fail, then bumps `?v=` and the `sw.js` cache so phones update. Never hand-edit `?v=` or `V`/`SHELL` in `sw.js`.
- Try changes with `node tools/dev-server.mjs` (runs the real `server/Code.gs` against an in-memory Sheet; PIN 1234;
  `NO_COACH=1` tests the free Coach mode). Check on a 390px-wide screen.
- Commit messages: short, plain, feature-first.
- Keep this file current and about a page.

## Programming rules (Sam's, don't break them)
- ONE core lift per session: Squat, Bench, Clean and Deadlift each get their own day. Never two on one day — this includes
  teen technique variations (goblet squat = squat, DB bench = bench, hang clean pull/hang power clean = clean, trap-bar = deadlift).
- No separate speed days needed: sprints/agility/ladder + jumps/throws open every lifting day. Only a 5-day week adds a light Athletic Day.
- 4 days: adult Mon SQ · Tue BP · Thu CL · Fri DL; teen Mon · Tue · Thu · Sat (clean and deadlift not back to back).
  2–3 days: lifting days rotate SQ → BP → CL → DL (`nextDay` in engine.js).
- Teen: form gate (2 sessions at top of range with form 4–5 before +weight), small jumps, no max-testing language,
  16-lifting-set soft cap, never two lower-body lifting days in a row, parent notes on teen sessions.

## Layout
- `index.html` markup only. `styles.css` all styles (light/dark by system; adult = forge orange, teen = blue via `body.teen-on`).
- `config.js` — Apps Script `/exec` URL (blank = phone-only mode).
- `js/data.js` — exercise library `EXERCISES` / `EX` (form cues split by " | ").
- `js/howto.js` — `HOW[id]`: plain-English what/setup/steps + YouTube demo search for every exercise; `howBlock()` shows it on Plan and in the runner (open the first time a lifter does it). Every new exercise needs a HOW entry — the engine check fails without one.
- `js/engine.js` — pure logic: `generatePlan`, `nextDay`, `suggest` (double progression), `scoreWorkout` (PRs, XP, streak + monthly freeze, badges).
- `js/core.js` — local DB mirror of the Sheet, outbox (`af:out`) + `sync()`/`flush()`, `api()`, toast/modal/confetti/chime, `show(view)`, `ACTIONS` click delegation (`data-act`).
- `js/views.js` — Home, Plan, Progress (sparklines), Profile/specs form, lifter switcher. Tapping someone in Home's Family card
  = coaching them (`AS`/`coachAs()` in core.js): `profile()` follows them, a banner shows "Coaching Max · Back to Sam", lasts 6 h.
- `js/workout.js` — in-gym runner; state saved per workout in `af:w:*`; finish → Sets/Metrics/Sessions/Progress rows.
  "Workout day" picker on finish (today or up to 7 days back) for typing in numbers after the fact.
- `js/coach.js` — Coach. `coachOn()` = Sheet says an API key is set → in-app answers, `vetChanges()` checks every
  workout change in code (teen: never heavier, never more sets, never a second core lift). Otherwise free mode:
  `openInClaude()` opens claude.ai/new?q= with rules + context.
- `js/boot.js` — PIN once per phone, who's training, first sync, service worker. Never a blank screen: render errors show a card
  (`showCrash`) with Reload / "Reset this phone" (clears `af:*`, caches, service worker); sign-in has a "Stuck?" link + 8 s watchdog.
- `server/Code.gs` — Apps Script backend (tabs auto-created, PIN check, `sync`/`save`, `coach`/`recap` via the Anthropic API;
  key in Script Properties `ANTHROPIC_API_KEY`; model in Config tab "Coach model"). `server/Loader.gs` is pasted once and
  pulls `Code.gs` from GitHub, so server changes go live in ~10 min with no deploy.
- Sheet tabs: Profiles, Plans (days/schedule/rules as JSON), Sessions, Sets, Metrics, Progress, Recaps, Coach, Config.

## To-do
- Sheet connected (Nov 2026): "The Forge — Data" in Sam's Drive, Apps Script project "The Forge Server", web app deployed
  (Execute as Me, Anyone), URL in `config.js`. PIN lives in the Config tab. Coach is in free mode until an API key is added (README step 5).
- Ideas: more for Max (Max Effort challenges), coach-written weekly plan tweaks, charts on the Progress tab.
