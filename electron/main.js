// Overhead desktop shell.
// The app itself is app/index.html. This file only gives it a window, real files on disk and updates.
// Projects live in a library folder the user picks (default: Documents/Overhead), one
// "<project name>.overhead.json" file per project, so installing an update never touches them.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const EXT = '.overhead.json';
const LEGACY_EXT = ['.blockwise.json'];   // older names still open; they're renamed to EXT on the next save
const extOf = f => [EXT, ...LEGACY_EXT].find(x => f.toLowerCase().endsWith(x));
const BACKUPS = '.backups';
const KEEP_BACKUPS = 20;

// ---------- settings (kept in the per-user app data folder, survives updates) ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
function loadSettings() { try { settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { settings = {}; } }
function saveSettings() {
  try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch {}
}

// ---------- library folder ----------
let newFolder = false;   // true when the library folder was just created, so the app can add the sample project
function libDir() {
  const d = settings.libraryDir || path.join(app.getPath('documents'), 'Overhead');
  if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); newFolder = true; }
  return d;
}
const safeFile = n => (String(n || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/[. ]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 80)) || 'Untitled';

let index = {};          // project id -> file name inside the library folder
const backedUp = new Set();

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function scan() {
  index = {};
  const dir = libDir(), out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(extOf); } catch {}
  // oldest file first, so when two files share an id the original keeps it and the copy gets a new one
  const born = f => { try { return fs.statSync(path.join(dir, f)).birthtimeMs; } catch { return 0; } };
  files.sort((a, b) => born(a) - born(b));
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const p = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!p || !Array.isArray(p.scenes)) continue;
      // a file copied in Explorer/Finder keeps the original's id; give it its own so both show up
      if (!p.id || index[p.id]) { p.id = crypto.randomUUID(); writeAtomic(full, JSON.stringify(p, null, 2)); }
      index[p.id] = f;
      out.push({ id: p.id, name: p.name || f.slice(0, -extOf(f).length), updated: p.updated || fs.statSync(full).mtimeMs });
    } catch {}
  }
  return out;
}

function backup(dir, file) {
  const src = path.join(dir, file);
  if (!fs.existsSync(src)) return;
  const bdir = path.join(dir, BACKUPS);
  fs.mkdirSync(bdir, { recursive: true });
  const base = file.slice(0, -(extOf(file) || EXT).length);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  fs.copyFileSync(src, path.join(bdir, `${base} ${stamp}${EXT}`));
  const old = fs.readdirSync(bdir).filter(f => f.startsWith(base + ' ') && f.endsWith(EXT)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) { try { fs.unlinkSync(path.join(bdir, f)); } catch {} }
}

function writeProject(p) {
  const dir = libDir();
  const cur = index[p.id];
  const want = safeFile(p.name);
  let name = want + EXT;
  if (!cur || cur.toLowerCase() !== name.toLowerCase()) {
    for (let i = 2; fs.existsSync(path.join(dir, name)) && name.toLowerCase() !== (cur || '').toLowerCase(); i++) name = `${want} (${i})${EXT}`;
  }
  // one backup per project per app launch, before the first save
  if (cur && !backedUp.has(p.id)) { try { backup(dir, cur); } catch {} }
  backedUp.add(p.id);   // (a project created this session has nothing worth backing up yet)
  writeAtomic(path.join(dir, name), JSON.stringify(p, null, 2));
  if (cur && cur !== name) { try { fs.unlinkSync(path.join(dir, cur)); } catch {} }
  index[p.id] = name;
}

// ---------- bridge for app/index.html (see preload.js) ----------
ipcMain.on('app:version', e => { e.returnValue = app.getVersion(); });
// the version that ran last time, if it was a different one (so the app can say "Updated to …")
let updatedFrom = null;
ipcMain.on('app:updatedFrom', e => { e.returnValue = updatedFrom; updatedFrom = null; });
ipcMain.on('lib:list', e => { try { e.returnValue = scan(); } catch { e.returnValue = []; } });
ipcMain.on('lib:isNew', e => { e.returnValue = newFolder; newFolder = false; });
ipcMain.on('lib:folder', e => { e.returnValue = libDir(); });
ipcMain.on('lib:read', (e, id) => {
  try { if (!index[id]) scan(); e.returnValue = JSON.parse(fs.readFileSync(path.join(libDir(), index[id]), 'utf8')); }
  catch { e.returnValue = null; }
});
ipcMain.on('lib:write', (e, p) => { try { writeProject(p); e.returnValue = true; } catch (err) { console.error(err); e.returnValue = false; } });
ipcMain.on('lib:remove', (e, id) => {
  const f = index[id];
  if (f) { shell.trashItem(path.join(libDir(), f)).catch(() => {}); delete index[id]; }
  e.returnValue = true;
});
ipcMain.handle('lib:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose your Overhead library folder', defaultPath: libDir(),
    properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Use this folder',
  });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.libraryDir = r.filePaths[0]; saveSettings(); backedUp.clear();
  newFolder = !fs.readdirSync(settings.libraryDir).some(extOf);
  return settings.libraryDir;
});
ipcMain.on('lib:reveal', () => { shell.openPath(libDir()); });
ipcMain.handle('file:saveAs', async (e, name, bytes) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(settings.lastExportDir || app.getPath('documents'), name) });
  if (r.canceled || !r.filePath) return null;
  try { fs.writeFileSync(r.filePath, Buffer.from(bytes)); settings.lastExportDir = path.dirname(r.filePath); saveSettings(); return true; }
  catch { return false; }
});

// ---------- window ----------
let win;
function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 900, x: b.x, y: b.y,
    minWidth: 900, minHeight: 600, backgroundColor: '#0e1014', show: false,
    title: 'Overhead', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

  // keep the app in its window; open real web links in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  // Ctrl+Shift+I / F12 opens developer tools, handy when chasing a bug
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && (i.key === 'F12' || ((i.control || i.meta) && i.shift && i.key.toLowerCase() === 'i'))) win.webContents.toggleDevTools();
  });
  win.on('close', () => { settings.maximized = win.isMaximized(); if (!settings.maximized) settings.bounds = win.getBounds(); saveSettings(); });
}

function buildMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  // macOS needs a menu for Quit and for copy/paste in text fields. Undo, Select All etc. stay with the app itself.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
    { role: 'windowMenu' },
  ]));
}

// ---------- updates (GitHub Releases, see README) ----------
function setupUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', err => console.error('update check failed:', err && err.message));
  autoUpdater.on('update-downloaded', async info => {
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      message: `Overhead ${info.version} is ready to install`,
      detail: 'Your projects stay in your library folder and are not changed by updates. If you choose Later, it installs the next time you quit.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    loadSettings();
    if (settings.lastVersion && settings.lastVersion !== app.getVersion()) updatedFrom = settings.lastVersion;
    settings.lastVersion = app.getVersion(); saveSettings();
    libDir(); buildMenu(); createWindow(); setupUpdates();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
