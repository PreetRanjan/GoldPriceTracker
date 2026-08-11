const API_URL =
  "https://api.lalithaajewellery.com/public/pricings/latest?state_id=fbe51d69-c3ef-466f-a8f4-7c382759e35f";
const proxyConfig = window.GOLDTRACKER_PROXY_URL;
const PROXY_URL = typeof proxyConfig === "string" ? proxyConfig.trim() : "";
const CACHE_KEY = "gold-tracker-pricing-cache-v1";
const CACHE_TTL = 5 * 60 * 1000;
const GST_RATE = 3;
const DEFAULT_MAKING_CHARGE = 3;

const app = document.querySelector("#app");
const dashboardTemplate = document.querySelector("#dashboard-template");
const errorTemplate = document.querySelector("#error-template");
let deferredInstallPrompt = null;

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const fullDateFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

initialize();

async function initialize() {
  registerServiceWorker();
  bindInstallEvents();
  bindRefreshDuringSkeleton();
  await loadRates();
}

async function loadRates(forceRefresh = false) {
  setBusyState(true);

  const cachedEntry = readCache();
  const hasFreshCache =
    cachedEntry && Date.now() - cachedEntry.cachedAt < CACHE_TTL;

  if (hasFreshCache && !forceRefresh) {
    renderDashboard(cachedEntry.payload, true);
    setBusyState(false);
    void refreshInBackground();
    return;
  }

  try {
    const payload = await requestRates();
    writeCache(payload);
    renderDashboard(payload, false);
  } catch (error) {
    if (cachedEntry) {
      renderDashboard(cachedEntry.payload, true, error.message);
    } else {
      renderError(error.message);
    }
  } finally {
    setBusyState(false);
  }
}

async function refreshInBackground() {
  try {
    const payload = await requestRates();
    writeCache(payload);
    renderDashboard(payload, false);
  } catch (error) {
    const currentButton = document.querySelector("#refresh-button");

    if (currentButton) {
      currentButton.title = error.message;
    }
  }
}

async function requestRates() {
  if (PROXY_URL) {
    try {
      const json = await fetchJson(PROXY_URL);
      return normalizePayload(json, "proxy");
    } catch (proxyError) {
      throw new Error(`Proxy fetch failed. ${proxyError.message}`);
    }
  }

  try {
    const json = await fetchJson(API_URL);
    return normalizePayload(json, "direct");
  } catch (directError) {
    throw new Error(`Direct fetch failed. ${directError.message}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return response.json();
}

function normalizePayload(json, source) {
  if (!json || json.status !== "success" || !json.data?.prices) {
    throw new Error("The pricing API returned an unexpected payload.");
  }

  const { data } = json;
  const { gold, silver, platinum } = data.prices;

  if (!gold || !silver || !platinum || !data.rate_updated_time) {
    throw new Error("Required pricing fields are missing in the API response.");
  }

  return {
    source,
    stateName: data.state_name || "Karnataka",
    rateUpdatedTime: data.rate_updated_time,
    metals: {
      gold: normalizeMetal(gold),
      silver: normalizeMetal(silver),
      platinum: normalizeMetal(platinum),
    },
  };
}

function normalizeMetal(metal) {
  return {
    label: metal.metal_type,
    price: Number(metal.price),
    updatedAt: metal.rate_datetime,
  };
}

function renderDashboard(payload, fromCache, warningMessage = "") {
  const fragment = dashboardTemplate.content.cloneNode(true);
  const goldPricePerGram = payload.metals.gold.price;
  const estimatedTwentyFourKPrice = goldPricePerGram * (24 / 22);

  setText(fragment, "statusLabel", buildStatusLabel(payload.source, fromCache));
  setText(fragment, "todayLabel", fullDateFormatter.format(new Date()));
  setText(fragment, "goldPrice", currencyFormatter.format(goldPricePerGram));
  setText(fragment, "updatedTime", formatDateTime(payload.rateUpdatedTime));
  setText(fragment, "stateName", payload.stateName);
  setText(
    fragment,
    "goldTwentyFourKPrice",
    currencyFormatter.format(estimatedTwentyFourKPrice),
  );
  setText(
    fragment,
    "goldTwentyFourKTenGramPrice",
    currencyFormatter.format(estimatedTwentyFourKPrice * 10),
  );
  setText(
    fragment,
    "goldTenGramPrice",
    currencyFormatter.format(goldPricePerGram * 10),
  );
  setText(
    fragment,
    "goldTwelveGramPrice",
    currencyFormatter.format(goldPricePerGram * 12),
  );
  setText(
    fragment,
    "silverPrice",
    currencyFormatter.format(payload.metals.silver.price),
  );
  setText(
    fragment,
    "platinumPrice",
    currencyFormatter.format(payload.metals.platinum.price),
  );
  setText(
    fragment,
    "cacheMessage",
    buildCacheMessage(payload.source, fromCache, warningMessage),
  );

  app.replaceChildren(fragment);

  const refreshButton = document.querySelector("#refresh-button");
  const installButton = document.querySelector("#install-button");

  refreshButton?.addEventListener("click", () => loadRates(true));
  installButton?.addEventListener("click", handleInstallClick);
  syncInstallButton(installButton);
  initCalculators(goldPricePerGram);
}

function renderError(message) {
  const fragment = errorTemplate.content.cloneNode(true);
  setText(
    fragment,
    "errorMessage",
    message || "The service could not be reached.",
  );
  app.replaceChildren(fragment);

  const retryButton = document.querySelector("#retry-button");
  retryButton?.addEventListener("click", () => loadRates(true));
}

function setText(root, bindingName, value) {
  const node = root.querySelector(`[data-bind="${bindingName}"]`);

  if (node) {
    node.textContent = value;
  }
}

function buildStatusLabel(source, fromCache) {
  if (fromCache && source === "proxy") {
    return "Cached proxy snapshot";
  }

  if (fromCache) {
    return "Showing cached snapshot";
  }

  if (source === "proxy") {
    return "Proxy market snapshot";
  }

  return "Live market snapshot";
}

function buildCacheMessage(source, fromCache, warningMessage) {
  if (fromCache && warningMessage) {
    return `Showing the latest cached rates. Live refresh failed: ${warningMessage}`;
  }

  if (fromCache) {
    return "Showing a cached snapshot while the latest rates refresh in the background.";
  }

  if (source === "proxy") {
    return "Live rates fetched successfully through the fallback proxy.";
  }

  return "Live rates fetched successfully from the public pricing API.";
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return timeFormatter.format(date);
}

function readCache() {
  try {
    const rawValue = localStorage.getItem(CACHE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);

    if (!parsed?.payload || !parsed?.cachedAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        payload,
      }),
    );
  } catch {
    /* Ignore storage failures to keep the app functional. */
  }
}

function setBusyState(isBusy) {
  const refreshButton = document.querySelector("#refresh-button");
  const retryButton = document.querySelector("#retry-button");

  [refreshButton, retryButton].forEach((button) => {
    if (!button) {
      return;
    }

    button.disabled = isBusy;
    button.textContent = isBusy
      ? "Refreshing..."
      : button.id === "retry-button"
        ? "Try again"
        : "Refresh rates";
  });
}

function bindRefreshDuringSkeleton() {
  app.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === "refresh-button" || target.id === "retry-button") {
      void loadRates(true);
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* Ignore service worker registration failures. */
    });
  });
}

function bindInstallEvents() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButton(document.querySelector("#install-button"));
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    syncInstallButton(document.querySelector("#install-button"));
  });
}

async function handleInstallClick() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  syncInstallButton(document.querySelector("#install-button"));
}

function syncInstallButton(button) {
  if (!button) {
    return;
  }

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const isIOSStandalone = window.navigator.standalone === true;
  const shouldHide = isStandalone || isIOSStandalone || !deferredInstallPrompt;

  button.classList.toggle("hidden", shouldHide);
}

function initCalculators(goldPricePerGram) {
  const modeButtons = Array.from(document.querySelectorAll("[data-calc-mode]"));
  const buyPane = document.querySelector("#calc-pane-buy");
  const budgetPane = document.querySelector("#calc-pane-budget");
  const gramButtons = Array.from(
    document.querySelectorAll("[data-grams-option]"),
  );
  const customGramsField = document.querySelector("#custom-grams-field");
  const customGramsInput = document.querySelector("#custom-grams-input");
  const budgetPriceInput = document.querySelector("#budget-price-input");
  const makingSlider = document.querySelector("#making-slider");
  const makingInput = document.querySelector("#making-input");
  const gramsOutput = document.querySelector("#grams-from-price-output");

  if (
    !modeButtons.length ||
    !buyPane ||
    !budgetPane ||
    !gramButtons.length ||
    !customGramsField ||
    !customGramsInput ||
    !budgetPriceInput ||
    !makingSlider ||
    !makingInput ||
    !gramsOutput ||
    !Number.isFinite(goldPricePerGram) ||
    goldPricePerGram <= 0
  ) {
    return;
  }

  const defaultBudget = Math.round(
    calculateBuyBreakdown(goldPricePerGram, 1, DEFAULT_MAKING_CHARGE)
      .finalPrice,
  );

  const state = {
    calcMode: "buy",
    gramsMode: "1",
    customGrams: 1,
    budgetPrice: defaultBudget,
    makingPercent: DEFAULT_MAKING_CHARGE,
  };

  budgetPriceInput.value = String(defaultBudget);
  makingInput.value = trimPercent(DEFAULT_MAKING_CHARGE);
  makingSlider.value = String(DEFAULT_MAKING_CHARGE);

  const setCalcMode = (mode) => {
    state.calcMode = mode === "budget" ? "budget" : "buy";
    const showBuy = state.calcMode === "buy";

    buyPane.classList.toggle("hidden", !showBuy);
    budgetPane.classList.toggle("hidden", showBuy);
    buyPane.hidden = !showBuy;
    budgetPane.hidden = showBuy;

    modeButtons.forEach((button) => {
      const isActive = button.dataset.calcMode === state.calcMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  };

  const renderBuy = () => {
    const grams =
      state.gramsMode === "custom"
        ? sanitizePositiveNumber(state.customGrams, 1)
        : Number(state.gramsMode);
    const breakdown = calculateBuyBreakdown(
      goldPricePerGram,
      grams,
      state.makingPercent,
    );

    customGramsField.classList.toggle("hidden", state.gramsMode !== "custom");
    gramButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.gramsOption === state.gramsMode,
      );
      button.setAttribute(
        "aria-selected",
        String(button.dataset.gramsOption === state.gramsMode),
      );
    });

    setNodeText("#selected-grams-output", formatGramLabel(breakdown.grams));
    setNodeText(
      "#base-price-output",
      currencyFormatter.format(breakdown.basePrice),
    );
    setNodeText(
      "#gst-price-output",
      currencyFormatter.format(breakdown.gstAmount),
    );
    setNodeText(
      "#making-price-output",
      `${currencyFormatter.format(breakdown.makingAmount)} (${trimPercent(breakdown.makingPercent)}%)`,
    );
    setNodeText(
      "#final-price-output",
      currencyFormatter.format(breakdown.finalPrice),
    );
  };

  const renderBudget = () => {
    const breakdown = calculateGramsFromBudget(
      goldPricePerGram,
      state.budgetPrice,
      state.makingPercent,
    );

    setNodeText(
      "#budget-price-output",
      currencyFormatter.format(breakdown.budgetPrice),
    );
    setNodeText(
      "#reverse-base-price-output",
      currencyFormatter.format(breakdown.basePrice),
    );
    setNodeText(
      "#reverse-gst-price-output",
      currencyFormatter.format(breakdown.gstAmount),
    );
    setNodeText(
      "#reverse-making-price-output",
      `${currencyFormatter.format(breakdown.makingAmount)} (${trimPercent(breakdown.makingPercent)}%)`,
    );
    gramsOutput.textContent = formatPreciseGramLabel(breakdown.grams);
  };

  const render = () => {
    renderBuy();
    renderBudget();
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCalcMode(button.dataset.calcMode);
    });
  });

  gramButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.gramsMode = button.dataset.gramsOption || "1";

      if (state.gramsMode !== "custom") {
        state.customGrams = sanitizePositiveNumber(customGramsInput.value, 1);
      } else {
        customGramsInput.focus();
      }

      renderBuy();
    });
  });

  customGramsInput.addEventListener("input", () => {
    state.gramsMode = "custom";
    state.customGrams = sanitizePositiveNumber(customGramsInput.value, 1);
    renderBuy();
  });

  budgetPriceInput.addEventListener("input", () => {
    state.budgetPrice = sanitizePositiveNumber(budgetPriceInput.value, 0);
    renderBudget();
  });

  makingSlider.addEventListener("input", () => {
    state.makingPercent = sanitizeNonNegativeNumber(
      makingSlider.value,
      DEFAULT_MAKING_CHARGE,
    );
    makingInput.value = trimPercent(state.makingPercent);
    render();
  });

  makingInput.addEventListener("input", () => {
    state.makingPercent = sanitizeNonNegativeNumber(makingInput.value, 0);
    makingSlider.value = String(Math.min(state.makingPercent, 20));
    render();
  });

  setCalcMode("buy");
  render();
}

function calculateBuyBreakdown(goldPricePerGram, grams, makingPercent) {
  const safeGrams = sanitizePositiveNumber(grams, 0);
  const safeMakingPercent = sanitizeNonNegativeNumber(makingPercent, 0);
  const basePrice = goldPricePerGram * safeGrams;
  const gstAmount = basePrice * (GST_RATE / 100);
  const makingAmount = basePrice * (safeMakingPercent / 100);

  return {
    grams: safeGrams,
    makingPercent: safeMakingPercent,
    basePrice,
    gstAmount,
    makingAmount,
    finalPrice: basePrice + gstAmount + makingAmount,
  };
}

function calculateGramsFromBudget(
  goldPricePerGram,
  budgetPrice,
  makingPercent,
) {
  const safeBudget = sanitizePositiveNumber(budgetPrice, 0);
  const safeMakingPercent = sanitizeNonNegativeNumber(makingPercent, 0);
  const chargeMultiplier = 1 + GST_RATE / 100 + safeMakingPercent / 100;
  const basePrice = safeBudget / chargeMultiplier;
  const gstAmount = basePrice * (GST_RATE / 100);
  const makingAmount = basePrice * (safeMakingPercent / 100);
  const grams =
    goldPricePerGram > 0 ? basePrice / goldPricePerGram : 0;

  return {
    budgetPrice: safeBudget,
    makingPercent: safeMakingPercent,
    basePrice,
    gstAmount,
    makingAmount,
    grams,
  };
}

function setNodeText(selector, value) {
  const node = document.querySelector(selector);

  if (node) {
    node.textContent = value;
  }
}

function sanitizePositiveNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function sanitizeNonNegativeNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function trimPercent(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function formatGramLabel(value) {
  const formatted = Number(value).toFixed(1).replace(/\.0$/, "");
  return `${formatted} gm`;
}

function formatPreciseGramLabel(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 gm";
  }

  return `${value.toLocaleString("en-IN", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  })} gm`;
}
