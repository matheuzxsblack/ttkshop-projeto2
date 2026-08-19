(function () {
  "use strict";

  function ttkFunnel(ev, extra) {
    try {
      if (typeof window.ttkShopFunnel === "function") window.ttkShopFunnel(ev, extra || {});
    } catch (eF) {}
  }
  function ttkProdId() {
    return String(window.TTK_STORE || "toalha").toLowerCase();
  }

  function setFunnelStep(step) {
    var s = String(step || "").toLowerCase();
    if (s === "product" || s === "sku" || s === "cart") ttkFunnel("product", { product_id: ttkProdId() });
    else if (s === "checkout") ttkFunnel("checkout");
    else if (s === "pix") ttkFunnel("pix");
    else if (s === "paid") ttkFunnel("success");
  }
  setFunnelStep("product");

  /* modo simulação: /simular ou /?simular=1 — Pix auto-pago em 1 min */
  var SIMULATE_MODE = false;
  try {
    var _sq = new URLSearchParams(location.search);
    SIMULATE_MODE =
      _sq.get("simular") === "1" ||
      _sq.get("simular") === "true" ||
      location.pathname.indexOf("/simular") === 0;
  } catch (eSim) {}

  /* captura ttclid + UTMs na 1ª visita (sobrevive navegação interna) */
  var ATTR_KEY = "ttk_attr_v1";
  (function captureAttribution() {
    try {
      var q = new URLSearchParams(location.search);
      var prev = {};
      try {
        prev = JSON.parse(sessionStorage.getItem(ATTR_KEY) || "{}") || {};
      } catch (eP) {}
      var attr = {
        /* ?pixel=ID na URL da campanha força a atribuição da venda àquele pixel/loja */
        pixel_id: (q.get("pixel") || q.get("pixel_id") || prev.pixel_id || "").trim().slice(0, 40),
        ttclid: (q.get("ttclid") || prev.ttclid || "").trim().slice(0, 200),
        utm_source: (q.get("utm_source") || prev.utm_source || "").trim().slice(0, 80),
        utm_campaign: (q.get("utm_campaign") || prev.utm_campaign || "").trim().slice(0, 120),
        utm_medium: (q.get("utm_medium") || prev.utm_medium || "").trim().slice(0, 80),
        utm_content: (q.get("utm_content") || prev.utm_content || "").trim().slice(0, 120),
        ttp: prev.ttp || "",
      };
      try {
        var m = document.cookie.match(/(?:^|;\s*)_ttp=([^;]*)/);
        if (m && m[1]) attr.ttp = decodeURIComponent(m[1]).trim().slice(0, 200);
      } catch (eC) {}
      sessionStorage.setItem(ATTR_KEY, JSON.stringify(attr));
      window.__ttkAttr = attr;
    } catch (e) {
      window.__ttkAttr = window.__ttkAttr || {};
    }
  })();

  function ensureSimBanner() {
    if (!SIMULATE_MODE) return;
    if (document.getElementById("sim-banner")) return;
    var b = document.createElement("div");
    b.id = "sim-banner";
    b.setAttribute(
      "style",
      "position:fixed;top:0;left:0;right:0;z-index:99999;background:#fe2c55;color:#fff;" +
        "font:700 12px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;padding:10px 14px;text-align:center;"
    );
    b.textContent =
      "MODO SIMULAÇÃO — faça o pedido normalmente. Após gerar o Pix, em ~1 min marca como PAGO sozinho (sem pagar de verdade).";
    document.body.appendChild(b);
    document.body.style.paddingTop = "44px";
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureSimBanner);
  } else {
    ensureSimBanner();
  }

  /* No Vercel a loja é estática; API/webhook vivem no Render (mesmo backend das panelas). */
  var API_BASE = (function () {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return "";
      if (h.endsWith(".onrender.com")) return "";
      if (typeof window !== "undefined" && typeof window.TTK_RENDER_API === "string" && window.TTK_RENDER_API !== "") {
        return window.TTK_RENDER_API.replace(/\/+$/, "");
      }
    } catch (e) {}
    return "https://ttkshop-projeto2.onrender.com";
  })();
  function apiUrl(path) {
    return API_BASE + path;
  }

  var main = document.getElementById("main-scroll");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var scrollTopBtn = document.getElementById("btn-scroll-top");
  var reviewsPage = document.getElementById("reviews-page");
  var reviewsBody = document.querySelector(".reviews-body");
  var scrollTopReviews = document.getElementById("btn-scroll-top-reviews");
  var skuSheet = document.getElementById("sku-sheet");
  var skuOverlay = document.getElementById("sku-overlay");
  var suppressSpy = false;

  /* ---------- galeria: contador 1/10 ---------- */
  var carousel = document.getElementById("hero-carousel");
  var heroCounter = document.getElementById("hero-counter");
  var heroTotal = carousel.children.length;

  carousel.addEventListener("scroll", function () {
    var idx = Math.round(carousel.scrollLeft / carousel.clientWidth) + 1;
    idx = Math.min(Math.max(idx, 1), heroTotal);
    heroCounter.textContent = idx + "/" + heroTotal;
  });

  /* clique na metade direita avança; na metade esquerda volta */
  carousel.addEventListener("click", function (e) {
    var rect = carousel.getBoundingClientRect();
    var goNext = e.clientX - rect.left > rect.width / 2;
    var idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
    var target = goNext ? idx + 1 : idx - 1;
    if (target < 0 || target > heroTotal - 1) return;
    carousel.scrollTo({ left: target * carousel.clientWidth, behavior: "smooth" });
  });

  /* ---------- abas + scroll spy ---------- */
  var sectionOf = {
    geral: document.getElementById("section-geral"),
    avaliacoes: document.getElementById("section-avaliacoes"),
    descricao: document.getElementById("section-descricao"),
  };

  function setActiveTab(name) {
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var el = sectionOf[tab.dataset.tab];
      if (!el) return;
      setActiveTab(tab.dataset.tab);
      suppressSpy = true;
      main.scrollTo({ top: el.offsetTop, behavior: "smooth" });
      setTimeout(function () { suppressSpy = false; }, 700);
    });
  });

  main.addEventListener("scroll", function () {
    scrollTopBtn.classList.toggle("visible", main.scrollTop > 500);
    if (suppressSpy) return;

    var pos = main.scrollTop + 120;
    var current = "geral";
    ["avaliacoes", "descricao"].forEach(function (name) {
      if (sectionOf[name] && pos >= sectionOf[name].offsetTop) current = name;
    });
    setActiveTab(current);
  });

  scrollTopBtn.addEventListener("click", function () {
    main.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------- página de avaliações ---------- */
  function openReviews() {
    reviewsPage.hidden = false;
    reviewsBody.scrollTop = 0;
    reviewVisibleCount = reviewPageSize;
    applyReviewFilter();
    setFunnelStep("product");
  }

  document.getElementById("btn-all-reviews").addEventListener("click", openReviews);
  document.querySelectorAll("[data-open-reviews]").forEach(function (el) {
    el.addEventListener("click", openReviews);
  });
  document.querySelectorAll(".store-reviews, .sr-head").forEach(function (el) {
    el.style.cursor = "pointer";
    el.addEventListener("click", openReviews);
  });
  var countLink = document.querySelector(".count-link");
  if (countLink) countLink.addEventListener("click", openReviews);
  var ratingRow = document.querySelector(".rating-row");
  if (ratingRow) {
    ratingRow.style.cursor = "pointer";
    ratingRow.addEventListener("click", openReviews);
  }

  document.getElementById("btn-close-reviews").addEventListener("click", function () {
    reviewsPage.hidden = true;
  });

  reviewsBody.addEventListener("scroll", function () {
    scrollTopReviews.classList.toggle("visible", reviewsBody.scrollTop > 500);
  });

  scrollTopReviews.addEventListener("click", function () {
    reviewsBody.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* filtros (estrelas / fotos), likes, paginação e "mostrar mais" */
  var reviewFilter = "photos";
  var reviewSort = "recent";
  var reviewPageSize = 4;
  var reviewVisibleCount = reviewPageSize;

  function applyReviewFilter() {
    var list = Array.prototype.slice.call(
      document.querySelectorAll("#reviews-page .full-review")
    );
    var matched = 0;
    var shown = 0;
    list.forEach(function (rev) {
      var stars = String(rev.getAttribute("data-stars") || "5");
      var hasMedia = rev.getAttribute("data-has-media") === "1";
      var ok = true;
      if (reviewFilter === "photos") ok = hasMedia;
      else if (reviewFilter === "all") ok = true;
      else ok = stars === String(reviewFilter);

      if (!ok) {
        rev.hidden = true;
        return;
      }
      matched++;
      if (shown < reviewVisibleCount) {
        rev.hidden = false;
        shown++;
      } else {
        rev.hidden = true;
      }
    });
    var empty = document.getElementById("reviews-empty");
    if (empty) empty.hidden = matched > 0;
    var moreWrap = document.getElementById("reviews-more-wrap");
    if (moreWrap) moreWrap.hidden = shown >= matched;
  }

  var filterBox = document.getElementById("review-filters");
  if (filterBox) {
    filterBox.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip || !filterBox.contains(chip)) return;
      e.preventDefault();
      filterBox.querySelectorAll(".chip").forEach(function (c) {
        c.classList.remove("active", "dark");
      });
      chip.classList.add("active");
      if (chip.getAttribute("data-filter") === "photos") chip.classList.add("dark");
      reviewFilter = chip.getAttribute("data-filter") || "all";
      reviewVisibleCount = reviewPageSize;
      applyReviewFilter();
      reviewsBody.scrollTop = 0;
    });
  }

  var sortBtn = document.getElementById("review-sort") || document.querySelector("#reviews-page .sort-btn");
  if (sortBtn) {
    sortBtn.addEventListener("click", function () {
      reviewSort = reviewSort === "recent" ? "relevant" : "recent";
      var label = reviewSort === "recent" ? "Mais recentes" : "Mais relevantes";
      var svg = sortBtn.querySelector("svg");
      sortBtn.textContent = label + " ";
      if (svg) sortBtn.appendChild(svg);

      var wrap = reviewsBody;
      var items = Array.prototype.slice.call(wrap.querySelectorAll(".full-review"));
      items.sort(function (a, b) {
        if (reviewSort === "relevant") {
          return Number(b.getAttribute("data-stars") || 0) - Number(a.getAttribute("data-stars") || 0);
        }
        return Number(a.getAttribute("data-order") || 0) - Number(b.getAttribute("data-order") || 0);
      });
      var spacer = wrap.querySelector(".bottom-spacer");
      var moreWrap = document.getElementById("reviews-more-wrap");
      items.forEach(function (it) {
        wrap.insertBefore(it, moreWrap || spacer || null);
      });
      reviewVisibleCount = reviewPageSize;
      applyReviewFilter();
    });
  }

  /* marca ordem inicial */
  document.querySelectorAll("#reviews-page .full-review").forEach(function (rev, i) {
    rev.setAttribute("data-order", String(i));
  });
  applyReviewFilter();

  var btnReviewsMore = document.getElementById("btn-reviews-more");
  if (btnReviewsMore) {
    btnReviewsMore.addEventListener("click", function () {
      reviewVisibleCount += reviewPageSize;
      applyReviewFilter();
    });
  }

  reviewsPage.addEventListener("click", function (e) {
    var like = e.target.closest(".like-btn");
    if (like && reviewsPage.contains(like)) {
      e.preventDefault();
      e.stopPropagation();
      if (!like.hasAttribute("data-base")) {
        var initial = parseInt(String(like.textContent).replace(/[^\d]/g, "") || "0", 10) || 0;
        like.setAttribute("data-base", String(initial));
      }
      var base = parseInt(like.getAttribute("data-base") || "0", 10) || 0;
      var liked = like.classList.toggle("liked");
      var show = liked ? base + 1 : base;
      var svg = like.querySelector("svg");
      var svgHtml = svg ? svg.outerHTML : "";
      like.innerHTML = svgHtml + (show > 0 ? String(show) : "");
      return;
    }

    var more = e.target.closest(".show-more");
    if (more && reviewsPage.contains(more)) {
      e.preventDefault();
      e.stopPropagation();
      var p = more.parentElement;
      if (!p) return;
      p.classList.add("expanded");
      more.remove();
    }
  });

  /* ---------- sheet de variantes (escolha de cores · mín. 4) ---------- */
  var sizeHint = document.getElementById("size-hint");
  var MIN_TOWELS = 4;
  var KIT_CENTS = 3499; /* R$ 34,99 = kit 4 toalhas */
  var DISC_8_CENTS = 682; /* R$ 6,82 a cada 8 toalhas */
  var EXTRA_CENTS = 2784; /* R$ 27,84 — mais 4 cores aleatórias */
  var EXTRA_PRICE = EXTRA_CENTS / 100;
  var EXTRA_IMGS = [
    "imagens/cor-cinza.png",
    "imagens/cor-vermelho.png",
    "imagens/cor-azul.png",
    "imagens/cor-laranja.png",
    "imagens/cor-verde-claro.png",
    "imagens/cor-verde-escuro.png",
    "imagens/cor-rosa.png",
    "imagens/cor-amarelo.png",
    "imagens/cor-bordo.png",
  ];
  var UNIT_PRICE = Math.round(KIT_CENTS / 4) / 100;
  var colorCounts = {};
  var pickOrder = [];
  var cartItems = []; /* declarado cedo — renderPickUI usa no boot */
  var MAX_TICKET = 200;
  var MAX_C = MAX_TICKET * 100;
  var extraRow = document.getElementById("extra-row");
  var extraOptIn = false;
  var randomKitRow = document.getElementById("random-kit-row");
  var randomKitOptIn = false;
  var RANDOM_KIT_LABEL = "Kit 4 toalhas aleatórias";
  var KIT_PRICE = KIT_CENTS / 100;

  function money(v) {
    return "R$ " + Number(v).toFixed(2).replace(".", ",");
  }

  function setRandomKit(on) {
    randomKitOptIn = !!on;
    if (randomKitRow) {
      randomKitRow.classList.toggle("checked", randomKitOptIn);
      randomKitRow.setAttribute("aria-pressed", randomKitOptIn ? "true" : "false");
    }
    if (randomKitOptIn) {
      /* limpa escolha manual — modo aleatório */
      colorCounts = {};
      pickOrder = [];
      document.querySelectorAll("#sku-grid .sku-opt, #sku-grid-times .sku-opt").forEach(function (o) {
        o.classList.remove("selected", "selected2", "has-qty");
        var badge = o.querySelector(".sku-qty-badge");
        if (badge) {
          badge.hidden = true;
          badge.textContent = "0";
        }
      });
      var chips = document.getElementById("pick-chips");
      if (chips) {
        chips.hidden = true;
        chips.innerHTML = "";
      }
    }
    try {
      renderPickUI();
    } catch (ePick) {}
  }

  function setExtraChecked(on) {
    extraOptIn = !!on;
    if (!extraRow) return;
    extraRow.classList.toggle("checked", extraOptIn);
    extraRow.setAttribute("aria-checked", extraOptIn ? "true" : "false");
    try {
      renderPickUI();
    } catch (ePick) {}
  }


  function r2(v) {
    return Math.round(Number(v) * 100) / 100;
  }

  function towelCents(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n <= 0) return 0;
    var base = Math.round((n * KIT_CENTS) / 4);
    var disc = Math.floor(n / 8) * DISC_8_CENTS;
    return Math.max(0, base - disc);
  }

  function pickTotal() {
    return pickOrder.length;
  }

  function colorImg(color) {
    var opt = document.querySelector('#sku-grid .sku-opt[data-color="' + color + '"], #sku-grid-times .sku-opt[data-color="' + color + '"]');
    return (opt && opt.dataset.img) || "imagens/cor-cinza.png";
  }

  function resetPick() {
    colorCounts = {};
    pickOrder = [];
    randomKitOptIn = false;
    if (randomKitRow) {
      randomKitRow.classList.remove("checked");
      randomKitRow.setAttribute("aria-pressed", "false");
    }
    document.querySelectorAll("#sku-grid .sku-opt, #sku-grid-times .sku-opt").forEach(function (o) {
      o.classList.remove("selected", "selected2", "has-qty");
      var badge = o.querySelector(".sku-qty-badge");
      if (badge) {
        badge.hidden = true;
        badge.textContent = "0";
      }
    });
    renderPickUI();
  }

  function renderPickUI() {
    var n = pickTotal();
    var label = document.getElementById("pick-count-label");
    var priceLabel = document.getElementById("pick-price-label");
    var bar = document.getElementById("pick-bar-fill");
    var hint = document.getElementById("pick-disc-hint");
    var chips = document.getElementById("pick-chips");
    var btnCart = document.getElementById("btn-sku-cart");
    var btnBuy = document.getElementById("btn-sku-buy");

    var cartN = regularTowelCount();
    var pickTowels = randomKitOptIn ? 4 : n;
    var combined = cartN + pickTowels;
    var ok = (randomKitOptIn || n >= 1) && combined >= MIN_TOWELS;
    var previewExtra = extraOptIn ? EXTRA_CENTS : 0;
    /* preço desta escolha (não mistura o total do carrinho no topo) */
    var selectionCents = towelCents(pickTowels) + previewExtra;
    var orderPreviewCents =
      towelCents(combined) + extraPackCount() * EXTRA_CENTS + previewExtra;

    if (label) {
      if (randomKitOptIn) {
        label.textContent = "Kit aleatório selecionado (4 toalhas)";
      } else if (combined < MIN_TOWELS) {
        label.textContent =
          "Faltam " + (MIN_TOWELS - combined) + " toalhas para o mínimo (kit com 4)";
      } else if (n < 1) {
        label.textContent = "Toque nas cores ou escolha o kit aleatório";
      } else {
        label.textContent = n + " toalha" + (n > 1 ? "s" : "") + " nesta escolha · total " + combined;
      }
    }
    if (priceLabel) {
      if (pickTowels <= 0 && !extraOptIn) {
        priceLabel.textContent = money(KIT_PRICE);
      } else {
        priceLabel.textContent = money(r2(selectionCents / 100));
      }
    }
    if (bar) {
      var pct = Math.min(100, Math.round((Math.max(pickTowels, combined > 0 ? combined : 0) / MIN_TOWELS) * 100));
      if (pickTowels <= 0 && !randomKitOptIn) pct = Math.min(100, Math.round((cartN / MIN_TOWELS) * 100));
      bar.style.width = (randomKitOptIn || pickTowels >= MIN_TOWELS || combined >= MIN_TOWELS ? Math.max(pct, 25) : pct) + "%";
      if (randomKitOptIn) bar.style.width = "100%";
      bar.style.background = ok ? "#00a085" : "";
    }
    if (hint) {
      var groups = Math.floor(combined / 8);
      var nextAt = (groups + 1) * 8;
      if (groups > 0) {
        hint.textContent =
          "Desconto no pedido: − R$ " +
          (groups * (DISC_8_CENTS / 100)).toFixed(2).replace(".", ",") +
          " (a cada 8) · próximo em " +
          nextAt +
          " toalhas";
      } else {
        hint.textContent =
          "A cada 8 toalhas você ganha R$ " +
          (DISC_8_CENTS / 100).toFixed(2).replace(".", ",") +
          " de desconto · faltam " +
          Math.max(0, 8 - combined) +
          " para o 1º";
      }
    }

    document.querySelectorAll("#sku-grid .sku-opt, #sku-grid-times .sku-opt").forEach(function (o) {
      var c = o.dataset.color;
      var q = colorCounts[c] || 0;
      o.classList.toggle("has-qty", q > 0);
      o.classList.toggle("selected", q > 0);
      var badge = o.querySelector(".sku-qty-badge");
      if (badge) {
        badge.textContent = String(q);
        badge.hidden = q <= 0;
      }
    });

    if (chips) {
      if (!pickOrder.length) {
        chips.hidden = true;
        chips.innerHTML = "";
      } else {
        chips.hidden = false;
        chips.innerHTML = pickOrder
          .map(function (color, idx) {
            return (
              '<span class="pick-chip">' +
              '<img src="' +
              colorImg(color) +
              '" alt="" />' +
              "<span>" +
              color +
              "</span>" +
              '<button type="button" data-chip="' +
              idx +
              '" aria-label="Remover">×</button>' +
              "</span>"
            );
          })
          .join("");
      }
    }

    var lastColor = pickOrder.length ? pickOrder[pickOrder.length - 1] : null;
    if (lastColor) {
      document.getElementById("sku-thumb").src = colorImg(lastColor);
    } else if (randomKitOptIn) {
      document.getElementById("sku-thumb").src =
        EXTRA_IMGS[Math.floor(Math.random() * EXTRA_IMGS.length)];
    }

    if (btnCart) btnCart.disabled = !ok;
    if (btnBuy) {
      btnBuy.disabled = !ok;
      var sm = btnBuy.querySelector("small");
      if (sm) {
        sm.textContent = ok
          ? "Frete grátis"
          : randomKitOptIn
            ? "Frete grátis"
            : "Mínimo 4 toalhas";
      }
    }

    var topInt = document.querySelector("#sku-sheet .price-int.sm");
    var topCents = document.querySelector("#sku-sheet .price-cents");
    if (topInt && topCents) {
      var showC = pickTowels > 0 || extraOptIn ? selectionCents : KIT_CENTS;
      var parts = r2(showC / 100)
        .toFixed(2)
        .split(".");
      topInt.textContent = parts[0];
      topCents.textContent = "," + parts[1];
    }
  }

  function addColor(color) {
    if (randomKitOptIn) setRandomKit(false);
    var prospective = pickTotal() + 1;
    var previewExtra = extraOptIn ? EXTRA_CENTS : 0;
    if (
      towelCents(regularTowelCount() + prospective) +
        extraPackCount() * EXTRA_CENTS +
        previewExtra >
      MAX_C
    ) {
      warnLimit();
      return;
    }
    colorCounts[color] = (colorCounts[color] || 0) + 1;
    pickOrder.push(color);
    renderPickUI();
  }

  function removeColorAt(idx) {
    if (idx < 0 || idx >= pickOrder.length) return;
    var color = pickOrder[idx];
    pickOrder.splice(idx, 1);
    colorCounts[color] = Math.max(0, (colorCounts[color] || 0) - 1);
    if (colorCounts[color] === 0) delete colorCounts[color];
    renderPickUI();
  }

  function removeOneColor(color) {
    var idx = pickOrder.lastIndexOf(color);
    if (idx === -1) return;
    removeColorAt(idx);
  }

  function selectedColorOpt() {
    return document.querySelector("#sku-grid .sku-opt.has-qty, #sku-grid .sku-opt.selected, #sku-grid-times .sku-opt.has-qty, #sku-grid-times .sku-opt.selected");
  }
  function selectedSizeOpt() {
    return document.querySelector("#size-grid .size-opt.selected");
  }

  function openSku() {
    setFunnelStep("sku");
    editingIndex = null;
    setExtraChecked(false);
    setRandomKit(false);
    resetPick();
    skuSheet.removeAttribute("hidden");
    skuOverlay.removeAttribute("hidden");
  }
  function closeSku() {
    skuSheet.setAttribute("hidden", "");
    skuOverlay.setAttribute("hidden", "");
    editingIndex = null;
    setExtraChecked(false);
    setRandomKit(false);
  }
  function syncSkuLayers() {
    if (!skuOverlay || !skuSheet) return;
    if (skuSheet.hasAttribute("hidden")) {
      skuOverlay.setAttribute("hidden", "");
    }
  }
  syncSkuLayers();

  document.getElementById("btn-open-sku").addEventListener("click", openSku);
  document.getElementById("btn-add-cart").addEventListener("click", openSku);
  document.getElementById("btn-buy-now").addEventListener("click", openSku);
  document.querySelectorAll("[data-open-sku]").forEach(function (el) {
    el.addEventListener("click", openSku);
  });

  skuOverlay.addEventListener("click", closeSku);
  document.getElementById("btn-close-sku").addEventListener("click", closeSku);

  function handleSkuGridClick(e) {
    var ex = e.target.closest(".expand-ico");
    if (ex) {
      var owner = ex.closest(".sku-opt");
      if (owner && owner.dataset.img) openLightbox(owner.dataset.img);
      return;
    }
    var badge = e.target.closest(".sku-qty-badge");
    if (badge) {
      var optB = badge.closest(".sku-opt");
      if (optB) removeOneColor(optB.dataset.color);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var opt = e.target.closest(".sku-opt");
    if (!opt) return;
    if (editingIndex !== null) {
      document.querySelectorAll("#sku-grid .sku-opt, #sku-grid-times .sku-opt").forEach(function (o) {
        o.classList.remove("selected", "has-qty");
      });
      opt.classList.add("selected", "has-qty");
      if (opt.dataset.img) document.getElementById("sku-thumb").src = opt.dataset.img;
      handleVariantPick();
      return;
    }
    addColor(opt.dataset.color);
  }
  document.getElementById("sku-grid").addEventListener("click", handleSkuGridClick);
  if (document.getElementById("sku-grid-times")) {
    document.getElementById("sku-grid-times").addEventListener("click", handleSkuGridClick);
  }

  var pickChipsEl = document.getElementById("pick-chips");
  if (pickChipsEl) {
    pickChipsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-chip]");
      if (!btn) return;
      removeColorAt(parseInt(btn.dataset.chip, 10));
    });
  }

  document.getElementById("size-grid").addEventListener("click", function () {});

  if (extraRow) {
    extraRow.addEventListener("click", function (e) {
      e.stopPropagation();
      setExtraChecked(!extraOptIn);
    });
    extraRow.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setExtraChecked(!extraOptIn);
      }
    });
    setExtraChecked(false);
  }

  if (randomKitRow) {
    randomKitRow.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setRandomKit(!randomKitOptIn);
    });
  }

  /* ---------- aviso (toast) ---------- */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  function showToast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, ms || 3500);
  }

  /* ---------- cupons ---------- */
  document.querySelectorAll(".coupon-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      /* volta para a tela do produto e mostra a regra do cupom */
      main.scrollTo({ top: 0, behavior: "smooth" });
      showToast(btn.dataset.toast || "Cupom resgatado!");
    });
  });

  /* arraste lateral dos cupons com o mouse (no toque já é nativo) */
  var coupons = document.getElementById("coupons-scroll");
  var dragging = false;
  var dragStartX = 0;
  var dragStartScroll = 0;
  var dragMoved = false;

  coupons.addEventListener("mousedown", function (e) {
    dragging = true;
    dragMoved = false;
    dragStartX = e.pageX;
    dragStartScroll = coupons.scrollLeft;
  });

  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var dx = e.pageX - dragStartX;
    if (Math.abs(dx) > 4) {
      dragMoved = true;
      coupons.classList.add("dragging");
    }
    coupons.scrollLeft = dragStartScroll - dx;
  });

  window.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    /* espera o click disparar antes de reativar os botões */
    setTimeout(function () {
      coupons.classList.remove("dragging");
    }, 0);
  });

  /* ---------- visualizador de foto ---------- */
  var lightbox = document.getElementById("lightbox");

  function openLightbox(src) {
    if (!src) return;
    document.getElementById("lightbox-img").src = src;
    lightbox.hidden = false;
  }

  lightbox.addEventListener("click", function () {
    lightbox.hidden = true;
  });

  /* fotos das avaliações (resumo + página completa) */
  function reviewImgSrc(el) {
    var img = el.tagName === "IMG" ? el : el.querySelector("img");
    return img ? img.getAttribute("src") : "";
  }
  document.addEventListener(
    "click",
    function (e) {
      var thumb = e.target.closest(".fr-thumb, .rm-thumb");
      if (!thumb) return;
      e.preventDefault();
      e.stopPropagation();
      openLightbox(reviewImgSrc(thumb));
    },
    true
  );

  /* ---------- carrinho ---------- */
  var cartPage = document.getElementById("cart-page");
  var cartItemsEl = document.getElementById("cart-items");
  /* cartItems / MAX_C já iniciados acima no sheet */
  var editingIndex = null;
  var PRICE = UNIT_PRICE;
  var OLD_PRICE = r2(109.9 / 4); /* ~27,48 por toalha */
  var LIMIT_MSG = "O valor total do pedido não pode passar de R$ 200,00.";

  function regularTowelCount() {
    if (!Array.isArray(cartItems)) return 0;
    return cartItems.reduce(function (sum, it) {
      if (it.extra) return sum;
      if (it.randomKit) return sum + it.qty * 4;
      return sum + it.qty;
    }, 0);
  }

  function extraPackCount() {
    if (!Array.isArray(cartItems)) return 0;
    return cartItems.reduce(function (sum, it) {
      return sum + (it.extra ? it.qty : 0);
    }, 0);
  }

  function orderCents() {
    var c = towelCents(regularTowelCount()) + extraPackCount() * EXTRA_CENTS;
    return Math.min(c, MAX_C);
  }

  function cartCents() {
    return orderCents();
  }

  function warnLimit() {
    showToast(LIMIT_MSG, 4500);
  }

  var COUPON_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="#FE2C55"><path d="M21 7H3a1 1 0 00-1 1v2.5a2.5 2.5 0 010 5V18a1 1 0 001 1h18a1 1 0 001-1v-2.5a2.5 2.5 0 010-5V8a1 1 0 00-1-1zm-7 3h-4v1.2h4V10zm0 2.8h-4V14h4v-1.2z"/></svg>';
  var CHEV_DOWN_SVG =
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#8a8b91" stroke-width="2" stroke-linecap="round"/></svg>';

  function moneyParts(v) {
    var parts = Number(v).toFixed(2).split(".");
    return "R$ " + parts[0] + "<i>," + parts[1] + "</i>";
  }

  function totalQty() {
    /* badge / checkout: toalhas (extra/randomKit = 4 por pacote) */
    return cartItems.reduce(function (sum, it) {
      if (it.extra || it.randomKit) return sum + it.qty * 4;
      return sum + it.qty;
    }, 0);
  }

  function cartSubtotal() {
    return r2(orderCents() / 100);
  }

  function cartDiscountReais() {
    return r2((Math.floor(regularTowelCount() / 8) * DISC_8_CENTS) / 100);
  }

  function itemHtml(item, i) {
    var variantBtn =
      item.extra || item.randomKit
        ? '<span class="cart-variant static"><span>' + item.label + "</span></span>"
        : '<button class="cart-variant" type="button" data-vi="' +
          i +
          '"><span>Cor: ' +
          item.label +
          "</span> " +
          CHEV_DOWN_SVG +
          "</button>";
    var oldRow =
      item.extra || item.randomKit
        ? ""
        : '<p class="cart-old-row"><span class="price-old">' +
          money(OLD_PRICE) +
          '</span> <span class="cart-off">-68%</span></p>';
    var title = item.extra
      ? "Mais 4 toalhas cores aleatórias..."
      : item.randomKit
        ? "Kit com 4 toalhas aleatórias..."
        : "Toalha de Banho Gigante 75×150...";
    return (
      '<div class="cart-item">' +
      '<span class="cart-check checked" aria-hidden="true"></span>' +
      '<img class="cart-item-img" src="' +
      item.img +
      '" alt="Produto" />' +
      '<div class="cart-item-info">' +
      '<p class="cart-item-title">' +
      title +
      "</p>" +
      variantBtn +
      '<div class="cart-price-row">' +
      '<span class="cart-price">' +
      moneyParts(item.price) +
      "</span>" +
      COUPON_SVG +
      '<span class="cart-qty-ctrl">' +
      '<button type="button" data-act="minus" data-i="' +
      i +
      '" aria-label="Diminuir">−</button>' +
      "<b>" +
      item.qty +
      "</b>" +
      '<button type="button" data-act="plus" data-i="' +
      i +
      '" aria-label="Aumentar">+</button>' +
      "</span></div>" +
      oldRow +
      '<p class="cart-others">Em outros 342 carrinhos</p>' +
      "</div></div>"
    );
  }

  function renderCart() {
    var count = totalQty();
    var hasItem = count > 0;
    document.getElementById("cart-count").textContent = String(count);

    document.querySelectorAll(".cart-badge").forEach(function (b) {
      b.textContent = count > 99 ? "99+" : String(count);
      b.hidden = !hasItem;
    });
    document.getElementById("cart-empty").hidden = hasItem;
    document.getElementById("cart-filled").hidden = !hasItem;
    document.getElementById("cart-footer").hidden = !hasItem;
    document.getElementById("cart-edit").hidden = !hasItem;
    if (hasItem) {
      cartItemsEl.innerHTML = cartItems.map(itemHtml).join("");
      var disc = cartDiscountReais();
      var totalTxt = money(cartSubtotal());
      if (disc > 0) totalTxt += " (−" + money(disc) + ")";
      document.getElementById("cart-total").textContent = totalTxt;
      document.getElementById("cart-checkout-count").textContent = String(count);
    } else {
      cartItemsEl.innerHTML = "";
    }
  }

  function openCart() {
    setFunnelStep("cart");
    renderCart();
    cartPage.hidden = false;
  }
  function closeCart() {
    cartPage.hidden = true;
  }

  document.querySelectorAll('[aria-label="Carrinho"]').forEach(function (btn) {
    btn.addEventListener("click", openCart);
  });

  document.getElementById("btn-close-cart").addEventListener("click", closeCart);
  document.getElementById("btn-start-shopping").addEventListener("click", closeCart);

  /* adicionar a partir do sheet de variantes */
  function addToCart(mode) {
    var n = pickTotal();
    var addRandom = !!randomKitOptIn;
    var addExtra = !!extraOptIn && extraRow && extraRow.classList.contains("checked");

    if (!addRandom && n < 1) {
      showToast("Escolha as cores ou o kit aleatório.");
      return;
    }
    var addTowels = addRandom ? 4 : n;
    if (regularTowelCount() + addTowels < MIN_TOWELS) {
      showToast("Pedido mínimo: 4 toalhas.");
      return;
    }

    var nextCents =
      towelCents(regularTowelCount() + addTowels) +
      (extraPackCount() + (addExtra ? 1 : 0)) * EXTRA_CENTS;
    if (nextCents > MAX_C) {
      if (
        addExtra &&
        towelCents(regularTowelCount() + addTowels) + extraPackCount() * EXTRA_CENTS <= MAX_C
      ) {
        addExtra = false;
        showToast("Upsell removido para não passar de R$ 200.");
      } else {
        warnLimit();
        return;
      }
    }

    if (addRandom) {
      var existingRnd = cartItems.find(function (it) {
        return it.randomKit && it.label === RANDOM_KIT_LABEL;
      });
      if (existingRnd) {
        existingRnd.qty += 1;
      } else {
        cartItems.push({
          label: RANDOM_KIT_LABEL,
          img: EXTRA_IMGS[Math.floor(Math.random() * EXTRA_IMGS.length)],
          qty: 1,
          price: KIT_PRICE,
          extra: false,
          randomKit: true,
        });
      }
    } else {
      Object.keys(colorCounts).forEach(function (color) {
        var q = colorCounts[color] || 0;
        if (q <= 0) return;
        var img = colorImg(color);
        var existing = cartItems.find(function (it) {
          return !it.extra && !it.randomKit && it.label === color;
        });
        if (existing) {
          existing.qty += q;
        } else {
          cartItems.push({
            label: color,
            img: img,
            qty: q,
            price: PRICE,
            extra: false,
            randomKit: false,
          });
        }
      });
    }

    if (addExtra) {
      var extraLabel = "Mais 4 toalhas cores aleatórias";
      var existingExtra = cartItems.find(function (it) {
        return it.extra && it.label === extraLabel;
      });
      if (existingExtra) {
        existingExtra.qty += 1;
      } else {
        cartItems.push({
          label: extraLabel,
          img: EXTRA_IMGS[Math.floor(Math.random() * EXTRA_IMGS.length)],
          qty: 1,
          price: EXTRA_PRICE,
          extra: true,
          randomKit: false,
        });
      }
    }

    closeSku();
    resetPick();
    renderCart();

    try {
      if (window.ttq && typeof window.ttq.track === "function") {
        var atcVal = r2((towelCents(addTowels) + (addExtra ? EXTRA_CENTS : 0)) / 100);
        window.ttq.track("AddToCart", {
          contents: [
            {
              content_id: addRandom ? "toalha-kit-aleatorio" : "toalha-kit-cores",
              content_type: "product",
              content_name: addRandom ? RANDOM_KIT_LABEL : "Toalhas " + n + " un.",
              quantity: addTowels,
              price: addRandom ? KIT_PRICE : PRICE,
            },
          ],
          content_type: "product",
          currency: "BRL",
          value: atcVal,
        });
        console.log("[TikTok Pixel] AddToCart R$", atcVal);
      }
    } catch (eAtc) {}

    setFunnelStep("cart");

    if (mode === "buy") {
      openCheckout();
    } else {
      showToast(addRandom ? "Kit aleatório adicionado!" : "Adicionado ao carrinho!");
    }
  }

  document.querySelectorAll(".sku-actions .btn-cart").forEach(function (btn) {
    btn.addEventListener("click", function () {
      addToCart("cart");
    });
  });
  document.querySelectorAll(".sku-actions .btn-buy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      addToCart("buy");
    });
  });

  cartItemsEl.addEventListener("click", function (e) {
    var vbtn = e.target.closest(".cart-variant");
    if (vbtn && !vbtn.classList.contains("static")) {
      openSkuForEdit(parseInt(vbtn.dataset.vi, 10));
      return;
    }

    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;

    if (!bumpCartItem(item, btn.dataset.act)) return;
    if (item.qty <= 0) cartItems.splice(i, 1);
    renderCart();
  });

  function openSkuForEdit(i) {
    var item = cartItems[i];
    if (!item) return;
    editingIndex = i;
    resetPick();
    document.querySelectorAll("#sku-grid .sku-opt, #sku-grid-times .sku-opt").forEach(function (o) {
      var on = o.dataset.color === item.label;
      o.classList.toggle("selected", on);
      o.classList.toggle("has-qty", on);
    });
    var sel = document.querySelector("#sku-grid .sku-opt.selected, #sku-grid-times .sku-opt.selected");
    if (sel && sel.dataset.img) {
      document.getElementById("sku-thumb").src = sel.dataset.img;
    }
    skuSheet.removeAttribute("hidden");
    skuOverlay.removeAttribute("hidden");
  }

  function handleVariantPick() {
    if (editingIndex === null) return;
    var item = cartItems[editingIndex];
    if (!item) {
      editingIndex = null;
      return;
    }

    var sel = document.querySelector("#sku-grid .sku-opt.selected, #sku-grid-times .sku-opt.selected");
    if (!sel) return;

    var label = sel.dataset.color;
    var img = sel.dataset.img || item.img;
    var editIdx = editingIndex;
    var otherIdx = -1;
    cartItems.forEach(function (it, idx) {
      if (idx !== editIdx && it.label === label) otherIdx = idx;
    });

    if (otherIdx !== -1) {
      cartItems[otherIdx].qty += item.qty;
      cartItems.splice(editIdx, 1);
    } else {
      item.label = label;
      item.img = img;
    }

    editingIndex = null;
    renderCart();
    closeSku();
  }

  /* ---------- checkout ---------- */
  var checkoutPage = document.getElementById("checkout-page");
  var addressPage = document.getElementById("address-page");
  var pixPage = document.getElementById("pix-page");
  var checkoutItemsEl = document.getElementById("checkout-items");
  var address = null;
  var pixTimerId = null;
  var pixSecsLeft = 0;
  var FRETE = 12.0;

  /* checkout SEMPRE simples — igual panela / imagem pedida */
  var checkoutMode = "simple";
  fetch(apiUrl("/api/checkout-mode?store=toalha"))
    .then(function (r) { return r.json(); })
    .then(function () {
      checkoutMode = "simple";
    })
    .catch(function () {
      checkoutMode = "simple";
    });

  function bumpCartItem(item, act) {
    if (act === "plus") {
      var addC;
      if (item.extra) {
        addC = EXTRA_CENTS;
      } else if (item.randomKit) {
        addC = towelCents(regularTowelCount() + 4) - towelCents(regularTowelCount());
      } else {
        addC = towelCents(regularTowelCount() + 1) - towelCents(regularTowelCount());
      }
      if (orderCents() + addC > MAX_C) {
        warnLimit();
        return false;
      }
      item.qty++;
      return true;
    }
    var removeT = item.extra ? 0 : item.randomKit ? 4 : 1;
    var remain = regularTowelCount() - removeT;
    if (!item.extra && remain > 0 && remain < MIN_TOWELS) {
      showToast("Pedido mínimo: 4 toalhas.");
      return false;
    }
    item.qty--;
    return true;
  }

  function coItemHtml(item, i) {
    var title = item.extra
      ? "Mais 4 toalhas cores aleatórias..."
      : item.randomKit
        ? "Kit com 4 toalhas aleatórias..."
        : "Toalha de Banho Gigante 75×150...";
    var variant = item.extra || item.randomKit ? item.label : "Cor: " + item.label;
    var oldRow =
      item.extra || item.randomKit
        ? ""
        : '<p class="co-item-old"><span class="price-old">' +
          money(OLD_PRICE) +
          '</span> <span class="cart-off">-68%</span></p>';
    return (
      '<div class="co-item">' +
      '<img class="co-item-img" src="' +
      item.img +
      '" alt="Produto" />' +
      '<div class="co-item-info">' +
      '<p class="co-item-title">' +
      title +
      "</p>" +
      '<p class="co-item-variant">' +
      variant +
      "</p>" +
      '<div class="co-item-price-row">' +
      '<span class="co-item-price">' +
      money(item.price) +
      "</span>" +
      COUPON_SVG +
      '<span class="cart-qty-ctrl">' +
      '<button type="button" data-act="minus" data-i="' +
      i +
      '" aria-label="Diminuir">−</button>' +
      "<b>" +
      item.qty +
      "</b>" +
      '<button type="button" data-act="plus" data-i="' +
      i +
      '" aria-label="Aumentar">+</button>' +
      "</span></div>" +
      oldRow +
      "</div></div>"
    );
  }

  function round2(v) {
    return r2(v);
  }

  function orderTotals() {
    var count = totalQty();
    var subtotal = cartSubtotal();
    var original = r2(
      cartItems.reduce(function (sum, it) {
        if (it.extra) return sum + OLD_PRICE * 4 * it.qty;
        if (it.randomKit) return sum + OLD_PRICE * 4 * it.qty;
        return sum + OLD_PRICE * it.qty;
      }, 0)
    );
    var total = subtotal;
    if (total > MAX_TICKET) total = MAX_TICKET;
    return {
      count: count,
      subtotal: subtotal,
      original: original,
      total: total,
      discount8: cartDiscountReais(),
    };
  }

  function renderCheckout() {
    var t = orderTotals();
    checkoutItemsEl.innerHTML = cartItems.map(coItemHtml).join("");

    var itemWord = t.count === 1 ? "item" : "itens";
    document.getElementById("co-total-label").textContent = "Total (" + t.count + " " + itemWord + ")";
    document.getElementById("co-total").textContent = money(t.total);

    /* resumo real do pedido */
    document.getElementById("sum-subtotal").textContent = money(t.subtotal);
    document.getElementById("sum-original").textContent = money(t.original);
    document.getElementById("sum-desconto").textContent = "- " + money(round2(t.original - t.subtotal));
    document.getElementById("sum-total").textContent = money(t.total);
  }

  var checkoutPixelFired = false;
  function openCheckout() {
    if (totalQty() === 0) return;
    if (regularTowelCount() < MIN_TOWELS) {
      showToast("Pedido mínimo: 4 toalhas. Escolha mais cores.");
      openSku();
      return;
    }
    if (!checkoutPixelFired && window.ttq && typeof window.ttq.track === "function") {
      checkoutPixelFired = true;
      try {
        var t = orderTotals();
        window.ttq.track("InitiateCheckout", {
          contents: cartItems.map(function (it, i) {
            return {
              content_id: "toalha-" + String(it.label || i).replace(/\s+/g, "-").toLowerCase(),
              content_type: "product",
              content_name: "Toalha " + (it.label || ""),
              quantity: Number(it.qty) || 1,
              price: Number(it.price) || 0,
            };
          }),
          content_type: "product",
          currency: "BRL",
          value: Number(t.total) || 0,
        });
        console.log("[TikTok Pixel] InitiateCheckout R$", t.total);
      } catch (eIc) {}
    }
    renderSimpleCheckout();
    resetSimpleCheckoutOrderUi();
    var persistedAddr = scLoadPersistedAddress();
    if (persistedAddr && scAddressComplete(persistedAddr)) {
      scApplySavedAddressUi(persistedAddr);
    } else if (scSavedBar && scSavedBar.hidden === false && scAddressComplete(address)) {
      scApplySavedAddressUi(address);
    } else if (persistedAddr) {
      scFillFormFromAddress(persistedAddr);
      scSavedBar.hidden = true;
      scFormFields.hidden = false;
      scUpdateReady();
    }
    scSelectPix();
    setFunnelStep("checkout");
    if (simplePage) simplePage.hidden = false;
    if (checkoutPage) checkoutPage.hidden = true;
  }

  document.getElementById("btn-checkout").addEventListener("click", openCheckout);
  document.getElementById("btn-close-checkout").addEventListener("click", function () {
    showExitModal(function () {
      checkoutPage.hidden = true;
    });
  });

  /* ---------- aviso ao tentar sair do checkout (segura a venda) ---------- */
  var exitModal = document.getElementById("exit-modal");
  var exitTimerEl = document.getElementById("exit-timer");
  var exitSecs = 5 * 60 + 59;
  var exitTimerId = null;
  var exitLeaveFn = null;

  function renderExitTimer() {
    var m = String(Math.floor(exitSecs / 60)).padStart(2, "0");
    var s = String(exitSecs % 60).padStart(2, "0");
    exitTimerEl.textContent = m + ":" + s;
  }

  function tickExitTimer() {
    exitSecs--;
    if (exitSecs <= 0) exitSecs = 5 * 60 + 59; /* nunca chega a 00:00 morto */
    renderExitTimer();
  }

  function showExitModal(onLeave) {
    exitLeaveFn = onLeave;
    renderExitTimer();
    if (!exitTimerId) exitTimerId = setInterval(tickExitTimer, 1000);
    exitModal.hidden = false;
  }

  document.getElementById("btn-exit-stay").addEventListener("click", function () {
    exitModal.hidden = true;
    exitLeaveFn = null;
  });

  document.getElementById("btn-exit-leave").addEventListener("click", function () {
    exitModal.hidden = true;
    if (exitLeaveFn) exitLeaveFn();
    exitLeaveFn = null;
  });

  /* stepper dos itens no checkout */
  checkoutItemsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;
    if (!bumpCartItem(item, btn.dataset.act)) return;
    if (item.qty <= 0) cartItems.splice(i, 1);
    renderCart();
    if (totalQty() === 0) {
      checkoutPage.hidden = true;
    } else {
      renderCheckout();
    }
  });

  /* forma de pagamento — promoção só no Pix */
  var payPix = document.getElementById("pay-pix");
  var payCard = document.getElementById("pay-card");

  function selectPixPay() {
    payCard.classList.remove("selected");
    payPix.classList.add("selected");
  }

  payPix.addEventListener("click", selectPixPay);

  payCard.addEventListener("click", function () {
    selectPixPay();
    showToast(
      "Esta promoção é válida apenas para pagamentos no Pix. Tente pagar com Pix crédito no seu banco e selecione a opção Pix aqui.",
      6500
    );
  });

  /* ---------- endereço ---------- */
  document.getElementById("co-address").addEventListener("click", function () {
    addressPage.hidden = false;
  });
  document.getElementById("btn-close-address").addEventListener("click", function () {
    addressPage.hidden = true;
  });

  /* busca automática pelo CEP (ViaCEP) */
  var cepInput = document.getElementById("addr-cep");
  var cepLast = "";

  function formatCep(digits) {
    if (digits.length <= 5) return digits;
    return digits.slice(0, 5) + "-" + digits.slice(5, 8);
  }

  function fillByCep(cep) {
    if (cep === cepLast) return;
    cepLast = cep;

    cepInput.classList.add("loading");
    showToast("Buscando CEP...");

    fetch("https://viacep.com.br/ws/" + cep + "/json/")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        cepInput.classList.remove("loading");
        if (data.erro) {
          showToast("CEP não encontrado. Preencha o endereço manualmente.");
          return;
        }
        document.getElementById("addr-uf").value = data.uf || "";
        document.getElementById("addr-cidade").value = data.localidade || "";
        document.getElementById("addr-bairro").value = data.bairro || "";
        document.getElementById("addr-rua").value = data.logradouro || "";
        showToast("Endereço preenchido! Complete o número.");
        document.getElementById("addr-numero").focus();
      })
      .catch(function () {
        cepInput.classList.remove("loading");
        showToast("Não foi possível buscar o CEP. Preencha manualmente.");
      });
  }

  cepInput.addEventListener("input", function () {
    var digits = cepInput.value.replace(/\D/g, "").slice(0, 8);
    cepInput.value = formatCep(digits);
    if (digits.length === 8) {
      fillByCep(digits);
    } else {
      cepLast = "";
    }
  });

  cepInput.addEventListener("blur", function () {
    var digits = cepInput.value.replace(/\D/g, "");
    if (digits.length === 8) fillByCep(digits);
  });

  /* telefone e CPF: só números, com limite e máscara */
  var foneInput = document.getElementById("addr-fone");
  var cpfInput = document.getElementById("addr-cpf");

  function formatCpf(d) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
    return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9, 11);
  }

  foneInput.addEventListener("input", function () {
    /* DDD + celular = 11 dígitos */
    foneInput.value = foneInput.value.replace(/\D/g, "").slice(0, 14);
  });

  cpfInput.addEventListener("input", function () {
    var d = cpfInput.value.replace(/\D/g, "").slice(0, 14);
    cpfInput.value = formatCpf(d);
  });

  document.getElementById("btn-save-address").addEventListener("click", function () {
    var get = function (id) {
      return document.getElementById(id).value.trim();
    };
    var nome = get("addr-nome");
    var fone = get("addr-fone");
    var cep = get("addr-cep");
    var uf = get("addr-uf");
    var cidade = get("addr-cidade");
    var bairro = get("addr-bairro");
    var rua = get("addr-rua");
    var numero = get("addr-numero");
    var cpf = get("addr-cpf");

    var email = get("addr-email") || "cliente@email.com";
    if (!nome || !fone || !cep || !uf || !cidade || !bairro || !rua || !numero) {
      showToast("Preencha todos os campos obrigatórios (CPF e e-mail opcionais).");
      return;
    }
    if (cep.replace(/\D/g, "").length !== 8) {
      showToast("CEP incompleto. Digite os 8 dígitos.");
      cepInput.focus();
      return;
    }
    var cpfDigits = cpf.replace(/\D/g, "");

    var compl = get("addr-compl");
    address = {
      nome: nome,
      fone: fone,
      email: email,
      cpf: cpfDigits,
      cep: cep,
      uf: uf,
      cidade: cidade,
      bairro: bairro,
      rua: rua,
      numero: numero,
      compl: compl,
    };
    var linha2 =
      rua + ", " + numero + (compl ? ", " + compl : "") + ", " + bairro + ", " +
      cidade + ", " + uf + ", " + cep;

    document.getElementById("co-address-text").innerHTML =
      "<b>" + nome + ", (+55)" + fone + "</b>" +
      '<span class="addr-line2">' + linha2 + "</span>";

    addressPage.hidden = true;
    showToast("Endereço salvo!");
  });

  /* ---------- checkout simples (endereço na tela, sem cliques escondidos) ---------- */
  var simplePage = document.getElementById("simple-checkout-page");
  var simpleItemsEl = document.getElementById("simple-checkout-items");
  var scSaveBtn = document.getElementById("btn-sc-save");
  var scPayPix = document.getElementById("sc-pay-pix");
  var scPayCard = document.getElementById("sc-pay-card");

  var SC_FIELDS = ["sc-nome", "sc-email", "sc-cpf", "sc-fone", "sc-cep", "sc-rua", "sc-numero", "sc-compl", "sc-bairro", "sc-cidade", "sc-uf"];
  var SC_ADDR_STORAGE_KEY = "checkout_addr_toalha";

  function scPersistAddress(addr) {
    if (!addr) return;
    try {
      sessionStorage.setItem(SC_ADDR_STORAGE_KEY, JSON.stringify(addr));
    } catch (eSt) {}
  }

  function scLoadPersistedAddress() {
    try {
      var raw = sessionStorage.getItem(SC_ADDR_STORAGE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && typeof o === "object" ? o : null;
    } catch (eLd) {
      return null;
    }
  }

  function scFillFormFromAddress(addr) {
    if (!addr) return;
    scEl("sc-nome").value = addr.nome || "";
    scEl("sc-email").value = addr.email && addr.email !== "cliente@email.com" ? addr.email : "";
    scEl("sc-cpf").value = addr.cpf ? formatCpf(String(addr.cpf).replace(/\D/g, "").slice(0, 11)) : "";
    scEl("sc-fone").value = addr.fone || "";
    scEl("sc-cep").value = addr.cep || "";
    scEl("sc-rua").value = addr.rua || "";
    scEl("sc-numero").value = addr.numero || "";
    scEl("sc-compl").value = addr.compl || "";
    scEl("sc-bairro").value = addr.bairro || "";
    scEl("sc-cidade").value = addr.cidade || "";
    scEl("sc-uf").value = addr.uf || "";
  }

  function scAddressComplete(addr) {
    if (!addr) return false;
    var req = [addr.nome, addr.fone, addr.cep, addr.rua, addr.numero, addr.bairro, addr.cidade, addr.uf];
    for (var i = 0; i < req.length; i++) {
      if (!String(req[i] || "").trim()) return false;
    }
    return String(addr.cep || "").replace(/\D/g, "").length === 8;
  }

  function scApplySavedAddressUi(addr) {
    if (!scAddressComplete(addr)) return false;
    var formFields = document.getElementById("sc-form-fields");
    var savedBar = document.getElementById("sc-saved-bar");
    address = addr;
    scFillFormFromAddress(addr);
    if (formFields) formFields.hidden = true;
    if (savedBar) savedBar.hidden = false;
    scSaveBtn.classList.add("saved");
    scSaveBtn.textContent = "Endereço salvo";
    scSaveBtn.classList.toggle("ready", true);
    return true;
  }

  function resetSimpleCheckoutOrderUi() {
    pixCreating = false;
    setScOrderLoading(false);
    if (scOrderBtn) scOrderBtn.disabled = false;
    setOrderBtnLoading(false);
    if (placeOrderBtn) placeOrderBtn.disabled = false;
  }

  function scGetAddressForOrder() {
    if (scSavedBar && !scSavedBar.hidden && scAddressComplete(address)) {
      return address;
    }
    var fromForm = scValidate();
    if (fromForm) return fromForm;
    if (scAddressComplete(address)) return address;
    return null;
  }

  function scEl(id) {
    return document.getElementById(id);
  }
  function scVal(id) {
    return scEl(id).value.trim();
  }

  function scItemHtml(item, i) {
    var title = item.extra
      ? "Mais 4 toalhas cores aleatórias"
      : item.randomKit
        ? "Kit com 4 toalhas aleatórias"
        : "Toalha de Banho Gigante 75×150cm";
    var variant = item.extra || item.randomKit ? item.label : "Cor: " + item.label;
    var oldRow =
      item.extra || item.randomKit
        ? ""
        : '<span class="sc-item-old">' + money(OLD_PRICE) + '</span> <span class="sc-item-off">-68%</span>';
    return (
      '<div class="sc-item">' +
      '<img class="sc-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="sc-item-info">' +
      '<p class="sc-item-title">' + title + ' <span class="sc-variant">(' + variant + ")</span></p>" +
      '<span class="sc-item-flash">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="#FE2C55"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>' +
      "Oferta Relâmpago</span>" +
      '<div class="sc-item-price-row">' +
      '<span class="sc-item-price">' + money(item.price) + "</span>" +
      oldRow +
      "</div>" +
      '<span class="sc-item-qty">' +
      '<button type="button" data-act="minus" data-i="' + i + '" aria-label="Diminuir">−</button>' +
      "<b>" + item.qty + "</b>" +
      '<button type="button" data-act="plus" data-i="' + i + '" aria-label="Aumentar">+</button>' +
      "</span>" +
      "</div></div>"
    );
  }

  function renderSimpleCheckout() {
    var t = orderTotals();
    simpleItemsEl.innerHTML = cartItems.map(scItemHtml).join("");
    var itemWord = t.count === 1 ? "toalha" : "toalhas";
    var label = "Total (" + t.count + " " + itemWord + ")";
    if (t.discount8 > 0) label += " · −" + money(t.discount8) + " (a cada 8)";
    document.getElementById("sc-total-label").textContent = label;
    document.getElementById("sc-total").textContent = money(t.total);
  }

  document.getElementById("btn-close-simple-checkout").addEventListener("click", function () {
    showExitModal(function () {
      simplePage.hidden = true;
      resetSimpleCheckoutOrderUi();
    });
  });

  /* stepper dos itens */
  simpleItemsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;
    if (!bumpCartItem(item, btn.dataset.act)) return;
    if (item.qty <= 0) cartItems.splice(i, 1);
    renderCart();
    if (totalQty() === 0) {
      simplePage.hidden = true;
    } else {
      renderSimpleCheckout();
    }
  });

  /* máscaras: CEP com busca automática, telefone e CPF só números */
  var scCepInput = scEl("sc-cep");
  var scCepLast = "";

  function scFillByCep(cep) {
    if (cep === scCepLast) return;
    scCepLast = cep;
    scCepInput.classList.add("loading");
    showToast("Buscando CEP...");
    fetch("https://viacep.com.br/ws/" + cep + "/json/")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        scCepInput.classList.remove("loading");
        if (data.erro) {
          showToast("CEP não encontrado. Preencha o endereço manualmente.");
          return;
        }
        scEl("sc-uf").value = data.uf || "";
        scEl("sc-cidade").value = data.localidade || "";
        scEl("sc-bairro").value = data.bairro || "";
        scEl("sc-rua").value = data.logradouro || "";
        ["sc-uf", "sc-cidade", "sc-bairro", "sc-rua"].forEach(function (id) {
          if (scVal(id)) scEl(id).classList.remove("sc-invalid");
        });
        scUpdateReady();
        showToast("Endereço preenchido! Complete o número.");
        scEl("sc-numero").focus();
      })
      .catch(function () {
        scCepInput.classList.remove("loading");
        showToast("Não foi possível buscar o CEP. Preencha manualmente.");
      });
  }

  scCepInput.addEventListener("input", function () {
    var digits = scCepInput.value.replace(/\D/g, "").slice(0, 8);
    scCepInput.value = formatCep(digits);
    if (digits.length === 8) {
      scFillByCep(digits);
    } else {
      scCepLast = "";
    }
  });

  scEl("sc-fone").addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 14);
  });

  scEl("sc-cpf").addEventListener("input", function () {
    var d = this.value.replace(/\D/g, "").slice(0, 14);
    this.value = formatCpf(d);
  });

  scEl("sc-uf").addEventListener("input", function () {
    this.value = this.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  });

  /* formulário completo (complemento, e-mail e CPF são opcionais) → botão rosa TikTok */
  function scFormReady() {
    var required = ["sc-nome", "sc-fone", "sc-cep", "sc-rua", "sc-numero", "sc-bairro", "sc-cidade", "sc-uf"];
    for (var i = 0; i < required.length; i++) {
      if (!scVal(required[i])) return false;
    }
    if (scVal("sc-cep").replace(/\D/g, "").length !== 8) return false;
    return true;
  }

  function scUpdateReady() {
    scSaveBtn.classList.toggle("ready", scFormReady());
  }

  /* tira o vermelho assim que a pessoa digita e acende o botão quando completar */
  SC_FIELDS.forEach(function (id) {
    scEl(id).addEventListener("input", function () {
      this.classList.remove("sc-invalid");
      if (scSaveBtn.classList.contains("saved")) {
        scSaveBtn.classList.remove("saved");
        scSaveBtn.textContent = "Salvar endereço";
      }
      scUpdateReady();
    });
  });

  /* valida o formulário; marca em vermelho o que faltar e retorna o endereço ou null */
  function scValidate() {
    var required = ["sc-nome", "sc-fone", "sc-cep", "sc-rua", "sc-numero", "sc-bairro", "sc-cidade", "sc-uf"];
    var firstBad = null;
    required.forEach(function (id) {
      var bad = !scVal(id);
      scEl(id).classList.toggle("sc-invalid", bad);
      if (bad && !firstBad) firstBad = scEl(id);
    });
    if (firstBad) {
      showToast("Preencha os campos marcados em vermelho.");
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      firstBad.focus();
      return null;
    }
    if (scVal("sc-cep").replace(/\D/g, "").length !== 8) {
      scEl("sc-cep").classList.add("sc-invalid");
      showToast("CEP incompleto. Digite os 8 dígitos.");
      scEl("sc-cep").focus();
      return null;
    }
    var cpfDigits = scVal("sc-cpf").replace(/\D/g, "");
    return {
      nome: scVal("sc-nome"),
      fone: scVal("sc-fone"),
      email: scVal("sc-email") || "cliente@email.com",
      cpf: cpfDigits,
      cep: scVal("sc-cep"),
      uf: scVal("sc-uf"),
      cidade: scVal("sc-cidade"),
      bairro: scVal("sc-bairro"),
      rua: scVal("sc-rua"),
      numero: scVal("sc-numero"),
      compl: scVal("sc-compl"),
    };
  }

  var scFormFields = document.getElementById("sc-form-fields");
  var scSavedBar = document.getElementById("sc-saved-bar");
  var scBody = simplePage.querySelector(".sc-body");

  scSaveBtn.addEventListener("click", function () {
    var addr = scValidate();
    if (!addr) return;
    address = addr;
    scPersistAddress(addr);
    /* o formulário some e a página sobe — fica só a barrinha de confirmação */
    scFormFields.hidden = true;
    scSavedBar.hidden = false;
    scBody.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Endereço salvo!");
  });

  document.getElementById("btn-sc-edit").addEventListener("click", function () {
    scSavedBar.hidden = true;
    scFormFields.hidden = false;
    scUpdateReady();
  });

  /* pagamento — promoção só no Pix (igual ao checkout original) */
  function scSelectPix() {
    scPayCard.classList.remove("selected");
    scPayPix.classList.add("selected");
  }
  scPayPix.addEventListener("click", scSelectPix);
  scPayCard.addEventListener("click", function () {
    scSelectPix();
    showToast(
      "Esta promoção é válida apenas para pagamentos no Pix. Tente pagar com Pix crédito no seu banco e selecione a opção Pix aqui.",
      6500
    );
  });

  /* ---------- página do código Pix (Pixzy) ---------- */
  var pixLoading = document.getElementById("pix-loading");
  var pixContent = document.getElementById("pix-content");
  var pixCopyBtn = document.getElementById("btn-copy-pix");
  var currentPixCode = "";
  var currentTxId = null;
  var pixPollId = null;

  function formatPixDeadline(date) {
    var months = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
    var h = String(date.getHours()).padStart(2, "0");
    var m = String(date.getMinutes()).padStart(2, "0");
    return (
      "Prazo " + date.getDate() + " de " + months[date.getMonth()] + " de " +
      date.getFullYear() + ", " + h + ":" + m
    );
  }

  function tickPixCountdown() {
    if (pixSecsLeft < 0) pixSecsLeft = 0;
    var h = String(Math.floor(pixSecsLeft / 3600)).padStart(2, "0");
    var m = String(Math.floor((pixSecsLeft % 3600) / 60)).padStart(2, "0");
    var s = String(pixSecsLeft % 60).padStart(2, "0");
    document.getElementById("pix-countdown").textContent = h + ":" + m + ":" + s;
    if (pixSecsLeft > 0) pixSecsLeft--;
  }

  function setPixLoading(on) {
    pixLoading.hidden = !on;
    pixContent.hidden = on;
    pixCopyBtn.disabled = on || !currentPixCode;
  }

  function stopPixPoll() {
    if (pixPollId) {
      clearInterval(pixPollId);
      pixPollId = null;
    }
  }

  function clearPixTimer() {
    if (pixTimerId) {
      clearInterval(pixTimerId);
      pixTimerId = null;
    }
  }

  function startPixPoll(txId) {
    stopPixPoll();
    currentTxId = txId;
    var pollMs = SIMULATE_MODE ? 2000 : 5000;
    var ticks = 0;
    var maxTicks = SIMULATE_MODE ? 60 : 720; /* ~1h no real */

    function tick() {
      if (String(currentTxId) !== String(txId)) return; /* poll antigo descartado */
      ticks++;
      if (ticks > maxTicks) {
        stopPixPoll();
        return;
      }
      fetch(apiUrl("/api/pix/" + encodeURIComponent(txId)))
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          if (String(currentTxId) !== String(txId)) return;
          var data = (json && json.data) || json || {};
          var st = String(data.status || "").toLowerCase();
          if (st === "paid" || st === "approved" || st === "completed") {
            stopPixPoll();
            clearPixTimer();
            setFunnelStep("paid");
            showSuccessPage();
          } else if (SIMULATE_MODE && data.simulate_pay_in_ms != null) {
            var left = Math.ceil(Number(data.simulate_pay_in_ms) / 1000);
            var ban = document.getElementById("sim-banner");
            if (ban && left >= 0) {
              ban.textContent =
                "MODO SIMULAÇÃO — pagamento automático em ~" + left + "s (não precisa pagar o Pix)";
            }
          }
        })
        .catch(function () {});
    }

    tick(); /* 1ª checagem na hora — sem janela cega de 5s */
    pixPollId = setInterval(tick, pollMs);
  }


  function readUtmParams() {
    try {
      var q = new URLSearchParams(location.search);
      var stored = {};
      try {
        stored =
          window.__ttkAttr && typeof window.__ttkAttr === "object"
            ? window.__ttkAttr
            : JSON.parse(sessionStorage.getItem(ATTR_KEY) || "{}") || {};
      } catch (eS) {}
      var ttp = (stored.ttp || "").trim();
      try {
        var m = document.cookie.match(/(?:^|;\s*)_ttp=([^;]*)/);
        if (m && m[1]) ttp = decodeURIComponent(m[1]).trim().slice(0, 200);
      } catch (eC) {}
      return {
        utm_source: (q.get("utm_source") || stored.utm_source || "").trim(),
        utm_campaign: (q.get("utm_campaign") || stored.utm_campaign || "").trim(),
        utm_medium: (q.get("utm_medium") || stored.utm_medium || "").trim(),
        utm_content: (q.get("utm_content") || stored.utm_content || "").trim(),
        ttclid: (q.get("ttclid") || stored.ttclid || "").trim(),
        ttp: ttp,
        pixel_id: (q.get("pixel") || q.get("pixel_id") || stored.pixel_id || "").trim(),
      };
    } catch (e) {
      return {
        utm_source: "",
        utm_campaign: "",
        utm_medium: "",
        utm_content: "",
        ttclid: "",
        ttp: "",
        pixel_id: "",
      };
    }
  }

  var pixCreatePromise = null;

  function getPixIdempotencyKey(cents) {
    var sk = "pix_idem_toalha_" + String(cents);
    try {
      var existing = sessionStorage.getItem(sk);
      if (existing) return existing;
      var key =
        "j-" +
        String(cents) +
        "-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(sk, key);
      return key;
    } catch (eId) {
      return "j-" + String(cents) + "-" + Date.now();
    }
  }

  function createPixCharge(total) {
    var cents = orderCents();
    if (!cents && total) cents = Math.min(Math.round(Number(total) * 100), MAX_C);
    var idemKey = getPixIdempotencyKey(cents);
    try {
      var cached = JSON.parse(sessionStorage.getItem("pix_cache_toalha") || "null");
      if (
        cached &&
        cached.br_code &&
        cached.transaction_id &&
        Number(cached.amount) === cents &&
        Date.now() - Number(cached.at || 0) < 30 * 60 * 1000
      ) {
        return Promise.resolve(cached);
      }
    } catch (eCache) {}

    if (pixCreatePromise) return pixCreatePromise;

    var utm = readUtmParams();
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var to = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (eAb) {}
    }, 55000);
    pixCreatePromise = fetch(apiUrl("/api/pix"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({
        amount: cents,
        idempotency_key: idemKey,
        origem: SIMULATE_MODE ? "simular" : "toalha-ttkshop",
        simulate: SIMULATE_MODE ? true : false,
        utm_source: utm.utm_source || (SIMULATE_MODE ? "simular" : ""),
        utm_campaign: utm.utm_campaign || (SIMULATE_MODE ? "simular" : ""),
        utm_medium: utm.utm_medium || (SIMULATE_MODE ? "simular" : ""),
        utm_content: utm.utm_content,
        ttclid: utm.ttclid || "",
        ttp: utm.ttp || "",
        /* pixel que estava rodando na página → define a "loja" da venda no admin */
        pixel_id:
          utm.pixel_id ||
          window.tikTokAttributionPixelId ||
          window.tikTokPixelId ||
          (Array.isArray(window.tikTokPixelIds) ? window.tikTokPixelIds[0] : "") ||
          "",
        client_name: address.nome,
        client_email: address.email || "cliente@email.com",
        client_doc: address.cpf,
        client_phone: address.fone,
        items: totalQty(),
        address: {
          cep: address.cep,
          uf: address.uf,
          cidade: address.cidade,
          bairro: address.bairro,
          rua: address.rua,
          numero: address.numero,
          complemento: address.compl || "",
        },
        items_detail: cartItems.map(function (it) {
          return {
            variante: it.extra
              ? "Mais 4 toalhas cores aleatórias"
              : it.randomKit
                ? "Kit 4 toalhas aleatórias"
                : "Toalha cor " + it.label,
            qtd: it.extra || it.randomKit ? it.qty * 4 : it.qty,
          };
        }),
      }, typeof window.ttkFunnelPixMeta === "function" ? window.ttkFunnelPixMeta() : {})),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) {
        return r.text().then(function (txt) {
          var json = null;
          try {
            json = txt ? JSON.parse(txt) : null;
          } catch (eParse) {
            json = null;
          }
          if (!r.ok) {
            var msg =
              (json && json.error) ||
              (r.status === 429
                ? "Muitas tentativas. Aguarde alguns segundos e tente de novo."
                : r.status === 401
                  ? "Falha de autenticação no Pix. Atualize a página e tente de novo."
                  : r.status === 422
                    ? "Confira nome e CPF e tente de novo."
                    : r.status >= 500
                      ? "Servidor indisponível. Tente de novo em instantes."
                      : "Falha ao gerar Pix");
            if (typeof msg === "string" && /invalid request|cpf|cnpj/i.test(msg)) {
              msg = "CPF inválido. Digite um CPF válido com 11 dígitos.";
            }
            /* limpa cache/idem pra próxima tentativa não repetir erro velho */
            try {
              sessionStorage.removeItem("pix_cache_toalha");
              sessionStorage.removeItem("pix_idem_toalha_" + String(cents));
            } catch (eClr) {}
            throw new Error(String(msg));
          }
          var data = (json && (json.data || json)) || {};
          try {
            sessionStorage.setItem(
              "pix_cache_toalha",
              JSON.stringify({
                br_code: data.br_code,
                transaction_id: data.transaction_id || data.id,
                tracking_code: data.tracking_code || "",
                amount: cents,
                at: Date.now(),
              })
            );
          } catch (eSet) {}
          return data;
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          throw new Error("Demorou demais para gerar o Pix. Tente de novo.");
        }
        throw err;
      })
      .finally(function () {
        clearTimeout(to);
        pixCreatePromise = null;
      });
    return pixCreatePromise;
  }

  /* mostra a tela do Pix já com o código gerado */
  function showPixPage(total, data) {
    if (!data || !data.br_code) {
      throw new Error("O Pix não foi gerado corretamente.");
    }
    var txId = data.transaction_id || data.id || null;
    if (!txId) {
      throw new Error("Pedido sem ID — tente gerar o Pix de novo.");
    }
    if (simplePage) simplePage.hidden = true;
    if (checkoutPage) checkoutPage.hidden = true;
    currentPixCode = data.br_code || "";
    currentTxId = txId;
    purchasePixelFired = false; /* nova compra nesta aba */
    stopPixPoll();

    /* guarda o resumo do pedido para a tela de pagamento confirmado */
    lastOrder = {
      tracking: data.tracking_code || "",
      txId: String(txId),
      total: round2(total),
      items: cartItems.map(function (it) {
        return {
          label: it.label,
          img: it.img,
          qty: it.qty,
          price: it.price,
          extra: it.extra,
          randomKit: it.randomKit,
        };
      }),
      address: address,
    };

    document.getElementById("pix-amount").textContent = money(total);
    document.getElementById("pix-code").textContent = currentPixCode;
    pixCopyBtn.disabled = false;

    var deadline = new Date(Date.now() + 24 * 3600 * 1000);
    document.getElementById("pix-deadline").textContent = formatPixDeadline(deadline);
    pixSecsLeft = 24 * 3600 - 1;
    tickPixCountdown();
    clearPixTimer();
    pixTimerId = setInterval(tickPixCountdown, 1000);

    setPixLoading(false);
    setFunnelStep("pix");
    pixPage.hidden = false;
    startPixPoll(currentTxId);
    setTimeout(function () {
      var code = currentPixCode || (document.getElementById("pix-code") && (document.getElementById("pix-code").value || document.getElementById("pix-code").textContent)) || "";
      if (code && code !== "—" && code !== "Gerando…") {
        function done() {
          showToast("Código Pix copiado! Abra o banco e cole.");
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(function () {
            var ta = document.createElement("textarea");
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); } catch (e) {}
            document.body.removeChild(ta);
            done();
          });
        } else {
          try {
            var ta2 = document.createElement("textarea");
            ta2.value = code;
            document.body.appendChild(ta2);
            ta2.select();
            document.execCommand("copy");
            document.body.removeChild(ta2);
            done();
          } catch (e2) {}
        }
      }
    }, 180);
  }

  document.getElementById("btn-close-pix").addEventListener("click", function () {
    pixPage.hidden = true;
    if (cartItems.length > 0 && simplePage) {
      simplePage.hidden = false;
      resetSimpleCheckoutOrderUi();
    }
    /* NÃO para o poll — se o cliente pagar com a tela fechada, ainda confirma e dispara pixel */
  });

  /* ---------- tela de pagamento confirmado (resumo + rastreio) ---------- */
  var successPage = document.getElementById("success-page");
  var lastOrder = null;

  function trackingLink() {
    var code = (lastOrder && lastOrder.tracking) || "";
    if (!code) return "/rastreio/";
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com" || h.endsWith(".onrender.com")) {
        return "/rastreio/?c=" + encodeURIComponent(code);
      }
    } catch (eH) {}
    var base = String(window.TRACKING_SITE_BASE || "https://ofertasgrandes.com").replace(/\/+$/, "");
    return base + "/rastreio/?c=" + encodeURIComponent(code);
  }

  function looksLikeEmail(e) {
    var s = String(e || "").trim().toLowerCase();
    if (!s || s === "cliente@email.com") return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function sucItemHtml(item) {
    var title = item.extra
      ? "Mais 4 toalhas cores aleatórias"
      : item.randomKit
        ? "Kit com 4 toalhas aleatórias"
        : "Toalha de Banho Gigante | 100% Algodão 75x150cm";
    var detail = item.extra || item.randomKit
      ? item.label + " · " + item.qty + " kit(s)"
      : "Cor: " + item.label + " · " + item.qty + " un.";
    return (
      '<div class="suc-item">' +
      '<img src="' + item.img + '" alt="Produto" />' +
      '<div class="suc-item-info">' +
      "<p>" + title + "</p>" +
      "<span>" + detail + "</span>" +
      "</div>" +
      '<span class="suc-item-price">' + money(item.price * item.qty) + "</span>" +
      "</div>"
    );
  }

  function renderSucEmailCard(savedEmail) {
    var card = document.getElementById("suc-email-card");
    var email = savedEmail || (lastOrder && lastOrder.address && lastOrder.address.email) || "";
    if (looksLikeEmail(email)) {
      card.innerHTML =
        '<h3 class="suc-card-title">Acompanhe por e-mail</h3>' +
        '<p class="suc-email-note">Enviamos o resumo do pedido e o código de rastreio para <b>' +
        email +
        "</b>. Verifique a caixa de entrada e também o <b>spam/lixo eletrônico</b>.</p>";
      return;
    }
    card.innerHTML =
      '<h3 class="suc-card-title">Receba o rastreio por e-mail</h3>' +
      '<p class="suc-email-note" style="margin-bottom:10px">Você não informou um e-mail. Digite abaixo para receber o resumo do pedido e o código de rastreio.</p>' +
      '<input class="suc-email-input" type="email" id="suc-email-input" placeholder="Seu melhor e-mail" autocomplete="email" />' +
      '<button class="suc-email-save" type="button" id="btn-suc-email">Salvar e receber por e-mail</button>';

    document.getElementById("btn-suc-email").addEventListener("click", function () {
      var btn = this;
      var val = document.getElementById("suc-email-input").value.trim().toLowerCase();
      if (!looksLikeEmail(val)) {
        showToast("Digite um e-mail válido para receber o rastreio.");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Salvando…";
      fetch(apiUrl("/api/order-email"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: lastOrder.tracking, email: val }),
      })
        .then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok, j: j }; });
        })
        .then(function (res) {
          if (!res.ok) {
            btn.disabled = false;
            btn.textContent = "Salvar e receber por e-mail";
            showToast(res.j.error || "Não foi possível salvar o e-mail. Tente de novo.");
            return;
          }
          if (lastOrder && lastOrder.address) lastOrder.address.email = val;
          renderSucEmailCard(val);
          showToast("E-mail salvo! Verifique a caixa de entrada e o spam em instantes.");
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "Salvar e receber por e-mail";
          showToast("Sem conexão. Tente salvar o e-mail novamente.");
        });
    });
  }

  var purchasePixelFired = false;

  /* Purchase no browser + ack pro servidor (CAPI) + retry se SDK atrasar */
  function firePurchasePixel(order, attempt) {
    attempt = attempt || 0;
    if (!order || purchasePixelFired) return;
    if (!window.ttq || typeof window.ttq.track !== "function") {
      if (attempt < 25) {
        setTimeout(function () {
          firePurchasePixel(order, attempt + 1);
        }, 300);
      } else {
        console.warn("[pixel] ttq não carregou — Purchase não disparado");
      }
      return;
    }

    function eventIdFor(name, txId, pid) {
      var base = String(txId || "");
      var id = String(pid || "0");
      if (name === "Purchase") return "paid-purchase-" + base + "-" + id;
      if (name === "PlaceAnOrder") return "paid-order-" + base + "-" + id;
      return "paid-" + base + "-" + id;
    }

    function doTrack() {
      if (purchasePixelFired) return;
      purchasePixelFired = true;
      var contents = (order.items || []).map(function (it, i) {
        return {
          content_id: "toalha-" + String(it.label || i).replace(/\s+/g, "-").toLowerCase(),
          content_type: "product",
          content_name: "Toalha " + (it.label || ""),
          quantity: Number(it.qty) || 1,
          price: Number(it.price) || 0,
        };
      });
      var value = Number(order.total) || 0;
      var payload = {
        contents: contents.length
          ? contents
          : [{ content_id: "toalha", content_type: "product", content_name: "Toalha", quantity: 1, price: value }],
        content_ids: (contents.length ? contents : [{ content_id: "toalha" }]).map(function (c) {
          return c.content_id;
        }),
        content_type: "product",
        currency: "BRL",
        value: value,
      };
      try {
        var email = order.address && order.address.email;
        var phone = order.address && (order.address.fone || order.address.phone);
        var n = Date.now() % 900000000;
        var ddds = ["11", "21", "31", "41", "51", "61", "71", "81", "85"];
        var ddd = ddds[n % ddds.length];
        window.ttq.identify({
          email:
            email && email !== "cliente@email.com"
              ? email
              : "cliente" + n + "@gmail.com",
          phone_number: phone
            ? "+55" + String(phone).replace(/\D/g, "").replace(/^55/, "")
            : "+55" + ddd + "9" + String(10000000 + (n % 89999999)).padStart(8, "0"),
        });
      } catch (eId) {}
      var ids = Array.isArray(window.tikTokPixelIds)
        ? window.tikTokPixelIds.filter(Boolean)
        : window.tikTokPixelId
          ? [window.tikTokPixelId]
          : [];
      var names = ["CompletePayment", "Purchase", "PlaceAnOrder"];
      var txId = order.txId || order.id || "";
      if (!ids.length) {
        names.forEach(function (name) {
          try {
            window.ttq.track(name, payload, { event_id: eventIdFor(name, txId, "0") });
            console.log("[TikTok Pixel] ✓", name, "R$", value);
          } catch (err) {
            console.warn("[TikTok Pixel] ✗", name, err && err.message);
          }
        });
      } else {
        ids.forEach(function (pid) {
          names.forEach(function (name) {
            try {
              var opts = { event_id: eventIdFor(name, txId, pid) };
              var inst = window.ttq.instance(pid);
              if (inst && typeof inst.track === "function") inst.track(name, payload, opts);
              else window.ttq.track(name, payload, opts);
              console.log("[TikTok Pixel] ✓", pid, name, "R$", value);
            } catch (err) {
              console.warn("[TikTok Pixel] ✗", pid, name, err && err.message);
            }
          });
        });
      }
      try {
        fetch(apiUrl("/api/pixel/purchase-ack"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: order.tracking || "",
            id: order.txId || order.id || "",
          }),
          keepalive: true,
        }).catch(function () {});
      } catch (eAck) {}
    }

    /* dispara NA HORA — não espera ttq.ready (redirect/navegação matava o evento) */
    doTrack();
    try {
      if (typeof window.ttq.ready === "function") window.ttq.ready(doTrack);
    } catch (eReady) {}
  }

  function showSuccessPage() {
    if (!lastOrder) return;

    var now = new Date();
    document.getElementById("suc-when").textContent =
      "Compra realizada em " + now.toLocaleDateString("pt-BR") + " às " +
      now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    document.getElementById("suc-track-code").textContent = lastOrder.tracking || "—";
    document.getElementById("suc-items").innerHTML = lastOrder.items.map(sucItemHtml).join("");
    document.getElementById("suc-total").textContent = money(lastOrder.total);

    var a = lastOrder.address || {};
    document.getElementById("suc-addr-name").textContent = (a.nome || "") + (a.fone ? " · (+55) " + a.fone : "");
    document.getElementById("suc-addr-lines").innerHTML =
      (a.rua || "") + ", " + (a.numero || "") + (a.compl ? ", " + a.compl : "") + "<br>" +
      (a.bairro || "") + " — " + (a.cidade || "") + "/" + (a.uf || "") + "<br>CEP " + (a.cep || "");

    renderSucEmailCard(null);

    /* Purchase real — o que aquece/converte no Ads */
    /* Purchase real — o que aquece/converte no Ads (pula no modo simulação) */
    if (!SIMULATE_MODE) firePurchasePixel(lastOrder);

    /* limpa o carrinho e fecha as telas de compra por baixo */
    cartItems.splice(0, cartItems.length);
    renderCart();
    pixPage.hidden = true;
    checkoutPage.hidden = true;
    simplePage.hidden = true;
    cartPage.hidden = true;

    successPage.hidden = false;
  }

  document.getElementById("btn-suc-track").addEventListener("click", function () {
    var url = trackingLink();
    try {
      window.location.assign(url);
    } catch (e) {
      window.location.href = url;
    }
  });

  document.getElementById("btn-suc-copy").addEventListener("click", function () {
    var link = trackingLink();
    function done() { showToast("Link de rastreio copiado!"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(function () {
        var ta = document.createElement("textarea");
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done();
      });
    } else {
      done();
    }
  });

  document.getElementById("btn-suc-back").addEventListener("click", function () {
    successPage.hidden = true;
  });

  document.getElementById("btn-pix-order").addEventListener("click", function () {
    pixPage.hidden = true;
    showToast("Pedido aguardando pagamento Pix.");
  });

  pixCopyBtn.addEventListener("click", function () {
    var code = currentPixCode || document.getElementById("pix-code").textContent;
    if (!code || code === "—" || code === "Gerando…") {
      showToast("Aguarde o código Pix ser gerado.");
      return;
    }
    function done() {
      showToast("Código Pix copiado!");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(function () {
        var ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done();
      });
    } else {
      done();
    }
  });

  /* fazer pedido — gera o Pix antes de trocar de tela (botão trava carregando ~3s) */
  var placeOrderBtn = document.getElementById("btn-place-order");
  var orderBtnLabel = placeOrderBtn.querySelector("span");
  var orderBtnSmall = placeOrderBtn.querySelector("small");
  var ORDER_MIN_WAIT = 1200;
  var pixCreating = false;

  function setOrderBtnLoading(on) {
    placeOrderBtn.disabled = on;
    placeOrderBtn.classList.toggle("is-busy", on);
    orderBtnLabel.textContent = on ? "Gerando Pix…" : "Fazer pedido";
    orderBtnSmall.style.display = on ? "none" : "";
  }

  placeOrderBtn.addEventListener("click", function (ev) {
    if (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (eEv) {}
    }
    if (placeOrderBtn.disabled || pixCreating) return;

    if (!address) {
      addressPage.hidden = false;
      showToast("Adicione seu endereço de entrega para continuar.");
      return;
    }
    if (!payPix.classList.contains("selected")) {
      selectPixPay();
      showToast(
        "Esta promoção é válida apenas para pagamentos no Pix. Selecione Pix para continuar.",
        5000
      );
      return;
    }

    var total = orderTotals().total;
    var started = Date.now();
    pixCreating = true;
    setOrderBtnLoading(true);

    function remainingWait() {
      return Math.max(0, ORDER_MIN_WAIT - (Date.now() - started));
    }

    createPixCharge(total)
      .then(function (data) {
        if (!data.br_code) {
          throw new Error("O Pix não foi gerado corretamente.");
        }
        setTimeout(function () {
          setOrderBtnLoading(false);
          pixCreating = false;
          try {
            showPixPage(total, data);
          } catch (eShow) {
            pixCreating = false;
            placeOrderBtn.disabled = false;
            showToast((eShow.message || "Não foi possível abrir o Pix.") + " Tente de novo.", 6000);
          }
        }, remainingWait());
      })
      .catch(function (err) {
        setTimeout(function () {
          pixCreating = false;
          setOrderBtnLoading(false);
          showToast(
            (err.message || "Não foi possível gerar o Pix.") + " Por favor, tente novamente.",
            6000
          );
        }, remainingWait());
      });
  });

  /* fazer pedido no checkout simples — valida o formulário na hora, sem tela extra */
  var scOrderBtn = document.getElementById("btn-sc-place-order");
  var scOrderLabel = scOrderBtn.querySelector("span");
  var scOrderSmall = scOrderBtn.querySelector("small");

  function setScOrderLoading(on) {
    scOrderBtn.disabled = on;
    scOrderBtn.classList.toggle("is-busy", on);
    scOrderLabel.textContent = on ? "Gerando Pix…" : "Fazer pedido";
    scOrderSmall.style.display = on ? "none" : "";
  }

  scOrderBtn.addEventListener("click", function (ev) {
    if (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (eEv) {}
    }
    if (scOrderBtn.disabled || pixCreating) return;

    var addr = scGetAddressForOrder();
    if (!addr) {
      if (scSavedBar && !scSavedBar.hidden) {
        scSavedBar.hidden = true;
        scFormFields.hidden = false;
        showToast("Toque em Alterar e confira o endereço completo.");
      }
      return;
    }
    address = addr;

    if (!scPayPix.classList.contains("selected")) {
      scSelectPix();
      showToast("Esta promoção é válida apenas para pagamentos no Pix. Selecione Pix para continuar.", 5000);
      return;
    }

    var total = orderTotals().total;
    var started = Date.now();
    pixCreating = true;
    setScOrderLoading(true);

    function remainingWait() {
      return Math.max(0, ORDER_MIN_WAIT - (Date.now() - started));
    }

    createPixCharge(total)
      .then(function (data) {
        if (!data.br_code) {
          throw new Error("O Pix não foi gerado corretamente.");
        }
        setTimeout(function () {
          setScOrderLoading(false);
          pixCreating = false;
          try {
            showPixPage(total, data);
          } catch (eShow) {
            pixCreating = false;
            scOrderBtn.disabled = false;
            showToast((eShow.message || "Não foi possível abrir o Pix.") + " Tente de novo.", 6000);
          }
        }, remainingWait());
      })
      .catch(function (err) {
        setTimeout(function () {
          pixCreating = false;
          setScOrderLoading(false);
          showToast(
            (err.message || "Não foi possível gerar o Pix.") + " Por favor, tente novamente.",
            6000
          );
        }, remainingWait());
      });
  });

  /* contador do cupom (01:58:00 regressivo) */
  var timerSecs = 1 * 3600 + 58 * 60;
  var timerEl = document.getElementById("order-timer");
  setInterval(function () {
    if (timerSecs > 0) timerSecs--;
    var h = String(Math.floor(timerSecs / 3600)).padStart(2, "0");
    var m = String(Math.floor((timerSecs % 3600) / 60)).padStart(2, "0");
    var s = String(timerSecs % 60).padStart(2, "0");
    timerEl.textContent = h + ":" + m + ":" + s;
  }, 1000);
})();
