(function () {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;
  const CACHE_KEY = "bms-public-status-v1";
  const config = window.BMS_SHARE_CONFIG || {};
  const model = window.BmsStatusModel;
  const page = document.getElementById("sharePage");
  const stateTag = document.getElementById("stateTag");
  const freshnessTitle = document.getElementById("freshnessTitle");
  const updatedAt = document.getElementById("updatedAt");
  const socValue = document.getElementById("socValue");
  const rangeValue = document.getElementById("rangeValue");
  const rangeNote = document.getElementById("rangeNote");

  function configured() {
    return typeof config.supabaseUrl === "string" && config.supabaseUrl.startsWith("https://")
      && typeof config.publishableKey === "string" && config.publishableKey.trim().length > 0;
  }

  function endpoint() {
    return `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/get_public_bms_status`;
  }

  function render(snapshot) {
    const display = model.deriveDisplay(snapshot, Date.now());
    if (!display) {
      showError("暂无可用数据", "等待电池监控 App 首次同步");
      return;
    }
    page.className = `share-page ${display.state}${display.low ? " low" : ""}`;
    page.style.setProperty("--soc", `${display.soc}%`);
    stateTag.textContent = display.label;
    freshnessTitle.textContent = display.low ? "电量偏低" : display.freshness;
    updatedAt.textContent = model.formatAge(display.ageMs);
    socValue.textContent = String(display.soc);
    rangeValue.textContent = display.range;
    rangeNote.textContent = display.note;
  }

  function showError(title, detail) {
    page.className = "share-page offline";
    stateTag.textContent = "暂不可用";
    freshnessTitle.textContent = title;
    updatedAt.textContent = detail;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (cached && cached.row && Number.isFinite(cached.fetchedAt)) {
        return model.normalizeRow(cached.row, cached.fetchedAt);
      }
      return model.normalizeRow(cached);
    } catch (_) {
      return null;
    }
  }

  function saveCache(response, fetchedAt) {
    try {
      const row = Array.isArray(response) ? response[0] : response;
      if (row) localStorage.setItem(CACHE_KEY, JSON.stringify({ row, fetchedAt }));
    } catch (_) {
      // The page still works when private browsing blocks local storage.
    }
  }

  async function refresh() {
    if (!configured()) {
      showError("共享页面尚未配置", "请先填写 Supabase 公开配置");
      return;
    }
    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.publishableKey}`
        },
        body: "{}",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const fetchedAt = Date.now();
      const snapshot = model.normalizeRow(json, fetchedAt);
      if (!snapshot) throw new Error("empty status");
      saveCache(json, fetchedAt);
      render(snapshot);
    } catch (_) {
      const cached = readCache();
      if (cached) render(cached);
      else showError("暂时无法读取数据", "页面将在 5 分钟后重试");
    }
  }

  const cached = readCache();
  if (cached) render(cached);
  refresh();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });
})();
