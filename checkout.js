"use strict";

const PRODUCT = {
  content_ids: ["500GB-HDD-DJ"],
  content_type: "product",
  value: 1500,
  currency: "PHP",
};

// Preserve the store's existing Meta Pixel without putting customer details
// into tracking event payloads. The checkout also works if it is blocked.
(function initPixel() {
  if (!window.fbq) {
    const fbq = window.fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.append(script);
  }
  window.fbq("init", "631653776133164");
  track("PageView");
  track("ViewContent", PRODUCT);
})();

function track(event, data = {}) {
  try { window.fbq?.("track", event, data); } catch { /* Tracking must not block orders. */ }
}

document.querySelectorAll("[data-contact]").forEach(link => {
  link.addEventListener("click", () => track("Contact"));
});

const form = document.getElementById("orderForm");
const phone = form.elements.namedItem("phone");
const submitButton = document.getElementById("submitOrder");
const orderStatus = document.getElementById("orderStatus");
const confirmation = document.getElementById("confirmation");
const orderMessage = document.getElementById("orderMessage");
let submitting = false;
let accepted = false;

function normalizePhone(value) {
  const number = value.trim().replace(/[\s-]/g, "");
  if (/^09\d{9}$/.test(number)) return "+63" + number.slice(1);
  if (/^\+639\d{9}$/.test(number)) return number;
  return null;
}

function validatePhone() {
  const valid = !phone.value.trim() || Boolean(normalizePhone(phone.value));
  phone.setCustomValidity(valid ? "" : "Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).");
  if (valid) phone.removeAttribute("aria-invalid");
  else phone.setAttribute("aria-invalid", "true");
}

phone.addEventListener("input", validatePhone);
phone.addEventListener("blur", validatePhone);
form.addEventListener("focusin", () => track("InitiateCheckout"), { once: true });
form.addEventListener("input", event => {
  if (event.target !== phone && event.target.name !== "website") {
    event.target.setCustomValidity("");
    event.target.removeAttribute("aria-invalid");
  }
});

function setStatus(message, kind = "") {
  orderStatus.textContent = message;
  orderStatus.dataset.kind = kind;
}

// Apps Script deployments may return text or JSON. Check HTTP status and
// recognized explicit failure messages; an unknown success schema is not
// proof that a row was actually written to Sheets.
async function checkResponse(response) {
  if (!response.ok) throw new Error("Order endpoint returned an HTTP error");
  const body = (await response.text()).trim();
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html") || /^<!doctype html|^<html\b/i.test(body)) {
    throw new Error("Unexpected HTML response");
  }
  let data;
  if (body.startsWith("{") || contentType.includes("application/json")) {
    try { data = JSON.parse(body); } catch { throw new Error("Malformed response"); }
  }
  if (data && (data.success === false || data.ok === false || data.error ||
      /^(error|failed|failure|false)$/i.test(String(data.status)))) {
    throw new Error("Order endpoint reported a failure");
  }
  if (/^(error\b|failed\b|failure\b|false$)/i.test(body)) throw new Error("Order endpoint reported a failure");
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (submitting || accepted || form.elements.namedItem("website").value) return;
  validatePhone();
  const details = {};
  for (const key of ["name", "address", "landmark"]) {
    const field = form.elements.namedItem(key);
    details[key] = field.value.trim();
    if (!details[key]) {
      field.setCustomValidity("Please enter this information.");
      field.setAttribute("aria-invalid", "true");
    }
  }
  if (!form.reportValidity()) return;
  details.phone = normalizePhone(phone.value);
  if (!details.phone) return;

  submitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting order…";
  form.setAttribute("aria-busy", "true");
  setStatus("Sending your order. Please wait.");
  track("AddToCart", PRODUCT);

  const body = new FormData();
  for (const key of ["name", "phone", "address", "landmark"]) body.append(key, details[key]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(form.action, { method: "POST", body, signal: controller.signal });
    await checkResponse(response);
    accepted = true;
  } catch {
    setStatus("We could not confirm whether your order was received. Please contact us on Messenger before submitting again. Your details are still here.", "error");
  } finally {
    clearTimeout(timeout);
    submitting = false;
    form.removeAttribute("aria-busy");
    submitButton.disabled = accepted;
    submitButton.textContent = accepted ? "Order submitted" : "Place order · ₱1,500 COD";
  }

  if (!accepted) return;
  track("Purchase", PRODUCT);
  setStatus("Order submitted. Confirm your delivery details on Messenger.", "success");
  orderMessage.value = [
    "Hello! Confirm order:", "",
    "Name: " + details.name,
    "Phone: " + details.phone,
    "Address: " + details.address,
    "Landmark: " + details.landmark, "",
    "Product: 500GB HDD",
    "Price: ₱1,500 COD",
  ].join("\n");

  if (typeof confirmation.showModal === "function") confirmation.showModal();
  else confirmation.setAttribute("open", "");
  // Avoid a second submission even if the confirmation dialog is dismissed.
  document.getElementById("closeConfirmation").focus();
});

document.getElementById("closeConfirmation").addEventListener("click", () => {
  if (typeof confirmation.close === "function") confirmation.close();
  else confirmation.removeAttribute("open");
});
document.getElementById("copyOrder").addEventListener("click", async () => {
  const copyStatus = document.getElementById("copyStatus");
  try {
    await navigator.clipboard.writeText(orderMessage.value);
    copyStatus.textContent = "Copied. Paste your message in Messenger.";
  } catch {
    orderMessage.focus();
    orderMessage.select();
    copyStatus.textContent = "Select and copy the message manually, then paste it in Messenger.";
  }
});
submitButton.disabled = false;

// Load only the review that the visitor has asked to see.
const reviewImage = document.getElementById("reviewImage");
const reviewCount = document.getElementById("reviewCount");
const reviewError = document.getElementById("reviewError");
let reviewIndex = 1;
function showReview(index) {
  reviewIndex = (index + 10) % 11 + 1;
  reviewError.hidden = true;
  reviewImage.alt = "Customer review screenshot " + reviewIndex + " of 11";
  reviewCount.textContent = reviewIndex + " of 11";
  reviewImage.src = "review" + reviewIndex + ".png";
}
reviewImage.addEventListener("error", () => { reviewError.hidden = false; });
document.getElementById("loadReviews").addEventListener("click", event => {
  document.getElementById("reviews").hidden = false;
  event.currentTarget.hidden = true;
  showReview(1);
  document.getElementById("nextReview").focus();
});
document.getElementById("previousReview").addEventListener("click", () => showReview(reviewIndex - 1));
document.getElementById("nextReview").addEventListener("click", () => showReview(reviewIndex + 1));
