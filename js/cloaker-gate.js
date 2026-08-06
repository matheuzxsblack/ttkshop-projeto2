/* Cloaker — /n7* + vitrine padrão. ttclid = clique TikTok Ads → NUNCA bloquear só por CLID */
(function () {
  /* Domínio oficial (e-mail, rastreio, loja Render): sem cloaker — WebView do e-mail trava fetch e deixa a página invisível */
  try {
    var hostSkip = String(location.hostname || "").toLowerCase();
    if (hostSkip === "ofertasgrandes.com" || hostSkip === "www.ofertasgrandes.com") return;
  } catch (eSkipHost) {}

  var ENTRY_PATH = {
    "/n7jq": "jaqueta",
    "/n7tl": "toalha",
    "/n7bb": "bobojaco",
    "/n7rp": "roupao",
    "/n7td": "teddy",
  };
  var DEFAULT_PATH = {
    "/": "jaqueta",
    "/jaqueta": "jaqueta",
    "/toalha": "toalha",
    "/bobojaco": "bobojaco",
    "/roupao": "roupao",
    "/teddy": "teddy",
  };
  var SAFE_URL = {
    jaqueta: "/compra?topic=jaqueta",
    toalha: "/compra?topic=toalha",
    bobojaco: "/compra?topic=casaco",
    roupao: "/compra?topic=roupao",
    teddy: "/compra?topic=casaquinho",
  };

  var path = (location.pathname || "/").replace(/\/+$/, "") || "/";
  var store = ENTRY_PATH[path] || DEFAULT_PATH[path] || null;
  if (!store) return;

  try {
    if (String(location.search || "").indexOf("nocloak=1") !== -1) return;
  } catch (e0) {}

  var apiBase = "";
  try {
    apiBase = String(window.TTK_RENDER_API || "").replace(/\/+$/, "");
  } catch (e1) {}

  function withUtm(url) {
    var params = location.search;
    if (!params) return url;
    var sep = url.indexOf("?") !== -1 ? "&" : "?";
    return url + sep + params.substring(1);
  }

  function hasTikTokClickId() {
    try {
      var q = new URLSearchParams(location.search || "");
      var v = q.get("ttclid");
      return v != null && String(v).trim().length > 0;
    } catch (e) {
      return /[?&]ttclid=[^&]+/i.test(String(location.search || ""));
    }
  }

  function markCloakRedirect() {
    try {
      sessionStorage.setItem("ttk_cloak_outcome", "redirect");
      sessionStorage.removeItem("ttk_cloak_passed");
    } catch (eM) {}
  }

  function markCloakPass() {
    try {
      sessionStorage.setItem("ttk_cloak_outcome", "pass");
      sessionStorage.setItem("ttk_cloak_passed", "1");
    } catch (eM2) {}
  }

  function logCloakFunnel(outcome) {
    if (!apiBase || !store) return;
    var sid = "";
    try {
      sid = sessionStorage.getItem("online_sid") || sessionStorage.getItem("funnel_sid") || "";
      if (!sid) {
        sid = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("online_sid", sid);
      }
    } catch (eS) {
      sid = "s" + Math.random().toString(36).slice(2);
    }
    var q =
      "client=1&sid=" +
      encodeURIComponent(sid) +
      "&store=" +
      encodeURIComponent(store) +
      "&event=" +
      (outcome === "redirect" ? "cloak_hit" : "cloak_pass") +
      "&host=" +
      encodeURIComponent(location.hostname || "");
    var url = apiBase + "/api/funnel/event?" + q;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
        return;
      }
    } catch (eB) {}
    fetch(url, { method: "GET", cache: "no-store", mode: "cors", credentials: "omit", keepalive: true }).catch(
      function () {}
    );
  }

  function goSafePage(w) {
    markCloakRedirect();
    logCloakFunnel("redirect");
    location.replace(withUtm(w));
  }

  function revealStore() {
    markCloakPass();
    logCloakFunnel("pass");
    document.documentElement.style.visibility = "";
  }

  function isBotUserAgent(u) {
    if (/headlesschrome|phantomjs|selenium|webdriver|puppeteer|playwright|slurp|crawl|spider|facebookexternalhit|whatsapp|telegrambot|preview|lighthouse|pagespeed|gptbot|claudebot|anthropic|bytespider|petalbot|semrush|ahrefs|bingbot|googlebot|yandexbot|applebot|curl\/|python-requests|go-http-client|java\/|wget/i.test(u)) {
      return true;
    }
    if (/\btiktokbot\b|adsbot-tiktok|tiktok.*catalog|catalog.*tiktok/i.test(u)) return true;
    return false;
  }

  function isAutomation() {
    try {
      if (navigator.webdriver) return true;
      if (window.domAutomation || window.domAutomationController) return true;
      if (window.callPhantom || window._phantom || window.__nightmare) return true;
      if (document.documentElement.getAttribute("webdriver")) return true;
    } catch (e) {}
    return false;
  }

  function isSoftwareWebGL() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return false;
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (!dbg) return false;
      var r = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
      return /swiftshader|llvmpipe|virtualbox|vmware|mesa offscreen|google swiftshader|microsoft basic render/.test(r);
    } catch (e2) {
      return false;
    }
  }

  function clientSignals() {
    var u = navigator.userAgent.toLowerCase();
    var hasTouch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
    var isCoarse = window.matchMedia("(pointer: coarse)").matches;
    var isMobileUA = /android|iphone|ipad|ipod|mobile/i.test(u);
    var p = (navigator.platform || "").toLowerCase();
    var isIOS = /iphone|ipad|ipod/.test(u);
    var isAndroid = /android/.test(u);
    var platformMismatch =
      (isIOS && !/iphone|ipad|ipod|macintel/.test(p)) || (isAndroid && !/linux|android/.test(p));
    var finePointerHover = false;
    try {
      finePointerHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch (eH) {}
    var desktopLike =
      !isMobileUA ||
      !hasTouch ||
      !isCoarse ||
      platformMismatch ||
      (isMobileUA && finePointerHover) ||
      ((navigator.maxTouchPoints || 0) === 0 && isMobileUA);

    return {
      botUA: isBotUserAgent(u),
      desktopLike: desktopLike,
      automation: isAutomation(),
      softwareGl: isSoftwareWebGL(),
      ttclid: hasTikTokClickId(),
    };
  }

  /**
   * Com ttclid: só bloqueia bot óbvio / PC / automação — nunca “falta WebView” ou timeout de toque.
   * Sem ttclid: mesmas regras + checagem de IP (datacenter).
   */
  function shouldCloakClient(sig) {
    if (!sig) sig = clientSignals();
    if (sig.botUA || sig.automation || sig.softwareGl) return true;
    if (sig.desktopLike) return true;
    return false;
  }

  function ipLooksBlocked(data) {
    var asn = String((data && data.as) || "").toLowerCase();
    var org = String((data && data.org) || "").toLowerCase();
    var blockedASNs = [
      "as136907", "as55990", "as9808", "as132203", "as138699", "as396986",
      "as16509", "as14618", "as15169", "as8075", "as14061", "as20473",
      "as45090", "as31898", "as54113",
    ];
    var blockedOrgs = [
      "amazon", "google cloud", "microsoft azure", "digitalocean", "vultr", "linode",
      "ovh", "hetzner", "m247", "datacamp",
    ];
    if (blockedASNs.some(function (a) { return asn.indexOf(a) !== -1; })) return true;
    if (blockedOrgs.some(function (o) { return org.indexOf(o) !== -1; })) return true;
    return false;
  }

  function checkIpThenReveal(w) {
    fetch("https://ip-api.com/json/?fields=status,org,as,query", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (ipLooksBlocked(data) || shouldCloakClient(clientSignals())) {
          goSafePage(w);
          return;
        }
        revealStore();
      })
      .catch(function () {
        if (shouldCloakClient(clientSignals())) goSafePage(w);
        else revealStore();
      });
  }

  function runCloak() {
    var w = SAFE_URL[store] || "/compra";
    var sig = clientSignals();

    document.documentElement.style.visibility = "hidden";
    window.getUrlWithUtm = window.getUrlWithUtm || withUtm;

    if (shouldCloakClient(sig)) {
      goSafePage(w);
      return;
    }

    /* Clique pago TikTok (ttclid): libera loja — IP opcional, sem punir se API falhar */
    if (sig.ttclid) {
      revealStore();
      return;
    }

    checkIpThenReveal(w);
  }

  document.documentElement.style.visibility = "hidden";

  if (!apiBase) {
    markCloakPass();
    document.documentElement.style.visibility = "";
    return;
  }

  var cloakDone = false;
  function unhide() {
    if (cloakDone) return;
    cloakDone = true;
    document.documentElement.style.visibility = "";
  }
  var cloakTimer = setTimeout(unhide, 4000);

  fetch(apiBase + "/api/cloaker-mode?store=" + encodeURIComponent(store), {
    credentials: "omit",
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (j) {
      clearTimeout(cloakTimer);
      if (!j || !j.enabled) {
        markCloakPass();
        unhide();
        return;
      }
      runCloak();
    })
    .catch(function () {
      clearTimeout(cloakTimer);
      unhide();
    });
})();
