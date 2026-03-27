const API_URL =
  "https://api.lalithaajewellery.com/public/pricings/latest?state_id=fbe51d69-c3ef-466f-a8f4-7c382759e35f";
const proxyConfig = window.GOLDTRACKER_PROXY_URL;
const PROXY_URL = typeof proxyConfig === "string" ? proxyConfig.trim() : "";
const CACHE_KEY = "gold-tracker-pricing-cache-v1";
const CACHE_TTL = 5 * 60 * 1000;

const app = document.querySelector("#app");
const dashboardTemplate = document.querySelector("#dashboard-template");
const errorTemplate = document.querySelector("#error-template");

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

  setText(fragment, "statusLabel", buildStatusLabel(payload.source, fromCache));
  setText(fragment, "todayLabel", fullDateFormatter.format(new Date()));
  setText(
    fragment,
    "goldPrice",
    currencyFormatter.format(payload.metals.gold.price),
  );
  setText(fragment, "updatedTime", formatDateTime(payload.rateUpdatedTime));
  setText(fragment, "stateName", payload.stateName);
  setText(
    fragment,
    "silverPrice",
    currencyFormatter.format(payload.metals.silver.price),
  );
  setText(
    fragment,
    "silverTime",
    `Silver updated ${formatDateTime(payload.metals.silver.updatedAt)}`,
  );
  setText(
    fragment,
    "platinumPrice",
    currencyFormatter.format(payload.metals.platinum.price),
  );
  setText(
    fragment,
    "platinumTime",
    `Platinum updated ${formatDateTime(payload.metals.platinum.updatedAt)}`,
  );
  setText(
    fragment,
    "cacheMessage",
    buildCacheMessage(payload.source, fromCache, warningMessage),
  );
  setText(fragment, "panelNote", buildPanelNote(payload.source));

  app.replaceChildren(fragment);

  const refreshButton = document.querySelector("#refresh-button");
  refreshButton?.addEventListener("click", () => loadRates(true));
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

function buildPanelNote(source) {
  if (source === "proxy") {
    return "Rates are being served through the fallback proxy for GitHub Pages compatibility.";
  }

  return "Anonymous API fetch. Cached briefly for faster repeat visits.";
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
