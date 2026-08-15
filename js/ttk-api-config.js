/** Front projeto 2 → Render ttkshop-projeto2. ofertasgrandes.com → projeto 1. */
(function (g) {
  var RENDER_P2 = "https://ttkshop-projeto2.onrender.com";
  var RENDER_P1 = "https://ttkshop-panelas-9e6w.onrender.com";

  var PROJETO2_HOSTS = {
    "ofertasdemulher.vercel.app": 1,
    "www.ofertasdemulher.vercel.app": 1,
    "ttkshop-projeto-dois.vercel.app": 1,
  };

  function isProjeto2Host(h) {
    if (!h) return false;
    if (PROJETO2_HOSTS[h]) return true;
    if (h.indexOf("projeto2") !== -1 || h.indexOf("projeto-dois") !== -1) return true;
    if (h.indexOf("ofertasdemulher") !== -1) return true;
    return false;
  }

  function resolveApi() {
    var h = String(
      (typeof location !== "undefined" && location.hostname) || ""
    ).toLowerCase();
    if (!h || h === "localhost" || h === "127.0.0.1") return "";
    if (h.endsWith(".onrender.com")) {
      return h.indexOf("projeto2") !== -1 ? "" : RENDER_P1;
    }
    if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com") return RENDER_P1;
    if (isProjeto2Host(h)) return RENDER_P2;
    if (/\.vercel\.app$/.test(h)) return RENDER_P1;
    if (h.indexOf("ttkshop-panelas") !== -1) return RENDER_P1;
    return RENDER_P1;
  }

  g.TTK_RENDER_API = resolveApi();
  g.TTK_IS_PROJETO2 = isProjeto2Host(
    String((typeof location !== "undefined" && location.hostname) || "").toLowerCase()
  );
})(typeof window !== "undefined" ? window : this);
