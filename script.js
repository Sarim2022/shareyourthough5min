(() => {
  const SHARE_TTL_MS = 5 * 60 * 1000;
  const SHARE_PARAM = "id";
  const DEFAULT_REPLY_TEXT = "Replying to this message...";

  const nameInput = document.getElementById("nameInput");
  const textInput = document.getElementById("textInput");
  const getLinkBtn = document.getElementById("getLinkBtn");
  const copyBtn = document.getElementById("copyBtn");
  const whatsAppBtn = document.getElementById("whatsAppBtn");
  const replyBtn = document.getElementById("replyBtn");
  const errorEl = document.getElementById("error");
  const linkArea = document.getElementById("linkArea");
  const shareLinkEl = document.getElementById("shareLink");

  const composeView = document.getElementById("composeView");
  const sharedView = document.getElementById("sharedView");
  const sharedTextEl = document.getElementById("sharedText");
  const senderMetaEl = document.getElementById("senderMeta");
  const countdownEl = document.getElementById("countdown");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function base64UrlEncode(bytes) {
    // Convert bytes -> base64 string, then make it URL-safe.
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecodeToBytes(base64Url) {
    const padded = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function utf8ToBytes(str) {
    // Prefer TextEncoder, fallback for older browsers.
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str);
    }

    const utf8 = unescape(encodeURIComponent(str));
    const bytes = new Uint8Array(utf8.length);
    for (let i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i);
    return bytes;
  }

  function bytesToUtf8(bytes) {
    // Prefer TextDecoder, fallback for older browsers.
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(bytes);
    }

    let ascii = "";
    for (let i = 0; i < bytes.length; i++) ascii += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(ascii));
  }

  function encodeSharePayload(text, expiresAt) {
    // Self-contained payload so other devices can decode it without a backend.
    const payload = JSON.stringify({ text, expiresAt, sender: getSenderName() });
    const bytes = utf8ToBytes(payload);
    return base64UrlEncode(bytes);
  }

  function decodeSharePayload(encoded) {
    try {
      const bytes = base64UrlDecodeToBytes(encoded);
      const payloadStr = bytesToUtf8(bytes);
      const parsed = JSON.parse(payloadStr);
      if (!parsed || typeof parsed.expiresAt !== "number" || typeof parsed.text !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function randomNickname() {
    const adjectives = ["Blue", "Swift", "Bright", "Calm", "Brave", "Sunny", "Lucky", "Quiet"];
    const animals = ["Fox", "Tiger", "Owl", "Panda", "Wolf", "Falcon", "Dolphin", "Koala"];
    const a = adjectives[Math.floor(Math.random() * adjectives.length)];
    const b = animals[Math.floor(Math.random() * animals.length)];
    const n = Math.floor(100 + Math.random() * 900);
    return `${a}${b}${n}`;
  }

  function getSenderName() {
    const explicit = (nameInput.value || "").trim();
    if (explicit) return explicit;
    return randomNickname();
  }

  function showComposeView() {
    sharedView.hidden = true;
    composeView.hidden = false;
    linkArea.hidden = true;
    copyBtn.hidden = true;
    whatsAppBtn.hidden = true;
    countdownEl.textContent = "";
  }

  function buildWhatsAppUrl(shareUrl) {
    return `https://wa.me/?text=${encodeURIComponent(`Check this message: ${shareUrl}`)}`;
  }

  async function copyTextToClipboard(value) {
    if (!value) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}

    try {
      const temp = document.createElement("textarea");
      temp.value = value;
      temp.setAttribute("readonly", "");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(temp);
      return !!ok;
    } catch {
      return false;
    }
  }

  function formatRemaining(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  function setCountdown(expiresAt) {
    let intervalId = null;
    const tick = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        countdownEl.textContent = "";
        sharedView.hidden = true;
        composeView.hidden = false;
        showError("This share link has expired.");
        if (intervalId != null) window.clearInterval(intervalId);
        return;
      }
      countdownEl.textContent = `Expires in ${formatRemaining(remaining)}`;
    };

    tick();
    intervalId = window.setInterval(tick, 1000);
  }

  function buildShareUrl(encodedPayload) {
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_PARAM, encodedPayload);
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

    const expiresAt = Date.now() + SHARE_TTL_MS;
    const encodedPayload = encodeSharePayload(text, expiresAt);
    const shareUrl = buildShareUrl(encodedPayload);
    shareLinkEl.href = shareUrl;
    shareLinkEl.textContent = shareUrl;
    linkArea.hidden = false;
    copyBtn.hidden = false;
    whatsAppBtn.hidden = false;
    whatsAppBtn.href = buildWhatsAppUrl(shareUrl);
  });

  copyBtn.addEventListener("click", async () => {
    clearError();
    const value = shareLinkEl.textContent || shareLinkEl.href || "";
    const ok = await copyTextToClipboard(value);
    if (!ok) {
      showError("Could not copy the link. Please copy it manually.");
      return;
    }
    copyBtn.textContent = "Copied!";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy link";
    }, 1200);
  });

  replyBtn.addEventListener("click", () => {
    clearError();
    showComposeView();
    textInput.value = DEFAULT_REPLY_TEXT;
    textInput.focus();
  });

  // If opened via a share link, display the stored text.
  (function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const encodedPayload = params.get(SHARE_PARAM);
    if (!encodedPayload) return;

    const record = decodeSharePayload(encodedPayload);
    if (!record) {
      showError("This share link is invalid or has expired.");
      return;
    }

    if (Date.now() > record.expiresAt) {
      showError("This share link is invalid or has expired.");
      return;
    }

    composeView.hidden = true;
    sharedView.hidden = false;
    sharedTextEl.textContent = record.text;
    if (record.sender && typeof record.sender === "string") {
      senderMetaEl.textContent = `Sent by: ${record.sender}`;
      senderMetaEl.hidden = false;
    } else {
      senderMetaEl.textContent = "";
      senderMetaEl.hidden = true;
    }
    setCountdown(record.expiresAt);
  })();
})();

