/** audience para ping online: store = vitrine | cloaker = /compra */
(function () {
  function pathNorm() {
    try {
      return (location.pathname || "/").replace(/\/+$/, "") || "/";
    } catch (e) {
      return "/";
    }
  }

  window.ttkResolveOnlineAudience = function () {
    var p = pathNorm();
    if (p === "/compra" || p.indexOf("/compra/") === 0) return "cloaker";
    try {
      if (sessionStorage.getItem("ttk_cloak_outcome") === "redirect") return "cloaker";
    } catch (e1) {}
    if (p === "/n7jq" || p === "/n7tl" || p === "/n7bb" || p === "/n7rp" || p === "/n7td") return "store";
    if (p === "/" || p === "/jaqueta" || p === "/toalha" || p === "/bobojaco" || p === "/roupao" || p === "/teddy") return "store";
    return "store";
  };

  window.ttkAudienceQuery = function () {
    return "&audience=" + encodeURIComponent(window.ttkResolveOnlineAudience());
  };
})();
