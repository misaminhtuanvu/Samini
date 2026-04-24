const KEY = "sami-v3";
const root = document.getElementById("app");
const screen = document.getElementById("screen");
const livePane = document.getElementById("livePane");
const donePane = document.getElementById("donePane");
const liveList = document.getElementById("liveList");
const doneList = document.getElementById("doneList");
const liveLamp = document.getElementById("liveLamp");
const doneLamp = document.getElementById("doneLamp");
const liveCount = document.getElementById("liveCount");
const doneCount = document.getElementById("doneCount");
const doneFolderToggle = document.getElementById("doneFolderToggle");
const doneFolderActionsToggle = document.getElementById("doneFolderActionsToggle");
const currentFolderActions = document.getElementById("currentFolderActions");
const doneFolderMenu = document.getElementById("doneFolderMenu");
const folderBackdrop = document.getElementById("folderBackdrop");
const undoBtn = document.getElementById("undoBtn");
const addFab = document.getElementById("addFab");
const overlay = document.getElementById("overlay");
const launchSplash = document.getElementById("launchSplash");

const state = loadState();
let drag = null;

function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5); }
function now() { return Date.now(); }
function esc(text) { return (text || "").replace(/[&<>"]/g, s => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[s])); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function cssNumber(name) { return parseFloat(cssVar(name)); }
function cssPx(name) { return parseFloat(cssVar(name).replace("px", "")); }
function fmt(time) {
  const d = new Date(time);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function splitRatio() { return state.mode === "done" ? cssNumber("--split-done") : cssNumber("--split-live"); }
function doneNotesForCurrentFolder() { return state.done.filter(n => n.folderId === state.currentFolderId).sort((a, b) => b.doneAt - a.doneAt); }
function doneCountForFolder(folderId) { return state.done.filter(n => n.folderId === folderId).length; }

function loadState() {
  const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
  const folders = Array.isArray(raw.folders) && raw.folders.length ? raw.folders.map(f => ({ id: f.id || uid(), name: (f.name || "Folder").trim() || "Folder" })) : [{ id: "samini", name: "Samini" }];
  const liveSource = Array.isArray(raw.live) ? raw.live : Array.isArray(raw.active) ? raw.active : [];
  const live = liveSource.map(note => ({ id: note.id || uid(), text: note.text || "", createdAt: note.createdAt || now() }));
  const done = (Array.isArray(raw.done) ? raw.done : []).map(note => ({ id: note.id || uid(), text: note.text || "", createdAt: note.createdAt || now(), doneAt: note.doneAt || now(), folderId: note.folderId || folders[0].id }));
  return {
    mode: raw.mode === "done" ? "done" : "live",
    folders,
    currentFolderId: folders.some(f => f.id === raw.currentFolderId) ? raw.currentFolderId : folders[0].id,
    live,
    done,
    lastMoved: raw.lastMoved || null,
    noteSheet: null,
    confirmDialog: null,
    doneFolderOpen: false,
    folderDraft: null,
    folderActionId: null
  };
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify({
    mode: state.mode,
    folders: state.folders,
    currentFolderId: state.currentFolderId,
    live: state.live,
    done: state.done,
    lastMoved: state.lastMoved
  }));
}

function ensureFolderIds() {
  const fallback = state.folders[0].id;
  state.done.forEach(n => { if (!n.folderId) n.folderId = fallback; });
  if (!state.folders.some(f => f.id === state.currentFolderId)) state.currentFolderId = fallback;
}

function openNewNote() {
  state.mode = "live";
  state.noteSheet = { side: "live", source: "live", noteId: null, text: "" };
  state.doneFolderOpen = false;
  state.folderDraft = null;
  render();
  focusLater("noteInput");
}

function openNote(side, source, noteId) {
  const list = source === "live" ? state.live : state.done;
  const note = list.find(n => n.id === noteId);
  if (!note) return;
  state.mode = side;
  state.noteSheet = { side, source, noteId, text: note.text };
  state.doneFolderOpen = false;
  state.folderDraft = null;
  render();
  focusLater("noteInput");
}

function closeSheets() {
  state.noteSheet = null;
  state.confirmDialog = null;
  render();
}

function focusLater(id, selectAll = false) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.focus({ preventScroll: true }); }
    catch { el.focus(); }
    if (selectAll && typeof el.select === "function") el.select();
  });
}

function syncViewportMode() {
  const mobileLike =
    window.matchMedia("(max-width: 820px)").matches ||
    window.matchMedia("(pointer: coarse)").matches ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  document.documentElement.classList.toggle("mobile-host", mobileLike);
}

function saveNote() {
  if (!state.noteSheet) return;
  const text = state.noteSheet.text.trim();
  if (!text) return;
  if (state.noteSheet.source === "live") {
    if (state.noteSheet.noteId) {
      const note = state.live.find(n => n.id === state.noteSheet.noteId);
      if (note) note.text = text;
    } else {
      state.live.unshift({ id: uid(), text, createdAt: now() });
    }
  } else {
    const note = state.done.find(n => n.id === state.noteSheet.noteId);
    if (note) note.text = text;
  }
  state.noteSheet = null;
  persist();
  render();
}

function deleteCurrentNote() {
  if (!state.noteSheet?.noteId) return;
  if (state.noteSheet.source === "live") state.live = state.live.filter(n => n.id !== state.noteSheet.noteId);
  else state.done = state.done.filter(n => n.id !== state.noteSheet.noteId);
  state.noteSheet = null;
  persist();
  render();
}

function toggleDoneFolderMenu() {
  const opening = !state.doneFolderOpen;
  state.doneFolderOpen = opening;
  state.folderDraft = null;
  state.folderActionId = null;
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
  render();
}
function startCreateFolder(prefill = "", selectAll = false) {
  state.doneFolderOpen = true;
  state.folderDraft = { type: "create", text: prefill };
  state.folderActionId = null;
  render();
  focusLater("folderInput", selectAll);
}
function startRenameFolder(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  state.doneFolderOpen = true;
  state.folderDraft = { type: "rename", folderId, text: folder.name };
  state.folderActionId = null;
  render();
  focusLater("folderInput", true);
}
function toggleFolderActions(folderId) {
  state.folderActionId = state.folderActionId === folderId ? null : folderId;
  state.folderDraft = null;
  state.doneFolderOpen = false;
  render();
}
function commitFolderDraft() {
  const draft = state.folderDraft;
  if (!draft) return;
  const name = (draft.text || "").trim();
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

function moveLiveToDone(noteId) {
  const index = state.live.findIndex(n => n.id === noteId);
  if (index < 0) return;
  const note = state.live[index];
  state.live.splice(index, 1);
  state.done.unshift({ id: note.id, text: note.text, createdAt: note.createdAt, doneAt: now(), folderId: state.currentFolderId || state.folders[0].id });
  state.lastMoved = { note: { id: note.id, text: note.text, createdAt: note.createdAt } };
  state.mode = "done";
  persist();
  render();
}

function moveDoneToLive(noteId) {
  const index = state.done.findIndex(n => n.id === noteId);
  if (index < 0) return;
  const note = state.done[index];
  state.done.splice(index, 1);
  state.live.unshift({ id: note.id, text: note.text, createdAt: note.createdAt });
  state.lastMoved = null;
  state.mode = "live";
  persist();
  render();
}

function undoMove() {
  if (!state.lastMoved?.note) return;
  const note = state.lastMoved.note;
  state.done = state.done.filter(n => n.id !== note.id);
  state.live.unshift({ id: note.id, text: note.text, createdAt: note.createdAt });
  state.lastMoved = null;
  state.mode = "live";
  persist();
  render();
}

function getPaneRect(side) {
  const rect = root.getBoundingClientRect();
  const splitPx = rect.width * splitRatio();
  const left = side === "done" ? rect.left : rect.left + splitPx;
  const width = side === "done" ? splitPx : rect.width - splitPx;
  const topInset = cssPx("--sheet-top-inset");
  const sideInset = cssPx("--pane-side-inset");
  const bottomInset = cssPx("--pane-bottom-inset");
  return {
    left: left + sideInset,
    top: rect.top + topInset,
    width: Math.max(228, width - sideInset * 2),
    height: rect.height - topInset - bottomInset
  };
}

function buildCard(note, source) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.innerHTML = `<p class="card-text">${esc(note.text)}</p><div class="card-meta"><span>${fmt(source === "done" ? note.doneAt : note.createdAt)}</span><span></span></div>`;
  card.addEventListener("pointerdown", e => startDragGesture(e, note.id, card, source));
  return card;
}

function startDragGesture(event, noteId, card, source) {
  if (event.button !== 0 || state.noteSheet || state.doneFolderOpen || state.folderDraft) return;
  const note = source === "live"
    ? state.live.find(n => n.id === noteId)
    : state.done.find(n => n.id === noteId);
  if (!note) return;
  const startX = event.clientX, startY = event.clientY, cardRect = card.getBoundingClientRect();
  let moved = false, ghost = null;
  const cleanup = success => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (ghost) ghost.remove();
    drag = null;
    if (success) {
      if (source === "live") moveLiveToDone(noteId);
      else moveDoneToLive(noteId);
    }
  };
  const onMove = e => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > 10) {
      moved = true;
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.innerHTML = `<p class="card-text">${esc(note.text)}</p><div class="card-meta"><span>${fmt(note.createdAt)}</span><span></span></div>`;
      document.body.appendChild(ghost);
    }
    if (!ghost) return;
    ghost.style.left = `${e.clientX - cardRect.width * .45}px`;
    ghost.style.top = `${e.clientY - cardRect.height * .45}px`;
    const tilt = source === "live"
      ? Math.max(-9, Math.min(9, dx / 16))
      : Math.max(-9, Math.min(9, dx / 16));
    ghost.style.transform = `rotate(${tilt}deg) scale(1.03)`;
  };
  const onUp = e => {
    if (!moved) {
      if (source === "live") openNote("live", "live", noteId);
      else openNote("done", "done", noteId);
      cleanup(false);
      return;
    }
    const rect = root.getBoundingClientRect();
    const divider = rect.left + rect.width * splitRatio();
    const success = source === "live"
      ? e.clientX <= divider + 26
      : e.clientX >= divider - 26;
    cleanup(success);
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
    });
    return;
  }
  const rect = getPaneRect(state.noteSheet.side);
  html += `<div class="sheet note-sheet" style="left:${rect.left - screenRect.left}px;top:${rect.top - screenRect.top}px;width:${rect.width}px;height:${rect.height}px">
    <div class="sheet-top">
      <button class="sheet-action" id="closeNote" type="button">&times;</button>
      <button class="save-btn" id="saveNote" type="button">Luu</button>
    </div>
    <textarea class="note-input" id="noteInput" placeholder="Nhap note..." spellcheck="false">${esc(state.noteSheet.text)}</textarea>
    <div class="sheet-bottom">
      <div class="sheet-meta">${state.noteSheet.noteId ? fmt(state.noteSheet.source === "done" ? (state.done.find(n => n.id === state.noteSheet.noteId)?.doneAt || now()) : (state.live.find(n => n.id === state.noteSheet.noteId)?.createdAt || now())) : "new"}</div>
      <div class="meta-actions">
        ${state.noteSheet.noteId ? `<button class="icon-btn trash-btn" id="deleteNote" type="button" aria-label="Xoa note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>` : ""}
      </div>
    </div>
  </div>`;
  overlay.innerHTML = html;
  overlay.querySelector("[data-close]")?.addEventListener("click", closeSheets);
  overlay.querySelector("#closeNote")?.addEventListener("click", closeSheets);
  overlay.querySelector("#saveNote")?.addEventListener("click", saveNote);
  overlay.querySelector("#deleteNote")?.addEventListener("click", deleteCurrentNote);
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
    ${currentEditing ? `<div class="folder-draft"><input class="folder-input-inline" id="folderInput" value="${esc(draft.text)}" placeholder="Ten folder"><button class="folder-save-inline" id="saveFolderDraft" type="button">Luu</button></div>` : ""}
    ${state.folders.filter(folder => folder.id !== state.currentFolderId).map(folder => {
      const editing = draft && draft.type === "rename" && draft.folderId === folder.id;
      if (editing) {
        return `<div class="folder-draft"><input class="folder-input-inline" id="folderInput" value="${esc(draft.text)}" placeholder="Ten folder"><button class="folder-save-inline" id="saveFolderDraft" type="button">Luu</button></div>`;
      }
      return `<div class="folder-word-row">
        <button class="folder-word ${folder.id === state.currentFolderId ? "is-active" : ""}" data-pick-folder="${folder.id}" type="button">${esc(folder.name)}</button>
      </div>`;
    }).join("")}
    ${draft && draft.type === "create" ? `<div class="folder-draft"><input class="folder-input-inline" id="folderInput" value="${esc(draft.text)}" placeholder="Ten folder moi"><button class="folder-save-inline" id="saveFolderDraft" type="button">Tao</button></div>` : ""}
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
  doneFolderMenu.querySelector("#folderInput")?.addEventListener("input", e => { state.folderDraft.text = e.target.value; });
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

function render() {
  ensureFolderIds();
  const currentFolderName = (state.folders.find(f => f.id === state.currentFolderId)?.name) || "Samini";
  root.style.setProperty("--split", splitRatio());
  folderBackdrop.classList.toggle("active", state.doneFolderOpen || state.folderActionId === state.currentFolderId);
  addFab.classList.toggle("muted", state.doneFolderOpen || state.folderActionId === state.currentFolderId || !!state.confirmDialog);
  addFab.classList.toggle("hidden", state.mode === "done");
  donePane.classList.toggle("compact", state.mode === "live");
  livePane.classList.toggle("compact", state.mode === "done");
  liveLamp.classList.toggle("on", state.mode === "live");
  doneLamp.classList.toggle("on", state.mode === "done");
  liveCount.textContent = `${state.live.length}`;
  doneCount.textContent = `${doneNotesForCurrentFolder().length}`;
  doneFolderToggle.textContent = currentFolderName;
  donePane.style.setProperty("--compact-folder-band-height", `${Math.ceil(doneFolderToggle.scrollWidth + 12)}px`);
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
  renderOverlay();
  persist();
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
doneFolderToggle.addEventListener("click", e => {
  e.stopPropagation();
  if (state.mode === "live") {
    state.mode = "done";
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
    state.mode = "done";
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
  if (state.mode === "done") {
    state.mode = "live";
    state.doneFolderOpen = false;
    state.folderDraft = null;
    render();
    return;
  }
  if (!e.target.closest(".card") && !e.target.closest(".head")) {
    state.mode = "live";
    state.doneFolderOpen = false;
    state.folderDraft = null;
    render();
  }
});
donePane.addEventListener("click", e => {
  if (state.mode === "live") {
    if (!e.target.closest("#doneFolderMenu")) {
      state.mode = "done";
      state.doneFolderOpen = false;
      state.folderDraft = null;
      render();
    }
    return;
  }
  if (!e.target.closest(".card") && !e.target.closest(".head")) {
    state.mode = "done";
    render();
  }
});
window.addEventListener("resize", () => {
  syncViewportMode();
  if (state.noteSheet) renderOverlay();
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

syncViewportMode();
render();
startLaunchSplash();
