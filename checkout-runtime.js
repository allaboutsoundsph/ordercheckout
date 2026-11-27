/* Shared checkout contract: preview and live use the same validation,
   while all real network activity is isolated to explicit live mode. */
(() => {
  "use strict";
  const config = window.CHECKOUT_CONFIG;
  if (!config) throw new Error("Checkout configuration unavailable");
  const isLive = config.mode === "live";
  document.documentElement.dataset.checkoutMode = isLive ? "live" : "preview";
  if (isLive) document.title = "500GB External HDD — All About Sounds PH";
  const product = Object.freeze({
    content_ids: Object.freeze([config.productId]),
    content_type: "product",
    value: config.price,
    currency: config.currency
  });

  function trackFB(event, data = {}) {
    if (!isLive || typeof window.fbq !== "function") return;
    // Tracking failures must never interfere with a successfully saved order.
    try {
      const payload = {...data};
      if (Array.isArray(payload.content_ids)) payload.content_ids = [...payload.content_ids];
      window.fbq("track", event, payload);
    } catch {}
  }

  function initializePixel() {
    if (!isLive) return;
    try {
      if (!window.fbq) {
        const n = window.fbq = function() {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!window._fbq) window._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(script);
      }
      window.fbq("init", config.pixelId);
      trackFB("PageView");
      trackFB("ViewContent", product);
    } catch {}
  }

  async function submitOrder(fields) {
    if (!isLive) {
      await new Promise(resolve => setTimeout(resolve, 350));
      return {success: true};
    }
    const body = new URLSearchParams();
    for (const name of ["name", "phone", "address", "landmark"]) {
      body.append(name, String(fields[name] || ""));
    }
    const response = await fetch(config.sheetURL, {method: "POST", body});
    if (!response.ok) throw new Error("Order submission failed");
    const result = await response.json();
    if (!result || result.success !== true) throw new Error("Order not saved");
    return result;
  }

  function handoff(message) {
    if (isLive) {
      window.location.href = "https://m.me/" + encodeURIComponent(config.messengerPage) +
        "?text=" + encodeURIComponent(message);
    } else {
      try { sessionStorage.setItem("checkout-demo-message", message); } catch {}
      window.location.href = "messenger-preview.html";
    }
  }
  window.trackFB = trackFB;
  window.checkoutRuntime = Object.freeze({isLive, product, submitOrder, handoff});
  initializePixel();
})();
