(function () {
  "use strict";

  function ttkFunnel(ev, extra) {
    try {
      if (typeof window.ttkShopFunnel === "function") window.ttkShopFunnel(ev, extra || {});
    } catch (eF) {}
  }
  function ttkProdId() {
    return String(window.TTK_STORE || "conjunto").toLowerCase();
  }

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

  /* No Vercel a loja é estática; API/webhook vivem no achadofertas (Render). */
  var API_BASE = (function () {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return "";
      if (h.endsWith(".onrender.com")) return "";
      if (typeof window !== "undefined" && typeof window.TTK_RENDER_API === "string" && window.TTK_RENDER_API !== "") {
        return window.TTK_RENDER_API.replace(/\/+$/, "");
      }
    } catch (e) {}
    return "https://ttkshop-panelas-9e6w.onrender.com";
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
  var qtyEl = document.getElementById("qty-val");
  var qty = 1;
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
      ttkFunnel("product", { product_id: ttkProdId() });
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

  /* ---------- sheet de variantes (cor + tamanho) ---------- */
  var sizeHint = document.getElementById("size-hint");
  var extraRow = document.getElementById("extra-row");
  /* só true se a pessoa clicar de propósito no upsell (nunca herda de abertura) */
  var extraOptIn = false;

  function selectedColorOpt() {
    return document.querySelector("#sku-grid .sku-opt.selected");
  }
  function selectedSizeOpt() {
    return document.querySelector("#size-grid .size-opt.selected");
  }

  function setExtraChecked(on) {
    extraOptIn = !!on;
    extraRow.classList.toggle("checked", extraOptIn);
    extraRow.setAttribute("aria-checked", extraOptIn ? "true" : "false");
  }

  function openSku() {
    ttkFunnel("product", { product_id: ttkProdId() });
    /* cor aleatória sempre começa desligada — a pessoa marca se quiser */
    setExtraChecked(false);
    skuSheet.removeAttribute("hidden");
    skuOverlay.removeAttribute("hidden");
  }
  function closeSku() {
    skuSheet.setAttribute("hidden", "");
    skuOverlay.setAttribute("hidden", "");
    editingIndex = null;
    setExtraChecked(false);
  }
  function syncSkuLayers() {
    if (!skuOverlay || !skuSheet) return;
    if (skuSheet.hasAttribute("hidden")) skuOverlay.setAttribute("hidden", "");
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

  document.getElementById("sku-grid").addEventListener("click", function (e) {
    /* ícone de expandir: abre a foto inteira sem selecionar a variante */
    var ex = e.target.closest(".expand-ico");
    if (ex) {
      var owner = ex.closest(".sku-opt");
      if (owner && owner.dataset.img) openLightbox(owner.dataset.img);
      return;
    }

    var opt = e.target.closest(".sku-opt");
    if (!opt) return;
    this.querySelectorAll(".sku-opt").forEach(function (o) {
      o.classList.remove("selected", "selected2");
    });
    opt.classList.add("selected");
    if (opt.dataset.img) {
      document.getElementById("sku-thumb").src = opt.dataset.img;
    }
    handleVariantPick();
  });

  document.getElementById("size-grid").addEventListener("click", function (e) {
    var opt = e.target.closest(".size-opt");
    if (!opt) return;
    this.querySelectorAll(".size-opt").forEach(function (o) {
      o.classList.remove("selected");
    });
    opt.classList.add("selected");
    sizeHint.textContent = opt.dataset.size;
    handleVariantPick();
  });

  /* leve +1 cor aleatória (checkbox) — só troca com clique direto */
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

  /* ---------- carrinho ---------- */
  var cartPage = document.getElementById("cart-page");
  var cartItemsEl = document.getElementById("cart-items");
  var cartItems = []; /* { label, img, qty, price, extra } */
  var editingIndex = null; /* item do carrinho em troca de variante */
  var PRICE = 34.99;
  var OLD_PRICE = 109.9;
  var EXTRA_PRICE = 29.87;
  var EXTRA_IMGS = [
    "images/01.png", "images/02.png", "images/03.png", "images/04.png", "images/05.png",
    "images/06.png", "images/07.png", "images/08.png", "images/09.png", "images/10.png",
  ];
  /* limite do ticket na Pixzy: o pedido inteiro não pode passar de R$ 200 */
  var MAX_TICKET = 200;
  var LIMIT_MSG = "O valor total do pedido não pode passar de R$ 200,00.";
  var PRICE_C = Math.round(PRICE * 100);
  var EXTRA_C = Math.round(EXTRA_PRICE * 100);
  var MAX_C = MAX_TICKET * 100;

  function cartCents() {
    return Math.round(cartSubtotal() * 100);
  }

  function warnLimit() {
    showToast(LIMIT_MSG, 4500);
  }

  /* ---------- quantidade (sheet) ---------- */
  document.getElementById("qty-minus").addEventListener("click", function () {
    if (qty > 1) qtyEl.textContent = String(--qty);
  });
  document.getElementById("qty-plus").addEventListener("click", function () {
    var extraC = extraOptIn && extraRow.classList.contains("checked") ? EXTRA_C : 0;
    var prospective = cartCents() + (qty + 1) * PRICE_C + extraC;
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
    var variantBtn = item.extra
      ? '<span class="cart-variant static"><span>' + item.label + "</span></span>"
      : '<button class="cart-variant" type="button" data-vi="' + i + '"><span>' + item.label + "</span> " + CHEV_DOWN_SVG + "</button>";
    var oldRow = item.extra
      ? ""
      : '<p class="cart-old-row"><span class="price-old">R$ 109,90</span> <span class="cart-off">-68%</span></p>';
    return (
      '<div class="cart-item">' +
      '<span class="cart-check checked" aria-hidden="true"></span>' +
      '<img class="cart-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="cart-item-info">' +
      '<p class="cart-item-title">' + (item.extra ? "Cor surpresa — Conjunto Alfaiataria Prem..." : "Conjunto Feminino Alfaiataria Blusa Bl...") + "</p>" +
      variantBtn +
      '<div class="cart-price-row">' +
      '<span class="cart-price">' + moneyParts(item.price) + "</span>" + COUPON_SVG +
      '<span class="cart-qty-ctrl">' +
      '<button type="button" data-act="minus" data-i="' + i + '" aria-label="Diminuir">−</button>' +
      "<b>" + item.qty + "</b>" +
      '<button type="button" data-act="plus" data-i="' + i + '" aria-label="Aumentar">+</button>' +
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
  }

  function openCart() {
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

  /* adicionar a partir do sheet de variantes */
  function addToCart(mode) {
    var sel = selectedColorOpt();
    var size = selectedSizeOpt();
    if (!size) {
      showToast("Selecione um tamanho para continuar.");
      return;
    }

    /* ajusta quantidade/extra para o pedido não passar de R$ 200 */
    var budgetC = MAX_C - cartCents();
    var addExtra = !!extraOptIn && extraRow.classList.contains("checked");
    var addQty = qty;

    if (addQty * PRICE_C + (addExtra ? EXTRA_C : 0) > budgetC) {
      addQty = Math.floor((budgetC - (addExtra ? EXTRA_C : 0)) / PRICE_C);
      if (addQty < 1 && addExtra) {
        addExtra = false;
        addQty = Math.floor(budgetC / PRICE_C);
      }
      if (addQty < 1) {
        warnLimit();
        return;
      }
      warnLimit();
    }

    var label = "Off White, " + size.dataset.size;
    var img = "images/01.png";
    if (sel) {
      label = variantLabel(sel, size);
      if (sel.dataset.img) img = sel.dataset.img;
    }

    var existing = cartItems.find(function (it) {
      return !it.extra && it.label === label;
    });
    if (existing) {
      existing.qty += addQty;
    } else {
      cartItems.push({ label: label, img: img, qty: addQty, price: PRICE, extra: false });
    }

    /* leve +1 cor aleatória */
    if (addExtra) {
      var extraLabel = "Cor aleatória, " + size.dataset.size;
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
        });
      }
    }

    closeSku();
    renderCart();

    if (mode === "buy") {
      /* comprar agora: vai direto para a compra */
      openCheckout();
    } else {
      /* só adicionou: continua na página para escolher mais itens */
      showToast("Adicionado ao carrinho!");
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
    /* edição de variante não liga o upsell */
    setExtraChecked(false);

    var parts = item.label.split(", ");
    var color = parts[0] || "";
    var size = parts[1] || "";

    /* marca a cor atual do item na grade */
    document.querySelectorAll("#sku-grid .sku-opt").forEach(function (o) {
      o.classList.toggle("selected", o.dataset.color === color);
      o.classList.remove("selected2");
    });
    var sel = selectedColorOpt();
    if (sel && sel.dataset.img) {
      document.getElementById("sku-thumb").src = sel.dataset.img;
    }

    /* marca o tamanho atual */
    document.querySelectorAll("#size-grid .size-opt").forEach(function (o) {
      o.classList.toggle("selected", o.dataset.size === size);
    });
    if (size) sizeHint.textContent = size;

    skuSheet.removeAttribute("hidden");
    skuOverlay.removeAttribute("hidden");
  }

  /* aplica a variante escolhida ao item em edição (cor ou tamanho) */
  function handleVariantPick() {
    if (editingIndex === null) return;
    var item = cartItems[editingIndex];
    if (!item) {
      editingIndex = null;
      return;
    }

    var sel = selectedColorOpt();
    var size = selectedSizeOpt();
    if (!sel || !size) return;

    var label = variantLabel(sel, size);
    var img = sel.dataset.img || item.img;

    /* se já existe um item com essa variante, junta as quantidades */
    var editIdx = editingIndex;
    var otherIdx = -1;
    cartItems.forEach(function (it, idx) {
      if (idx !== editIdx && !it.extra && it.label === label) otherIdx = idx;
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

  /* modo definido no painel admin: "tiktok" (original) ou "simple" */
  var checkoutMode = "tiktok";
  fetch(apiUrl("/api/checkout-mode?store=conjunto"))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && (j.mode === "simple" || j.mode === "tiktok")) checkoutMode = j.mode;
    })
    .catch(function () {});

  function coItemHtml(item, i) {
    var oldRow = item.extra
      ? ""
      : '<p class="co-item-old"><span class="price-old">R$ 109,90</span> <span class="cart-off">-68%</span></p>';
    return (
      '<div class="co-item">' +
      '<img class="co-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="co-item-info">' +
      '<p class="co-item-title">' + (item.extra ? "Cor surpresa — Conjunto Alfaiataria Prem..." : "Conjunto Feminino Alfaiataria Blusa Bl...") + "</p>" +
      '<p class="co-item-variant">' + item.label + "</p>" +
      '<div class="co-item-price-row">' +
      '<span class="co-item-price">' + money(item.price) + "</span>" + COUPON_SVG +
      '<span class="cart-qty-ctrl">' +
      '<button type="button" data-act="minus" data-i="' + i + '" aria-label="Diminuir">−</button>' +
      "<b>" + item.qty + "</b>" +
      '<button type="button" data-act="plus" data-i="' + i + '" aria-label="Aumentar">+</button>' +
      "</span></div>" +
      oldRow +
      "</div></div>"
    );
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function orderTotals() {
    var count = totalQty();
    var subtotal = cartSubtotal();
    var original = round2(
      cartItems.reduce(function (sum, it) {
        return sum + (it.extra ? it.price : OLD_PRICE) * it.qty;
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

  function openCheckout() {
    ttkFunnel("checkout");
    if (totalQty() === 0) return;
    if (checkoutMode === "simple") {
      renderSimpleCheckout();
      simplePage.hidden = false;
      return;
    }
    renderCheckout();
    checkoutPage.hidden = false;
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
    if (!nome || !fone || !cep || !uf || !cidade || !bairro || !rua || !numero || !cpf) {
      showToast("Preencha todos os campos obrigatórios (o e-mail é opcional).");
      return;
    }
    if (cep.replace(/\D/g, "").length !== 8) {
      showToast("CEP incompleto. Digite os 8 dígitos.");
      cepInput.focus();
      return;
    }
    /* CPF: aceita o que a pessoa digitar (mesmo inválido) — não bloqueia o pagamento */

    var compl = get("addr-compl");
    address = {
      nome: nome,
      fone: fone,
      email: email,
      cpf: cpf.replace(/\D/g, ""),
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

  function scEl(id) {
    return document.getElementById(id);
  }
  function scVal(id) {
    return scEl(id).value.trim();
  }

  function scItemHtml(item, i) {
    var title = item.extra ? "Cor surpresa — Jaqueta Puffer Premium" : "Jaqueta Feminina Puffer Forrada Impermeável Inverno";
    var oldRow = item.extra
      ? ""
      : '<span class="sc-item-old">R$ 109,90</span> <span class="sc-item-off">-68%</span>';
    return (
      '<div class="sc-item">' +
      '<img class="sc-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="sc-item-info">' +
      '<p class="sc-item-title">' + title + ' <span class="sc-variant">(' + item.label + ")</span></p>" +
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
    this.value = this.value.replace(/\D/g, "").slice(0, 14);
  });

  scEl("sc-cpf").addEventListener("input", function () {
    var d = this.value.replace(/\D/g, "").slice(0, 14);
    this.value = formatCpf(d);
  });

  scEl("sc-uf").addEventListener("input", function () {
    this.value = this.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  });

  /* formulário completo (complemento e e-mail são opcionais) → botão rosa TikTok */
  function scFormReady() {
    var required = ["sc-nome", "sc-fone", "sc-cep", "sc-rua", "sc-numero", "sc-bairro", "sc-cidade", "sc-uf"];
    for (var i = 0; i < required.length; i++) {
      if (!scVal(required[i])) return false;
    }
    if (scVal("sc-cep").replace(/\D/g, "").length !== 8) return false;
    /* CPF só precisa estar preenchido — valor inválido não impede o Pix */
    if (!scVal("sc-cpf").replace(/\D/g, "")) return false;
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
    return {
      nome: scVal("sc-nome"),
      fone: scVal("sc-fone"),
      email: scVal("sc-email") || "cliente@email.com",
      cpf: scVal("sc-cpf").replace(/\D/g, ""),
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

  function startPixPoll(txId) {
    stopPixPoll();
    currentTxId = txId;
    var pollMs = SIMULATE_MODE ? 2000 : 5000;
    pixPollId = setInterval(function () {
      fetch(apiUrl("/api/pix/" + encodeURIComponent(txId)))
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          var data = (json && json.data) || json || {};
          var st = String(data.status || "").toLowerCase();
          if (st === "paid" || st === "approved" || st === "completed") {
            stopPixPoll();
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
    }, pollMs);
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
      };
    } catch (e) {
      return {
        utm_source: "",
        utm_campaign: "",
        utm_medium: "",
        utm_content: "",
        ttclid: "",
        ttp: "",
      };
    }
  }

  function createPixCharge(total) {
    var cents = Math.min(Math.round(total * 100), MAX_TICKET * 100);
    var utm = readUtmParams();
    var attrPixel = "";
    try {
      if (window.tikTokAttributionPixelId) attrPixel = String(window.tikTokAttributionPixelId);
      if (!attrPixel) {
        var q = new URLSearchParams(location.search || "");
        attrPixel = String(q.get("pixel") || q.get("px") || q.get("pixel_id") || "").trim();
        var lojaN = parseInt(q.get("loja") || "", 10);
        var ids = window.tikTokPixelIds || [];
        if (!attrPixel && lojaN >= 1 && ids[lojaN - 1]) attrPixel = String(ids[lojaN - 1]);
        if (!attrPixel && ids && ids.length) attrPixel = String(ids[0] || "");
        if (!attrPixel && window.tikTokPixelId) attrPixel = String(window.tikTokPixelId);
      }
    } catch (ePix) {}
    return fetch(apiUrl("/api/pix"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({
        amount: cents,
        origem: SIMULATE_MODE ? "simular" : "jaqueta-ttkshop",
        simulate: SIMULATE_MODE ? true : false,
        attribution_pixel_id: attrPixel,
        utm_source: utm.utm_source || (SIMULATE_MODE ? "simular" : ""),
        utm_campaign: utm.utm_campaign || (SIMULATE_MODE ? "simular" : ""),
        utm_medium: utm.utm_medium || (SIMULATE_MODE ? "simular" : ""),
        utm_content: utm.utm_content,
        ttclid: utm.ttclid || "",
        ttp: utm.ttp || "",
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
          return { variante: "Jaqueta " + it.label, qtd: it.qty };
        }),
      }, typeof window.ttkFunnelPixMeta === "function" ? window.ttkFunnelPixMeta() : {})),
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok) {
          throw new Error((json && json.error) || "Falha ao gerar Pix");
        }
        return json.data || json;
      });
    });
  }

  /* mostra a tela do Pix já com o código gerado */
  function showPixPage(total, data) {
    currentPixCode = data.br_code || "";
    currentTxId = data.transaction_id || null;
    stopPixPoll();

    /* guarda o resumo do pedido para a tela de pagamento confirmado */
    lastOrder = {
      tracking: data.tracking_code || "",
      txId: data.transaction_id || "",
      total: (data.amount != null ? data.amount : Math.round(total * 100)) / 100,
      items: cartItems.map(function (it) {
        return { label: it.label, img: it.img, qty: it.qty, price: it.price, extra: it.extra };
      }),
      address: address,
    };

    document.getElementById("pix-amount").textContent = money(
      (data.amount != null ? data.amount : Math.round(total * 100)) / 100
    );
    document.getElementById("pix-code").textContent = currentPixCode;
    pixCopyBtn.disabled = false;

    var deadline = new Date(Date.now() + 24 * 3600 * 1000);
    document.getElementById("pix-deadline").textContent = formatPixDeadline(deadline);
    pixSecsLeft = 24 * 3600 - 1;
    tickPixCountdown();
    clearInterval(pixTimerId);
    pixTimerId = setInterval(tickPixCountdown, 1000);

    setPixLoading(false);
    pixPage.hidden = false;
    ttkFunnel("pix");
    if (currentTxId) startPixPoll(currentTxId);
  }

  document.getElementById("btn-close-pix").addEventListener("click", function () {
    pixPage.hidden = true;
    stopPixPoll();
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
    var title = item.extra ? "Cor surpresa — Jaqueta Puffer Premium" : "Jaqueta Feminina Puffer Forrada Impermeável Inverno";
    return (
      '<div class="suc-item">' +
      '<img src="' + item.img + '" alt="Produto" />' +
      '<div class="suc-item-info">' +
      "<p>" + title + "</p>" +
      "<span>" + item.label + " · " + item.qty + " un.</span>" +
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

  /* igual ofertasdetudo: Purchase no browser + ack pro servidor (CAPI) + retry se SDK atrasar */
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
          content_id: "jaqueta-" + String(it.label || i).replace(/\s+/g, "-").toLowerCase(),
          content_type: "product",
          content_name: it.extra ? "Cor surpresa — Jaqueta" : "Jaqueta " + (it.label || ""),
          quantity: Number(it.qty) || 1,
          price: Number(it.price) || 0,
        };
      });
      var value = Number(order.total) || 0;
      var payload = {
        contents: contents.length
          ? contents
          : [{ content_id: "jaqueta", content_type: "product", content_name: "Jaqueta", quantity: 1, price: value }],
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
            console.log("[pixel] ✓", name, "R$", value);
          } catch (err) {
            console.warn("[pixel] ✗", name, err && err.message);
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
              console.log("[pixel] ✓", pid, name, "R$", value);
            } catch (err) {
              console.warn("[pixel] ✗", pid, name, err && err.message);
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

    if (typeof window.ttq.ready === "function") {
      try {
        window.ttq.ready(doTrack);
        setTimeout(doTrack, 2500);
        return;
      } catch (eReady) {}
    }
    doTrack();
  }

  function showSuccessPage() {
    ttkFunnel("success");
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
  var ORDER_MIN_WAIT = 3000;

  function setOrderBtnLoading(on) {
    placeOrderBtn.disabled = on;
    placeOrderBtn.classList.toggle("is-busy", on);
    orderBtnLabel.textContent = on ? "Gerando Pix…" : "Fazer pedido";
    orderBtnSmall.style.display = on ? "none" : "";
  }

  placeOrderBtn.addEventListener("click", function () {
    if (placeOrderBtn.disabled) return;

    if (!address) {
      addressPage.hidden = false;
      showToast("Adicione seu endereço de entrega para continuar.");
      return;
    }
    if (!address.cpf) {
      addressPage.hidden = false;
      showToast("Salve o endereço com CPF para gerar o Pix.");
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
          showPixPage(total, data);
        }, remainingWait());
      })
      .catch(function (err) {
        setTimeout(function () {
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

  scOrderBtn.addEventListener("click", function () {
    if (scOrderBtn.disabled) return;

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
          showPixPage(total, data);
        }, remainingWait());
      })
      .catch(function (err) {
        setTimeout(function () {
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
