// Pure time-format + time-zone helpers (no DOM). Shared by the app UI;
// testable in Node: require("./public/time.js").
// Storage canonical forms never change: wall times are "HH:MM" 24h strings,
// instants are ISO-8601. These helpers only affect DISPLAY.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TimeFmt = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // "HH:MM" (24h) -> { h24, m }. Throws on bad input.
  function parseHHMM(s) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || "");
    if (!m) throw new Error("Bad time: " + s);
    return { h24: Number(m[1]), m: Number(m[2]) };
  }

  // 24h hour -> { h12, ampm }. 0 -> 12 AM, 12 -> 12 PM.
  function hour12(h24) {
    if (h24 === 0) return { h12: 12, ampm: "AM" };
    if (h24 < 12) return { h12: h24, ampm: "AM" };
    if (h24 === 12) return { h12: 12, ampm: "PM" };
    return { h12: h24 - 12, ampm: "PM" };
  }

  // 12h components -> 24h hour. 12 AM -> 0, 12 PM -> 12.
  function hour24(h12, ampm) {
    h12 = Number(h12);
    if (!(h12 >= 1 && h12 <= 12)) throw new Error("Bad hour: " + h12);
    const ap = String(ampm).toUpperCase();
    if (ap !== "AM" && ap !== "PM") throw new Error("Bad AM/PM: " + ampm);
    if (h12 === 12) return ap === "AM" ? 0 : 12;
    return ap === "AM" ? h12 : h12 + 12;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // Display "HH:MM" in the user's chosen mode ("12" or "24").
  function fmtTime(hhmm, mode) {
    const { h24, m } = parseHHMM(hhmm);
    if (mode === "12") {
      const { h12, ampm } = hour12(h24);
      return `${h12}:${pad(m)} ${ampm}`;
    }
    return `${pad(h24)}:${pad(m)}`;
  }

  // Build a canonical "HH:MM" from 12h form selections.
  function from12(h12, min, ampm) {
    const mm = Number(min);
    if (!(mm >= 0 && mm <= 59)) throw new Error("Bad minutes: " + min);
    return `${pad(hour24(h12, ampm))}:${pad(mm)}`;
  }

  // Device IANA zone, e.g. "Africa/Lagos". Never hardcoded.
  function localZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
    } catch {
      return "local time";
    }
  }

  // Format an ISO instant in a given IANA zone + mode (for timestamps like
  // session created_at). DST handled by Intl automatically.
  function fmtInstant(iso, zone, mode) {
    const d = new Date(iso);
    if (isNaN(d)) throw new Error("Bad instant: " + iso);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: mode === "12",
    }).format(d);
  }

  return { parseHHMM, hour12, hour24, fmtTime, from12, localZone, fmtInstant };
});
