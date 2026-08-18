/* Ping de presença online (Render) — inclui audience store/cloaker */
(function () {
  var API_BASE = (function () {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return "";
      if (h.endsWith(".onrender.com")) return "";
      if (typeof window !== "undefined" && typeof window.TTK_RENDER_API === "string" && window.TTK_RENDER_API !== "") {
        return window.TTK_RENDER_API.replace(/\/+$/, "");
      }
    } catch (e) {}
    return "https://ttkshop-projeto2.onrender.com";
  })();

  var sid = "";
  try {
    sid = sessionStorage.getItem("online_sid") || "";
    if (!sid) {
      sid = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("online_sid", sid);
    }
  } catch (e2) {
    sid = "s" + Math.random().toString(36).slice(2);
  }

  function audQ() {
    if (typeof window.ttkAudienceQuery === "function") return window.ttkAudienceQuery();
    return "&audience=store";
  }

  function ping() {
    var page = "";
    var host = "";
    try {
      page = location.pathname + (location.search || "");
      host = location.hostname || "";
    } catch (ePage) {}
    var q =
      "client=1&sid=" +
      encodeURIComponent(sid) +
      "&page=" +
      encodeURIComponent(page) +
      "&host=" +
      encodeURIComponent(host) +
      audQ();
    fetch(API_BASE + "/api/online-ping?" + q, {
      method: "GET",
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
    }).catch(function () {});
  }

  function leave() {
    var url = API_BASE + "/api/online-leave?client=1&sid=" + encodeURIComponent(sid);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
        return;
      }
    } catch (e3) {}
    try {
      fetch(url, { method: "GET", cache: "no-store", keepalive: true, mode: "cors" }).catch(function () {});
    } catch (e4) {}
  }

  ping();
  setInterval(ping, 5000);
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") leave();
  });
})();
