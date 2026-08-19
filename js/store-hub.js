/* Recomendações + link para página da loja (Ofertas De Mulher) */
(function () {
  "use strict";

  var cat = window.TTK_CATALOG;
  if (!cat || !Array.isArray(cat.products)) return;

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function currentProductId() {
    if (window.TTK_STORE) return String(window.TTK_STORE).trim().toLowerCase();
    try {
      var p = String(location.pathname || "").toLowerCase();
      if (p.indexOf("/conjunto") === 0) return "conjunto";
      if (p.indexOf("/panela") === 0 || p.indexOf("/panelas") === 0) return "panelas";
      if (p.indexOf("/toalha") === 0) return "toalha";
      if (p.indexOf("/bobojaco") === 0) return "bobojaco";
      if (p.indexOf("/teddy") === 0) return "teddy";
      if (p.indexOf("/roupao") === 0) return "roupao";
      if (p.indexOf("/jaqueta") === 0) return "jaqueta";
      if (p.indexOf("/sabonete") === 0) return "sabonete";
    } catch (e) {}
    return "jaqueta";
  }

  function lojaUrl() {
    return "/loja/";
  }

  function goLoja(e) {
    if (e && e.preventDefault) e.preventDefault();
    location.href = lojaUrl();
  }

  function wireStoreVisit() {
    var block = document.querySelector(".store-block");
    if (!block) return;
    block.querySelectorAll(".btn-visitar, .store-logo, .store-info h3").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", goLoja);
    });
    var lojaBtn = document.querySelector(".bottom-bar .bb-ico");
    if (lojaBtn) lojaBtn.addEventListener("click", goLoja);
  }

  function renderRecommendations() {
    var cur = currentProductId();
    var list = cat.products.filter(function (p) {
      return p && p.id !== cur;
    });
    if (!list.length) return;

    var sec = document.getElementById("section-recomendacoes");
    var grid;
    if (sec) {
      grid = sec.querySelector(".ttk-reco-grid");
      if (!grid) return;
    } else {
      var anchor = document.querySelector(".bottom-spacer");
      if (!anchor || !anchor.parentNode) return;
      sec = document.createElement("section");
      sec.className = "ttk-reco-block";
      sec.setAttribute("aria-label", "Recomendados");
      sec.innerHTML =
        '<h2 class="ttk-reco-title">Recomendados para você</h2>' +
        '<div class="ttk-reco-grid"></div>';
      grid = sec.querySelector(".ttk-reco-grid");
      anchor.parentNode.insertBefore(sec, anchor);
    }

    grid.innerHTML = "";
    list.forEach(function (p) {
      var a = document.createElement("a");
      a.className = "ttk-reco-card";
      a.href = p.url;
      a.innerHTML =
        '<div class="ttk-reco-thumb">' +
        (p.badge ? '<span class="ttk-reco-badge">' + esc(p.badge) + "</span>" : "") +
        '<img src="' +
        esc(p.image) +
        '" alt="" loading="lazy" />' +
        "</div>" +
        '<p class="ttk-reco-name">' +
        esc(p.title) +
        "</p>" +
        '<p class="ttk-reco-price">' +
        esc(p.priceLabel) +
        "</p>";
      grid.appendChild(a);
    });
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor);
  }

  function syncStoreLabels() {
    document.querySelectorAll(".store-block .store-info h3, .store-block .store-logo").forEach(function (el) {
      if (el.tagName === "H3") el.textContent = cat.brand;
      if (el.tagName === "IMG") {
        el.src = cat.logo;
        el.alt = cat.brand;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    try {
      syncStoreLabels();
      wireStoreVisit();
      renderRecommendations();
    } catch (e) {
      console.warn("[store-hub]", e);
    }
  }
})();
