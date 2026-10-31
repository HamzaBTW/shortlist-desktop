# Shortlist

A calm desktop app for the open-source [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search) workflow. It is a front-end only: your profile, tracker and application folders stay in your own copy of ai-job-search, and every button runs that repo's own commands.

**Status:** early. The app shell works (window, sidebar, themes, settings). Connecting a folder and an AI engine comes next.

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

## Licence
MIT. Bundled fonts: SIL Open Font License 1.1.
