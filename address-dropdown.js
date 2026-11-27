/* Searchable nationwide address picker. PSA PSGC, Q3 2026.
   Geography is bundled locally; no third-party address lookups. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const dropdowns = $("addressDropdowns");
  const manualPanel = $("manualAddressPanel");
  const manual = $("manualAddress");
  const toggle = $("addressModeToggle");
  const status = $("addressDataStatus");
  const picker = $("locationPicker");
  const trigger = $("locationTrigger");
  const summary = $("locationSummary");
  const panel = $("locationPanel");
  const search = $("locationSearch");
  const list = $("locationList");
  const regionText = $("locationRegion");
  const street = $("addressStreet");
  const steps = [$("locationProvinceStep"), $("locationCityStep"), $("locationBarangayStep")];
  const stepNames = ["province or area", "city or municipality", "barangay"];
  const cache = new Map();
  let areas = [];
  let selectedArea = null;
  let selectedCity = null;
  let selectedBarangay = null;
  let cities = [];
  let phase = 0;
  let manualMode = true;
  let loading = false;
  let generation = 0;
  const clean = text => String(text || "").trim().replace(/\s+/g, " ");
  const searchKey = text => clean(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const barangayLabel = b => b[1] + (b[2] ? " — " + b[2] : "");
  const cityLabel = c => c.name.replace(/^City of (.+)$/i, "$1 City");
  const isComplete = () => !!(selectedArea && selectedCity && selectedBarangay && !loading);

  function updateSummary() {
    const parts = [];
    if (selectedArea && selectedArea.kind !== "independent_city") parts.push(selectedArea.name);
    if (selectedCity) parts.push(cityLabel(selectedCity));
    else if (selectedArea?.kind === "independent_city") parts.push(selectedArea.name);
    if (selectedBarangay) parts.push(barangayLabel(selectedBarangay));
    summary.textContent = [...parts, ...(!isComplete() && parts.length ? ["Select " + stepNames[!selectedCity ? 1 : 2]] : [])].join(" / ") || "Select delivery location";
    trigger.dataset.empty = String(!parts.length);
    regionText.hidden = !selectedArea;
    regionText.textContent = selectedArea ? "Region: " + selectedArea.region.name : "";
    steps.forEach((step, i) => {
      step.setAttribute("aria-pressed", String(i === phase));
      step.disabled = (i === 1 && !selectedArea) || (i === 2 && !selectedCity);
    });
  }
  function setMode(useManual) {
    manualMode = useManual;
    dropdowns.hidden = useManual;
    manualPanel.hidden = !useManual;
    toggle.textContent = useManual ? "Use address dropdown" : "Enter address manually";
    trigger.disabled = useManual || !areas.length;
    street.disabled = useManual;
    street.required = !useManual;
    manual.disabled = !useManual;
    manual.required = useManual;
    if (useManual) closePicker(false);
  }
  async function readJSON(path) {
    const response = await fetch("assets/address-data/" + path);
    if (!response.ok) throw new Error("Location list unavailable");
    return response.json();
  }
  async function loadData(code) {
    if (!cache.has(code)) {
      const data = await readJSON("areas/" + code + ".json");
      if (data.code !== code || !Array.isArray(data.cities)) throw new Error("Invalid location list");
      cache.set(code, data.cities);
    }
    return cache.get(code);
  }
  function choices() {
    if (phase === 0) return areas.map(a => ({value:a, label:a.name, note:a.kind === "independent_city" ? "Independent city" : "", keywords:a.region.name, selected:selectedArea?.code === a.code}));
    if (phase === 1) return cities.map(c => ({value:c, label:cityLabel(c), keywords:c.name, selected:selectedCity?.code === c.code}));
    return (selectedCity?.barangays || []).map(b => ({value:b, label:barangayLabel(b), selected:selectedBarangay?.[0] === b[0]}));
  }
  function message(text, retry) {
    const el = document.createElement(retry ? "button" : "p");
    el.className = retry ? "location-option" : "location-message";
    el.textContent = text;
    if (retry) { el.type = "button"; el.addEventListener("click", retry); }
    list.append(el);
  }
  function render() {
    updateSummary();
    const label = stepNames[phase];
    search.placeholder = "Search " + label + "…";
    search.setAttribute("aria-label", "Search " + label);
    list.setAttribute("aria-label", "Available " + label + " options");
    list.replaceChildren();
    if (phase !== 0 && loading) { message("Loading locations…"); return; }
    if (phase === 1 && selectedArea && !cities.length) {
      message("Couldn't load locations. Tap to retry.", () => chooseArea(selectedArea));
      return;
    }
    const tokens = searchKey(search.value).split(" ").filter(Boolean);
    const records = choices().filter(item => tokens.every(token => searchKey(item.label + " " + (item.keywords || "") + " " + (item.note || "")).includes(token)))
      .sort((a,b) => a.label.localeCompare(b.label, "en-PH", {numeric:true}));
    if (!records.length) { message("No matching locations. Try another spelling."); return; }
    const fragment = document.createDocumentFragment();
    for (const item of records) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "location-option";
      button.dataset.locationOption = "true";
      button.dataset.code = String(item.value.code || item.value[0]);
      button.setAttribute("aria-current", String(item.selected));
      const title = document.createElement("span");
      title.textContent = item.label;
      button.append(title);
      if (item.note) {
        const note = document.createElement("small");
        note.textContent = item.note;
        button.append(note);
      }
      button.addEventListener("click", () => {
        if (phase === 0) return chooseArea(item.value);
        if (phase === 1) return chooseCity(item.value);
        return chooseBarangay(item.value);
      });
      fragment.append(button);
    }
    list.append(fragment);
  }
  function showPhase(next, focus = false) {
    phase = next;
    search.value = "";
    render();
    list.scrollTop = 0;
    if (focus && !panel.hidden) search.focus({preventScroll:true});
  }
  function openPicker() {
    if (manualMode || !areas.length) return;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    showPhase(isComplete() ? 0 : selectedCity ? 2 : selectedArea ? 1 : 0, true);
    status.textContent = "";
  }
  function closePicker(focus = false) {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus();
  }
  async function chooseArea(area) {
    const epoch = ++generation;
    selectedArea = area;
    selectedCity = null;
    selectedBarangay = null;
    cities = [];
    loading = true;
    status.textContent = "";
    showPhase(1, true);
    try {
      if (area.kind === "metro") {
        const chunks = await Promise.all(area.region.independent.map(c => loadData(c.code)));
        if (generation !== epoch) return;
        cities = chunks.flat();
      } else {
        const data = await loadData(area.code);
        if (generation !== epoch) return;
        cities = data;
      }
      loading = false;
      // Outside Metro Manila, independent cities are first-level delivery areas.
      if (phase === 1 && area.kind === "independent_city" && cities.length === 1) {
        chooseCity(cities[0]);
      } else render();
    } catch {
      if (generation !== epoch) return;
      loading = false;
      render();
      status.textContent = "Location list unavailable. Retry or enter your address manually.";
    }
  }
  function chooseCity(city) {
    selectedCity = city;
    selectedBarangay = null;
    status.textContent = "";
    showPhase(2, true);
  }
  function chooseBarangay(barangay) {
    selectedBarangay = barangay;
    status.textContent = "";
    updateSummary();
    closePicker(true);
  }
  function getAddress() {
    if (manualMode) {
      const result = clean(manual.value);
      if (!result) { manual.reportValidity(); return null; }
      return result;
    }
    if (!isComplete()) {
      openPicker();
      status.textContent = loading ? "Please wait for the locations to load." : "Choose your province, city or municipality, and barangay.";
      return null;
    }
    if (!clean(street.value)) { street.reportValidity(); street.focus(); return null; }
    const bName = selectedBarangay[1];
    const bPart = /^barangay\b/i.test(bName) ? bName : "Barangay " + bName;
    return [
      clean(street.value), bPart, selectedBarangay[2] || "", selectedCity.name,
      selectedArea.kind === "province" ? selectedArea.name : "", selectedArea.region.name
    ].filter(Boolean).join(", ");
  }
  trigger.addEventListener("click", () => panel.hidden ? openPicker() : closePicker());
  steps.forEach((step,i) => step.addEventListener("click", () => {
    if (!step.disabled) showPhase(i, true);
  }));
  search.addEventListener("input", () => { render(); list.scrollTop = 0; });
  search.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const first = list.querySelector("[data-location-option]");
      if (first) e.key === "Enter" ? first.click() : first.focus();
    }
  });
  list.addEventListener("keydown", e => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const options = [...list.querySelectorAll("[data-location-option]")];
    const i = options.indexOf(document.activeElement);
    if (e.key === "ArrowUp" && i <= 0) search.focus();
    else options[Math.max(0, Math.min(options.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  });
  picker.addEventListener("keydown", e => {
    if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); closePicker(true); }
  });
  document.addEventListener("click", e => { if (!panel.hidden && !e.composedPath().includes(picker)) closePicker(); });
  toggle.addEventListener("click", () => {
    if (!areas.length) return;
    setMode(!manualMode);
    status.textContent = "";
    (manualMode ? manual : trigger).focus();
  });
  window.checkoutAddress = {getAddress};
  (async () => {
    try {
      const data = await readJSON("index.json");
      if (!Array.isArray(data.regions) || !data.regions.length) throw new Error("No regions");
      areas = data.regions.flatMap(region => region.provinces.length ? [
        ...region.provinces.map(p => ({...p, kind:"province", region})),
        ...region.independent.map(c => ({...c, name:cityLabel(c), kind:"independent_city", region}))
      ] : [{code:region.code, name:"Metro Manila (NCR)", kind:"metro", region}]);
      updateSummary();
      toggle.hidden = false;
      setMode(Boolean(clean(manual.value)));
      status.textContent = "";
    } catch {
      setMode(true);
      status.textContent = "Address lists unavailable. You can still type your complete address.";
    }
  })();
})();
