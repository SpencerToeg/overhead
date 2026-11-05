# Overhead

Top-down scene, blocking and shot planner for Windows and Mac.

## How it's put together

| Path | What it is |
|---|---|
| `app/index.html` | The whole app (UI, drawing, scenes, shots). Most bug fixes and features happen here. |
| `electron/main.js` | Desktop shell: window, library folder, file saving, backups, auto-update. |
| `electron/preload.js` | The small bridge between the two (`window.overheadHost`). |
| `build/icon.png` | App icon (1024×1024). Replace it to change the icon. |
| `.github/workflows/release.yml` | Builds the Windows and Mac apps on GitHub and publishes updates. |

## Where your work is saved, and why updates never break it

- Projects are plain files, one per project: `<Project name>.overhead.json`. They live in the **library folder** (default `Documents\Overhead`). You can change it from the bottom of the Projects screen. Like an Obsidian vault, you can put it in OneDrive or Dropbox, copy files in and out, or back the folder up.
- The app is installed separately from the library folder. An update replaces the app only. It never touches your library.
- Each project is backed up to `.backups` inside the library folder the first time you save it after launching the app. The last 20 backups per project are kept.
- Every project file stores a format `version`. When the file format changes, bump `FORMAT` in `app/index.html` and add the conversion to `normalizeProject()`. Older files are then upgraded automatically when they're opened, so nothing has to be remade.
- **Never change `appId` (`com.overhead.app`) or `productName`** in `package.json`. Updates and settings are tied to them.

## Day-to-day

```bash
npm install          # first time on a computer, or after changing dependencies
npm start            # run the app from source to try a change
npm run build:win    # build a Windows installer locally into dist/
```

## Shipping an update

1. Make the change and try it with `npm start`.
2. Bump the version and tag it: `npm version patch` (bug fix), `npm version minor` (feature).
3. `git push --follow-tags`.

GitHub Actions then builds both installers and publishes a release. Installed copies on Windows find it within a few hours, or the next time they're launched. They download it and offer **Restart now**. If you choose to wait, it installs the next time you quit.

**Mac note:** without an Apple Developer ID ($99/yr), the Mac app is unsigned. The first time you open it, right-click it and choose Open. macOS also only allows automatic updates for signed apps, so on Mac you download each new version from the GitHub release page. Your library folder is kept.

## Installing on a new Windows PC

- **Smart App Control off (most PCs):** download `Overhead-Setup-x.y.z.exe` from the latest release. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
- **Smart App Control on:** Windows blocks unsigned installers downloaded from the internet. Build the installer on that PC instead: install Node.js LTS, run `npm ci`, then `npm run build:win`, and run `dist\Overhead Setup x.y.z.exe`. Updates still install themselves after that.
- Code signing (Microsoft Artifact Signing, about $10/month) would remove both workarounds. It plugs into `win.azureSignOptions` in `package.json` and the release workflow.
