# Security policy

## Supported versions
Only the latest release gets security fixes. Shortlist is early (0.x), so please update before reporting.

## Reporting a vulnerability
Please **do not open a public issue** for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, the steps to reproduce it, the Shortlist version and your operating system.

You can expect a first reply within 7 days. Once a fix is out, the advisory is published and you are credited unless you ask not to be.

Please do not include real personal data (your CV, profile files, tracker) in a report. A made-up example is enough.

## What counts
In scope: the Shortlist app in this repository, for example:
- the window reaching the network, loading remote content, or escaping its sandbox;
- a way for a page, posting or file to run code or call the app's internal functions;
- reading or writing files outside the job-search folder you picked, or serving files other than the PDFs in `cv/` and `cover_letters/`;
- an AI command getting past a rule that is meant to always refuse (changes outside your folder, `git push`, deleting folders, administrator commands);
- the installer or release files.

Out of scope here (please report to the project concerned):
- the ai-job-search framework and its commands: [ai-job-search-dev/ai-job-search](https://github.com/ai-job-search-dev/ai-job-search);
- Claude Code itself, Electron, Node.js or other dependencies, unless Shortlist uses them in an unsafe way.

## How Shortlist is built to stay safe
- No account, no telemetry and no network port. The screens cannot reach the internet; only the AI engine you connect does.
- The window runs sandboxed with context isolation and a strict content security policy. The screens can call only the functions listed in `src/shared/ipc.ts`, and the main process checks who is calling.
- Shortlist never handles your Claude Code sign-in and never writes your job-search files itself; the framework's commands do.
- Releases are not code-signed yet. Each release lists SHA-256 checksums in `SHA256SUMS.txt`; check your download against it.
