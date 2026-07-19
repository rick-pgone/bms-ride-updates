(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  root.BmsStatusModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CLOUD_STALE_MS = 10 * 60 * 1000;
  const VALID_STATES = new Set(["online", "offline", "riding", "charging"]);

  function toFinite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeRow(response, fetchedAt = Date.now()) {
    const row = Array.isArray(response) ? response[0] : response;
    if (!row || typeof row !== "object") return null;
    const soc = toFinite(row.soc);
    const observedAt = Date.parse(row.observed_at);
    const syncedAt = Date.parse(row.synced_at);
    const cloudAgeSeconds = toFinite(row.age_seconds);
    const observedAgeSeconds = toFinite(row.observed_age_seconds);
    if (soc === null || soc < 0 || soc > 100
        || !Number.isFinite(observedAt) || !Number.isFinite(syncedAt)) return null;
    return {
      soc: Math.round(soc),
      status: VALID_STATES.has(row.status) ? row.status : "offline",
      estimatedRangeKm: toFinite(row.estimated_range_km),
      observedAt,
      syncedAt,
      fetchedAt,
      cloudAgeAtFetchMs: cloudAgeSeconds === null ? null : Math.max(0, cloudAgeSeconds * 1000),
      observedAgeAtFetchMs: observedAgeSeconds === null ? null : Math.max(0, observedAgeSeconds * 1000)
    };
  }

  function deriveDisplay(snapshot, now) {
    if (!snapshot) return null;
    const elapsedSinceFetch = Math.max(0, now - snapshot.fetchedAt);
    const cloudAgeMs = snapshot.cloudAgeAtFetchMs === null
      ? Math.max(0, now - snapshot.syncedAt)
      : snapshot.cloudAgeAtFetchMs + elapsedSinceFetch;
    const observedAgeMs = snapshot.observedAgeAtFetchMs === null
      ? Math.max(0, now - snapshot.observedAt)
      : snapshot.observedAgeAtFetchMs + elapsedSinceFetch;
    const cloudIsStale = cloudAgeMs > CLOUD_STALE_MS;
    const state = cloudIsStale ? "offline" : snapshot.status;
    const labels = {
      online: "在线中",
      offline: "离线中",
      riding: "骑行中",
      charging: "充电中"
    };
    const freshness = state === "offline" ? "显示最后数据"
      : state === "charging" ? "正在充电"
      : state === "riding" ? "正在骑行"
      : "数据正常";
    const range = snapshot.estimatedRangeKm !== null && snapshot.estimatedRangeKm >= 0
      ? snapshot.estimatedRangeKm.toFixed(1) : "--";
    return {
      state,
      label: labels[state],
      freshness,
      soc: snapshot.soc,
      range,
      low: snapshot.soc < 20,
      note: state === "offline" ? "车辆离线，续航为上次估算" : "根据历史骑行记录估算",
      ageMs: observedAgeMs
    };
  }

  function formatAge(ageMs) {
    if (!Number.isFinite(ageMs) || ageMs < 60_000) return "刚刚更新";
    if (ageMs < 60 * 60_000) return `${Math.floor(ageMs / 60_000)} 分钟前更新`;
    if (ageMs < 24 * 60 * 60_000) return `${Math.floor(ageMs / (60 * 60_000))} 小时前更新`;
    return `${Math.floor(ageMs / (24 * 60 * 60_000))} 天前更新`;
  }

  return { CLOUD_STALE_MS, normalizeRow, deriveDisplay, formatAge };
});
