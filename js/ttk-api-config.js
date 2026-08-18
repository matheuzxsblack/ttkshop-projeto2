/** API Node: Frontend projeto 2 (mundodasmulheres.net / ofertasdemulher.vercel.app) → Render ttkshop-projeto2. */
(function (g) {
  var renderApi = "https://ttkshop-projeto2.onrender.com";
  var api = renderApi;
  try {
    var h = String(location.hostname || "").toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || (h.endsWith(".onrender.com") && h.indexOf("projeto2") !== -1)) {
      api = "";
    }
  } catch (e) {}
  g.TTK_RENDER_API = api;
  g.TTK_IS_PROJETO2 = true;
})(typeof window !== "undefined" ? window : this);

/* ---------- presença "Onde estão agora" (heartbeat 5s em todas as lojas) ---------- */
(function (g) {
  try {
    if (/^\/admin/.test(String(g.location.pathname || ""))) return;
    var sid = "";
    try {
      sid = g.sessionStorage.getItem("online_sid") || "";
      if (!sid) {
        sid = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        g.sessionStorage.setItem("online_sid", sid);
      }
    } catch (eS) { sid = "s" + Math.random().toString(36).slice(2); }
    var api = String(g.TTK_RENDER_API || "").replace(/\/+$/, "");
    function ping() {
      var url = api + "/api/online-ping?client=1&sid=" + encodeURIComponent(sid) +
        "&host=" + encodeURIComponent(g.location.hostname || "") +
        "&page=" + encodeURIComponent(g.location.pathname || "/");
      try {
        fetch(url, { method: "GET", cache: "no-store", mode: "cors", credentials: "omit", keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    function leave() {
      try {
        fetch(api + "/api/online-leave?sid=" + encodeURIComponent(sid), { method: "GET", cache: "no-store", mode: "cors", credentials: "omit", keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    ping();
    setInterval(ping, 5000);
    g.addEventListener("pagehide", leave);
    g.document.addEventListener("visibilitychange", function () {
      if (g.document.visibilityState === "hidden") leave();
    });
  } catch (e) {}
})(typeof window !== "undefined" ? window : this);
