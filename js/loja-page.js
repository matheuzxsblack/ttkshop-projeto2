(function () {
  "use strict";

  var cat = window.TTK_CATALOG;
  if (!cat) return;

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function parsePriceMain(p) {
    var raw = String((p && p.priceMain) || "").trim();
    if (!raw && p && p.priceLabel) {
      var m = String(p.priceLabel).match(/(\d+[.,]\d{2})/);
      if (m) raw = m[1];
    }
    if (!raw) return { int: "0", cents: "00" };
    raw = raw.replace(".", ",");
    var parts = raw.split(",");
    return { int: parts[0] || "0", cents: (parts[1] || "00").slice(0, 2) };
  }

  function productCardHtml(p) {
    var pr = parsePriceMain(p);
    return (
      '<a class="loja-feed-card" href="' +
      esc(p.url) +
      '">' +
      '<div class="loja-feed-img">' +
      (p.badge ? '<span class="loja-feed-badge">' + esc(p.badge) + "</span>" : "") +
      '<img src="' +
      esc(p.image) +
      '" alt="" loading="lazy" />' +
      "</div>" +
      '<div class="loja-feed-body">' +
      '<p class="loja-feed-title">' +
      esc(p.title) +
      "</p>" +
      '<p class="loja-feed-price"><span class="loja-from">A partir de</span> R$&nbsp;<b class="loja-pi">' +
      esc(pr.int) +
      '</b><b class="loja-pc">,' +
      esc(pr.cents) +
      "</b></p>" +
      '<p class="loja-feed-meta">' +
      '<span class="loja-stars">★ ' +
      esc(p.rating || "4.8") +
      "</span>" +
      '<span class="loja-dot">·</span>' +
      '<span class="loja-sold">' +
      esc(p.sold || "") +
      "</span>" +
      "</p>" +
      "</div></a>"
    );
  }

  function fillFeed(el, list) {
    if (!el) return;
    el.innerHTML = (list || []).map(productCardHtml).join("");
  }

  document.getElementById("loja-back").addEventListener("click", function () {
    if (history.length > 1) history.back();
    else location.href = "/jaqueta/";
  });

  document.getElementById("loja-name").textContent = cat.brand;
  document.getElementById("loja-logo").src = cat.logo;
  document.getElementById("loja-logo").alt = cat.brand;
  document.getElementById("loja-sold").textContent = cat.soldLabel || "";
  document.getElementById("loja-followers").textContent = cat.followers || "";
  document.getElementById("loja-search-text").textContent = "Buscar em " + cat.brand;
  document.getElementById("loja-about-text").textContent = cat.about || "";

  var metrics = document.getElementById("loja-metrics");
  metrics.innerHTML =
    '<div class="loja-metric"><b>' +
    esc((cat.stats && cat.stats.reply) || "90%") +
    '</b><span>Resposta em 24h</span></div>' +
    '<div class="loja-metric"><b>' +
    esc((cat.stats && cat.stats.ship) || "94%") +
    '</b><span>Envio pontual</span></div>' +
    '<div class="loja-metric"><b>4.8</b><span>Avaliação</span></div>';

  var products = cat.products || [];
  fillFeed(document.getElementById("loja-feed"), products);
  fillFeed(document.getElementById("loja-feed-promo"), products);

  var followBtn = document.getElementById("loja-follow");
  var following = false;
  followBtn.addEventListener("click", function () {
    following = !following;
    followBtn.textContent = following ? "Seguindo" : "Seguir";
    followBtn.classList.toggle("is-following", following);
  });

  document.querySelectorAll(".loja-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var key = tab.getAttribute("data-tab");
      document.querySelectorAll(".loja-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
      });
      document.getElementById("panel-produtos").hidden = key !== "produtos";
      document.getElementById("panel-produtos").classList.toggle("active", key === "produtos");
      document.getElementById("panel-promo").hidden = key !== "promo";
      document.getElementById("panel-promo").classList.toggle("active", key === "promo");
      document.getElementById("panel-sobre").hidden = key !== "sobre";
      document.getElementById("panel-sobre").classList.toggle("active", key === "sobre");
    });
  });
})();
