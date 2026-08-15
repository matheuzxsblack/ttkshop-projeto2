(function () {
  "use strict";

  function setFunnelStep(step) {
    try {
      if (typeof window.setFunnelStep === "function") window.setFunnelStep(step);
      else window.__funnelStep = step;
    } catch (eFs) {}
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

  /* API no mesmo host (Render/local). Em front estático separado (Vercel), aponta pro Render. */
  var API_BASE = (function () {
    var renderApi = "https://ttkshop-panelas-9e6w.onrender.com";
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com" || h.endsWith(".onrender.com")) return "";
      return renderApi;
    } catch (e) {
      return renderApi;
    }
  })();
  function apiUrl(path) {
    return API_BASE + path;
  }

  function round2(v) {
    return Math.round(Number(v) * 100) / 100;
  }

  /* adicional no sheet: kit 4 toalhas da loja */
  var TOALHA_KIT_PRICE = 34.99;
  var TOALHA_KIT_OLD = 109.9;
  var TOALHA_KIT_C = 3499;
  var TOALHA_KIT_LABEL = "Kit 4 Toalhas Gigante";
  var TOALHA_KIT_IMG = "/toalha/imagens/01.png";

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var main = document.getElementById("main-scroll");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var scrollTopBtn = document.getElementById("btn-scroll-top");
  var reviewsPage = document.getElementById("reviews-page");
  var reviewsBody = document.querySelector(".reviews-body");
  var scrollTopReviews = document.getElementById("btn-scroll-top-reviews");
  var skuSheet = document.getElementById("sku-sheet");
  var skuOverlay = document.getElementById("sku-overlay");
  var qtyEl = document.getElementById("qty-val");
  var qty = 1;
  var suppressSpy = false;

  /* ---------- galeria: contador 1/8 ---------- */
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
    recomendacoes: document.getElementById("section-recomendacoes"),
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
  }

  document.getElementById("btn-all-reviews").addEventListener("click", openReviews);
  document.querySelectorAll("[data-open-reviews]").forEach(function (el) {
    el.addEventListener("click", openReviews);
  });

  document.getElementById("btn-close-reviews").addEventListener("click", function () {
    reviewsPage.hidden = true;
  });

  reviewsBody.addEventListener("scroll", function () {
    scrollTopReviews.classList.toggle("visible", reviewsBody.scrollTop > 500);
  });

  scrollTopReviews.addEventListener("click", function () {
    reviewsBody.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------- sheet de compra (Cor da Caixa) ---------- */
  var sizeHint = document.getElementById("size-hint");
  var extraRow = document.getElementById("extra-row");
  var extraOptIn = false;
  var corCaixaLabel = document.getElementById("cor-caixa-label");
  var skuSelectedName = document.getElementById("sku-selected-name");
  var skuPriceInt = document.getElementById("sku-price-int");
  var skuPriceCents = document.getElementById("sku-price-cents");
  var skuPriceOld = document.getElementById("sku-price-old");
  var skuPriceOff = document.getElementById("sku-price-off");
  var optionsLabel = document.getElementById("options-label");

  function selectedColorOpt() {
    return document.querySelector("#sku-grid .sku-opt.selected");
  }
  function selectedSizeOpt() {
    return document.querySelector("#size-grid .size-opt.selected");
  }

  function setExtraChecked(on) {
    extraOptIn = !!on;
    if (!extraRow) return;
    extraRow.classList.toggle("checked", extraOptIn);
    extraRow.setAttribute("aria-checked", extraOptIn ? "true" : "false");
    syncSkuPriceUi(selectedColorOpt());
  }

  function syncSkuPriceUi(opt) {
    opt = opt || selectedColorOpt();
    if (!opt) return;
    var price = Number(opt.dataset.price) || 26.96;
    if (extraOptIn) price = round2(price + TOALHA_KIT_PRICE);
    var old = Number(opt.dataset.old) || 74.9;
    if (extraOptIn) old = round2(old + TOALHA_KIT_OLD);
    var off = String(opt.dataset.off || "57");
    var color = opt.dataset.color || "kit com 8 unidades";
    var parts = price.toFixed(2).split(".");
    if (skuPriceInt) skuPriceInt.textContent = parts[0];
    if (skuPriceCents) skuPriceCents.textContent = "," + parts[1];
    if (skuPriceOld) skuPriceOld.textContent = "R$ " + old.toFixed(2).replace(".", ",");
    if (skuPriceOff) skuPriceOff.textContent = "-" + off + "%";
    if (skuSelectedName) skuSelectedName.textContent = color;
    if (corCaixaLabel) corCaixaLabel.textContent = color;
    if (optionsLabel) optionsLabel.textContent = color;
    if (opt.dataset.img) {
      var thumb = document.getElementById("sku-thumb");
      if (thumb) thumb.src = opt.dataset.img;
    }
  }

  function openSku() {
    setFunnelStep("sku");
    qty = 1;
    if (qtyEl) qtyEl.textContent = "1";
    setExtraChecked(false);
    syncSkuPriceUi(selectedColorOpt());
    skuOverlay.hidden = false;
    skuSheet.hidden = false;
  }
  function closeSku() {
    skuOverlay.hidden = true;
    skuSheet.hidden = true;
    editingIndex = null;
    setExtraChecked(false);
  }

  document.getElementById("btn-open-sku").addEventListener("click", openSku);
  document.getElementById("btn-add-cart").addEventListener("click", openSku);
  document.getElementById("btn-buy-now").addEventListener("click", openSku);
  document.querySelectorAll("[data-open-sku]").forEach(function (el) {
    el.addEventListener("click", openSku);
  });

  skuOverlay.addEventListener("click", closeSku);
  document.getElementById("btn-close-sku").addEventListener("click", closeSku);

  document.getElementById("sku-grid").addEventListener("click", function (e) {
    var opt = e.target.closest(".sku-opt");
    if (!opt) return;
    this.querySelectorAll(".sku-opt").forEach(function (o) {
      o.classList.remove("selected", "selected2");
    });
    opt.classList.add("selected");
    syncSkuPriceUi(opt);
    handleVariantPick();
  });

  var sizeGridEl = document.getElementById("size-grid");
  if (sizeGridEl) {
    sizeGridEl.addEventListener("click", function (e) {
      var opt = e.target.closest(".size-opt");
      if (!opt) return;
      this.querySelectorAll(".size-opt").forEach(function (o) {
        o.classList.remove("selected");
      });
      opt.classList.add("selected");
      if (sizeHint) sizeHint.textContent = opt.dataset.size;
      handleVariantPick();
    });
  }

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
  }

  setExtraChecked(false);
  syncSkuPriceUi(selectedColorOpt());

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
    document.getElementById("lightbox-img").src = src;
    lightbox.hidden = false;
  }

  lightbox.addEventListener("click", function () {
    lightbox.hidden = true;
  });

  /* ---------- avaliações 100+ + clique nas fotos ---------- */
  (function initReviews() {
    var names = ["m**a","c**a s**","j**n","l**i","r**a","a**e","p**o","f**a","t**i","v**r","b**a","g**i","n**o","s**a","d**s","h**a","k**e","w**n","y**a","z**o","u**i","q**a","e**r","i**s","o**a","x**e"];
    var texts = [
      "Chegou rápido, embalado com cuidado. Produto consagrado e com o melhor preço da internet.",
      "Produto bem embalado, chegou rápido, recomendo e vou comprar novamente.",
      "Caixa linda, fragrâncias bem fortes e agradáveis. Super indico!",
      "Vieram todas as cores/cheiros. Lavanda e Odor de Rosas são minhas favoritas.",
      "Base vegetal, limpa bem sem ressecar. Minha família toda usa agora.",
      "Cheiro dura o dia todo. Compensa muito pelo kit com 16 unidades.",
      "Comprei no impulso e não me arrependi. Entrega rápida e produto de qualidade.",
      "Gostei bastante, Patchouly é bem marcado. As outras fragrâncias são ótimas.",
      "Perfeito pro banho diário. Espuma boa e hidrata. Recomendo demais.",
      "Comprei 2 kits: um pra casa e um de presente. Todo mundo pediu o link.",
      "Embalagem perfeita pra presentear. Chegou lacrado.",
      "Melhor custo-benefício que achei. Já é a segunda compra.",
      "Não resseca a pele, aroma clássico. Amei.",
      "Kit completo com 16 sabonetes. Vale cada centavo.",
      "Entrega antes do prazo. Produto original.",
      "Usei no banho e a pele ficou macia. Indico!",
      "Caixa amarela linda. Presenteei minha mãe e ela adorou.",
      "Fragrâncias icônicas. Qualidade Phebo de verdade.",
      "Comprei a caixa VINHO também. As duas são ótimas.",
      "Espuma cremosa e cheiro marcante. Nota 10."
    ];
    var days = ["Há 1d","Há 2d","Há 3d","Há 4d","Há 5d","Há 6d","Há 7d","Há 8d","Há 10d","Há 12d","Há 2 sem"];
    /* fotos únicas — sem repetir a mesma imagem nas avaliações */
    var reviewPhotos = [
      "images/rev-1.png",
      "images/rev-2.png",
      "images/rev-3.png",
      "images/rev-4.png",
      "images/rev-5.png",
      "images/rev-6.png",
      "images/rev-7.png",
      "images/rev-8.png",
      "images/rev-9.png",
      "images/rev-10.png",
    ];
    var list = document.getElementById("reviews-list");
    if (!list) return;
    var total = 112;
    var withImg = reviewPhotos.length;
    var html = "";
    var likeSvg = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M7 10.5V20H4a1 1 0 01-1-1v-7.5a1 1 0 011-1h3zm0 0l4.2-6.8a1.8 1.8 0 013.3 1V9h4.3a1.6 1.6 0 011.6 2l-1.8 7.6a1.6 1.6 0 01-1.6 1.3H7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.querySelectorAll("#reviews-page .rf-chip, #reviews-page .filter-chip").forEach(function (chip) {
      if (/Inclui imagens/i.test(chip.textContent || "")) {
        chip.textContent = "Inclui imagens ou vídeos (" + withImg + ")";
      }
    });
    for (var i = 0; i < total; i++) {
      var stars = i % 17 === 0 ? "★★★★" : "★★★★★";
      var starHtml = i % 17 === 0 ? '★★★★<i class="star-off">★</i>' : "★★★★★";
      var name = names[i % names.length];
      var text = texts[i % texts.length];
      var av = "images/av-" + ((i % 8) + 1) + ".png";
      var day = days[i % days.length];
      var likes = (i % 7) + 1;
      var media = "";
      if (i < withImg) {
        var src = reviewPhotos[i];
        media =
          '<div class="fr-media">' +
          '<button type="button" class="fr-thumb rev-photo" data-src="' + src + '" aria-label="Ampliar foto da avaliação">' +
          '<img src="' + src + '" alt="Foto da avaliação" />' +
          "</button></div>";
      }
      html +=
        '<article class="full-review">' +
        '<div class="fr-user"><img class="avatar lg" src="' + av + '" alt="" /><b>' + name + "</b></div>" +
        '<div class="fr-meta"><span class="stars md">' + starHtml + '</span><span class="variant">• Kit 16 un., 90g</span></div>' +
        '<div class="fr-text"><p>' + text + "</p></div>" +
        media +
        '<div class="fr-footer"><span>' + day + '</span><span class="fr-actions">' +
        '<button type="button" aria-label="Mais">⋯</button>' +
        '<button type="button" class="like-btn" aria-label="Curtir">' + likeSvg + " " + likes + "</button>" +
        "</span></div></article>";
    }
    list.innerHTML = html;
  })();

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target.closest(".rev-photo, .fr-thumb, .rm-thumb");
      if (!btn) return;
      var src = btn.getAttribute("data-src");
      if (!src) {
        var img = btn.querySelector("img");
        src = img ? img.getAttribute("src") : "";
      }
      if (!src) return;
      e.preventDefault();
      e.stopPropagation();
      openLightbox(src);
    },
    true
  );


  /* ---------- carrinho ---------- */
  var cartPage = document.getElementById("cart-page");
  var cartItemsEl = document.getElementById("cart-items");
  var cartItems = []; /* { label, img, qty, price, extra } */
  var editingIndex = null; /* item do carrinho em troca de variante */
  var BOX_PRICE = 26.96; /* kit com 8 unidades */
  var BOX_OLD = 74.9;
  var COMBO_PRICE = 35.32; /* kit com 16 unidades */
  var COMBO_OLD = 139.8;
  var PRICE = BOX_PRICE;
  var OLD_PRICE = BOX_OLD;
  var EXTRA_PRICE = COMBO_PRICE;
  var EXTRA_QTY = 16;
  var EXTRA_IMGS = [
    "images/01.png", "images/02.png", "images/03.png", "images/04.png",
    "images/05.png", "images/06.png", "images/07.png", "images/08.png",
  ];
  /* limite do ticket na Pixzy: o pedido inteiro não pode passar de R$ 200 */
  var MAX_TICKET = 200;
  var LIMIT_MSG = "O valor total do pedido não pode passar de R$ 200,00.";
  var PRICE_C = Math.round(BOX_PRICE * 100);
  var EXTRA_C = Math.round(COMBO_PRICE * 100);
  var BOX_C = PRICE_C;
  var COMBO_C = EXTRA_C;
  var MAX_C = MAX_TICKET * 100;

  function cartCents() {
    return Math.round(cartSubtotal() * 100);
  }

  function warnLimit() {
    showToast(LIMIT_MSG, 4500);
  }

  
  /* ---------- upsell no carrinho (16 unidades) ---------- */
  var cartUpsell = document.getElementById("cart-upsell");
  var cartUpsellBtn = document.getElementById("cart-upsell-btn");

  function syncCartUpsellUi() {
    if (!cartUpsell) return;
    var filled = cartItems.some(function (it) { return !it.extra; });
    cartUpsell.hidden = !filled;
    var on = hasUpsellInCart();
    cartUpsell.classList.toggle("checked", on);
    cartUpsell.setAttribute("aria-checked", on ? "true" : "false");
    if (cartUpsellBtn) {
      cartUpsellBtn.textContent = on ? "Remover oferta" : "Sim, quero aproveitar";
    }
  }

  function toggleCartUpsell() {
    if (hasUpsellInCart()) {
      cartItems = cartItems.filter(function (it) { return !it.extra && !it.combo; });
      setExtraChecked(false);
      renderCart();
      syncCartUpsellUi();
      showToast("Kit com 16 unidades removido.");
      return;
    }
    if (cartCents() + COMBO_C > MAX_C) {
      warnLimit();
      return;
    }
    cartItems.push({
      label: "kit com 16 unidades",
      img: "images/01.png",
      qty: 1,
      price: COMBO_PRICE,
      oldPrice: COMBO_OLD,
      soapPerKit: 16,
      combo: true,
      extra: true,
    });
    setExtraChecked(true);
    renderCart();
    syncCartUpsellUi();
    showToast("Kit com 16 unidades adicionado!");
  }

  if (cartUpsell) {
    cartUpsell.addEventListener("click", function (e) {
      if (e.target && e.target.id === "cart-upsell-btn") return;
      toggleCartUpsell();
    });
  }
  if (cartUpsellBtn) {
    cartUpsellBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleCartUpsell();
    });
  }

  /* ---------- quantidade (sheet) ---------- */
  document.getElementById("qty-minus").addEventListener("click", function () {
    if (qty > 1) qtyEl.textContent = String(--qty);
  });
  document.getElementById("qty-plus").addEventListener("click", function () {
    var sel = selectedColorOpt();
    var unitC = sel ? Math.round(Number(sel.dataset.price) * 100) : BOX_C;
    var prospective = cartCents() + (qty + 1) * unitC;
    if (prospective > MAX_C) {
      warnLimit();
      return;
    }
    qtyEl.textContent = String(++qty);
  });

  var COUPON_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="#FE2C55"><path d="M21 7H3a1 1 0 00-1 1v2.5a2.5 2.5 0 010 5V18a1 1 0 001 1h18a1 1 0 001-1v-2.5a2.5 2.5 0 010-5V8a1 1 0 00-1-1zm-7 3h-4v1.2h4V10zm0 2.8h-4V14h4v-1.2z"/></svg>';
  var CHEV_DOWN_SVG =
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#8a8b91" stroke-width="2" stroke-linecap="round"/></svg>';

  function money(v) {
    return "R$ " + v.toFixed(2).replace(".", ",");
  }

  function moneyParts(v) {
    var parts = v.toFixed(2).split(".");
    return "R$ " + parts[0] + "<i>," + parts[1] + "</i>";
  }

  function totalQty() {
    return cartItems.reduce(function (sum, it) {
      return sum + it.qty;
    }, 0);
  }

  function cartSubtotal() {
    return round2(
      cartItems.reduce(function (sum, it) {
        return sum + it.price * it.qty;
      }, 0)
    );
  }

  function itemHtml(item, i) {
    var isToalha = !!item.toalha;
    var variantBtn =
      item.extra || isToalha
        ? '<span class="cart-variant static"><span>' + escHtml(item.label) + "</span></span>"
        : '<button class="cart-variant" type="button" data-vi="' +
          i +
          '"><span>' +
          escHtml(item.label) +
          "</span> " +
          CHEV_DOWN_SVG +
          "</button>";
    var oldRow =
      item.extra && !isToalha
        ? ""
        : '<p class="cart-old-row"><span class="price-old">' +
          money(item.oldPrice || (isToalha ? TOALHA_KIT_OLD : OLD_PRICE)) +
          '</span> <span class="cart-off">-' +
          (item.combo ? "58" : isToalha ? "61" : "57") +
          "%</span></p>";
    var title = isToalha ? "Kit Toalhas Gigante — 4 unidades" : "Kit Sabonete Granado";
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

    /* bolinha nos ícones de carrinho */
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
      document.getElementById("cart-total").textContent = money(cartSubtotal());
      document.getElementById("cart-checkout-count").textContent = String(count);
    } else {
      cartItemsEl.innerHTML = "";
    }
    try { syncCartUpsellUi(); } catch (eSu) {}
  }

  function openCart() {
    setFunnelStep("cart");
    renderCart();
    cartPage.hidden = false;
  }
  function closeCart() {
    cartPage.hidden = true;
  }

  /* ícones de carrinho (topo e página de avaliações) */
  document.querySelectorAll('[aria-label="Carrinho"]').forEach(function (btn) {
    btn.addEventListener("click", openCart);
  });

  document.getElementById("btn-close-cart").addEventListener("click", closeCart);
  document.getElementById("btn-start-shopping").addEventListener("click", closeCart);

  function variantLabel(colorOpt, sizeOpt) {
    return colorOpt.dataset.color + ", " + sizeOpt.dataset.size;
  }

  function upsellLabel() {
    return "kit com 16 unidades";
  }

  function regularSoapCount() {
    return cartItems.reduce(function (sum, it) {
      return sum + (it.extra ? 0 : it.qty);
    }, 0);
  }

  function hasUpsellInCart() {
    return cartItems.some(function (it) {
      return (it.extra || it.combo) && !it.toalha;
    });
  }

  function hasToalhaInCart() {
    return cartItems.some(function (it) {
      return !!it.toalha;
    });
  }

  function totalSoapUnits() {
    return cartItems.reduce(function (sum, it) {
      if (it.toalha) return sum;
      var per = it.soapPerKit || (it.combo || it.extra ? 16 : 8);
      return sum + it.qty * per;
    }, 0);
  }

  /* adicionar a partir do sheet de variantes */
  function addToCart(mode) {
    var sel = selectedColorOpt();
    if (!sel) {
      showToast("Selecione o kit para continuar.");
      return;
    }

    var unitPrice = Number(sel.dataset.price) || BOX_PRICE;
    var unitOld = Number(sel.dataset.old) || BOX_OLD;
    var unitC = Math.round(unitPrice * 100);
    var soapPer = Math.max(1, parseInt(sel.dataset.soap, 10) || 8);
    var isCombo = sel.dataset.combo === "1";
    var addToalha = !!extraOptIn;
    var budgetC = MAX_C - cartCents();
    var addQty = qty;

    if (addQty * unitC + (addToalha ? TOALHA_KIT_C : 0) > budgetC) {
      addQty = Math.floor((budgetC - (addToalha ? TOALHA_KIT_C : 0)) / unitC);
      if (addQty < 1 && addToalha) {
        addToalha = false;
        addQty = Math.floor(budgetC / unitC);
      }
      if (addQty < 1) {
        warnLimit();
        return;
      }
      warnLimit();
    }

    var label = sel.dataset.color || "kit com 8 unidades";
    var img = sel.dataset.img || "images/08.png";

    var existing = cartItems.find(function (it) {
      return !it.toalha && it.label === label && !!it.combo === isCombo;
    });
    if (existing) {
      existing.qty += addQty;
    } else {
      cartItems.push({
        label: label,
        img: img,
        qty: addQty,
        price: unitPrice,
        oldPrice: unitOld,
        soapPerKit: soapPer,
        combo: isCombo,
        extra: isCombo,
      });
    }

    if (addToalha) {
      var existingToalha = cartItems.find(function (it) {
        return !!it.toalha;
      });
      if (existingToalha) {
        existingToalha.qty += 1;
      } else {
        cartItems.push({
          label: TOALHA_KIT_LABEL,
          img: TOALHA_KIT_IMG,
          qty: 1,
          price: TOALHA_KIT_PRICE,
          oldPrice: TOALHA_KIT_OLD,
          soapPerKit: 0,
          toalha: true,
          combo: false,
          extra: false,
        });
      }
    }

    closeSku();
    renderCart();

    try {
      if (window.ttq && typeof window.ttq.track === "function") {
        var atcVal = round2(addQty * unitPrice + (addToalha ? TOALHA_KIT_PRICE : 0));
        window.ttq.track("AddToCart", {
          contents: [
            {
              content_id: "sabonete-" + String(label || "item").replace(/\s+/g, "-").toLowerCase(),
              content_type: "product",
              content_name: String(label || "kit sabonete"),
              quantity: addQty,
              price: unitPrice,
            },
          ],
          content_type: "product",
          currency: "BRL",
          value: atcVal,
        });
      }
    } catch (eAtc) {}

    setFunnelStep("cart");

    if (mode === "buy") {
      openCheckout();
    } else {
      showToast(addToalha ? "Sabonete + kit de toalhas no carrinho!" : "Adicionado ao carrinho!");
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

  /* cliques nos itens do carrinho (delegação) */
  cartItemsEl.addEventListener("click", function (e) {
    /* chip da variante: abre o seletor para trocar */
    var vbtn = e.target.closest(".cart-variant");
    if (vbtn && !vbtn.classList.contains("static")) {
      openSkuForEdit(parseInt(vbtn.dataset.vi, 10));
      return;
    }

    /* + / − de quantidade */
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;

    if (btn.dataset.act === "plus") {
      if (cartCents() + Math.round(item.price * 100) > MAX_C) {
        warnLimit();
        return;
      }
      item.qty++;
    } else {
      item.qty--;
      if (item.qty <= 0) cartItems.splice(i, 1);
    }
    renderCart();
  });

  /* abre o sheet para trocar a variante de um item do carrinho */
  function openSkuForEdit(i) {
    var item = cartItems[i];
    if (!item) return;
    editingIndex = i;
    setExtraChecked(false);

    var color = item.label || "";
    document.querySelectorAll("#sku-grid .sku-opt").forEach(function (o) {
      o.classList.toggle("selected", o.dataset.color === color);
      o.classList.remove("selected2");
    });
    syncSkuPriceUi(selectedColorOpt());

    skuOverlay.hidden = false;
    skuSheet.hidden = false;
  }

  /* aplica a variante escolhida ao item em edição */
  function handleVariantPick() {
    if (editingIndex === null) return;
    var item = cartItems[editingIndex];
    if (!item) {
      editingIndex = null;
      return;
    }

    var sel = selectedColorOpt();
    if (!sel) return;

    var label = sel.dataset.color || item.label;
    var img = sel.dataset.img || item.img;
    var isCombo = sel.dataset.combo === "1";
    var unitPrice = Number(sel.dataset.price) || BOX_PRICE;
    var unitOld = Number(sel.dataset.old) || BOX_OLD;
    var soapPer = Math.max(1, parseInt(sel.dataset.soap, 10) || 16);

    var editIdx = editingIndex;
    var otherIdx = -1;
    cartItems.forEach(function (it, idx) {
      if (idx !== editIdx && it.label === label && !!it.combo === isCombo) otherIdx = idx;
    });

    if (otherIdx !== -1) {
      cartItems[otherIdx].qty += item.qty;
      cartItems.splice(editIdx, 1);
    } else {
      item.label = label;
      item.img = img;
      item.price = unitPrice;
      item.oldPrice = unitOld;
      item.soapPerKit = soapPer;
      item.combo = isCombo;
      item.extra = isCombo;
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
  fetch(apiUrl("/api/checkout-mode?store=sabonete"))
    .then(function (r) { return r.json(); })
    .then(function () {
      checkoutMode = "simple";
    })
    .catch(function () {
      checkoutMode = "simple";
    });

  function coItemHtml(item, i) {
    var isToalha = !!item.toalha;
    var oldRow =
      item.extra && !isToalha
        ? ""
        : '<p class="co-item-old"><span class="price-old">' +
          money(item.oldPrice || (isToalha ? TOALHA_KIT_OLD : OLD_PRICE)) +
          '</span> <span class="cart-off">-' +
          (item.combo ? "58" : isToalha ? "61" : "57") +
          "%</span></p>";
    var title = isToalha
      ? "Kit Toalhas Gigante"
      : item.extra
        ? "kit com 16 unidades"
        : "kit com 8 unidades";
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
      escHtml(item.label) +
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

  function orderTotals() {
    var count = totalQty();
    var subtotal = cartSubtotal();
    var original = round2(
      cartItems.reduce(function (sum, it) {
        var unitOld =
          it.oldPrice != null
            ? it.oldPrice
            : it.toalha
              ? TOALHA_KIT_OLD
              : it.extra || it.combo
                ? COMBO_OLD
                : OLD_PRICE;
        return sum + unitOld * it.qty;
      }, 0)
    );
    var total = subtotal;
    if (total > MAX_TICKET) total = MAX_TICKET;
    return { count: count, subtotal: subtotal, original: original, total: total };
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
    if (!checkoutPixelFired && window.ttq && typeof window.ttq.track === "function") {
      checkoutPixelFired = true;
      try {
        var t = orderTotals();
        window.ttq.track("InitiateCheckout", {
          contents: cartItems.map(function (it, i) {
            return {
              content_id: "sabonete-" + String(it.label || i).replace(/\s+/g, "-").toLowerCase(),
              content_type: "product",
              content_name: it.extra ? "Upsell: 16 sabonetes" : "Sabonete " + (it.label || ""),
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

    if (btn.dataset.act === "plus") {
      if (cartCents() + Math.round(item.price * 100) > MAX_C) {
        warnLimit();
        return;
      }
      item.qty++;
    } else {
      item.qty--;
      if (item.qty <= 0) cartItems.splice(i, 1);
    }
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
    foneInput.value = foneInput.value.replace(/\D/g, "").slice(0, 11);
  });

  cpfInput.addEventListener("input", function () {
    var d = cpfInput.value.replace(/\D/g, "").slice(0, 11);
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

    var emailRaw = normalizeClientEmail(get("addr-email"));
    var email = looksLikeEmail(emailRaw) ? emailRaw : "cliente@email.com";
    if (!nome || !fone || !cep || !uf || !cidade || !bairro || !rua || !numero) {
      showToast("Preencha todos os campos obrigatórios (e-mail é opcional).");
      return;
    }

    if (fone.replace(/\D/g, "").length < 10) {
      showToast("Telefone incompleto. Digite o DDD + número (10 ou 11 dígitos).");
      foneInput.focus();
      return;
    }
    if (cep.replace(/\D/g, "").length !== 8) {
      showToast("CEP incompleto. Digite os 8 dígitos.");
      cepInput.focus();
      return;
    }
    var cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      showToast("Informe um CPF válido com 11 dígitos.");
      cpfInput.focus();
      return;
    }
    if (!isValidCpfClient(cpfDigits)) {
      showToast("CPF inválido. Confira os dígitos.");
      cpfInput.focus();
      return;
    }

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
      "<b>" + escHtml(nome) + ", (+55)" + escHtml(fone) + "</b>" +
      '<span class="addr-line2">' + escHtml(linha2) + "</span>";

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

  function scEl(id) {
    return document.getElementById(id);
  }
  function scVal(id) {
    return scEl(id).value.trim();
  }

  function isValidCpfClient(digits) {
    var s = String(digits || "").replace(/\D/g, "");
    if (s.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(s)) return false;
    var i, sum, rev;
    sum = 0;
    for (i = 0; i < 9; i++) sum += parseInt(s.charAt(i), 10) * (10 - i);
    rev = 11 - (sum % 11);
    if (rev >= 10) rev = 0;
    if (rev !== parseInt(s.charAt(9), 10)) return false;
    sum = 0;
    for (i = 0; i < 10; i++) sum += parseInt(s.charAt(i), 10) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev >= 10) rev = 0;
    return rev === parseInt(s.charAt(10), 10);
  }

  function scItemHtml(item, i) {
    var isToalha = !!item.toalha;
    var title = isToalha
      ? "Kit 4 Toalhas Gigante"
      : item.extra
        ? "kit com 16 unidades"
        : "kit com 8 unidades";
    var oldRow =
      item.extra && !isToalha
        ? ""
        : '<span class="sc-item-old">' +
          money(item.oldPrice || (isToalha ? TOALHA_KIT_OLD : OLD_PRICE)) +
          '</span> <span class="sc-item-off">-' +
          (item.combo ? "58" : isToalha ? "61" : "57") +
          "%</span>";
    return (
      '<div class="sc-item">' +
      '<img class="sc-item-img" src="' +
      item.img +
      '" alt="Produto" />' +
      '<div class="sc-item-info">' +
      '<p class="sc-item-title">' +
      title +
      ' <span class="sc-variant">(' +
      escHtml(item.label) +
      ")</span></p>" +
      '<span class="sc-item-flash">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="#FE2C55"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>' +
      "Oferta Relâmpago</span>" +
      '<div class="sc-item-price-row">' +
      '<span class="sc-item-price">' +
      money(item.price) +
      "</span>" +
      oldRow +
      "</div>" +
      '<span class="sc-item-qty">' +
      '<button type="button" data-act="minus" data-i="' +
      i +
      '" aria-label="Diminuir">−</button>' +
      "<b>" +
      item.qty +
      "</b>" +
      '<button type="button" data-act="plus" data-i="' +
      i +
      '" aria-label="Aumentar">+</button>' +
      "</span>" +
      "</div></div>"
    );
  }

  function renderSimpleCheckout() {
    var t = orderTotals();
    simpleItemsEl.innerHTML = cartItems.map(scItemHtml).join("");
    var itemWord = t.count === 1 ? "item" : "itens";
    document.getElementById("sc-total-label").textContent = "Total (" + t.count + " " + itemWord + ")";
    document.getElementById("sc-total").textContent = money(t.total);
  }

  document.getElementById("btn-close-simple-checkout").addEventListener("click", function () {
    showExitModal(function () {
      simplePage.hidden = true;
    });
  });

  /* stepper dos itens */
  simpleItemsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;
    if (btn.dataset.act === "plus") {
      if (cartCents() + Math.round(item.price * 100) > MAX_C) {
        warnLimit();
        return;
      }
      item.qty++;
    } else {
      item.qty--;
      if (item.qty <= 0) cartItems.splice(i, 1);
    }
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
    this.value = this.value.replace(/\D/g, "").slice(0, 11);
  });

  scEl("sc-cpf").addEventListener("input", function () {
    var d = this.value.replace(/\D/g, "").slice(0, 11);
    this.value = formatCpf(d);
  });

  scEl("sc-uf").addEventListener("input", function () {
    this.value = this.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  });

  /* formulário completo (complemento e e-mail opcionais; CPF obrigatório) */
  function scFormReady() {
    var required = ["sc-nome", "sc-fone", "sc-cep", "sc-rua", "sc-numero", "sc-bairro", "sc-cidade", "sc-uf"];
    for (var i = 0; i < required.length; i++) {
      if (!scVal(required[i])) return false;
    }
    if (scVal("sc-fone").replace(/\D/g, "").length < 10) return false;
    if (scVal("sc-cep").replace(/\D/g, "").length !== 8) return false;
    var cpfDig = scVal("sc-cpf").replace(/\D/g, "");
    if (cpfDig.length !== 11 || !isValidCpfClient(cpfDig)) return false;
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
    scEl("sc-cpf").classList.remove("sc-invalid");
    if (firstBad) {
      showToast("Preencha os campos marcados em vermelho.");
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      firstBad.focus();
      return null;
    }
    if (scVal("sc-fone").replace(/\D/g, "").length < 10) {
      scEl("sc-fone").classList.add("sc-invalid");
      showToast("WhatsApp incompleto. Digite o DDD + número.");
      scEl("sc-fone").focus();
      return null;
    }
    if (scVal("sc-cep").replace(/\D/g, "").length !== 8) {
      scEl("sc-cep").classList.add("sc-invalid");
      showToast("CEP incompleto. Digite os 8 dígitos.");
      scEl("sc-cep").focus();
      return null;
    }
    /* CPF obrigatório — 11 dígitos válidos */
    var cpfDigits = scVal("sc-cpf").replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      scEl("sc-cpf").classList.add("sc-invalid");
      showToast("Informe um CPF válido com 11 dígitos.");
      scEl("sc-cpf").focus();
      return null;
    }
    if (!isValidCpfClient(cpfDigits)) {
      scEl("sc-cpf").classList.add("sc-invalid");
      showToast("CPF inválido. Confira os dígitos.");
      scEl("sc-cpf").focus();
      return null;
    }
    var emailRaw = normalizeClientEmail(scVal("sc-email"));
    var emailOk = looksLikeEmail(emailRaw) ? emailRaw : "cliente@email.com";
    return {
      nome: scVal("sc-nome"),
      fone: scVal("sc-fone"),
      email: emailOk,
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

  function copyTextToClipboard(text) {
    return new Promise(function (resolve) {
      var t = String(text || "");
      if (!t || t === "—" || t === "Gerando…") return resolve(false);

      function legacyCopy() {
        try {
          var ta = document.createElement("textarea");
          ta.value = t;
          ta.setAttribute("readonly", "");
          ta.setAttribute("aria-hidden", "true");
          ta.style.cssText =
            "position:fixed;top:0;left:0;width:2px;height:2px;padding:0;margin:0;border:0;outline:none;opacity:0;";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, t.length);
          var ok = false;
          try {
            ok = document.execCommand("copy");
          } catch (e1) {}
          document.body.removeChild(ta);
          return !!ok;
        } catch (e2) {
          return false;
        }
      }

      try {
        if (
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function" &&
          window.isSecureContext
        ) {
          navigator.clipboard
            .writeText(t)
            .then(function () {
              resolve(true);
            })
            .catch(function () {
              resolve(legacyCopy());
            });
          return;
        }
      } catch (eClip) {}
      resolve(legacyCopy());
    });
  }

  function setPixCodeDisplay(code) {
    var el = document.getElementById("pix-code");
    if (!el) return;
    if ("value" in el) el.value = code || "";
    else el.textContent = code || "";
  }

  function getPixCodeDisplay() {
    var el = document.getElementById("pix-code");
    if (!el) return "";
    if ("value" in el) return String(el.value || "").trim();
    return String(el.textContent || "").trim();
  }

  function markPixCopyBtn(ok) {
    if (!pixCopyBtn) return;
    pixCopyBtn.classList.toggle("is-copied", !!ok);
    var label = pixCopyBtn.querySelector(".pix-copy-label");
    if (label) label.textContent = ok ? "Código copiado!" : "Copiar código Pix";
    else pixCopyBtn.lastChild && (pixCopyBtn.lastChild.textContent = ok ? " Código copiado!" : " Copiar código Pix");
  }

  function copyPixCode(opts) {
    opts = opts || {};
    var code = currentPixCode || getPixCodeDisplay();
    if (!code || code === "—" || code === "Gerando…") {
      if (!opts.silent) showToast("Aguarde o código Pix ser gerado.");
      return Promise.resolve(false);
    }
    return copyTextToClipboard(code).then(function (ok) {
      if (ok) {
        markPixCopyBtn(true);
        if (!opts.silent) showToast("Código Pix copiado! Abra o banco e cole.");
        setTimeout(function () {
          markPixCopyBtn(false);
        }, 4000);
      } else if (!opts.silent) {
        try {
          var el = document.getElementById("pix-code");
          if (el && el.focus) {
            el.focus();
            if (el.select) el.select();
            if (el.setSelectionRange) el.setSelectionRange(0, String(code).length);
          }
        } catch (eSel) {}
        showToast("Toque e segure o código para copiar.");
      }
      return ok;
    });
  }

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
    var failStreak = 0;
    var maxTicks = SIMULATE_MODE ? 60 : 720; /* ~1h no real */

    function tick() {
      if (String(currentTxId) !== String(txId)) return; /* poll antigo descartado */
      ticks++;
      if (ticks > maxTicks) {
        stopPixPoll();
        showToast("Ainda não confirmamos o Pix. Se já pagou, aguarde ou use o código de rastreio do e-mail.", 6000);
        return;
      }
      fetch(apiUrl("/api/pix/" + encodeURIComponent(txId)))
        .then(function (r) {
          return r.text().then(function (txt) {
            var json = null;
            try {
              json = txt ? JSON.parse(txt) : null;
            } catch (eP) {
              json = null;
            }
            return { ok: r.ok, json: json };
          });
        })
        .then(function (res) {
          if (String(currentTxId) !== String(txId)) return;
          if (!res.ok || !res.json) {
            failStreak++;
            if (failStreak === 3 || failStreak === 10) {
              showToast("Não conseguimos verificar o pagamento agora. Tentando de novo…", 4000);
            }
            return;
          }
          failStreak = 0;
          var data = (res.json && res.json.data) || res.json || {};
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
        .catch(function () {
          failStreak++;
          if (failStreak === 3 || failStreak === 10) {
            showToast("Sem conexão ao verificar o Pix. Tentando de novo…", 4000);
          }
        });
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

  function pixCartFingerprint(cents) {
    var items = (cartItems || [])
      .map(function (it) {
        return String(it.label || "") + "x" + String(it.qty || 0);
      })
      .join("|");
    var a = address || {};
    return [
      String(cents),
      items,
      String(a.cpf || ""),
      String(a.cep || ""),
      String(a.numero || ""),
      String(a.nome || ""),
    ].join("#");
  }

  function getPixIdempotencyKey(cents) {
    var fp = pixCartFingerprint(cents);
    var sk = "pix_idem_sabonete_" + fp;
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
    var cents = Math.min(Math.round(total * 100), MAX_TICKET * 100);
    var idemKey = getPixIdempotencyKey(cents);
    var fp = pixCartFingerprint(cents);
    try {
      var cached = JSON.parse(sessionStorage.getItem("pix_cache_sabonete") || "null");
      if (
        cached &&
        cached.br_code &&
        cached.transaction_id &&
        Number(cached.amount) === cents &&
        cached.fp === fp &&
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
      body: JSON.stringify({
        amount: cents,
        store: "sabonete",
        idempotency_key: idemKey,
        origem: SIMULATE_MODE ? "simular" : "sabonete-ttkshop",
        simulate: SIMULATE_MODE ? true : false,
        utm_source: utm.utm_source || (SIMULATE_MODE ? "simular" : ""),
        utm_campaign: utm.utm_campaign || (SIMULATE_MODE ? "simular" : ""),
        utm_medium: utm.utm_medium || (SIMULATE_MODE ? "simular" : ""),
        utm_content: utm.utm_content,
        ttclid: utm.ttclid || "",
        ttp: utm.ttp || "",
        /* pixel que estava rodando na página → define a "loja" da venda no admin */
        pixel_id: utm.pixel_id || window.tikTokPixelId || "",
        client_name: address.nome,
        client_email: address.email || "cliente@email.com",
        client_doc: address.cpf || "",
        client_phone: address.fone,
        items: totalSoapUnits(),
        upsell: hasUpsellInCart(),
        /* kits no carrinho; soap_qty = unidades de sabão */
        soap_qty: totalSoapUnits(),
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
          if (it.toalha) {
            return {
              variante: "Kit 4 Toalhas Gigante",
              qtd: it.qty,
            };
          }
          if (it.combo || it.extra) {
            return {
              variante: "kit com 16 unidades — 16 sabonetes 90g",
              qtd: it.qty,
            };
          }
          return {
            variante: String(it.label || "kit com 8 unidades") + " — " + (it.soapPerKit || 8) + " sabonetes 90g",
            qtd: it.qty,
          };
        }),
      }),
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
                : r.status >= 500
                  ? "Servidor indisponível. Tente de novo em instantes."
                  : "Falha ao gerar Pix");
            throw new Error(msg);
          }
          var data = (json && (json.data || json)) || {};
          try {
            sessionStorage.setItem(
              "pix_cache_sabonete",
              JSON.stringify({
                br_code: data.br_code,
                transaction_id: data.transaction_id || data.id,
                tracking_code: data.tracking_code || "",
                amount: cents,
                fp: fp,
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
          combo: it.combo,
          toalha: it.toalha,
          soapPerKit: it.soapPerKit,
        };
      }),
      address: address,
    };

    document.getElementById("pix-amount").textContent = money(total);
    setPixCodeDisplay(currentPixCode);
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
    markPixCopyBtn(false);
    setTimeout(function () {
      copyPixCode({ silent: true }).then(function (ok) {
        if (ok) showToast("Código Pix copiado! Abra o banco e cole.");
      }).catch(function () {});
    }, 180);
  }

  document.getElementById("btn-close-pix").addEventListener("click", function () {
    pixPage.hidden = true;
    /* NÃO para o poll — se o cliente pagar com a tela fechada, ainda confirma e dispara pixel */
  });

  /* ---------- tela de pagamento confirmado (resumo + rastreio) ---------- */
  var successPage = document.getElementById("success-page");
  var lastOrder = null;

  function trackingLink() {
    var code = (lastOrder && lastOrder.tracking) || "";
    return location.origin + "/rastreio/?c=" + encodeURIComponent(code);
  }

  function normalizeClientEmail(e) {
    var s = String(e || "").trim().toLowerCase();
    if (!s) return "";
    var bare = s.match(/^([^\s@]+)@(gmail|hotmail|outlook|yahoo|icloud|uol|bol|terra)$/i);
    if (bare) s = bare[1] + "@" + bare[2].toLowerCase() + ".com";
    return s;
  }

  function looksLikeEmail(e) {
    var s = normalizeClientEmail(e);
    if (!s || s === "cliente@email.com") return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(s);
  }

  function sucItemHtml(item) {
    var title = item.toalha
      ? "Kit 4 Toalhas Gigante"
      : item.extra || item.combo
        ? "kit com 16 unidades"
        : "kit com 8 unidades";
    return (
      '<div class="suc-item">' +
      '<img src="' +
      item.img +
      '" alt="Produto" />' +
      '<div class="suc-item-info">' +
      "<p>" +
      title +
      "</p>" +
      "<span>" +
      escHtml(item.label) +
      " · " +
      item.qty +
      " un.</span>" +
      "</div>" +
      '<span class="suc-item-price">' +
      money(item.price * item.qty) +
      "</span>" +
      "</div>"
    );
  }

  function renderSucEmailCard(savedEmail) {
    var card = document.getElementById("suc-email-card");
    var email = savedEmail || (lastOrder && lastOrder.address && lastOrder.address.email) || "";
    if (looksLikeEmail(email)) {
      card.innerHTML =
        '<h3 class="suc-card-title">Acompanhe por e-mail</h3>' +
        '<p class="suc-email-note">O resumo do pedido e o código de rastreio serão enviados para <b>' + escHtml(email) + "</b>.</p>";
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
          showToast("E-mail salvo! O resumo do pedido chega em instantes.");
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
    /* trava persistente: reload/reabrir não repete o Purchase */
    try {
      if (localStorage.getItem("tt_paid_fired_" + (order.txId || order.id || "x"))) return;
    } catch (eLsChk) {}
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
          content_id: "sabonete-" + String(it.label || i).replace(/\s+/g, "-").toLowerCase(),
          content_type: "product",
          content_name: it.extra ? "Upsell: 16 sabonetes" : "Sabonete " + (it.label || ""),
          quantity: Number(it.qty) || 1,
          price: Number(it.price) || 0,
        };
      });
      var value = Number(order.total) || 0;
      var payload = {
        contents: contents.length
          ? contents
          : [{ content_id: "sabonete", content_type: "product", content_name: "Sabonete Artesanal", quantity: 1, price: value }],
        content_ids: (contents.length ? contents : [{ content_id: "sabonete" }]).map(function (c) {
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
      /* 1 pagamento real = 1 CompletePayment (padrão TikTok); event_id = mesmo do CAPI (dedup) */
      var names = ["CompletePayment"];
      var txId = order.txId || order.id || "";
      try { localStorage.setItem("tt_paid_fired_" + (txId || "x"), String(Date.now())); } catch (eLs) {}
      names.forEach(function (name) {
        var trackTargets = ids.length ? ids : [null];
        trackTargets.forEach(function (pid) {
          try {
            var eid = eventIdFor(name, txId, pid || ids[0] || "0");
            if (pid && typeof window.ttq.instance === "function") {
              window.ttq.instance(pid).track(name, payload, { event_id: eid });
            } else {
              window.ttq.track(name, payload, { event_id: eid });
            }
            console.log("[TikTok Pixel] ✓", name, "R$", value, pid || "");
          } catch (err) {
            console.warn("[TikTok Pixel] ✗", name, err && err.message);
          }
        });
      });
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
      escHtml(a.rua || "") + ", " + escHtml(a.numero || "") + (a.compl ? ", " + escHtml(a.compl) : "") + "<br>" +
      escHtml(a.bairro || "") + " — " + escHtml(a.cidade || "") + "/" + escHtml(a.uf || "") + "<br>CEP " + escHtml(a.cep || "");

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
    location.href = trackingLink();
  });

  document.getElementById("btn-suc-copy").addEventListener("click", function () {
    var link = trackingLink();
    function done() { showToast("Link de rastreio copiado!"); }
    function fallbackCopy() {
      var ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(fallbackCopy);
    } else {
      fallbackCopy();
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
    copyPixCode();
  });

  (function bindPixCodeTap() {
    var box = document.querySelector(".pix-code-box");
    var codeEl = document.getElementById("pix-code");
    function onTap(e) {
      if (e && e.target && e.target.closest && e.target.closest("#btn-copy-pix")) return;
      copyPixCode();
    }
    if (box && !box.dataset.pixTapBound) {
      box.dataset.pixTapBound = "1";
      box.addEventListener("click", onTap);
    }
    if (codeEl && !codeEl.dataset.pixFocusBound) {
      codeEl.dataset.pixFocusBound = "1";
      codeEl.addEventListener("focus", function () {
        try {
          codeEl.select && codeEl.select();
        } catch (eF) {}
      });
    }
  })();

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
          placeOrderBtn.disabled = true;
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

    var addr = scValidate();
    if (!addr) return;
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
          scOrderBtn.disabled = true;
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
