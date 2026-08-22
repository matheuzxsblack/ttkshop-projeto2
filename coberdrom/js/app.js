(function () {
  "use strict";

  window.TTK_STORE = "coberdrom";

  function ttkFunnel(ev, extra) {
    try {
      if (typeof window.ttkShopFunnel === "function") window.ttkShopFunnel(ev, extra || {});
    } catch (eF) {}
  }
  function setFunnelStep(step) {
    var s = String(step || "").toLowerCase();
    if (s === "product" || s === "sku") ttkFunnel("product", { product_id: "coberdrom" });
    else if (s === "checkout") ttkFunnel("checkout");
    else if (s === "pix") ttkFunnel("pix");
  }
  setFunnelStep("product");

  var main = document.getElementById("main-scroll");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var scrollTopBtn = document.getElementById("btn-scroll-top");
  var reviewsPage = document.getElementById("reviews-page");
  var skuSheet = document.getElementById("sku-sheet");
  var skuOverlay = document.getElementById("sku-overlay");

  /* Carousel counter */
  var carousel = document.getElementById("hero-carousel");
  var heroCounter = document.getElementById("hero-counter");
  var heroTotal = carousel ? carousel.children.length : 1;

  if (carousel && heroCounter) {
    carousel.addEventListener("scroll", function () {
      var idx = Math.round(carousel.scrollLeft / carousel.clientWidth) + 1;
      idx = Math.min(Math.max(idx, 1), heroTotal);
      heroCounter.textContent = idx + "/" + heroTotal;
    });
  }

  /* Sku Sheet handling */
  function openSku() {
    if (skuSheet && skuOverlay) {
      skuSheet.removeAttribute("hidden");
      skuOverlay.removeAttribute("hidden");
    }
  }
  function closeSku() {
    if (skuSheet && skuOverlay) {
      skuSheet.setAttribute("hidden", "");
      skuOverlay.setAttribute("hidden", "");
    }
  }

  var btnOpenSku = document.getElementById("btn-open-sku");
  var btnAddCart = document.getElementById("btn-add-cart");
  var btnBuyNow = document.getElementById("btn-buy-now");
  var btnCloseSku = document.getElementById("btn-close-sku");

  if (btnOpenSku) btnOpenSku.addEventListener("click", openSku);
  if (btnAddCart) btnAddCart.addEventListener("click", openSku);
  if (btnBuyNow) btnBuyNow.addEventListener("click", openSku);
  if (btnCloseSku) btnCloseSku.addEventListener("click", closeSku);
  if (skuOverlay) skuOverlay.addEventListener("click", closeSku);

  /* Select Size and Color */
  var selectedSize = "Queen";
  var selectedColor = "Azul Marinho";

  document.querySelectorAll("#size-grid .size-opt").forEach(function (opt) {
    opt.addEventListener("click", function () {
      document.querySelectorAll("#size-grid .size-opt").forEach(function (o) {
        o.style.borderColor = "#e5e7eb";
        o.classList.remove("selected");
      });
      opt.style.borderColor = "#161823";
      opt.classList.add("selected");
      selectedSize = opt.getAttribute("data-size") || "Queen";
    });
  });

  document.querySelectorAll("#sku-grid .sku-opt").forEach(function (opt) {
    opt.addEventListener("click", function () {
      document.querySelectorAll("#sku-grid .sku-opt").forEach(function (o) {
        o.style.borderColor = "#e5e7eb";
        o.classList.remove("selected");
      });
      opt.style.borderColor = "#161823";
      opt.classList.add("selected");
      selectedColor = opt.getAttribute("data-color") || "Azul Marinho";
      var img = opt.getAttribute("data-img");
      if (img && document.getElementById("sku-thumb")) {
        document.getElementById("sku-thumb").src = img;
      }
    });
  });

  /* Reviews toggle */
  var btnAllReviews = document.getElementById("btn-all-reviews");
  var btnCloseReviews = document.getElementById("btn-close-reviews");
  if (btnAllReviews && reviewsPage) {
    btnAllReviews.addEventListener("click", function () { reviewsPage.hidden = false; });
  }
  if (btnCloseReviews && reviewsPage) {
    btnCloseReviews.addEventListener("click", function () { reviewsPage.hidden = true; });
  }

  /* Direct Checkout Action */
  var btnSkuBuy = document.getElementById("btn-sku-buy");
  if (btnSkuBuy) {
    btnSkuBuy.addEventListener("click", function () {
      var price = selectedSize === "Queen" ? "89.90" : selectedSize === "Casal" ? "79.90" : "69.90";
      var title = "Coberdrom Sherpa Lã de Carneiro - " + selectedSize + " (" + selectedColor + ")";
      var checkoutUrl = "/checkout?item=" + encodeURIComponent(title) + "&price=" + price + "&store=coberdrom";
      window.location.href = checkoutUrl;
    });
  }
})();
