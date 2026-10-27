# Teleprompter

A teleprompter PWA built for iPad: a rich-text script editor plus a full-screen prompter with
mirroring, adjustable speed, a start countdown and touch scrubbing. Plain HTML/CSS/JS, no build
step and no dependencies.

## Deploy your own copy

The app is a static site with no server, database or accounts: each person's scripts are saved
only in their own browser. Anyone can run their own copy for free. Vercel is the easiest host,
and the steps below use it.

### Option A: one click

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmblank1240%2Fteleprompter-pwa&project-name=teleprompter&repository-name=teleprompter)

1. Click the button and sign in to Vercel (signing in with GitHub is simplest).
2. Vercel copies this repo into your own GitHub account and deploys it. No settings to change:
   `vercel.json` already tells Vercel to serve the `public/` folder with no build step.
3. You get an address like `https://teleprompter-yourname.vercel.app`.

### Option B: fork, then import

Use this if you want to follow updates to this repo, because a fork can sync with it.

1. Click **Fork** at the top of this page on GitHub.
2. Go to https://vercel.com/new, choose **Import** next to your fork, and click **Deploy**.
   Leave every setting at its default.
3. To pick up later changes from this repo, click **Sync fork** on your fork's GitHub page.
   Vercel redeploys automatically.

### Option C: command line

```sh
git clone https://github.com/mblank1240/teleprompter-pwa.git
cd teleprompter-pwa
npm i -g vercel
vercel login
vercel deploy --prod      # accept the defaults; prints your live address
```

Run `vercel git connect` afterwards if you push the folder to your own GitHub repo and want
every push to deploy automatically.

### After deploying

- **Choose your address before you rely on it.** Saved scripts belong to one web address. If
  you change it later, the app starts with an empty library, so export your scripts first and
  import them at the new address. To change the address, open the project on vercel.com, go to
  **Settings → Domains**, and edit the `*.vercel.app` name or add your own domain.
- **Updates:** with Options A and B, every push to your repo's `main` branch goes live within
  seconds. Other branches get their own preview addresses, so you can try a change without
  touching the installed app. Preview addresses ask for a Vercel login by default (change this
  under **Settings → Deployment Protection**). Your main address is always public.
- **Cost:** Vercel's free Hobby plan is plenty for this app. It is meant for personal,
  non-commercial use; for wider use inside an organization, check Vercel's terms or use a
  Pro plan.
- **Other hosts** work too, since it's only static files. On Netlify or Cloudflare Pages, set the
  publish/output directory to `public` and leave the build command empty. Anywhere else, upload
  the contents of `public/`.

## Install on the iPad

Open the deployed site in Safari → Share → **Add to Home Screen**. Launched from the home
screen it runs full screen, works offline, and its scripts are exempt from Safari's 7-day
storage cleanup for sites you only open in a browser tab.

## How updates reach the iPad

- The service worker is **network-first**: when online, every launch loads the latest deploy
  and refreshes the offline copy; offline (or if the network takes longer than 3 s), the cached
  copy is used.
- A home-screen app resumes without reloading, so on resume the app checks whether its files
  changed and shows **"A new version is available · Reload"**. Your script is saved first.
- No version bump is needed for normal deploys. Bumping `VERSION` in `public/sw.js` only forces
  a clean re-download of every file.
- If you add a new file to `public/`, also add it to `ASSETS` in `public/sw.js` (offline copy)
  and, if it's code, to `APP_FILES` in `public/js/app.js` (update check).

## Develop

```sh
npm start          # serves public/ on http://localhost:8080 and prints your LAN address
```

Everything the browser loads lives in `public/`; edit those files and refresh.

To test on the iPad while you edit, the LAN address (e.g. `http://10.x.x.x:8080`) works,
but Safari turns off offline mode and keep-screen-awake over plain `http`. For the full
experience, give your local server a temporary HTTPS address:

```sh
npx cloudflared tunnel --url http://localhost:8080   # prints a https://….trycloudflare.com link
```

## Features

**Editor**
- Bold, italic, underline, strikethrough, text color, highlight, clear formatting, alignment, undo/redo
- Font, line spacing and letter spacing apply to the whole script, in both the editor and the prompter
- Light / dark / match-system theme
- Auto-saves on the device; library of multiple scripts (☰ button)
- Import `.txt`, `.md`, `.html`; export `.txt` (plain) or `.html` (keeps formatting, re-importable).
  On iPad, export opens the share sheet → *Save to Files*.
- Pasted text is cleaned up to the supported formatting
- `Ctrl/⌘ + Enter` starts the prompter

**Prompter**
- Minimal one-row control bar that hides itself while playing
- Speed 0–50 with − / + (press and hold to step quickly; finer control at the slow end)
- Text size − / +, side margins and reading marker, remembered between sessions
- Mirror horizontally (beam-splitter glass), flip vertically, reverse scroll direction
- Start delay with on-screen countdown (0–10 s)
- **Touch and hold** pauses the text under your finger; **drag** to scrub; release and it continues
- **Tap** to show or hide the controls (they auto-hide while playing)
- Keeps the screen awake while prompting (iPadOS 16.4+)
- Keyboard / Bluetooth remote: `Space`/`Enter` play/pause · `←/→` speed ±1 · `↑/↓` nudge a line ·
  `PgUp/PgDn` jump · `Home` back to start · `+/-` size · `M` mirror · `F` flip · `R` direction · `Esc` exit

## Code layout

| File | Purpose |
|---|---|
| `public/index.html` | Markup for both views |
| `public/css/styles.css` | Theme tokens (light/dark), editor and prompter styles |
| `public/js/app.js` | Editor, toolbar, script library, file menu, update check, wiring |
| `public/js/prompter.js` | Scroll engine, touch scrubbing, countdown, prompter controls |
| `public/js/storage.js` | localStorage persistence (one place to swap for native storage) |
| `public/js/sanitize.js` | HTML allow-list for paste/import, text ⇄ HTML conversion |
| `public/js/files.js` | Import/export, save via file picker / share sheet / download |
| `public/sw.js`, `public/manifest.webmanifest` | Offline support and install metadata |
| `vercel.json` | Hosting config: serve `public/`, never cache `sw.js` |
| `tools/` | Dev server and icon generator (`npm run icons`) |

## Going native later

The quickest path is **Capacitor**: it wraps this exact web app in a native iOS shell, so you can
ship to the App Store and add native plugins (file system, keep-awake, Bluetooth remotes) over time.

```sh
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init Teleprompter com.example.teleprompter --web-dir public
npx cap add ios && npx cap open ios
```

For a fully native SwiftUI rewrite, `js/prompter.js` is the spec to port: position in px past
the marker, speed curve `(speed/100)^1.5 × 3 lines/sec`, with speed capped at 50, hold-to-pause / drag-to-scrub, and the
countdown. The script format is the simple HTML subset defined in `js/sanitize.js`, which maps
directly onto `AttributedString`.

## License

[MIT](LICENSE): free to use, copy, modify and share, including in your own projects.
