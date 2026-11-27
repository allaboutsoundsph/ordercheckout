/* Checkout UI safeguards. No new tracking or customer data storage. */
(() => {
  "use strict";
  const form = document.getElementById("orderForm");
  const btn = form.querySelector('button[type="submit"]');
  const phoneInput = form.querySelector('input[name="phone"]');
  const modal = document.getElementById("thankYouModal");
  const messenger = document.getElementById("manualMessenger");
  const messengerOnly = document.getElementById("openMessengerOnly");
  const closeConfirmation = document.getElementById("closeConfirmation");
  const details = document.getElementById("confirmationDetails");
  const copyStatus = document.getElementById("confirmationCopyStatus");
  const status = document.getElementById("orderAttemptStatus");
  const statusText = document.getElementById("orderAttemptText");
  const reset = document.getElementById("resetOrderAttempt");
  const sticky = document.getElementById("stickyOrder");
  const checkout = document.getElementById("order-information");
  const heroOrder = document.querySelector(".product-card .order-now-btn");
  const runtime = window.checkoutRuntime;
  const key = "aas-checkout-attempt-v1-" + (runtime.isLive ? "live" : "preview");
  let state = "";
  let busy = false;
  let ready = false;
  let handoffTimer;
  let confirmationMessage = "";
  let revision = 0;
  let handedOff = false;

  try { state = sessionStorage.getItem(key) || ""; } catch {}
  if (!["pending", "uncertain", "saved"].includes(state)) state = "";
  function setState(next) {
    state = next;
    try {
      if (next) sessionStorage.setItem(key, next);
      else sessionStorage.removeItem(key);
    } catch {}
  }
  function normalizePhone(value) {
    const compact = String(value).trim().replace(/[\s()-]/g, "");
    if (/^09\d{9}$/.test(compact)) return "+63" + compact.slice(1);
    if (/^639\d{9}$/.test(compact)) return "+" + compact;
    if (/^\+639\d{9}$/.test(compact)) return compact;
    return "";
  }
  function renderState() {
    btn.disabled = !ready || busy || !!state;
    btn.classList.toggle("loading", busy);
    btn.textContent = busy ? "Processing..." : state === "saved" ? "ORDER SAVED" : state ? "ORDER STATUS UNCONFIRMED" : "PLACE ORDER";
    status.hidden = busy || !state;
    if (!status.hidden) {
      statusText.textContent = state === "saved"
        ? "Your previous order was saved. Only start another order if you want to order again."
        : "We could not confirm your previous order. Please check with us on Messenger before ordering again to avoid duplicate orders.";
      reset.textContent = state === "saved" ? "Start a new order" : "I checked — retry order";
    }
  }
  phoneInput.addEventListener("input", () => phoneInput.setCustomValidity(""));
  phoneInput.addEventListener("blur", () => {
    const normalized = normalizePhone(phoneInput.value);
    if (normalized) phoneInput.value = normalized;
    phoneInput.setCustomValidity("");
  });
  function validatePhone() {
    const normalized = normalizePhone(phoneInput.value);
    phoneInput.setCustomValidity(normalized ? "" : "Enter a valid Philippine mobile number, such as 09123456789.");
    if (!normalized) phoneInput.reportValidity();
    else phoneInput.value = normalized;
    return normalized;
  }
  function begin() {
    if (busy || state || btn.disabled) return false;
    busy = true;
    setState("pending");
    renderState();
    return true;
  }
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }
  function updateSticky() {
    const show = window.innerWidth < 768 && !isVisible(checkout) &&
      !isVisible(heroOrder) && modal.style.display !== "flex";
    sticky.hidden = !show;
    document.body.classList.toggle("has-sticky-order", show);
  }
  function openMessenger() {
    if (!confirmationMessage || handedOff) return;
    clearTimeout(handoffTimer);
    revision++;
    handedOff = true;
    try {
      runtime.handoff(confirmationMessage);
    } catch {
      handedOff = false;
      copyStatus.textContent = "Messenger could not open. Please try the button again.";
    }
  }
  async function copyDetails(allowSelectionFallback) {
    if (!confirmationMessage) return false;
    // Clipboard access varies with browser and user activation. Never claim
    // success or leave the page automatically if the copy was not confirmed.
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(confirmationMessage);
        return true;
      }
    } catch {}
    if (!allowSelectionFallback) return false;
    details.focus();
    details.select();
    details.setSelectionRange(0, details.value.length);
    try { return document.execCommand("copy") === true; } catch { return false; }
  }
  async function copyAndOpen() {
    if (!confirmationMessage || handedOff) return;
    clearTimeout(handoffTimer);
    const ticket = ++revision;
    copyStatus.textContent = "Copying your order details…";
    messenger.disabled = true;
    const copied = await copyDetails(true);
    if (ticket !== revision) return;
    messenger.disabled = false;
    if (copied) {
      copyStatus.textContent = "Copied! In Messenger, paste your message if needed, then tap Send.";
      openMessenger();
    } else {
      copyStatus.textContent = "Automatic copy was blocked. Your message is selected above. Press and hold to Copy (or Ctrl+C), then tap Open Messenger.";
      details.focus();
    }
  }
  function closeSavedDialog() {
    ++revision;
    clearTimeout(handoffTimer);
    confirmationMessage = "";
    details.value = "";
    modal.style.display = "none";
    messenger.disabled = false;
    updateSticky();
    reset.focus();
  }
  function saved(message) {
    busy = false;
    setState("saved");
    renderState();
    confirmationMessage = message;
    details.value = message;
    handedOff = false;
    messenger.disabled = false;
    modal.style.display = "flex";
    copyStatus.textContent = "Tap Copy Details & Open Messenger to copy your saved order.";
    updateSticky();
    messenger.focus({preventScroll: true});
    // If the submit click is still active after saving, copy and continue
    // automatically. Otherwise retain the message and explicit copy action.
    const ticket = ++revision;
    if (typeof navigator !== "undefined" && navigator.userActivation?.isActive !== false && navigator.clipboard?.writeText) {
      copyDetails(false).then(copied => {
        if (ticket !== revision || !confirmationMessage) return;
        if (!copied) return;
        copyStatus.textContent = "Copied! Opening Messenger. If the chat box is empty, paste your message and tap Send.";
        handoffTimer = setTimeout(openMessenger, 2000);
      });
    }
  }
  function uncertain() {
    busy = false;
    setState("uncertain");
    renderState();
    status.focus({preventScroll: false});
  }
  messenger.addEventListener("click", copyAndOpen);
  messengerOnly.addEventListener("click", openMessenger);
  closeConfirmation.addEventListener("click", closeSavedDialog);
  reset.addEventListener("click", () => {
    if (busy) return;
    if (state !== "saved" && !window.confirm("Have you confirmed with All About Sounds PH that your previous order was not saved? Only retry if it was not saved.")) return;
    setState("");
    renderState();
    btn.focus();
  });
  window.addEventListener("scroll", updateSticky, {passive: true});
  window.addEventListener("resize", updateSticky, {passive: true});
  window.addEventListener("pagehide", () => { ++revision; clearTimeout(handoffTimer); });
  window.addEventListener("pageshow", event => {
    if (event.persisted && state === "saved" && confirmationMessage) {
      handedOff = false;
      messenger.disabled = false;
      modal.style.display = "flex";
      copyStatus.textContent = "Your order is saved. You can copy the message again or reopen Messenger without placing another order.";
    }
    renderState();
    updateSticky();
  });
  window.checkoutUX = Object.freeze({normalizePhone, validatePhone, begin, saved, uncertain, activate() { ready = true; renderState(); }});
  renderState();
  updateSticky();
})();
