/* Ping de presença online (Render) — inclui audience store/cloaker */
(function () {
  var API_BASE = (function () {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com") return "";
      if (
        h === "ofertasonlineshop.vercel.app" ||
        h === "otimasofertas.vercel.app" ||
        h === "ofertaslindas.vercel.app" ||
        h === "grandesofertas.vercel.app" ||
        /\.vercel\.app$/.test(h)
      ) {
        return (
          (typeof window.TTK_RENDER_API === "string" && window.TTK_RENDER_API) ||
          "https://ttkshop-projeto2.onrender.com"
        );
      }
    } catch (e) {}
    return "";
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
