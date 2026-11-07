import { BACKEND_URL } from "./config.js";

async function request(path, options = {}) {
  if (!BACKEND_URL) {
    throw new Error("BACKEND_URL is not set in app.json");
  }

  // A hung socket must not leave a request pending forever; on a phone that
  // reads as a frozen screen rather than as a network error.
  const { timeoutMs, ...init } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      ...init,
      signal: controller?.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Builds ?since=…&limit=… only from values that were actually provided, so an
// unfiltered request keeps the exact URL it had before.
function queryString({ since, limit } = {}) {
  const params = [];
  if (since) params.push(`since=${encodeURIComponent(since)}`);
  if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
  return params.length ? `?${params.join("&")}` : "";
}

export const Api = {
  getSensorReadings(options = {}) {
    return request(`/api/readings${queryString(options)}`);
  },
  getThresholds(options = {}) {
    return request(`/api/thresholds${queryString(options)}`);
  },
  createThreshold(payload) {
    return request("/api/thresholds", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getHealth() {
    return request("/api/health", { timeoutMs: 5000 });
  },
};
