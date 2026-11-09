# The Forge

Strength + speed training for the Ahlersmeyer household: one adult profile, one teen/athlete profile.
Live at **https://samahlersmeyer-prog.github.io/the-forge/** — open it on each phone, then Share → **Add to Home Screen**.

- **Plans built from your specs.** One core lift per session (Squat, Bench, Clean, Deadlift days), speed/agility/jumps
  to open every lifting day, double progression, and stricter teen rules (technique variations, form gate, no max testing).
- **In-gym logging.** Last time vs. today's target on every set, big +/− buttons, form rating, rest timer, works with no signal.
- **Coach (Claude).** Ask questions, have Coach adjust today's workout, and get post-workout and weekly write-ups.
- **XP, streaks (one freeze a month), badges and a family feed**, including the 💯 Max Effort badge for the teen.

## Costs

Free: GitHub Pages hosting, the Google Sheet and Apps Script.
Coach works two ways:

- **Free (default):** Coach buttons open your Claude app with the question, the coaching rules and your numbers already
  filled in. Claude accounts are for adults, so the teen's questions go through Dad's Claude.
- **Built-in (optional, pay-as-you-go):** add an Anthropic API key (step 5) and Coach answers inside the app, can apply
  workout changes with one tap, and writes recaps automatically. Expect a few dollars a month or less for two lifters.

## Setup (about 15 minutes, once)

1. **Make the Sheet.** Create a blank Google Sheet named **The Forge — Data**.
2. **Paste the loader.** In the Sheet: **Extensions → Apps Script**. Delete what's there, paste all of
   [`server/Loader.gs`](server/Loader.gs), and save. Choose **setup** in the function menu and click **Run**; approve the
   permissions. It creates every tab plus a **Config** tab.
3. **Set the PIN.** In the Config tab, type a **Household PIN** next to that row (everyone types it once per phone).
4. **Deploy.** Apps Script → **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Copy the URL
   ending in `/exec` and send it to Claude (it goes in `config.js`).
5. *(Optional, built-in Coach)* Get an API key at console.anthropic.com. In Apps Script → **Project Settings → Script
   properties → Add**: name `ANTHROPIC_API_KEY`, value = the key. Never put the key in the Sheet or in GitHub.

After that, server updates arrive on their own: the loader pulls `server/Code.gs` from this repo (about 10 minutes after a push).

## Without the Sheet

With `config.js` blank, the app still works on one phone (data saved on that phone only) and Coach uses the free
Claude-app mode.
