const KEY = "sami-v3";
const CUSTOM_THEME_PRESETS = ["sau", "tram", "am"];
const FOLDER_NAME_MAX = 15;
const MOVE_FOLDER_VISIBLE_MAX = 6;
const MOVE_FOLDER_STILL_ROWS = 2;
const MOVE_FOLDER_AUTO_SCROLL_MIN = 1.5;
const MOVE_FOLDER_AUTO_SCROLL_MAX = 15;
const MOVE_FOLDER_HIT_SLOP_X = 38;
const MOVE_FOLDER_HIT_SLOP_Y = 26;
const MOVE_FOLDER_AFTER_LIVE_SAFE_MS = 360;
const root = document.getElementById("app");
const screen = document.getElementById("screen");
const livePane = document.getElementById("livePane");
const donePane = document.getElementById("donePane");
const liveList = document.getElementById("liveList");
const doneList = document.getElementById("doneList");
const liveLamp = document.getElementById("liveLamp");
const liveCount = document.getElementById("liveCount");
const doneCount = document.getElementById("doneCount");
const utilityToggle = document.getElementById("utilityToggle");
const utilityPanel = document.getElementById("utilityPanel");
const utilityPanelBack = document.getElementById("utilityPanelBack");
const utilityHome = document.getElementById("utilityHome");
const openSettings = document.getElementById("openSettings");
const openTrash = document.getElementById("openTrash");
const settingsSection = document.getElementById("settingsSection");
const trashSection = document.getElementById("trashSection");
const settingsView = document.getElementById("settingsView");
const trashView = document.getElementById("trashView");
const doneFolderToggle = document.getElementById("doneFolderToggle");
const doneFolderCompact = document.getElementById("doneFolderCompact");
const doneFolderActionsToggle = document.getElementById("doneFolderActionsToggle");
const currentFolderActions = document.getElementById("currentFolderActions");
const doneFolderMenu = document.getElementById("doneFolderMenu");
const folderBackdrop = document.getElementById("folderBackdrop");
const undoBtn = document.getElementById("undoBtn");
const addFab = document.getElementById("addFab");
const overlay = document.getElementById("overlay");
const launchSplash = document.getElementById("launchSplash");
let modeFxTimer = null;
let searchRevealTimer = null;
let utilityBackTimer = null;
let utilitySearchComposing = false;
let utilitySearchRenderTimer = null;

const state = loadState();
applyThemeMode();
state.utilityBackFrom = null;
let drag = null;
let moveFolderLayer = null;
let moveFolderTargets = [];
let moveFolderActiveIndex = -1;
let moveFolderScrollY = 0;
let moveFolderTargetHeight = 0;
let moveFolderGap = 0;
let moveFolderAutoScrollFrame = 0;
let moveFolderAutoScrollSpeed = 0;
let moveFolderAutoScrollVelocity = 0;
let moveFolderPointerY = null;
let moveFolderSafeUntil = 0;

function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5); }
function now() { return Date.now(); }
function esc(text) { return (text || "").replace(/[&<>"]/g, s => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[s])); }
function limitText(text, max) { return Array.from(text || "").slice(0, max).join(""); }
function normalizeFolderName(name) {
  return limitText((name || "").replace(/\s+/g, " ").trim(), FOLDER_NAME_MAX) || "Folder";
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function cssNumber(name) { return parseFloat(cssVar(name)); }
function cssPx(name) { return parseFloat(cssVar(name).replace("px", "")); }
function fmt(time) {
  const d = new Date(time);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function normalizeNote(note, fallbackFolderId = null) {
  const base = {
    id: note.id || uid(),
    title: (note.title || "").trim(),
    text: note.text || "",
    createdAt: note.createdAt || now()
  };
  if (note.doneAt) base.doneAt = note.doneAt;
  if (fallbackFolderId || note.folderId) base.folderId = note.folderId || fallbackFolderId;
  return base;
}
function noteTitle(note) {
  return (note.title || "").trim();
}
function noteBody(note) {
  return (note.text || "").trim();
}
function notePreviewText(note) {
  return noteBody(note) || "Note trong";
}
function noteSecondaryPreview(note) {
  return noteBody(note) || (noteTitle(note) ? "" : "Note trong");
}
function daysLeft(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - now()) / 86400000));
}
function splitRatio() {
  if (state.utilityOpen) return cssNumber("--split-done");
  return state.mode === "done" ? cssNumber("--split-done") : cssNumber("--split-live");
}
function syncCardContentWidths() {
  const rect = root.getBoundingClientRect();
  const sideInset = cssPx("--pane-side-inset") || 12;
  const cardPadX = cssPx("--card-pad-x") || 20;
  const listRightPad = 2;
  const doneWidth = rect.width * cssNumber("--split-done") - sideInset * 2 - cardPadX * 2 - listRightPad;
  const liveWidth = rect.width * (1 - cssNumber("--split-live")) - sideInset * 2 - cardPadX * 2 - listRightPad;
  root.style.setProperty("--done-card-content-width", `${Math.max(120, doneWidth)}px`);
  root.style.setProperty("--live-card-content-width", `${Math.max(120, liveWidth)}px`);
}
function syncCardFitHeight() {
  if (state.utilityOpen) return;
  const list = state.mode === "done" ? doneList : liveList;
  const listHeight = list?.clientHeight || 0;
  const baseHeight = cssPx("--card-height-base") || 78;
  const minHeight = cssPx("--card-height-min") || 72;
  const maxHeight = cssPx("--card-height-max") || baseHeight;
  const baseGap = cssPx("--card-gap-base") || 8.5;
  if (!listHeight) {
    root.style.setProperty("--card-height", `${baseHeight}px`);
    root.style.setProperty("--card-gap", `${baseGap}px`);
    return;
  }
  const visibleAtBase = Math.max(1, Math.floor((listHeight + baseGap) / (baseHeight + baseGap)));
  const itemCount = state.mode === "done" ? doneNotesForCurrentFolder().length : state.live.length;
  const targetCount = itemCount >= 9 ? 9 : visibleAtBase + 1;
  const fitHeight = (listHeight - baseGap * (targetCount - 1)) / targetCount;
  const clampedHeight = Math.max(minHeight, Math.min(maxHeight, fitHeight));
  const nextHeight = Math.floor(clampedHeight * 2) / 2;
  let nextGap = baseGap;
  if (itemCount >= 9 && targetCount > 1) {
    const balancedGap = (listHeight - nextHeight * targetCount) / (targetCount - 1);
    if (Number.isFinite(balancedGap)) {
      nextGap = Math.max(baseGap, Math.min(baseGap + 2, balancedGap));
    }
  }
  root.style.setProperty("--card-height", `${nextHeight}px`);
  root.style.setProperty("--card-gap", `${Math.round(nextGap * 100) / 100}px`);
}
function runModeFx(kind) {
  root.classList.remove("is-switching-live", "is-switching-done");
  root.classList.add(kind === "live" ? "is-switching-live" : "is-switching-done");
  if (modeFxTimer) window.clearTimeout(modeFxTimer);
  modeFxTimer = window.setTimeout(() => {
    root.classList.remove("is-switching-live", "is-switching-done");
    if (kind === "done" && state.mode === "done") doneFolderToggle.textContent = getCurrentFolderName();
    modeFxTimer = null;
  }, 430);
}
function doneNotesForCurrentFolder() { return state.done.filter(n => n.folderId === state.currentFolderId).sort((a, b) => b.doneAt - a.doneAt); }
function doneCountForFolder(folderId) { return state.done.filter(n => n.folderId === folderId).length; }
function cardContentHTML(note) {
  const title = noteTitle(note);
  const body = noteBody(note);
  return title
    ? `<div class="card-content"><p class="card-title">${esc(title)}</p>${body ? `<p class="card-text card-body-preview">${esc(body)}</p>` : ""}</div>`
    : `<div class="card-content"><p class="card-text">${esc(notePreviewText(note))}</p></div>`;
}
function setCompactFolderText(text) {
  doneFolderCompact.textContent = text;
}

function loadState() {
  const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
  const folders = Array.isArray(raw.folders) && raw.folders.length ? raw.folders.map(f => ({ id: f.id || uid(), name: normalizeFolderName(f.name) })) : [{ id: "samini", name: "Samini" }];
  const liveSource = Array.isArray(raw.live) ? raw.live : Array.isArray(raw.active) ? raw.active : [];
  const live = liveSource.map(note => normalizeNote(note));
  const done = (Array.isArray(raw.done) ? raw.done : []).map(note => ({ ...normalizeNote(note, folders[0].id), doneAt: note.doneAt || now() }));
  const oldCustomMode = raw.themeMode === "custom";
  const savedThemeMode = oldCustomMode ? "light" : raw.themeMode;
  const themeMode = ["dark", "light"].includes(savedThemeMode) ? savedThemeMode : "light";
  const savedCustomPreset = raw.themeCustomPreset === "diu" ? "tram" : raw.themeCustomPreset === "sami" ? "sau" : raw.themeCustomPreset;
  const themeCustomPreset = CUSTOM_THEME_PRESETS.includes(savedCustomPreset) ? savedCustomPreset : "sau";
  const trash = (Array.isArray(raw.trash) ? raw.trash : []).map(item => ({
    id: item.id || uid(),
    title: (item.title || "").trim(),
    text: item.text || "",
    createdAt: item.createdAt || now(),
    doneAt: item.doneAt || null,
    deletedAt: item.deletedAt || now(),
    expiresAt: item.expiresAt || (now() + 30 * 86400000),
    deletedFrom: item.deletedFrom === "done" ? "done" : "live",
    originalFolderId: item.originalFolderId || null,
    originalFolderName: item.originalFolderName || ""
  })).filter(item => item.expiresAt > now());
  return {
    mode: raw.mode === "done" ? "done" : "live",
    folders,
    currentFolderId: folders.some(f => f.id === raw.currentFolderId) ? raw.currentFolderId : folders[0].id,
    live,
    done,
    trash,
    themeMode,
    themeCustomEnabled: oldCustomMode || raw.themeCustomEnabled === true,
    themeCustomPreset,
    lastMoved: raw.lastMoved || null,
    noteSheet: null,
    confirmDialog: null,
    doneFolderOpen: false,
    folderDraft: null,
    folderActionId: null,
    utilityOpen: false,
    utilityView: null,
    settingsPanel: null,
    searchQuery: "",
    searchOpenTarget: null,
    revealTarget: null
  };
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify({
    mode: state.mode,
    folders: state.folders,
    currentFolderId: state.currentFolderId,
    live: state.live,
    done: state.done,
    trash: state.trash,
    themeMode: state.themeMode,
    themeCustomEnabled: state.themeCustomEnabled === true,
    themeCustomPreset: CUSTOM_THEME_PRESETS.includes(state.themeCustomPreset) ? state.themeCustomPreset : "sau",
    lastMoved: state.lastMoved
  }));
}

function ensureFolderIds() {
  const fallback = state.folders[0].id;
  state.done.forEach(n => { if (!n.folderId) n.folderId = fallback; });
  if (!state.folders.some(f => f.id === state.currentFolderId)) state.currentFolderId = fallback;
}

function resetUtilityView() {
  window.clearTimeout(utilityBackTimer);
  window.clearTimeout(utilitySearchRenderTimer);
  state.utilityView = null;
  state.settingsPanel = null;
  state.utilityBackFrom = null;
  state.searchQuery = "";
  utilitySearchComposing = false;
  utilitySearchRenderTimer = null;
}

function openNewNote() {
  state.mode = "live";
  state.noteSheet = { side: "live", source: "live", noteId: null, title: "", text: "", createdAt: now() };
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.utilityOpen = false;
  resetUtilityView();
  render();
  focusLater("noteInput");
}

function openNote(side, source, noteId) {
  const list = source === "live" ? state.live : state.done;
  const note = list.find(n => n.id === noteId);
  if (!note) return;
  state.mode = side;
  state.noteSheet = { side, source, noteId, title: noteTitle(note), text: note.text, createdAt: note.createdAt, doneAt: note.doneAt || null };
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.utilityOpen = false;
  resetUtilityView();
  render();
  focusLater("noteInput");
}

function closeSheets() {
  queueSearchReveal();
  state.noteSheet = null;
  state.confirmDialog = null;
  state.utilityOpen = false;
  resetUtilityView();
  render();
}

function putNoteInTrash(note, deletedFrom, originalFolderId = null) {
  const folder = originalFolderId ? state.folders.find(f => f.id === originalFolderId) : null;
  state.trash.unshift({
    id: uid(),
    noteId: note.id,
    title: noteTitle(note),
    text: note.text,
    createdAt: note.createdAt || now(),
    doneAt: note.doneAt || null,
    deletedAt: now(),
    expiresAt: now() + 30 * 86400000,
    deletedFrom,
    originalFolderId,
    originalFolderName: folder?.name || ""
  });
}

function focusLater(id, selectAll = false, placeAtEnd = false) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.focus({ preventScroll: true }); }
    catch { el.focus(); }
    if (selectAll && typeof el.select === "function") el.select();
    else if (placeAtEnd && typeof el.setSelectionRange === "function") {
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    }
  });
}

function utilitySearchResultsHtml(query) {
  if (!(query || "").trim()) return "";
  const searchResults = searchNotes(query);
  return searchResults.length ? searchResults.map(row => {
    const title = noteTitle(row.note);
    const preview = noteSecondaryPreview(row.note);
    return `<button class="search-result" data-search-type="${row.type}" data-search-id="${row.note.id}" type="button">
      <span class="search-result-label">${esc(row.label)}</span>
      ${title ? `<strong>${esc(title)}</strong>` : ""}
      ${preview ? `<p>${esc(preview)}</p>` : ""}
    </button>`;
  }).join("") : `<div class="search-empty">Khong thay note.</div>`;
}

function bindUtilitySearchResultActions() {
  utilityHome.querySelectorAll("[data-search-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.searchType;
      const id = btn.dataset.searchId;
      if (type === "live") {
        state.searchOpenTarget = { source: "live", id };
        openNote("live", "live", id);
      }
      else if (type === "done") {
        const note = state.done.find(n => n.id === id);
        if (note?.folderId && state.folders.some(f => f.id === note.folderId)) state.currentFolderId = note.folderId;
        state.searchOpenTarget = { source: "done", id };
        openNote("done", "done", id);
      }
      else openTrashView(id);
    });
  });
}

function refreshUtilitySearch() {
  const query = state.searchQuery || "";
  const hasQuery = !!query.trim();
  utilityHome.querySelector(".utility-search")?.classList.toggle("has-query", hasQuery);
  const clearBtn = document.getElementById("utilitySearchClear");
  if (clearBtn) clearBtn.hidden = !hasQuery;
  const results = document.getElementById("utilitySearchResults");
  if (!results) return;
  results.hidden = !hasQuery;
  results.innerHTML = utilitySearchResultsHtml(query);
  bindUtilitySearchResultActions();
}

function refreshUtilitySearchSoon(delay = 90) {
  window.clearTimeout(utilitySearchRenderTimer);
  utilitySearchRenderTimer = window.setTimeout(() => {
    utilitySearchRenderTimer = null;
    refreshUtilitySearch();
  }, delay);
}

function queueSearchReveal() {
  if (!state.searchOpenTarget) return;
  state.revealTarget = state.searchOpenTarget;
  state.searchOpenTarget = null;
}

function isFullyVisibleInList(card, list) {
  const cardRect = card.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  return cardRect.top >= listRect.top && cardRect.bottom <= listRect.bottom;
}

function restartSearchHighlight(card) {
  if (searchRevealTimer) window.clearTimeout(searchRevealTimer);
  card.classList.remove("search-hit", "search-hit-live", "search-hit-done");
  void card.offsetWidth;
  const source = card.dataset.source === "done" ? "done" : "live";
  card.classList.add("search-hit", `search-hit-${source}`);
  searchRevealTimer = window.setTimeout(() => {
    card.classList.remove("search-hit", "search-hit-live", "search-hit-done");
    searchRevealTimer = null;
  }, 2200);
}

function restartTrashSearchHighlight(item) {
  if (searchRevealTimer) window.clearTimeout(searchRevealTimer);
  item.classList.remove("search-hit-trash");
  void item.offsetWidth;
  item.classList.add("search-hit-trash");
  searchRevealTimer = window.setTimeout(() => {
    item.classList.remove("search-hit-trash");
    searchRevealTimer = null;
  }, 2200);
}

function afterScrollSettles(scroller, callback) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    scroller.removeEventListener("scrollend", finish);
    callback();
  };
  if ("onscrollend" in scroller) {
    scroller.addEventListener("scrollend", finish, { once: true });
    window.setTimeout(finish, 900);
    return;
  }
  let last = scroller.scrollTop;
  let stableFrames = 0;
  const tick = () => {
    const current = scroller.scrollTop;
    stableFrames = Math.abs(current - last) < 0.5 ? stableFrames + 1 : 0;
    last = current;
    if (stableFrames >= 4) finish();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.setTimeout(finish, 900);
}

function runPendingReveal() {
  const target = state.revealTarget;
  if (!target || state.noteSheet) return;
  if (target.source === "trash") {
    if (!state.utilityOpen || state.utilityView !== "trash") return;
    state.revealTarget = null;
    requestAnimationFrame(() => {
      const item = Array.from(trashView.querySelectorAll(".trash-item")).find(el => el.dataset.trashId === target.id);
      if (!item) return;
      const alreadyVisible = isFullyVisibleInList(item, trashView);
      item.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      if (alreadyVisible) restartTrashSearchHighlight(item);
      else afterScrollSettles(trashView, () => restartTrashSearchHighlight(item));
    });
    return;
  }
  if (state.utilityOpen) return;
  state.revealTarget = null;
  requestAnimationFrame(() => {
    const list = target.source === "done" ? doneList : liveList;
    const card = Array.from(list.querySelectorAll(".card")).find(el => el.dataset.noteId === target.id);
    if (!card) return;
    const alreadyVisible = isFullyVisibleInList(card, list);
    card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    if (alreadyVisible) restartSearchHighlight(card);
    else afterScrollSettles(list, () => restartSearchHighlight(card));
  });
}

function saveNote() {
  if (!state.noteSheet) return;
  const title = state.noteSheet.title.trim();
  const text = state.noteSheet.text.trim();
  if (!title && !text) return;
  if (state.noteSheet.source === "live") {
    if (state.noteSheet.noteId) {
      const note = state.live.find(n => n.id === state.noteSheet.noteId);
      if (note) {
        note.title = title;
        note.text = text;
      }
    } else {
      state.live.unshift({ id: uid(), title, text, createdAt: now() });
    }
  } else {
    const note = state.done.find(n => n.id === state.noteSheet.noteId);
    if (note) {
      note.title = title;
      note.text = text;
    }
  }
  queueSearchReveal();
  state.noteSheet = null;
  persist();
  render();
}

function deleteCurrentNote() {
  if (!state.noteSheet?.noteId) return;
  state.searchOpenTarget = null;
  state.revealTarget = null;
  if (state.noteSheet.source === "live") {
    const note = state.live.find(n => n.id === state.noteSheet.noteId);
    if (note) putNoteInTrash(note, "live");
    state.live = state.live.filter(n => n.id !== state.noteSheet.noteId);
  } else {
    const note = state.done.find(n => n.id === state.noteSheet.noteId);
    if (note) putNoteInTrash(note, "done", note.folderId);
    state.done = state.done.filter(n => n.id !== state.noteSheet.noteId);
  }
  state.noteSheet = null;
  persist();
  render();
}

function toggleDoneFolderMenu() {
  const opening = !state.doneFolderOpen;
  state.doneFolderOpen = opening;
  state.folderDraft = null;
  state.folderActionId = null;
  state.utilityOpen = false;
  resetUtilityView();
  if (opening && state.folders.filter(f => f.id !== state.currentFolderId).length === 0) {
    state.folderDraft = { type: "create", text: "Folder moi" };
  }
  render();
  if (state.doneFolderOpen && state.folderDraft?.type === "create") focusLater("folderInput", true);
}
function closeDoneFolderMenu() {
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  state.utilityOpen = false;
  resetUtilityView();
  render();
}
function startCreateFolder(prefill = "", selectAll = false) {
  state.doneFolderOpen = true;
  state.folderDraft = { type: "create", text: normalizeFolderName(prefill) };
  state.folderActionId = null;
  state.utilityOpen = false;
  resetUtilityView();
  render();
  focusLater("folderInput", selectAll);
}
function startRenameFolder(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  state.doneFolderOpen = true;
  state.folderDraft = { type: "rename", folderId, text: normalizeFolderName(folder.name) };
  state.folderActionId = null;
  state.utilityOpen = false;
  resetUtilityView();
  render();
  focusLater("folderInput", true);
}
function toggleFolderActions(folderId) {
  state.folderActionId = state.folderActionId === folderId ? null : folderId;
  state.folderDraft = null;
  state.doneFolderOpen = false;
  state.utilityOpen = false;
  resetUtilityView();
  render();
}
function toggleUtilityPanel() {
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  state.confirmDialog = null;
  state.utilityOpen = !state.utilityOpen;
  if (!state.utilityOpen) {
    resetUtilityView();
  }
  if (state.mode === "live") runModeFx("live");
  render();
}

function openTrashView(revealId = null) {
  state.utilityOpen = true;
  const closingTrash = state.utilityView === "trash" && !revealId;
  state.utilityView = closingTrash ? null : "trash";
  state.settingsPanel = null;
  state.utilityBackFrom = closingTrash ? "trash" : null;
  if (!closingTrash) window.clearTimeout(utilityBackTimer);
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  state.confirmDialog = null;
  if (revealId) {
    window.clearTimeout(utilitySearchRenderTimer);
    utilitySearchRenderTimer = null;
    state.searchQuery = "";
    state.searchOpenTarget = null;
    state.revealTarget = { source: "trash", id: revealId };
  }
  render();
}

function openSettingsView() {
  state.utilityOpen = true;
  const inSettings = state.utilityView === "settings";
  if (!inSettings) {
    state.utilityView = "settings";
    state.settingsPanel = null;
    state.utilityBackFrom = null;
    window.clearTimeout(utilityBackTimer);
  } else if (state.settingsPanel) {
    state.settingsPanel = null;
    state.utilityBackFrom = null;
  } else {
    state.utilityView = null;
    state.utilityBackFrom = "settings";
  }
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  state.confirmDialog = null;
  render();
}

function openAppearanceSettings() {
  state.settingsPanel = "appearance";
  render();
}

function applyThemeMode() {
  const activeTheme = state.themeMode === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = activeTheme;
  document.documentElement.dataset.themeMode = state.themeMode;
  document.documentElement.dataset.themeCustom = state.themeCustomEnabled ? "on" : "off";
  document.documentElement.dataset.themePreset = CUSTOM_THEME_PRESETS.includes(state.themeCustomPreset) ? state.themeCustomPreset : "sau";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", activeTheme === "dark" ? "#0d1016" : "#10131b");
}

function setThemeModePreview(mode) {
  if (!["dark", "light"].includes(mode)) return;
  state.themeMode = mode;
  applyThemeMode();
  persist();
  render();
}

function setThemeCustomPreview(enabled) {
  state.themeCustomEnabled = enabled === true;
  applyThemeMode();
  persist();
  render();
}

function setThemeCustomPreset(preset) {
  if (!CUSTOM_THEME_PRESETS.includes(preset)) return;
  state.themeCustomEnabled = true;
  state.themeCustomPreset = preset;
  applyThemeMode();
  persist();
  render();
}

function restoreTrashItem(trashId) {
  const index = state.trash.findIndex(item => item.id === trashId);
  if (index < 0) return;
  const item = state.trash[index];
  state.trash.splice(index, 1);
  const note = { id: item.noteId || uid(), title: item.title || "", text: item.text, createdAt: item.createdAt || now() };
  if (item.deletedFrom === "done" && state.folders.some(f => f.id === item.originalFolderId)) {
    state.done.unshift({ ...note, doneAt: item.doneAt || now(), folderId: item.originalFolderId });
    state.mode = "done";
    state.currentFolderId = item.originalFolderId;
  } else {
    state.live.unshift(note);
    state.mode = "live";
  }
  state.utilityOpen = false;
  resetUtilityView();
  persist();
  render();
}

function confirmClearTrash() {
  const count = state.trash.filter(item => item.expiresAt > now()).length;
  if (!count) return;
  state.confirmDialog = {
    kind: "clear-trash",
    title: "Don sach thung rac?",
    body: `Tat ca ${count} note trong thung rac se bi xoa vinh vien.`,
    confirmLabel: "Don sach",
    cancelLabel: "Huy"
  };
  render();
}

function clearTrashNow() {
  state.trash = [];
  state.confirmDialog = null;
  persist();
  render();
}

function searchNotes(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const folderName = folderId => state.folders.find(f => f.id === folderId)?.name || "";
  const rows = [
    ...state.live.map(note => ({ type: "live", note, label: "Live", folder: "" })),
    ...state.done.map(note => ({ type: "done", note, label: folderName(note.folderId) || "Done", folder: folderName(note.folderId) })),
    ...state.trash.filter(item => item.expiresAt > now()).map(note => ({
      type: "trash",
      note,
      label: "Thung rac",
      folder: note.originalFolderName || ""
    }))
  ];
  return rows.filter(row => {
    const title = noteTitle(row.note).toLowerCase();
    const body = noteBody(row.note).toLowerCase();
    return title.includes(q) || body.includes(q) || row.label.toLowerCase().includes(q) || row.folder.toLowerCase().includes(q);
  }).slice(0, 12);
}
function commitFolderDraft() {
  const draft = state.folderDraft;
  if (!draft) return;
  const name = normalizeFolderName(draft.text);
  if (!name) return;
  if (draft.type === "create") {
    const folder = { id: uid(), name };
    state.folders.push(folder);
    state.currentFolderId = folder.id;
  } else {
    const folder = state.folders.find(f => f.id === draft.folderId);
    if (folder) folder.name = name;
  }
  state.folderDraft = null;
  state.folderActionId = null;
  persist();
  render();
}
function deleteFolderNow(folderId) {
  if (state.folders.length <= 1) return;
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  const fallback = state.folders.find(f => f.id !== folderId);
  if (!fallback) return;
  state.done.filter(n => n.folderId === folderId).forEach(note => putNoteInTrash(note, "done", folderId));
  state.done = state.done.filter(n => n.folderId !== folderId);
  if (state.currentFolderId === folderId) state.currentFolderId = fallback.id;
  state.folders = state.folders.filter(f => f.id !== folderId);
  state.folderDraft = null;
  state.folderActionId = null;
  state.confirmDialog = null;
  persist();
  render();
}
function deleteFolder(folderId) {
  if (state.folders.length <= 1) return;
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  const fallback = state.folders.find(f => f.id !== folderId);
  if (!fallback) return;
  const itemCount = doneCountForFolder(folderId);
  if (itemCount === 0) {
    deleteFolderNow(folderId);
    return;
  }
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  state.confirmDialog = {
    kind: "delete-folder",
    folderId,
    title: `Xoa "${folder.name}"?`,
    body: `Folder nay dang co ${itemCount} note. Neu xoa, tat ca note trong folder nay se bi xoa cung.`,
    confirmLabel: "OK",
    cancelLabel: "Huy"
  };
  render();
}
function pickDoneFolder(folderId) {
  state.currentFolderId = folderId;
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  persist();
  render();
}

function moveDoneToFolder(noteId, folderId) {
  if (folderId === state.currentFolderId || !state.folders.some(folder => folder.id === folderId)) return;
  const note = state.done.find(n => n.id === noteId);
  if (!note) return;
  note.folderId = folderId;
  state.currentFolderId = folderId;
  state.lastMoved = null;
  persist();
  render();
}

function moveLiveToDone(noteId) {
  const index = state.live.findIndex(n => n.id === noteId);
  if (index < 0) return;
  const note = state.live[index];
  state.live.splice(index, 1);
  state.done.unshift({ id: note.id, title: noteTitle(note), text: note.text, createdAt: note.createdAt, doneAt: now(), folderId: state.currentFolderId || state.folders[0].id });
  state.lastMoved = { note: { id: note.id, title: noteTitle(note), text: note.text, createdAt: note.createdAt } };
  moveFolderSafeUntil = now() + MOVE_FOLDER_AFTER_LIVE_SAFE_MS;
  setMode("done");
  persist();
  render();
}

function moveDoneToLive(noteId) {
  const index = state.done.findIndex(n => n.id === noteId);
  if (index < 0) return;
  const note = state.done[index];
  state.done.splice(index, 1);
  state.live.unshift({ id: note.id, title: noteTitle(note), text: note.text, createdAt: note.createdAt });
  state.lastMoved = null;
  setMode("live");
  persist();
  render();
}

function undoMove() {
  if (!state.lastMoved?.note) return;
  const note = state.lastMoved.note;
  state.done = state.done.filter(n => n.id !== note.id);
  state.live.unshift({ id: note.id, title: noteTitle(note), text: note.text, createdAt: note.createdAt });
  state.lastMoved = null;
  setMode("live");
  persist();
  render();
}

function getPaneRect(side) {
  const rect = root.getBoundingClientRect();
  const topInset = cssPx("--sheet-top-inset");
  const modalInset = cssPx("--sheet-live-edge-inset");
  return {
    left: rect.left + modalInset,
    top: rect.top + topInset,
    width: Math.max(228, rect.width - modalInset * 2),
    height: rect.height - topInset - modalInset
  };
}

function buildCard(note, source) {
  const card = document.createElement("button");
  card.type = "button";
  const title = noteTitle(note);
  card.className = `card${title ? " titled" : ""}`;
  card.dataset.noteId = note.id;
  card.dataset.source = source;
  card.innerHTML = cardContentHTML(note);
  card.addEventListener("pointerdown", e => startDragGesture(e, note.id, card, source));
  return card;
}

function clearMoveFolderHover() {
  moveFolderActiveIndex = -1;
  renderMoveFolderTrack(-1, moveFolderScrollY);
}

function moveFolderClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stopMoveFolderAutoScroll() {
  moveFolderAutoScrollSpeed = 0;
  moveFolderAutoScrollVelocity = 0;
  moveFolderPointerY = null;
  if (moveFolderAutoScrollFrame) {
    window.cancelAnimationFrame(moveFolderAutoScrollFrame);
    moveFolderAutoScrollFrame = 0;
  }
}

function nearestMoveFolderIndex(y) {
  if (!moveFolderLayer) return -1;
  const track = moveFolderLayer.querySelector(".move-folder-track");
  const rect = track?.getBoundingClientRect();
  const buttons = Array.from(moveFolderLayer.querySelectorAll(".move-folder-target"));
  let bestIndex = -1;
  let bestDistance = Infinity;
  buttons.forEach(btn => {
    const buttonRect = btn.getBoundingClientRect();
    const center = buttonRect.top + buttonRect.height / 2;
    if (rect && (center < rect.top || center > rect.bottom)) return;
    const distance = Math.abs(y - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = Number(btn.dataset.moveIndex);
    }
  });
  return bestIndex;
}

function moveFolderScrollSpeed(y, rect, maxScroll) {
  if (!rect || maxScroll <= 0) return 0;
  const visibleRows = MOVE_FOLDER_VISIBLE_MAX;
  const stillRows = Math.min(MOVE_FOLDER_STILL_ROWS, visibleRows);
  const rampRows = Math.max(1, (visibleRows - stillRows) / 2);
  const topRampEnd = rampRows / visibleRows;
  const bottomRampStart = 1 - topRampEnd;
  const ratio = moveFolderClamp((y - rect.top) / rect.height, 0, 1);
  let direction = 0;
  let strength = 0;
  if (ratio < topRampEnd) {
    direction = -1;
    strength = (topRampEnd - ratio) / topRampEnd;
  } else if (ratio > bottomRampStart) {
    direction = 1;
    strength = (ratio - bottomRampStart) / topRampEnd;
  }
  if (!direction || strength <= 0) return 0;
  const speed = MOVE_FOLDER_AUTO_SCROLL_MIN
    + (MOVE_FOLDER_AUTO_SCROLL_MAX - MOVE_FOLDER_AUTO_SCROLL_MIN) * Math.sqrt(moveFolderClamp(strength, 0, 1));
  return direction * speed;
}

function tickMoveFolderAutoScroll() {
  moveFolderAutoScrollFrame = 0;
  if (!moveFolderLayer || moveFolderPointerY == null) return;
  const track = moveFolderLayer.querySelector(".move-folder-track");
  const inner = moveFolderLayer.querySelector(".move-folder-track-inner");
  if (!track || !inner) return;
  const maxScroll = Math.max(0, inner.scrollHeight - track.clientHeight);
  moveFolderAutoScrollVelocity += (moveFolderAutoScrollSpeed - moveFolderAutoScrollVelocity) * .3;
  if (Math.abs(moveFolderAutoScrollSpeed) < .2 && Math.abs(moveFolderAutoScrollVelocity) < .08) {
    moveFolderAutoScrollVelocity = 0;
    renderMoveFolderTrack(nearestMoveFolderIndex(moveFolderPointerY), moveFolderScrollY);
    return;
  }
  const nextScroll = moveFolderClamp(moveFolderScrollY + moveFolderAutoScrollVelocity, 0, maxScroll);
  if (nextScroll === moveFolderScrollY) {
    renderMoveFolderTrack(nearestMoveFolderIndex(moveFolderPointerY), nextScroll);
    if (
      (moveFolderAutoScrollVelocity < 0 && nextScroll <= 0) ||
      (moveFolderAutoScrollVelocity > 0 && nextScroll >= maxScroll)
    ) {
      moveFolderAutoScrollVelocity = 0;
      return;
    }
    moveFolderAutoScrollFrame = window.requestAnimationFrame(tickMoveFolderAutoScroll);
    return;
  }
  renderMoveFolderTrack(nearestMoveFolderIndex(moveFolderPointerY), nextScroll);
  moveFolderAutoScrollFrame = window.requestAnimationFrame(tickMoveFolderAutoScroll);
}

function setMoveFolderAutoScroll(speed) {
  moveFolderAutoScrollSpeed = Math.abs(speed) < .2 ? 0 : speed;
  if (!moveFolderAutoScrollFrame && (moveFolderAutoScrollSpeed || Math.abs(moveFolderAutoScrollVelocity) >= .08)) {
    moveFolderAutoScrollFrame = window.requestAnimationFrame(tickMoveFolderAutoScroll);
  }
}

function renderMoveFolderTrack(activeIndex = moveFolderActiveIndex, scrollY = moveFolderScrollY) {
  if (!moveFolderLayer) return;
  const inner = moveFolderLayer.querySelector(".move-folder-track-inner");
  const track = moveFolderLayer.querySelector(".move-folder-track");
  const status = moveFolderLayer.querySelector(".move-folder-status");
  if (!inner || !track) return;
  const count = moveFolderTargets.length;
  const visible = Math.min(MOVE_FOLDER_VISIBLE_MAX, count);
  if (!count || !visible) {
    inner.innerHTML = "";
    inner.style.transform = "";
    track.classList.remove("has-hot", "has-overflow");
    if (status) status.textContent = "";
    return;
  }
  if (inner.children.length !== count) {
    inner.innerHTML = moveFolderTargets.map((folder, index) => {
      return `<button class="move-folder-target" data-move-folder="${folder.id}" data-move-index="${index}" type="button">${esc(folder.name)}</button>`;
    }).join("");
  }
  const hasActive = activeIndex >= 0 && activeIndex < count;
  const maxScroll = Math.max(0, inner.scrollHeight - track.clientHeight);
  const nextScroll = moveFolderClamp(scrollY, 0, maxScroll);
  moveFolderActiveIndex = hasActive ? activeIndex : -1;
  moveFolderScrollY = nextScroll;
  inner.style.transform = `translate3d(0, ${-nextScroll}px, 0)`;
  Array.from(inner.children).forEach((btn, index) => btn.classList.toggle("is-hot", index === moveFolderActiveIndex));
  track.classList.toggle("has-hot", hasActive);
  track.classList.toggle("has-overflow", maxScroll > 0);
  if (status) status.textContent = hasActive ? moveFolderTargets[activeIndex].name : "";
}

function showMoveFolderLayer() {
  moveFolderTargets = state.folders.filter(folder => folder.id !== state.currentFolderId);
  if (!moveFolderTargets.length || moveFolderLayer) return;
  moveFolderActiveIndex = -1;
  moveFolderScrollY = 0;
  const screenRect = screen.getBoundingClientRect();
  const paneRect = donePane.getBoundingClientRect();
  const cardWidth = doneList.querySelector(".card")?.getBoundingClientRect().width || doneList.getBoundingClientRect().width;
  const visibleCount = Math.min(MOVE_FOLDER_VISIBLE_MAX, moveFolderTargets.length);
  const gap = 10;
  const baseHeight = cssPx("--card-height") || cssPx("--card-height-base") || 78;
  const maxTrackHeight = Math.max(visibleCount * 58 + gap * (visibleCount - 1), paneRect.height - 120);
  const targetHeight = Math.max(64, Math.min(baseHeight, Math.floor((maxTrackHeight - gap * (visibleCount - 1)) / visibleCount)));
  const trackHeight = visibleCount * targetHeight + gap * (visibleCount - 1);
  moveFolderTargetHeight = targetHeight;
  moveFolderGap = gap;
  const railWidth = Math.max(230, Math.min(320, Math.floor(cardWidth || paneRect.width - 24)));
  const longestName = Math.max(...moveFolderTargets.map(folder => Array.from(folder.name || "").length), 1);
  const fontSize = Math.max(18, Math.min(30, Math.floor((railWidth - 42) / Math.max(longestName, 8) * 1.42)));
  moveFolderLayer = document.createElement("div");
  moveFolderLayer.className = "move-folder-layer";
  moveFolderLayer.innerHTML = `<div class="move-folder-rail"><div class="move-folder-stack"><div class="move-folder-status" aria-hidden="true"></div><div class="move-folder-track"><div class="move-folder-track-inner">
  </div></div></div></div>`;
  const rail = moveFolderLayer.querySelector(".move-folder-rail");
  rail.style.left = `${paneRect.left - screenRect.left + paneRect.width / 2}px`;
  rail.style.top = `${paneRect.top - screenRect.top + paneRect.height / 2}px`;
  moveFolderLayer.style.setProperty("--move-folder-rail-width", `${railWidth}px`);
  moveFolderLayer.style.setProperty("--move-folder-font-size", `${fontSize}px`);
  moveFolderLayer.style.setProperty("--move-folder-target-height", `${targetHeight}px`);
  moveFolderLayer.style.setProperty("--move-folder-gap", `${gap}px`);
  moveFolderLayer.style.setProperty("--move-folder-track-height", `${trackHeight}px`);
  screen.appendChild(moveFolderLayer);
  renderMoveFolderTrack(-1, 0);
  folderBackdrop.classList.add("active", "move-active");
}

function hideMoveFolderLayer() {
  stopMoveFolderAutoScroll();
  clearMoveFolderHover();
  moveFolderLayer?.remove();
  moveFolderLayer = null;
  moveFolderTargets = [];
  moveFolderActiveIndex = -1;
  moveFolderScrollY = 0;
  moveFolderTargetHeight = 0;
  moveFolderGap = 0;
  folderBackdrop.classList.remove("move-active");
  if (!state.doneFolderOpen && state.folderActionId !== state.currentFolderId) folderBackdrop.classList.remove("active");
}

function updateMoveFolderHover(x, y) {
  if (!moveFolderLayer) return null;
  const track = moveFolderLayer.querySelector(".move-folder-track");
  const inner = moveFolderLayer.querySelector(".move-folder-track-inner");
  const rect = track?.getBoundingClientRect();
  const count = moveFolderTargets.length;
  const visible = Math.min(MOVE_FOLDER_VISIBLE_MAX, count);
  if (
    rect && count && visible &&
    x >= rect.left - MOVE_FOLDER_HIT_SLOP_X &&
    x <= rect.right + MOVE_FOLDER_HIT_SLOP_X &&
    y >= rect.top - MOVE_FOLDER_HIT_SLOP_Y &&
    y <= rect.bottom + MOVE_FOLDER_HIT_SLOP_Y
  ) {
    const maxScroll = inner ? Math.max(0, inner.scrollHeight - track.clientHeight) : 0;
    const pointerY = moveFolderClamp(y, rect.top, rect.bottom);
    moveFolderPointerY = pointerY;
    setMoveFolderAutoScroll(moveFolderScrollSpeed(pointerY, rect, maxScroll));
    let nextIndex = nearestMoveFolderIndex(pointerY);
    if (nextIndex < 0) nextIndex = 0;
    renderMoveFolderTrack(nextIndex, moveFolderScrollY);
    return moveFolderTargets[nextIndex]?.id || null;
  }
  stopMoveFolderAutoScroll();
  renderMoveFolderTrack(-1, moveFolderScrollY);
  return null;
}

function isInLivePane(x) {
  const rect = root.getBoundingClientRect();
  return x >= rect.left + rect.width * splitRatio();
}

function startDragGesture(event, noteId, card, source) {
  if (event.button !== 0 || state.noteSheet || state.doneFolderOpen || state.folderDraft) return;
  const note = source === "live"
    ? state.live.find(n => n.id === noteId)
    : state.done.find(n => n.id === noteId);
  if (!note) return;
  const startX = event.clientX, startY = event.clientY, cardRect = card.getBoundingClientRect();
  const moveFolderSafeForGesture = source === "done" && now() < moveFolderSafeUntil;
  let cancelledMoveFolder = false;
  let moved = false, ghost = null;
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (ghost) ghost.remove();
    if (source === "done") hideMoveFolderLayer();
    drag = null;
  };
  const onMove = e => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > 10) {
      moved = true;
      ghost = document.createElement("div");
      const title = noteTitle(note);
      ghost.className = `drag-ghost${title ? " titled" : ""}`;
      ghost.innerHTML = cardContentHTML(note);
      ghost.style.width = `${cardRect.width}px`;
      ghost.style.height = `${cardRect.height}px`;
      document.body.appendChild(ghost);
    }
    if (!ghost) return;
    if (source === "done" && !moveFolderSafeForGesture && !moveFolderLayer && dx < -28) showMoveFolderLayer();
    if (source === "done" && moveFolderLayer && isInLivePane(e.clientX)) {
      cancelledMoveFolder = true;
      hideMoveFolderLayer();
    }
    const isFolderMove = source === "done" && moveFolderLayer;
    ghost.classList.toggle("folder-token", isFolderMove);
    ghost.innerHTML = isFolderMove ? "" : cardContentHTML(note);
    const ghostWidth = isFolderMove ? cardRect.width * .5 : cardRect.width;
    const ghostHeight = isFolderMove ? cardRect.height * .5 : cardRect.height;
    ghost.style.width = `${ghostWidth}px`;
    ghost.style.height = `${ghostHeight}px`;
    ghost.style.left = `${e.clientX - ghostWidth * .45}px`;
    ghost.style.top = `${e.clientY - ghostHeight * .45}px`;
    const tilt = isFolderMove ? 0 : Math.max(-9, Math.min(9, dx / 16));
    ghost.style.transform = `rotate(${tilt}deg) scale(1.03)`;
    if (source === "done" && moveFolderLayer) updateMoveFolderHover(e.clientX, e.clientY);
  };
  const onUp = e => {
    if (!moved) {
      if (source === "live") openNote("live", "live", noteId);
      else openNote("done", "done", noteId);
      cleanup();
      return;
    }
    if (cancelledMoveFolder) {
      cleanup();
      return;
    }
    if (source === "live") {
      const rect = root.getBoundingClientRect();
      const divider = rect.left + rect.width * splitRatio();
      const success = e.clientX <= divider + 26;
      cleanup();
      if (success) moveLiveToDone(noteId);
      return;
    }
    if (moveFolderLayer) {
      const targetId = updateMoveFolderHover(e.clientX, e.clientY);
      cleanup();
      if (targetId) moveDoneToFolder(noteId, targetId);
      return;
    }
    const rect = root.getBoundingClientRect();
    const divider = rect.left + rect.width * splitRatio();
    const success = e.clientX >= divider - 26;
    cleanup();
    if (success) moveDoneToLive(noteId);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  drag = { noteId, source };
}

function renderOverlay() {
  const show = !!state.noteSheet || !!state.confirmDialog;
  overlay.className = `overlay${show ? " active" : ""}`;
  if (!show) { overlay.innerHTML = ""; return; }
  const screenRect = screen.getBoundingClientRect();
  let html = `<div class="veil" data-close="1"></div>`;
  if (state.confirmDialog) {
    html += `<div class="sheet confirm-sheet">
      <div class="confirm-title">${esc(state.confirmDialog.title)}</div>
      <div class="confirm-body">${esc(state.confirmDialog.body)}</div>
      <div class="confirm-actions">
        <button class="confirm-btn secondary" id="cancelConfirm" type="button">${esc(state.confirmDialog.cancelLabel)}</button>
        <button class="confirm-btn primary" id="okConfirm" type="button">${esc(state.confirmDialog.confirmLabel)}</button>
      </div>
    </div>`;
    overlay.innerHTML = html;
    overlay.querySelector("[data-close]")?.addEventListener("click", () => { state.confirmDialog = null; render(); });
    overlay.querySelector("#cancelConfirm")?.addEventListener("click", () => { state.confirmDialog = null; render(); });
    overlay.querySelector("#okConfirm")?.addEventListener("click", () => {
      const dialog = state.confirmDialog;
      if (!dialog) return;
      if (dialog.kind === "delete-folder") deleteFolderNow(dialog.folderId);
      if (dialog.kind === "clear-trash") clearTrashNow();
    });
    return;
  }
  const rect = getPaneRect(state.noteSheet.side);
  const sheet = state.noteSheet;
  const metaParts = [fmt(sheet.createdAt || now()), ...(sheet.source === "done" && sheet.doneAt ? [fmt(sheet.doneAt)] : [])];
  const bottomActions = sheet.noteId ? `<div class="sheet-bottom">
      <div class="meta-actions">
        <button class="icon-btn trash-btn" id="deleteNote" type="button" aria-label="Xoa note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </div>
    </div>` : "";
  html += `<div class="sheet note-sheet" style="left:${rect.left - screenRect.left}px;top:${rect.top - screenRect.top}px;width:${rect.width}px;height:${rect.height}px">
    <div class="sheet-top">
      <button class="sheet-action" id="closeNote" type="button">&times;</button>
      <button class="save-btn" id="saveNote" type="button">Luu</button>
    </div>
    <div class="note-editor-card">
      <input class="note-title-input" id="noteTitleInput" placeholder="Ten neu can" value="${esc(sheet.title)}" spellcheck="false">
      <textarea class="note-input" id="noteInput" placeholder="Note..." spellcheck="false">${esc(sheet.text)}</textarea>
      ${metaParts.length ? `<div class="note-card-meta">${esc(metaParts.join(" - "))}</div>` : ""}
    </div>
    ${bottomActions}
  </div>`;
  overlay.innerHTML = html;
  overlay.querySelector("[data-close]")?.addEventListener("click", closeSheets);
  overlay.querySelector("#closeNote")?.addEventListener("click", closeSheets);
  overlay.querySelector("#saveNote")?.addEventListener("click", saveNote);
  overlay.querySelector("#deleteNote")?.addEventListener("click", deleteCurrentNote);
  document.getElementById("noteTitleInput")?.addEventListener("input", e => { state.noteSheet.title = e.target.value; });
  document.getElementById("noteInput")?.addEventListener("input", e => { state.noteSheet.text = e.target.value; });
}

function renderDoneFolderMenu() {
  if (!state.doneFolderOpen) {
    doneFolderMenu.className = "done-folder-menu";
    doneFolderMenu.innerHTML = "";
    return;
  }
  const draft = state.folderDraft;
  const currentEditing = draft && draft.type === "rename" && draft.folderId === state.currentFolderId;
  doneFolderMenu.className = "done-folder-menu open";
  doneFolderMenu.innerHTML = `
    ${currentEditing ? `<div class="folder-draft"><input class="folder-input-inline" id="folderInput" value="${esc(draft.text)}" maxlength="${FOLDER_NAME_MAX}" placeholder="Ten folder"><button class="folder-save-inline" id="saveFolderDraft" type="button">Luu</button></div>` : ""}
    ${state.folders.filter(folder => folder.id !== state.currentFolderId).map(folder => {
      const editing = draft && draft.type === "rename" && draft.folderId === folder.id;
      if (editing) {
        return `<div class="folder-draft"><input class="folder-input-inline" id="folderInput" value="${esc(draft.text)}" maxlength="${FOLDER_NAME_MAX}" placeholder="Ten folder"><button class="folder-save-inline" id="saveFolderDraft" type="button">Luu</button></div>`;
      }
      return `<div class="folder-word-row">
        <button class="folder-word ${folder.id === state.currentFolderId ? "is-active" : ""}" data-pick-folder="${folder.id}" type="button">${esc(folder.name)}</button>
      </div>`;
    }).join("")}
    ${draft && draft.type === "create" ? `<div class="folder-draft"><input class="folder-input-inline" id="folderInput" value="${esc(draft.text)}" maxlength="${FOLDER_NAME_MAX}" placeholder="Ten folder moi"><button class="folder-save-inline" id="saveFolderDraft" type="button">Tao</button></div>` : ""}
    ${!(draft && draft.type === "create") ? `<button class="folder-word" id="addFolderInline" type="button">+ Folder</button>` : ""}
  `;
  doneFolderMenu.querySelectorAll("[data-pick-folder]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    pickDoneFolder(btn.dataset.pickFolder);
  }));
  doneFolderMenu.querySelector("#addFolderInline")?.addEventListener("click", e => {
    e.stopPropagation();
    startCreateFolder("Folder moi", true);
  });
  doneFolderMenu.querySelector("#saveFolderDraft")?.addEventListener("click", e => {
    e.stopPropagation();
    commitFolderDraft();
  });
  doneFolderMenu.querySelector("#folderInput")?.addEventListener("input", e => {
    const next = limitText(e.target.value, FOLDER_NAME_MAX);
    if (e.target.value !== next) e.target.value = next;
    state.folderDraft.text = next;
  });
  doneFolderMenu.querySelector("#folderInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitFolderDraft();
    }
  });
}

function renderCurrentFolderActions() {
  if (state.folderActionId !== state.currentFolderId || state.mode !== "done") {
    currentFolderActions.className = "current-folder-actions";
    currentFolderActions.innerHTML = "";
    return;
  }
  const canDelete = state.folders.length > 1;
  currentFolderActions.className = "current-folder-actions open";
  currentFolderActions.innerHTML = `
    <button class="folder-action-item" id="renameCurrentFolder" type="button" aria-label="Sua ten"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
    ${canDelete ? `<button class="folder-action-item danger" id="deleteCurrentFolder" type="button" aria-label="Xoa folder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>` : ""}
  `;
  currentFolderActions.querySelector("#renameCurrentFolder")?.addEventListener("click", e => {
    e.stopPropagation();
    startRenameFolder(state.currentFolderId);
  });
  currentFolderActions.querySelector("#deleteCurrentFolder")?.addEventListener("click", e => {
    e.stopPropagation();
    deleteFolder(state.currentFolderId);
  });
}

function renderUtilityPanel() {
  if (!utilityPanel) return;
  const inTrash = state.utilityView === "trash";
  const inSettings = state.utilityView === "settings";
  const atUtilityHome = !inTrash && !inSettings;
  const searchQuery = state.searchQuery || "";
  const hasSearchQuery = !!searchQuery.trim();
  trashSection.querySelector(".trash-clear-trigger")?.remove();
  utilityPanel.setAttribute("aria-hidden", state.utilityOpen ? "false" : "true");
  settingsSection.classList.toggle("is-page", inSettings);
  trashSection.classList.toggle("is-page", inTrash);
  settingsSection.classList.toggle("is-away", inTrash);
  trashSection.classList.toggle("is-away", inSettings);
  settingsSection.classList.toggle("is-returning", atUtilityHome && state.utilityBackFrom === "settings");
  trashSection.classList.toggle("is-returning", atUtilityHome && state.utilityBackFrom === "trash");
  openSettings.setAttribute("aria-expanded", inSettings ? "true" : "false");
  openTrash.setAttribute("aria-expanded", inTrash ? "true" : "false");
  if (state.utilityBackFrom && atUtilityHome) {
    window.clearTimeout(utilityBackTimer);
    utilityBackTimer = window.setTimeout(() => {
      state.utilityBackFrom = null;
      render();
    }, 320);
  }
  const backIcon = `<svg class="utility-back-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;
  const settingsTitle = state.settingsPanel === "appearance" ? "Giao dien" : "Cai dat";
  openSettings.innerHTML = inSettings ? `${backIcon}<span>${settingsTitle}</span>` : "Cai dat";
  openTrash.innerHTML = inTrash ? `${backIcon}<span>Thung rac</span>` : "Thung rac";
  const themeLabels = { dark: "Toi", light: "Sang" };
  const customPresetLabels = { sau: "Sau", tram: "Tram", am: "Am" };
  const activeCustomPreset = CUSTOM_THEME_PRESETS.includes(state.themeCustomPreset) ? state.themeCustomPreset : "sau";
  const appearanceLabel = state.themeCustomEnabled ? `Custom ${customPresetLabels[activeCustomPreset]}` : themeLabels[state.themeMode];
  const themeOption = (mode, label) => `
    <button class="settings-choice ${state.themeMode === mode ? "is-selected" : ""}" data-theme-mode="${mode}" type="button" aria-pressed="${state.themeMode === mode ? "true" : "false"}">
      <span class="settings-theme-swatch settings-theme-swatch-${mode}" aria-hidden="true"></span>
      <span>${label}</span>
      <i></i>
    </button>`;
  const customPresetOption = (preset, label) => `
    <button class="settings-choice settings-preset-choice ${state.themeCustomEnabled && activeCustomPreset === preset ? "is-selected" : ""}" data-theme-preset="${preset}" type="button" aria-pressed="${state.themeCustomEnabled && activeCustomPreset === preset ? "true" : "false"}">
      <span class="settings-theme-swatch settings-theme-preset-${preset}" aria-hidden="true"></span>
      <span>${label}</span>
      <i></i>
    </button>`;
  settingsView.innerHTML = state.settingsPanel === "appearance" ? `
    <div class="settings-group settings-choice-group">
      ${themeOption("dark", "Toi")}
      ${themeOption("light", "Sang")}
      <button class="settings-choice settings-choice-custom ${state.themeCustomEnabled ? "is-selected" : ""}" data-theme-custom-toggle type="button" aria-pressed="${state.themeCustomEnabled ? "true" : "false"}">
        <span class="settings-theme-swatch settings-theme-swatch-custom" aria-hidden="true"></span>
        <span>Custom</span>
        <i></i>
      </button>
      ${state.themeCustomEnabled ? `
        ${customPresetOption("sau", "Sau")}
        ${customPresetOption("tram", "Tram")}
        ${customPresetOption("am", "Am")}
      ` : ""}
    </div>
  ` : `
    <div class="settings-group">
      <div class="settings-row">
        <p>Tai khoan</p>
      </div>
      <div class="settings-row">
        <p>Dong bo</p>
      </div>
      <button class="settings-row settings-row-button" id="openAppearanceSettings" type="button">
        <p>Giao dien</p>
        <span class="settings-row-value">${appearanceLabel}</span>
      </button>
    </div>
  `;
  settingsView.querySelector("#openAppearanceSettings")?.addEventListener("click", openAppearanceSettings);
  settingsView.querySelectorAll("[data-theme-mode]").forEach(btn => {
    btn.addEventListener("click", () => setThemeModePreview(btn.dataset.themeMode));
  });
  settingsView.querySelector("[data-theme-custom-toggle]")?.addEventListener("click", () => {
    setThemeCustomPreview(!state.themeCustomEnabled);
  });
  settingsView.querySelectorAll("[data-theme-preset]").forEach(btn => {
    btn.addEventListener("click", () => setThemeCustomPreset(btn.dataset.themePreset));
  });
  const searchHtml = `
    <div class="utility-search ${hasSearchQuery ? "has-query" : ""}">
      <svg class="utility-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>
      <input id="utilitySearchInput" type="text" value="${esc(searchQuery)}" placeholder="Tim note..." autocomplete="off" spellcheck="false">
      <button class="utility-search-clear" id="utilitySearchClear" type="button" aria-label="Xoa tim kiem" ${hasSearchQuery ? "" : "hidden"}>&times;</button>
    </div>
    <div class="utility-search-results" id="utilitySearchResults" ${hasSearchQuery ? "" : "hidden"}>${utilitySearchResultsHtml(searchQuery)}</div>
  `;
  utilityHome.querySelector(".utility-search-wrap")?.remove();
  utilityHome.insertAdjacentHTML("afterbegin", `<div class="utility-search-wrap">${searchHtml}</div>`);
  const searchInput = document.getElementById("utilitySearchInput");
  searchInput?.addEventListener("compositionstart", () => {
    utilitySearchComposing = true;
    window.clearTimeout(utilitySearchRenderTimer);
    utilitySearchRenderTimer = null;
  });
  searchInput?.addEventListener("compositionend", e => {
    utilitySearchComposing = false;
    state.searchQuery = e.target.value;
    refreshUtilitySearchSoon(0);
  });
  searchInput?.addEventListener("input", e => {
    state.searchQuery = e.target.value;
    if (utilitySearchComposing || e.isComposing) return;
    refreshUtilitySearchSoon();
  });
  document.getElementById("utilitySearchClear")?.addEventListener("click", () => {
    state.searchQuery = "";
    window.clearTimeout(utilitySearchRenderTimer);
    utilitySearchRenderTimer = null;
    if (searchInput) searchInput.value = "";
    refreshUtilitySearch();
    focusLater("utilitySearchInput", false, true);
  });
  bindUtilitySearchResultActions();
  if (inSettings) {
    trashView.innerHTML = "";
    return;
  }
  if (!inTrash) {
    trashView.innerHTML = "";
    return;
  }
  const sortedTrash = state.trash.filter(item => item.expiresAt > now()).sort((a, b) => b.deletedAt - a.deletedAt);
  state.trash = sortedTrash;
  if (sortedTrash.length) {
    openTrash.insertAdjacentHTML("afterend", `<button class="trash-clear-trigger" id="clearTrash" type="button" aria-label="Don sach thung rac"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>`);
    trashSection.querySelector("#clearTrash")?.addEventListener("click", e => {
      e.stopPropagation();
      confirmClearTrash();
    });
  }
  if (!sortedTrash.length) {
    trashView.innerHTML = `
      <div class="trash-empty">Thung rac trong.</div>
    `;
    return;
  }
  trashView.innerHTML = sortedTrash.map(item => {
    const origin = item.deletedFrom === "done" ? (item.originalFolderName || "Done") : "Live";
    const title = noteTitle(item);
    const preview = noteSecondaryPreview(item);
    return `<div class="trash-item" data-trash-id="${esc(item.id)}">
      <div class="trash-copy">
        ${title ? `<strong>${esc(title)}</strong>` : ""}
        ${preview ? `<p>${esc(preview)}</p>` : ""}
        <span>${esc(origin)} - Con ${daysLeft(item.expiresAt)} ngay</span>
      </div>
      <button class="trash-restore" data-restore-trash="${item.id}" type="button" aria-label="Khoi phuc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.16.68 4.24 1.76L13 11h8V3l-3.35 3.35Z"/></svg></button>
    </div>`;
  }).join("");
  trashView.querySelectorAll("[data-restore-trash]").forEach(btn => {
    btn.addEventListener("click", () => restoreTrashItem(btn.dataset.restoreTrash));
  });
}

function getCurrentFolderName() {
  return (state.folders.find(f => f.id === state.currentFolderId)?.name) || "Samini";
}

function syncCompactFolderText(fullName) {
  setCompactFolderText(fullName);
  return fullName;
}

function setMode(nextMode) {
  if (state.mode === nextMode) return;
  state.mode = nextMode;
  runModeFx(nextMode);
}

function render() {
  ensureFolderIds();
  applyThemeMode();
  const currentFolderName = getCurrentFolderName();
  root.style.setProperty("--split", splitRatio());
  folderBackdrop.style.setProperty("--backdrop-split", splitRatio());
  syncCardContentWidths();
  folderBackdrop.classList.toggle("active", state.doneFolderOpen || state.folderActionId === state.currentFolderId);
  addFab.classList.toggle("muted", state.doneFolderOpen || state.folderActionId === state.currentFolderId || !!state.confirmDialog);
  addFab.classList.toggle("hidden", state.mode === "done" || state.utilityOpen);
  donePane.classList.toggle("compact", state.mode === "live" && !state.utilityOpen);
  donePane.classList.toggle("is-folder-ui-open", state.doneFolderOpen || state.folderActionId === state.currentFolderId);
  donePane.classList.toggle("utility-open", state.utilityOpen);
  livePane.classList.toggle("compact", state.mode === "done" || state.utilityOpen);
  liveLamp.classList.toggle("on", state.mode === "live" && !state.utilityOpen);
  utilityPanel?.classList.toggle("open", !!state.utilityOpen);
  syncCardFitHeight();
  liveCount.textContent = `${state.live.length}`;
  doneCount.textContent = `${doneNotesForCurrentFolder().length}`;
  syncCompactFolderText(currentFolderName);
  doneFolderToggle.textContent = currentFolderName;
  undoBtn.disabled = !state.lastMoved;
  undoBtn.style.opacity = state.lastMoved ? "1" : ".45";

  liveList.innerHTML = "";
  doneList.innerHTML = "";
  if (state.live.length) state.live.sort((a, b) => b.createdAt - a.createdAt).forEach(note => liveList.appendChild(buildCard(note, "live")));
  else liveList.innerHTML = `<div class="empty">Live trong. Bam + de tao note moi.</div>`;
  const doneFiltered = doneNotesForCurrentFolder();
  if (doneFiltered.length) doneFiltered.forEach(note => doneList.appendChild(buildCard(note, "done")));
  else doneList.innerHTML = `<div class="empty">Folder nay chua co note done.</div>`;
  renderDoneFolderMenu();
  renderCurrentFolderActions();
  renderUtilityPanel();
  renderOverlay();
  persist();
  runPendingReveal();
}

function startLaunchSplash() {
  if (!launchSplash) return;
  window.setTimeout(() => {
    launchSplash.classList.add("is-fading");
  }, 820);
  window.setTimeout(() => {
    launchSplash.remove();
  }, 1320);
}

addFab.addEventListener("click", openNewNote);
undoBtn.addEventListener("click", undoMove);
utilityToggle?.addEventListener("click", e => {
  e.stopPropagation();
  toggleUtilityPanel();
});
utilityPanelBack?.addEventListener("click", e => {
  e.stopPropagation();
  toggleUtilityPanel();
});
openSettings?.addEventListener("click", e => {
  e.stopPropagation();
  openSettingsView();
});
openTrash?.addEventListener("click", e => {
  e.stopPropagation();
  openTrashView();
});
utilityPanel?.addEventListener("click", e => {
  e.stopPropagation();
});
doneFolderToggle.addEventListener("click", e => {
  e.stopPropagation();
  if (state.mode === "live") {
    setMode("done");
    state.doneFolderOpen = false;
    state.folderDraft = null;
    render();
    return;
  }
  toggleDoneFolderMenu();
});
doneFolderActionsToggle?.addEventListener("click", e => {
  e.stopPropagation();
  if (state.mode === "live") {
    setMode("done");
    state.doneFolderOpen = false;
    state.folderDraft = null;
    state.folderActionId = null;
    render();
    return;
  }
  toggleFolderActions(state.currentFolderId);
});
folderBackdrop.addEventListener("click", () => {
  if (!state.doneFolderOpen && !state.folderActionId) return;
  state.doneFolderOpen = false;
  state.folderDraft = null;
  state.folderActionId = null;
  render();
});
livePane.addEventListener("click", e => {
  if (state.utilityOpen) {
    if (state.mode === "done") {
      state.utilityOpen = false;
      resetUtilityView();
      setMode("live");
      render();
    } else {
      toggleUtilityPanel();
    }
    return;
  }
  if (state.mode === "done") {
    setMode("live");
    state.doneFolderOpen = false;
    state.folderDraft = null;
    render();
    return;
  }
  if (!e.target.closest(".card") && !e.target.closest(".head")) {
    setMode("live");
    state.doneFolderOpen = false;
    state.folderDraft = null;
    render();
  }
});
donePane.addEventListener("click", e => {
  if (state.utilityOpen) return;
  if (state.mode === "live") {
    if (!e.target.closest("#doneFolderMenu")) {
      setMode("done");
      state.doneFolderOpen = false;
      state.folderDraft = null;
      render();
    }
    return;
  }
  if (!e.target.closest(".card") && !e.target.closest(".head")) {
    setMode("done");
    render();
  }
});
window.addEventListener("resize", () => {
  syncCardContentWidths();
  syncCardFitHeight();
  if (state.noteSheet) renderOverlay();
  syncCompactFolderText(getCurrentFolderName());
});
document.addEventListener("click", e => {
  if (state.confirmDialog) return;
  if (state.doneFolderOpen && !e.target.closest("#doneFolderToggle") && !e.target.closest("#doneFolderMenu")) {
    state.doneFolderOpen = false;
    state.folderDraft = null;
    render();
    return;
  }
  if (state.folderActionId && !e.target.closest("#doneFolderActionsToggle") && !e.target.closest("#currentFolderActions")) {
    state.folderActionId = null;
    render();
    return;
  }
});

render();
startLaunchSplash();
