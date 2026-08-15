/* Funil multi-loja — eventos ao Render (ttkshop-panelas). */
(function () {
  function renderApiUrl() {
    return (typeof window.TTK_RENDER_API === "string" && window.TTK_RENDER_API) || "https://ttkshop-projeto2.onrender.com";
  }
  function apiBase() {
    try {
      if (typeof window.TTK_API_BASE === "string" && window.TTK_API_BASE) return window.TTK_API_BASE;
      var h = String(location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return "";
      if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com") return "";
      if (/\.vercel\.app$/.test(h)) return renderApiUrl();
      if (h.indexOf("onrender.com") !== -1 && h.indexOf("ttkshop") !== -1) return "";
    } catch (e) {}
    return "";
  }

  function detectStore() {
    if (window.TTK_STORE) return String(window.TTK_STORE).trim().toLowerCase();
    try {
      var p = String(location.pathname || "").toLowerCase();
      if (p.indexOf("/compra") === 0) {
        var tp = new URLSearchParams(location.search || "").get("topic") || "";
        tp = String(tp).toLowerCase();
        if (tp === "casaco") return "bobojaco";
        if (tp === "roupao") return "roupao";
        if (tp === "casaquinho") return "teddy";
        if (tp === "toalha") return "toalha";
        if (tp === "jaqueta") return "jaqueta";
        return "jaqueta";
      }
      if (p === "/n7jq" || p.indexOf("/n7jq/") === 0) return "jaqueta";
      if (p === "/n7tl" || p.indexOf("/n7tl/") === 0) return "toalha";
      if (p === "/n7bb" || p.indexOf("/n7bb/") === 0) return "bobojaco";
      if (p === "/n7rp" || p.indexOf("/n7rp/") === 0) return "roupao";
      if (p === "/n7td" || p.indexOf("/n7td/") === 0) return "teddy";
      if (p.indexOf("/panela") === 0 || p.indexOf("/panelas") === 0) return "panelas";
      if (p.indexOf("/toalha") === 0) return "toalha";
      if (p.indexOf("/jaqueta") === 0) return "jaqueta";
      if (p.indexOf("/bobojaco") === 0) return "bobojaco";
      if (p.indexOf("/teddy") === 0) return "teddy";
      if (p.indexOf("/roupao") === 0) return "roupao";
    } catch (e2) {}
    return "jaqueta";
  }

  var base = apiBase();
  var store = detectStore();
  var sid = "";
  try {
    sid = sessionStorage.getItem("funnel_sid") || sessionStorage.getItem("online_sid") || "";
    if (!sid) {
      sid = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("funnel_sid", sid);
    }
  } catch (e3) {
    sid = "t" + Math.random().toString(36).slice(2);
  }

  var sent = Object.create(null);

  function send(event, extra) {
    event = String(event || "").trim().toLowerCase();
    if (!event || !sid || !store) return;
    var onceKey =
      event === "leave" ? "" : event + (extra && extra.product_id ? ":" + extra.product_id : "");
    if (onceKey && sent[onceKey]) return;
    if (onceKey) sent[onceKey] = 1;
    if (event === "leave") {
      if (sent.__leave) return;
      sent.__leave = 1;
    }

    var q = new URLSearchParams();
    q.set("client", "1");
    q.set("sid", sid);
    q.set("store", store);
    q.set("event", event);
    q.set("host", location.hostname || "");
    var pid = (extra && extra.product_id != null ? extra.product_id : store) || store;
    if (event === "product" || event === "home") q.set("product_id", String(pid));

    var url = base + "/api/funnel/event?" + q.toString();
    try {
      if (navigator.sendBeacon && event === "leave") {
        navigator.sendBeacon(url);
        return;
      }
    } catch (eB) {}
    fetch(url, { method: "GET", cache: "no-store", mode: "cors", credentials: "omit", keepalive: true }).catch(
      function () {}
    );
  }

  /* eventos reais de variante (escolha de cor) e carrinho — delegação captura antes dos handlers da loja */
  try {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest(".sku-opt, .swatch, [data-color]")) { send("variant"); return; }
      if (t.closest("#btn-add-cart, .btn-cart")) send("cart");
    }, true);
  } catch (eClick) {}

  window.ttkShopFunnel = send;
  window.ttkFunnelPixMeta = function () {
    return { funnel_sid: sid, funnel_store: store, funnel_host: location.hostname || "" };
  };
  send("home");

  window.addEventListener("pagehide", function () {
    send("leave");
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") send("leave");
  });
})();
