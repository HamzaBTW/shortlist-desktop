# Shortlist

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/launch-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/launch-light.svg">
    <img src="docs/launch-dark.svg" alt="Shortlist: a calm place for the whole job hunt." width="100%">
  </picture>
</p>

A calm desktop app for the open-source [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search) workflow. It is a front-end only: your profile, tracker and application folders stay in your own copy of ai-job-search, and every button runs that repo's own commands.

**Status:** early. It connects to your folder and runs on your own signed-in Claude Code or, if you prefer, your own Anthropic API key. It adds jobs and checks your fit, finds and ranks new jobs, shows your tracker as a board, and records status updates. It also checks this computer for the tools the commands use (Settings › This computer) without installing anything. A first-run wizard connects the AI, checks the computer, picks or sets up your folder and starts building your profile. The Profile screen shows each profile file read-only, with "Update with AI" for the parts the setup command can update. Reports shows how far applications got, replies by channel and skill gaps, and exports a PDF in the app's own design.

## Platforms
- **Windows:** tested. The installer is on the [Releases page](https://github.com/HamzaBTW/shortlist-desktop/releases).
- **Linux:** untested; contributors welcome. Releases carry a `.deb` (x64) for Ubuntu, Debian and Mint. Before a release it is only checked to install and start on the build machine, so a release can come without it when that check fails.
  - Install or update: `sudo apt install ./<the downloaded file>.deb`. Remove: `sudo apt remove shortlist`.
  - There is no AppImage: on many systems (Ubuntu 24.04 and newer) it would start with the sandbox switched off.
  - Other Linux systems: build from source with `npm run dist:linux`.
- **macOS:** untested; contributors welcome. Build from source with `npm run dist:mac`.

## Install (Windows)
1. Install what Shortlist needs first. It checks for these and never installs them for you:
   - **Claude Code** 2.1.310 or newer, installed. Either sign in to it (Shortlist then runs on your own Claude plan) or add an Anthropic API key in Shortlist (runs are billed to that key). See [Trust and privacy](#trust-and-privacy).
   - **A copy of [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search)**, or let the first-run wizard set up a new one. The wizard then helps you fill in your profile.
   - **Python 3.10 or newer**, **Bun**, and the **PDF toolkit** (`lualatex`, `xelatex`, the `pypdf` package and Poppler) that ai-job-search itself uses.
2. Download `Shortlist-Setup-<version>.exe` from the [Releases page](https://github.com/HamzaBTW/shortlist-desktop/releases) and run it. It installs for your user only, so it needs no administrator rights. You can pick the folder.
3. Windows may show **"Windows protected your PC"** because this build is not code-signed yet. That warning means "unknown publisher", not "malware found". To continue, choose **More info**, then **Run anyway**. To check the file first, compare its hash with the one in `SHA256SUMS.txt` on the same release: `Get-FileHash .\Shortlist-Setup-<version>.exe -Algorithm SHA256` in PowerShell.
4. Open Shortlist. The first-run wizard connects the AI, checks this computer and picks (or sets up) your job-search folder. You can change all of it later in Settings.

To remove it, use Windows **Settings > Apps > Shortlist > Uninstall**. Your job-search folder is never touched.

To build the installer yourself: `npm run dist:win` writes `dist/Shortlist-Setup-<version>.exe`.

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

## Trust and privacy
Shortlist is a front-end. It has no account, no telemetry, no analytics and no network port of its own. The window is sandboxed (context isolation, a strict content security policy, no pop-ups, no navigation away from the app, no embedded web views) and cannot reach the internet itself.

### How the AI signs in
You choose one engine in **Settings › AI engine**. Shortlist never switches engines by itself.
- **Your Claude Code** (default): Shortlist starts the Claude Code installed on your computer in the background, inside your job-search folder. It uses Claude Code's own sign-in and your own Claude plan. Shortlist never reads, stores or handles that login: it only asks Claude Code "signed in, yes or no?", and **Sign in** opens Claude Code's own sign-in in a terminal window.
- **Anthropic API key**: the same Claude Code program, run with your key instead of your sign-in, so runs are billed to your Anthropic account. Any other sign-in is removed for these runs.
  - When you save the key, Shortlist checks it once with Anthropic's free model list (no model runs, no cost).
  - The key is stored encrypted with your system's own protection (Windows DPAPI, macOS Keychain, the Linux keyring) in `api-key.json` in the app-data folder. On Linux without a keyring, Shortlist refuses to save it.
  - The key is decrypted only when a run starts and is never shown again; the screen shows only its last 4 characters. **Remove key** deletes it.
  - Commands the AI runs (Bash, PowerShell) cannot read it: Claude Code removes credentials from their environment (Shortlist sets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` for every run, with either engine).
  - With a key, Claude Code switches off claude.ai connectors such as Indeed.
  - The key card shows roughly what the key has spent since you added it, added up from each run's cost as Claude Code reports it. Your Anthropic console has the exact figure.

### Everything that goes over the network
- **The AI engine.** Claude Code talks to Anthropic and sends what a task needs, such as a job posting and the parts of your profile it is matching. The job-search commands also read job pages and search the web (your folder's rules on robots.txt and site terms apply). This is the same as running the commands in Claude Code yourself.
- **The update check.** At most once a day, Shortlist asks GitHub's public release list for this app (`api.github.com/repos/HamzaBTW/shortlist-desktop/releases`), with a generic client name and nothing about you, and shows a notice if there is a newer version. It never downloads or installs anything. Turn it off in Settings.
- **The API-key check.** Only when you save a key: one request to `api.anthropic.com/v1/models` with that key.
- **Setting up a new folder** (wizard, only if you choose it): your installed Git copies the framework from GitHub (`HamzaBTW/ai-job-search` for the UAE, `ai-job-search-dev/ai-job-search` elsewhere) at a commit tested with this release. No submodules, no hooks, and the copy's push address is set to `DISABLED`.
- **Links you click** (a job posting, "Show me how") open in your own browser.

The update check and the key check each use their own locked-down connection that can reach only that one address. Nothing else goes over the network. Reports, the PDF export and "Update status" work offline.

### Where Shortlist keeps its own data
In your app-data folder (`%APPDATA%\Shortlist` on Windows, `~/Library/Application Support/Shortlist` on macOS, `~/.config/Shortlist` on Linux):
- `settings.json` (your preferences) and `workspace.json` (which folder you chose)
- `shortlist.db`: the jobs you started from the app, their results and replies, and the "Add to board" / "Hide" choices on ranked jobs
- `api-key.json` (only if you added a key; encrypted), `update-check.json` (when it last checked), `run-settings.json` (the settings every run gets: hooks off)

Uninstalling leaves this folder; delete it to remove everything.

### What Shortlist writes
- **Your job-search folder:** never written by Shortlist itself. The framework's own commands do that, as in Claude Code. The one exception is "Set up a new folder", which copies the framework into an empty folder you picked.
- **Update status** records the change with the framework's own `tools/outcome_state.py` (plain Python, no AI, no network). If that tool can't do it, the app runs the `/outcome` command instead.
- **Export my report** builds the page on this computer, with no AI, and writes it only where you save it (PDF or web page). The PDF is printed in a hidden window with scripts off and no network.
- PDFs open only from your folder's `cv/` and `cover_letters/`, and only allowlisted profile files open from the Profile screen.

### What runs without asking
Commands run inside your folder with your folder's own permission rules first. Hooks from the folder never run from Shortlist. By default these go ahead without a card:
- File changes inside your folder (your folder's own protected files still ask). A Settings switch makes every change ask.
- Reading web pages and searching the web. A Settings switch makes each one ask.
- The Indeed connector's `search_jobs` and `get_job_details`, when you have the connector.

These ask (Allow once / Deny): anything else a command wants to do, and Indeed company details, and those only while drafting an application (`/apply`).

**Auto-approve commands** (Settings, off by default) lets everything else go ahead without a card too. Turn it on only if you trust the commands in your folder.

These are always refused, whatever the settings: changes outside your folder, uploading to GitHub (`git push`), deleting folders, administrator commands, and reading your résumé on Indeed. Shortlist never uses Claude Code's "bypass permissions" mode.

## Job sources
Settings has a number per source (LinkedIn, freehire, Indeed, careers pages; 5 each by default; 0 skips a source) that limits how many postings each adds per search. Postings missing a company, location, description or apply link are listed so you can close them with one click. Indeed cannot load more results, so a source that falls short may stay short.

## Contributing and security
See [CONTRIBUTING.md](CONTRIBUTING.md). Please report security problems privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Licence
MIT. Bundled fonts: SIL Open Font License 1.1.
