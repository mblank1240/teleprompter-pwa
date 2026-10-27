# Teleprompter

A teleprompter PWA built for iPad: a rich-text script editor plus a full-screen prompter with
mirroring, adjustable speed, a start countdown and touch scrubbing. Plain HTML/CSS/JS, no build
step and no dependencies.

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

## Deploy (Vercel)

1. Push this folder to a GitHub repository.
2. On https://vercel.com/new, import the repository. `vercel.json` already sets everything
   (static site, serves `public/`, no build). Click **Deploy**.
3. Every push to `main` goes live in seconds. Every other branch or pull request gets its
   own preview URL, so you can try a change on the iPad without touching the installed app.

Other static hosts work too. Set the publish/output directory to `public` and leave the
build command empty (Netlify, Cloudflare Pages), or publish the `public/` folder as is.

**Pick your permanent URL early.** The home-screen app and its saved scripts are tied to the
site's address. Moving to a different domain later means starting with an empty library (use
Export/Import to carry scripts over). A custom domain can be added in Vercel at any time and
pointed at the same project.

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
- Speed 0–100% (finer control at the slow end)
- Text size, side margins and reading marker settings, remembered between sessions
- Mirror horizontally (beam-splitter glass), flip vertically, reverse scroll direction
- Start delay with on-screen countdown (0–10 s)
- **Touch and hold** pauses the text under your finger; **drag** to scrub; release and it continues
- **Tap** to show or hide the controls (they auto-hide while playing)
- Keeps the screen awake while prompting (iPadOS 16.4+)
- Keyboard / Bluetooth remote: `Space`/`Enter` play/pause · `←/→` speed · `↑/↓` nudge a line ·
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
the marker, speed curve `(speed/100)^1.5 × 3 lines/sec`, hold-to-pause / drag-to-scrub, and the
countdown. The script format is the simple HTML subset defined in `js/sanitize.js`, which maps
directly onto `AttributedString`.
