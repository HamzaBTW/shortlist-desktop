# Shortlist

A calm desktop app for the open-source [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search) workflow. It is a front-end only: your profile, tracker and application folders stay in your own copy of ai-job-search, and every button runs that repo's own commands.

**Status:** early. It connects to your folder and to your own signed-in Claude Code, adds jobs and checks your fit, finds and ranks new jobs, shows your tracker as a board, and records status updates. Still to come: API-key engine, setup checklist, Profile and Reports screens.

## Platforms
Windows is tested. macOS and Linux builds are set up but untested; contributors welcome.

## Develop
Needs Node 24 or newer.

```
npm install
npm run dev        # run with live reload
npm test           # unit tests
npm run build      # type-check and build
npm run dist:win   # Windows installer (also dist:mac, dist:linux)
```

## How it is put together
- `src/main`: the Electron main process. Opens the window, serves the screens from a private `app://` address, answers the screens' requests.
- `src/preload`: the bridge. The screens get only the functions listed in `src/shared/ipc.ts`.
- `src/renderer`: the screens (React + TypeScript). All text is in `src/renderer/src/locales/`.
- `design/`: copies from the Shortlist design system. `npm run tokens` turns `design/tokens.json` into CSS variables.

## Privacy and safety
- No account, no telemetry, no network port. The screens cannot reach the internet; only the AI engine you connect does.
- The window runs sandboxed with context isolation and a strict content security policy. Pop-ups, navigation away from the app and embedded web views are blocked.
- The app never writes your job-search files itself. The AI commands do, after you approve.

## What runs without asking
Commands run inside your folder through your own Claude Code. By default these go ahead without a card:
- File changes inside your folder (your folder's own protected files still ask). A Settings switch makes every change ask.
- Reading web pages and searching the web. A Settings switch makes each one ask.
- The Indeed connector's `search_jobs` and `get_job_details`, when you have the connector.

These always ask (Allow once / Deny): anything else a command wants to do, and Indeed company details, and only while drafting an application (`/apply`).

These are always refused, whatever the settings: changes outside your folder, uploading to GitHub (`git push`), deleting folders, administrator commands, and reading your résumé on Indeed.

## Job sources
Settings has a number per source (LinkedIn, freehire, Indeed, careers pages; 5 each by default; 0 skips a source) that limits how many postings each adds per search. Postings missing a company, location, description or apply link are listed so you can close them with one click. Indeed cannot load more results, so a source that falls short may stay short.

## Licence
MIT. Bundled fonts: SIL Open Font License 1.1.
