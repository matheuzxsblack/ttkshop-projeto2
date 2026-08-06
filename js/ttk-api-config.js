/** API Node: projeto 2 (Render). E-mails/rastreio usam SITE_BASE=ofertasgrandes.com no servidor. */
(function (g) {
  var renderApi = "https://ttkshop-projeto2.onrender.com";
  var api = "";
  try {
    var h = String(location.hostname || "").toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") {
      api = "";
    } else if (h.endsWith(".onrender.com")) {
      api = "";
    } else if (
      h.indexOf("ttkshop-projeto2") !== -1 ||
      h === "ofertasgrandes.com" ||
      h === "www.ofertasgrandes.com" ||
      /\.vercel\.app$/.test(h)
    ) {
      api = renderApi;
    } else {
      api = renderApi;
    }
  } catch (e) {
    api = renderApi;
  }
  g.TTK_RENDER_API = api;
})(typeof window !== "undefined" ? window : this);
