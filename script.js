import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  deleteDoc,
  limit,
  startAt,
  endAt,
  documentId
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQeLLw4jpHJJ7G7w6LMFpdhooMHh6DJwE",
  authDomain: "webchatfriends-4ebaa.firebaseapp.com",
  projectId: "webchatfriends-4ebaa",
  storageBucket: "webchatfriends-4ebaa.firebasestorage.app",
  messagingSenderId: "773081013408",
  appId: "1:773081013408:web:436f38418f10e1a8babdc5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const view = {
  home: document.getElementById("homeView"),
  locked: document.getElementById("lockedView"),
  inside: document.getElementById("insideRoomView")
};

const el = {
  error: document.getElementById("error"),
  status: document.getElementById("status"),
  modal: document.getElementById("createModal"),
  openCreateBtn: document.getElementById("openCreateBtn"),
  openSearchBtn: document.getElementById("openSearchBtn"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  searchArea: document.getElementById("searchArea"),
  searchInput: document.getElementById("searchInput"),
  searchResults: document.getElementById("searchResults"),
  newCreatorNameInput: document.getElementById("newCreatorNameInput"),
  newRoomNameInput: document.getElementById("newRoomNameInput"),
  newRoomCodeInput: document.getElementById("newRoomCodeInput"),
  joinNameInput: document.getElementById("joinNameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  backHomeBtn: document.getElementById("backHomeBtn"),
  roomBadge: document.getElementById("roomBadge"),
  peopleCountBadge: document.getElementById("peopleCountBadge"),
  messagesList: document.getElementById("messagesList"),
  replyInput: document.getElementById("replyInput"),
  sendReplyBtn: document.getElementById("sendReplyBtn"),
  sendMsgBtn: document.getElementById("sendMsgBtn"),
  shareRoomLink: document.getElementById("shareRoomLink"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  explicitShareBtn: document.getElementById("explicitShareBtn"),
  waShareBtn: document.getElementById("waShareBtn"),
  deleteRoomBtn: document.getElementById("deleteRoomBtn")
};

const CREATOR_KEY = "creatorID";
let currentRoomName = "";
let currentRoomData = null;
let currentDisplayName = "";
let unsubscribeMessages = null;
let authReadyPromiseResolve;
const authReady = new Promise((resolve) => {
  authReadyPromiseResolve = resolve;
});

function showStatus(message) {
  el.status.textContent = message || "";
}

function showError(message) {
  el.error.textContent = message || "Something went wrong.";
  el.error.hidden = false;
  showStatus("");
}

function clearError() {
  el.error.textContent = "";
  el.error.hidden = true;
}

function getFriendlyError(error, fallback) {
  if (!error) return fallback || "Something went wrong.";
  if (typeof error === "string") return error;
  if (error.code === "permission-denied") return "Permission denied for this action.";
  if (error.code === "unavailable") return "Network unavailable. Check internet and retry.";
  if (error.code === "unauthenticated") return "Authentication is not ready. Please retry.";
  if (error.code === "not-found") return "Requested room or message was not found.";
  return error.message || fallback || "Unexpected error occurred.";
}

function setInputError(inputEl, hasError) {
  if (!inputEl) return;
  inputEl.classList.toggle("input-error", !!hasError);
}

function clearInputErrors() {
  setInputError(el.newCreatorNameInput, false);
  setInputError(el.newRoomNameInput, false);
  setInputError(el.newRoomCodeInput, false);
  setInputError(el.joinNameInput, false);
  setInputError(el.roomCodeInput, false);
  setInputError(el.replyInput, false);
  setInputError(el.searchInput, false);
}

function sanitizeRoomName(raw) {
  return (raw || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
}

function getCreatorID() {
  if (auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;
  const existing = localStorage.getItem(CREATOR_KEY);
  if (existing) return existing;
  const generated = `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  localStorage.setItem(CREATOR_KEY, generated);
  return generated;
}

function initAnonymousAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        showError(`Auth failed: ${error.message || "Could not sign in anonymously."}`);
      }
      return;
    }
    console.log("Logged in as:", user.uid);
    authReadyPromiseResolve();
  });
}

function setState(stateName) {
  view.home.hidden = stateName !== "home";
  view.locked.hidden = stateName !== "locked";
  view.inside.hidden = stateName !== "inside";
}

function roomLink(roomName) {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
}

function buildWhatsAppUrl(link) {
  return `https://wa.me/?text=${encodeURIComponent(`Join my room: ${link}`)}`;
}

async function copyToClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

async function explicitShareLink(link) {
  if (!link) throw new Error("Share link is missing.");
  if (navigator.share) {
    await navigator.share({ title: "shareyourmind", text: "Join my room", url: link });
    return;
  }
  const ok = await copyToClipboard(link);
  if (!ok) throw new Error("Could not share link.");
  showStatus("Share not supported on this device. Link copied instead.");
}

function teardownMessagesListener() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
}

function updatePeopleCount(messagesDocs) {
  const people = new Set();
  if (currentRoomData && currentRoomData.creatorID) {
    people.add(currentRoomData.creatorID);
  }
  for (const snap of messagesDocs) {
    const data = snap.data();
    if (data.senderUID) people.add(data.senderUID);
  }
  const count = Math.max(1, people.size || 1);
  el.peopleCountBadge.textContent = `People: ${count}`;
}

function renderMessages(docs) {
  if (!docs.length) {
    el.messagesList.innerHTML = '<p class="message">No messages yet.</p>';
    return;
  }
  const html = docs
    .map((snap) => {
      const data = snap.data();
      const sender = data.senderName || "Guest";
      const text = data.text || "";
      return `<div class="message"><p class="message-meta">${sender}</p>${escapeHtml(text)}</div>`;
    })
    .join("");
  el.messagesList.innerHTML = html;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function tryCreateRoom() {
  await authReady;
  clearError();
  clearInputErrors();
  showStatus("Creating room...");

  const creatorName = (el.newCreatorNameInput.value || "").trim();
  const roomName = sanitizeRoomName(el.newRoomNameInput.value);
  const roomCode = (el.newRoomCodeInput.value || "").trim();
  if (!creatorName) {
    setInputError(el.newCreatorNameInput, true);
    throw new Error("Your name is required.");
  }
  if (!roomName) {
    setInputError(el.newRoomNameInput, true);
    throw new Error("Room name is required.");
  }
  if (!/^\d{4}$/.test(roomCode)) {
    setInputError(el.newRoomCodeInput, true);
    throw new Error("Room code must be exactly 4 digits.");
  }

  const roomRef = doc(db, "rooms", roomName);
  const existing = await getDoc(roomRef);
  if (existing.exists()) {
    setInputError(el.newRoomNameInput, true);
    throw new Error("Room name already exists. Try another.");
  }

  const creatorID = getCreatorID();
  await setDoc(roomRef, {
    roomCode,
    creatorID,
    creatorName,
    createdAt: serverTimestamp()
  });

  currentRoomName = roomName;
  currentRoomData = { roomCode, creatorID, creatorName };
  currentDisplayName = creatorName;
  const link = roomLink(roomName);
  window.history.replaceState({}, "", `?room=${encodeURIComponent(roomName)}`);
  setupInsideRoom(link);
  closeModal();
  showStatus("Room created.");
}

function openModal() {
  clearError();
  showStatus("");
  el.modal.hidden = false;
}

function closeModal() {
  el.modal.hidden = true;
}

async function searchRooms() {
  await authReady;
  clearError();
  setInputError(el.searchInput, false);
  const term = sanitizeRoomName(el.searchInput.value);
  if (!term) {
    el.searchResults.innerHTML = "";
    return;
  }

  const roomsRef = collection(db, "rooms");
  const q = query(roomsRef, orderBy(documentId()), startAt(term), endAt(`${term}\uf8ff`), limit(10));
  const result = await getDocs(q);

  if (result.empty) {
    el.searchResults.innerHTML = '<p class="hint">No matching rooms.</p>';
    return;
  }

  el.searchResults.innerHTML = result.docs
    .map((d) => {
      const n = d.id;
      return `<div class="result-item"><span>${n}</span><a class="button ghost" href="?room=${encodeURIComponent(
        n
      )}">Open</a></div>`;
    })
    .join("");
}

async function attemptUnlockRoom() {
  await authReady;
  clearError();
  clearInputErrors();
  showStatus("Verifying code...");
  const joinName = (el.joinNameInput.value || "").trim();
  const code = (el.roomCodeInput.value || "").trim();
  if (!joinName) {
    setInputError(el.joinNameInput, true);
    throw new Error("Please enter your name to join.");
  }
  if (!/^\d{4}$/.test(code)) {
    setInputError(el.roomCodeInput, true);
    throw new Error("Enter your 4-digit room code.");
  }

  const roomRef = doc(db, "rooms", currentRoomName);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    throw new Error("Room does not exist.");
  }

  const data = snap.data();
  if (data.roomCode !== code) {
    setInputError(el.roomCodeInput, true);
    throw new Error("Wrong room code.");
  }

  currentRoomData = data;
  currentDisplayName = joinName;
  const link = roomLink(currentRoomName);
  setupInsideRoom(link);
  showStatus("Room unlocked.");
}

function setupInsideRoom(link) {
  setState("inside");
  el.roomBadge.textContent = `Room: ${currentRoomName}`;
  el.shareRoomLink.href = link;
  el.shareRoomLink.textContent = "Open room link";
  el.waShareBtn.href = buildWhatsAppUrl(link);
  el.peopleCountBadge.textContent = "People: 1";
  const isCreator = currentRoomData && currentRoomData.creatorID === getCreatorID();
  el.deleteRoomBtn.hidden = !isCreator;

  teardownMessagesListener();
  const messagesRef = collection(db, "rooms", currentRoomName, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));
  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    renderMessages(snapshot.docs);
    updatePeopleCount(snapshot.docs);
  });
}

async function sendReply() {
  await authReady;
  clearError();
  clearInputErrors();
  const text = (el.replyInput.value || "").trim();
  if (!text) {
    setInputError(el.replyInput, true);
    throw new Error("Reply message cannot be empty.");
  }

  const senderName = currentDisplayName || `User-${getCreatorID().slice(-4)}`;
  await addDoc(collection(db, "rooms", currentRoomName, "messages"), {
    text,
    senderName,
    senderUID: getCreatorID(),
    createdAt: serverTimestamp()
  });
  el.replyInput.value = "";
}

async function deleteCurrentRoom() {
  await authReady;
  clearError();
  const okay = window.confirm(`Delete room "${currentRoomName}" and all messages?`);
  if (!okay) return;

  const roomRef = doc(db, "rooms", currentRoomName);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error("Room already deleted.");

  const roomData = roomSnap.data();
  if (roomData.creatorID !== getCreatorID()) throw new Error("Only the room creator can delete this room.");

  // Delete parent room document only. Message sub-collection can remain orphaned
  // if rules block message deletes; this prevents creator delete from failing.
  await deleteDoc(roomRef);

  teardownMessagesListener();
  currentRoomName = "";
  currentRoomData = null;
  currentDisplayName = "";
  window.history.replaceState({}, "", window.location.pathname);
  setState("home");
  showStatus("Room deleted.");
}

async function runAction(action, fallbackMessage) {
  clearError();
  try {
    await action();
  } catch (error) {
    showError(getFriendlyError(error, fallbackMessage));
  }
}

function bindEvents() {
  el.openCreateBtn.addEventListener("click", openModal);
  el.closeModalBtn.addEventListener("click", closeModal);
  el.createRoomBtn.addEventListener("click", () => runAction(tryCreateRoom, "Failed to create room."));
  el.openSearchBtn.addEventListener("click", () => {
    el.searchArea.hidden = !el.searchArea.hidden;
  });
  el.searchInput.addEventListener("input", () => {
    setInputError(el.searchInput, false);
    runAction(searchRooms, "Failed to search rooms.");
  });
  el.joinRoomBtn.addEventListener("click", () => runAction(attemptUnlockRoom, "Could not unlock room."));
  el.backHomeBtn.addEventListener("click", () => {
    window.history.replaceState({}, "", window.location.pathname);
    currentRoomName = "";
    currentRoomData = null;
    currentDisplayName = "";
    teardownMessagesListener();
    setState("home");
    showStatus("");
    clearError();
    clearInputErrors();
  });
  el.sendReplyBtn.addEventListener("click", () => runAction(sendReply, "Failed to send message."));
  el.sendMsgBtn.addEventListener("click", () => runAction(sendReply, "Failed to send message."));
  el.replyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runAction(sendReply, "Failed to send message.");
    }
  });
  el.copyLinkBtn.addEventListener("click", () =>
    runAction(async () => {
      const ok = await copyToClipboard(el.shareRoomLink.textContent || "");
      if (!ok) throw new Error("Could not copy link.");
      showStatus("Link copied.");
    }, "Could not copy link.")
  );
  el.explicitShareBtn.addEventListener("click", () =>
    runAction(async () => {
      await explicitShareLink(el.shareRoomLink.textContent || "");
      showStatus("Share opened.");
    }, "Could not share link.")
  );
  el.deleteRoomBtn.addEventListener("click", () => {
    runAction(deleteCurrentRoom, "Failed to delete room.");
  });

  [el.newRoomNameInput, el.newRoomCodeInput, el.roomCodeInput, el.replyInput].forEach((input) => {
    input.addEventListener("input", () => {
      setInputError(input, false);
      clearError();
    });
  });
  [el.newCreatorNameInput, el.joinNameInput].forEach((input) => {
    input.addEventListener("input", () => {
      setInputError(input, false);
      clearError();
    });
  });
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = sanitizeRoomName(params.get("room") || "");
  if (!room) {
    setState("home");
    return;
  }
  currentRoomName = room;
  setState("locked");
}

bindEvents();
initAnonymousAuth();
initFromUrl();

