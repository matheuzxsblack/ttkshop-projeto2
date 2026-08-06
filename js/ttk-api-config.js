/** API Node: projeto 2 só no front dele. ofertasgrandes.com = projeto 1 (panelas). */
(function (g) {
  var renderApi = "https://ttkshop-projeto2.onrender.com";
  var panelasApi = "https://ttkshop-panelas-9e6w.onrender.com";
  var api = panelasApi;
  try {
    var h = String(location.hostname || "").toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") {
      api = "";
    } else if (h.endsWith(".onrender.com")) {
      api = h.indexOf("projeto2") !== -1 ? "" : panelasApi;
    } else if (
      h === "ofertasgrandes.com" ||
      h === "www.ofertasgrandes.com"
    ) {
      api = panelasApi;
    } else if (/\.vercel\.app$/.test(h)) {
      api =
        h.indexOf("projeto-dois") !== -1 || h.indexOf("projeto2") !== -1
          ? renderApi
          : panelasApi;
    } else if (h.indexOf("ttkshop-panelas") !== -1) {
      api = panelasApi;
    }
  } catch (e) {
    api = panelasApi;
  }
  g.TTK_RENDER_API = api;
})(typeof window !== "undefined" ? window : this);
