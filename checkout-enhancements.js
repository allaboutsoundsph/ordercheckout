/* Checkout UI safeguards. No new tracking or customer data storage. */
(() => {
  "use strict";
  const form = document.getElementById("orderForm");
  const btn = form.querySelector('button[type="submit"]');
  const phoneInput = form.querySelector('input[name="phone"]');
  const modal = document.getElementById("thankYouModal");
  const messenger = document.getElementById("manualMessenger");
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
    if (!confirmationMessage) return;
    clearTimeout(handoffTimer);
    runtime.handoff(confirmationMessage);
  }
  function saved(message) {
    busy = false;
    setState("saved");
    renderState();
    confirmationMessage = message;
    modal.style.display = "flex";
    updateSticky();
    messenger.focus({preventScroll: true});
    handoffTimer = setTimeout(openMessenger, 2000);
  }
  function uncertain() {
    busy = false;
    setState("uncertain");
    renderState();
    status.focus({preventScroll: false});
  }
  messenger.addEventListener("click", openMessenger);
  reset.addEventListener("click", () => {
    if (busy) return;
    if (state !== "saved" && !window.confirm("Have you confirmed with All About Sounds PH that your previous order was not saved? Only retry if it was not saved.")) return;
    setState("");
    renderState();
    btn.focus();
  });
  window.addEventListener("scroll", updateSticky, {passive: true});
  window.addEventListener("resize", updateSticky, {passive: true});
  window.addEventListener("pagehide", () => clearTimeout(handoffTimer));
  window.addEventListener("pageshow", event => {
    if (event.persisted && state === "saved") {
      modal.style.display = "none";
      confirmationMessage = "";
    }
    renderState();
    updateSticky();
  });
  window.checkoutUX = Object.freeze({normalizePhone, validatePhone, begin, saved, uncertain, activate() { ready = true; renderState(); }});
  renderState();
  updateSticky();
})();
