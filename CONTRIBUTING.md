# Contributing to Shortlist

Thanks for helping. Shortlist is a small, calm desktop front-end for [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search). Bug reports, fixes, translations and testing on macOS or Linux are all welcome.

## Before you start
- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Problems with the job-search commands themselves (`/apply`, `/scrape`, `/rank` and so on) belong in the [ai-job-search repository](https://github.com/ai-job-search-dev/ai-job-search), not here.
- Security problems: see [SECURITY.md](SECURITY.md). Please don't open a public issue.

## Ground rules
These keep Shortlist safe and easy to maintain. Pull requests that break them can't be merged.

- **A thin layer.** Shortlist runs the framework's own slash commands unchanged. It holds no job-search logic of its own and never copies or rewrites the framework's `.claude/` files.
- **The app writes no job-search files.** It only reads `job_search_tracker.csv`, `job_scraper/seen_jobs.json`, `documents/applications/*` and compiled PDFs. The commands are the only writers. The app's own state lives in its local database.
- **No network from the window.** No new network access, remote scripts, fonts or images. Fonts are bundled.
- **Keep the safety rules.** Never skip permission checks, never turn off TLS verification, and never relax the rules that always refuse changes outside the folder, `git push`, deleting folders or administrator commands.
- **No personal data.** Tests and examples use made-up people and jobs, never a real CV or profile.
- **All screen text goes in the dictionaries** in `src/renderer/src/locales/`, and styles use CSS logical properties (`margin-inline-start`, not `margin-left`) so right-to-left languages work later.
- **Calm wording.** Closed jobs are never shown in red or with alarming words.
- **Design.** Use the existing tokens and `.sl-*` components from `design/` rather than new colours or one-off styles.

## Setting up
You need Node 24 or newer.

```
npm install
npm run dev        # run with live reload
npm test           # unit tests
npm run build      # type-check and build
```

To try the app end to end you need your own ai-job-search folder and a signed-in Claude Code. Use a test folder with a made-up profile, not your real one.

## Pull requests
- Keep each pull request to one change, with a short description of what and why.
- Add or update tests in `tests/` for behaviour you change. `npm run build` and `npm test` must pass; CI runs both on Windows and Linux (on Linux that covers the tests only; the app itself is untested there).
- Say which operating system you tested on. Windows is the tested platform; reports from macOS and Linux are especially useful.
- By contributing you agree that your work is released under the [MIT licence](LICENSE).
