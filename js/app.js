(function () {
  "use strict";

  function ttkFunnel(ev, extra) {
    try {
      if (typeof window.ttkShopFunnel === "function") window.ttkShopFunnel(ev, extra || {});
    } catch (eF) {}
  }
  function ttkProdId() {
    return String(window.TTK_STORE || "panelas").toLowerCase();
  }

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

  /* No Vercel a loja é estática; API/webhook vivem no Render (ofertasgrandes). */
  var API_BASE = (function () {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com") return "https://ttkshop-projeto2.onrender.com";
      if (h === "ofertasonlineshop.vercel.app" || h === "grandesofertas.vercel.app" || /\.vercel\.app$/.test(h)) {
        return "https://ttkshop-projeto2.onrender.com";
      }
    } catch (e) {}
    return "";
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

  /* ---------- galeria: contador 1/9 ---------- */
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

  /* ---------- sheet de variantes ---------- */
  function openSku() {
    ttkFunnel("product", { product_id: ttkProdId() });
    skuSheet.removeAttribute("hidden");
    skuOverlay.removeAttribute("hidden");
  }
  function closeSku() {
    skuSheet.setAttribute("hidden", "");
    skuOverlay.setAttribute("hidden", "");
    editingIndex = null;
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
    handleVariantPick(opt);
  });

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
  var cartItems = []; /* { label, img, qty } */
  var editingIndex = null; /* item do carrinho em troca de variante */
  var PRICE = 69.9;
  var MAX_PROMO_QTY = 3;
  var PROMO_QTY_MSG = "A promoção só vai até a quantidade de 3 panelas.";

  function roomForPromo() {
    return Math.max(0, MAX_PROMO_QTY - totalQty());
  }

  function warnPromoQty() {
    showToast(PROMO_QTY_MSG, 4000);
  }

  /* ---------- quantidade (sheet) ---------- */
  document.getElementById("qty-minus").addEventListener("click", function () {
    if (qty > 1) qtyEl.textContent = String(--qty);
  });
  document.getElementById("qty-plus").addEventListener("click", function () {
    var room = roomForPromo();
    if (room <= 0 || qty >= room) {
      warnPromoQty();
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

  function totalQty() {
    return cartItems.reduce(function (sum, it) {
      return sum + it.qty;
    }, 0);
  }

  function itemHtml(item, i) {
    return (
      '<div class="cart-item">' +
      '<span class="cart-check checked" aria-hidden="true"></span>' +
      '<img class="cart-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="cart-item-info">' +
      '<p class="cart-item-title"><span class="torcer-badge">Torcer</span> Jogo de Panelas Cerâmi...</p>' +
      '<button class="cart-variant" type="button" data-vi="' + i + '"><span>' + item.label + "</span> " + CHEV_DOWN_SVG + "</button>" +
      '<div class="cart-price-row">' +
      '<span class="cart-price">R$ 89<i>,90</i></span>' + COUPON_SVG +
      '<span class="cart-qty-ctrl">' +
      '<button type="button" data-act="minus" data-i="' + i + '" aria-label="Diminuir">−</button>' +
      "<b>" + item.qty + "</b>" +
      '<button type="button" data-act="plus" data-i="' + i + '" aria-label="Aumentar">+</button>' +
      "</span></div>" +
      '<p class="cart-old-row"><span class="price-old">R$ 239,00</span> <span class="cart-off">-62%</span></p>' +
      '<p class="cart-others">Em outros 280 carrinhos</p>' +
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
      document.getElementById("cart-total").textContent = money(PRICE * count);
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

  /* adicionar a partir do sheet de variantes */
  function addToCart(mode) {
    var room = roomForPromo();
    if (room <= 0) {
      warnPromoQty();
      return;
    }

    var addQty = Math.min(qty, room);
    if (addQty < qty) warnPromoQty();

    var sel = document.querySelector("#sku-grid .sku-opt.selected");
    var label = "04 - Versão Extra Espessa";
    var img = "images/opt-1.png";
    if (sel) {
      label = sel.querySelector(".sku-opt-label").textContent.replace(/\.\.\.$/, "").trim();
      if (sel.dataset.img) img = sel.dataset.img;
    }

    var existing = cartItems.find(function (it) {
      return it.label === label;
    });
    if (existing) {
      existing.qty += addQty;
    } else {
      cartItems.push({ label: label, img: img, qty: addQty });
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
    if (vbtn) {
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
      if (totalQty() >= MAX_PROMO_QTY) {
        warnPromoQty();
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

    /* marca a variante atual do item na grade */
    document.querySelectorAll("#sku-grid .sku-opt").forEach(function (o) {
      var l = o.querySelector(".sku-opt-label").textContent.replace(/\.\.\.$/, "").trim();
      o.classList.toggle("selected", l === item.label);
      o.classList.remove("selected2");
    });
    var sel = document.querySelector("#sku-grid .sku-opt.selected");
    if (sel && sel.dataset.img) {
      document.getElementById("sku-thumb").src = sel.dataset.img;
    }

    skuSheet.removeAttribute("hidden");
    skuOverlay.removeAttribute("hidden");
  }

  /* ---------- checkout ---------- */
  var checkoutPage = document.getElementById("checkout-page");
  var addressPage = document.getElementById("address-page");
  var pixPage = document.getElementById("pix-page");
  var checkoutItemsEl = document.getElementById("checkout-items");
  var address = null;
  var pixTimerId = null;
  var pixSecsLeft = 0;
  var OLD_PRICE = 239.0;
  var FRETE = 28.7;

  /* modo definido no painel admin: "tiktok" (original) ou "simple" */
  var checkoutMode = "tiktok";
  fetch(apiUrl("/api/checkout-mode?store=panelas"))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && (j.mode === "simple" || j.mode === "tiktok")) checkoutMode = j.mode;
    })
    .catch(function () {});

  function coItemHtml(item, i) {
    return (
      '<div class="co-item">' +
      '<img class="co-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="co-item-info">' +
      '<p class="co-item-title"><span class="torcer-badge">Torcer</span> Jogo de Panelas Cerâmica An...</p>' +
      '<p class="co-item-variant">' + item.label + "</p>" +
      '<div class="co-item-price-row">' +
      '<span class="co-item-price">R$ 69,90</span>' + COUPON_SVG +
      '<span class="cart-qty-ctrl">' +
      '<button type="button" data-act="minus" data-i="' + i + '" aria-label="Diminuir">−</button>' +
      "<b>" + item.qty + "</b>" +
      '<button type="button" data-act="plus" data-i="' + i + '" aria-label="Aumentar">+</button>' +
      "</span></div>" +
      '<p class="co-item-old"><span class="price-old">R$ 239,00</span> <span class="cart-off">-62%</span></p>' +
      "</div></div>"
    );
  }

  /* limite do ticket na Pixzy */
  var MAX_TICKET = 200;

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function couponValue(subtotal) {
    /* R$ 30 (2+), R$ 60 (3+); se ainda passar de R$ 200, aumenta o cupom até fechar em 200 */
    var base = 0;
    if (subtotal >= 260) base = 60;
    else if (subtotal >= 139) base = 30;

    var after = round2(subtotal - base);
    if (after > MAX_TICKET) {
      return round2(subtotal - MAX_TICKET);
    }
    return base;
  }

  function orderTotals() {
    var count = totalQty();
    var subtotal = round2(PRICE * count);
    var coupon = couponValue(subtotal);
    var total = round2(subtotal - coupon);
    if (total > MAX_TICKET) total = MAX_TICKET;
    return { count: count, subtotal: subtotal, coupon: coupon, total: total };
  }

  function renderCheckout() {
    var t = orderTotals();
    checkoutItemsEl.innerHTML = cartItems.map(coItemHtml).join("");

    var itemWord = t.count === 1 ? "item" : "itens";
    document.getElementById("co-total-label").textContent = "Total (" + t.count + " " + itemWord + ")";
    document.getElementById("co-total").textContent = money(t.total);

    /* badge do cupom no bloco de desconto */
    document.getElementById("co-coupon-line").hidden = t.coupon === 0;
    document.getElementById("co-coupon-badge").textContent = "- " + money(t.coupon);

    /* resumo real do pedido */
    document.getElementById("sum-subtotal").textContent = money(t.subtotal);
    document.getElementById("sum-original").textContent = money(OLD_PRICE * t.count);
    document.getElementById("sum-desconto").textContent = "- " + money((OLD_PRICE - PRICE) * t.count);
    document.getElementById("sum-cupom-row").hidden = t.coupon === 0;
    document.getElementById("sum-cupom").textContent = "- " + money(t.coupon);
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
    checkoutPage.hidden = true;
  });

  /* stepper dos itens no checkout */
  checkoutItemsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;

    if (btn.dataset.act === "plus") {
      if (totalQty() >= MAX_PROMO_QTY) {
        warnPromoQty();
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
    return (
      '<div class="sc-item">' +
      '<img class="sc-item-img" src="' + item.img + '" alt="Produto" />' +
      '<div class="sc-item-info">' +
      '<p class="sc-item-title">Jogo de Panelas Cerâmica Antiaderente 13 Peças <span class="sc-variant">(' + item.label + ")</span></p>" +
      '<span class="sc-item-flash">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="#FE2C55"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>' +
      "Oferta Relâmpago</span>" +
      '<div class="sc-item-price-row">' +
      '<span class="sc-item-price">' + money(PRICE) + "</span>" +
      '<span class="sc-item-old">R$ 239,00</span> <span class="sc-item-off">-62%</span>' +
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
    simplePage.hidden = true;
  });

  simpleItemsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    var item = cartItems[i];
    if (!item) return;
    if (btn.dataset.act === "plus") {
      if (totalQty() >= MAX_PROMO_QTY) {
        warnPromoQty();
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

  function scFormReady() {
    var required = ["sc-nome", "sc-fone", "sc-cep", "sc-rua", "sc-numero", "sc-bairro", "sc-cidade", "sc-uf"];
    for (var i = 0; i < required.length; i++) {
      if (!scVal(required[i])) return false;
    }
    if (scVal("sc-cep").replace(/\D/g, "").length !== 8) return false;
    if (!scVal("sc-cpf").replace(/\D/g, "")) return false;
    return true;
  }

  function scUpdateReady() {
    scSaveBtn.classList.toggle("ready", scFormReady());
  }

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
            ttkFunnel("success");
            var code = data.tracking_code || "";
            showToast("Pagamento confirmado! 🎉", 5000);
            if (code) {
              setTimeout(function () {
                location.href = "/rastreio/index.html?c=" + encodeURIComponent(code);
              }, 800);
            }
          }
        })
        .catch(function () {});
    }, 5000);
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
        origem: "panelas-ttkshop",
        attribution_pixel_id: attrPixel,
        utm_source: utm.utm_source,
        utm_campaign: utm.utm_campaign,
        utm_medium: utm.utm_medium,
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
          return { variante: it.label, qtd: it.qty };
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

  document.getElementById("btn-pix-order").addEventListener("click", function () {
    pixPage.hidden = true;
    stopPixPoll();
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

  /* fazer pedido no checkout simples — valida o formulário na hora */
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

  /* aplica a variante escolhida ao item em edição */
  function handleVariantPick(opt) {
    if (editingIndex === null) return;
    var item = cartItems[editingIndex];
    if (!item) {
      editingIndex = null;
      return;
    }

    var label = opt.querySelector(".sku-opt-label").textContent.replace(/\.\.\.$/, "").trim();
    var img = opt.dataset.img || item.img;

    /* se já existe um item com essa variante, junta as quantidades */
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
})();
