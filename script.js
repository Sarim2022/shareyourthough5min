(() => {
  const SHARE_TTL_MS = 5 * 60 * 1000;
  const STORAGE_PREFIX = "share:";

  // In-memory store (requested). We also mirror to localStorage so the link works
  // even if the tab is refreshed or opened in a new tab.
  const memoryStore = new Map();

  const textInput = document.getElementById("textInput");
  const getLinkBtn = document.getElementById("getLinkBtn");
  const errorEl = document.getElementById("error");
  const linkArea = document.getElementById("linkArea");
  const shareLinkEl = document.getElementById("shareLink");

  const composeView = document.getElementById("composeView");
  const sharedView = document.getElementById("sharedView");
  const sharedTextEl = document.getElementById("sharedText");
  const countdownEl = document.getElementById("countdown");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function createShareId() {
    // Prefer UUIDs when available.
    if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }

    if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    // Very old fallback.
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  function storageKey(id) {
    return `${STORAGE_PREFIX}${id}`;
  }

  function safeJsonParse(str) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function deleteShare(id) {
    memoryStore.delete(id);
    try {
      localStorage.removeItem(storageKey(id));
    } catch {
      // Ignore storage failures.
    }
  }

  function saveShare(id, text) {
    const expiresAt = Date.now() + SHARE_TTL_MS;
    const record = { text, expiresAt };

    memoryStore.set(id, record);

    // Mirror to localStorage for practical "share link" behavior.
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(record));
    } catch {
      // Ignore storage failures.
    }

    // Cleanup after 5 minutes.
    window.setTimeout(() => deleteShare(id), SHARE_TTL_MS + 150);
  }

  function loadShare(id) {
    const now = Date.now();

    const memRecord = memoryStore.get(id);
    if (memRecord) {
      if (now > memRecord.expiresAt) {
        deleteShare(id);
        return null;
      }
      return memRecord;
    }

    // If not in memory (page refresh / new tab), try localStorage.
    let record = null;
    try {
      record = safeJsonParse(localStorage.getItem(storageKey(id)));
    } catch {
      record = null;
    }

    if (!record || typeof record.expiresAt !== "number" || typeof record.text !== "string") {
      return null;
    }

    if (now > record.expiresAt) {
      deleteShare(id);
      return null;
    }

    // Restore into memory for fast subsequent reads.
    memoryStore.set(id, record);
    return record;
  }

  function formatRemaining(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  function setCountdown(expiresAt) {
    const tick = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        countdownEl.textContent = "";
        sharedView.hidden = true;
        composeView.hidden = false;
        showError("This share link has expired.");
        return;
      }
      countdownEl.textContent = `Expires in ${formatRemaining(remaining)}`;
    };

    tick();
    window.setInterval(tick, 1000);
  }

  function cleanupExpiredFromStorage() {
    const now = Date.now();
    let length = 0;
    try {
      length = localStorage.length;
    } catch {
      return;
    }

    // Iterate backwards in case we remove items while looping.
    for (let i = length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue;

      const id = k.slice(STORAGE_PREFIX.length);
      const record = safeJsonParse(localStorage.getItem(k));
      if (!record || typeof record.expiresAt !== "number") {
        try {
          localStorage.removeItem(k);
        } catch {}
        continue;
      }

      if (now > record.expiresAt) {
        deleteShare(id);
      }
    }
  }

  function buildShareUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    return url.toString();
  }

  // Button handler: store text for 5 minutes and output a unique link.
  getLinkBtn.addEventListener("click", () => {
    clearError();
    const text = (textInput.value || "").trim();

    if (!text) {
      showError("Please enter some text to share.");
      return;
    }

    const id = createShareId();
    saveShare(id, text);

    const shareUrl = buildShareUrl(id);
    shareLinkEl.href = shareUrl;
    shareLinkEl.textContent = shareUrl;
    linkArea.hidden = false;
  });

  // If opened via a share link, display the stored text.
  (function initFromUrl() {
    cleanupExpiredFromStorage();

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) return;

    const record = loadShare(id);
    if (!record) {
      showError("This share link is invalid or has expired.");
      return;
    }

    composeView.hidden = true;
    sharedView.hidden = false;
    sharedTextEl.textContent = record.text;
    setCountdown(record.expiresAt);
  })();
})();

