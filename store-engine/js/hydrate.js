/* Hidrata a vitrine genérica com o JSON da loja criada no admin. */
(function () {
  "use strict";

  function apiBase() {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return "";
      if (h.endsWith(".onrender.com")) return "";
      if (typeof window.TTK_RENDER_API === "string") {
        return String(window.TTK_RENDER_API).replace(/\/+$/, "");
      }
    } catch (e) {}
    return "";
  }

  function mediaUrl(u) {
    var s = String(u || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s) || s.indexOf("data:") === 0) return s;
    if (s.charAt(0) !== "/") s = "/" + s;
    if (s.indexOf("/sf/") === 0 || s.indexOf("/storefronts-assets/") === 0) {
      return apiBase() + s;
    }
    return s;
  }

  function slugFromPath() {
    try {
      var forced = String(window.TTK_STORE || window.TTK_CLOAK_STORE || "")
        .trim()
        .toLowerCase();
      if (forced && forced !== "c" && forced !== "store-engine") return forced;
      var segs = String(location.pathname || "")
        .split("/")
        .filter(Boolean);
      if (!segs.length) return "";
      if (segs[0] === "c" && segs[1]) return String(segs[1]).toLowerCase();
      if (segs[0] === "store-engine") return "";
      return String(segs[0]).toLowerCase();
    } catch (e2) {
      return "";
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function moneyBR(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return v.toFixed(2).replace(".", ",");
  }

  function priceParts(n) {
    var raw = moneyBR(n);
    var bits = raw.split(",");
    return { int: bits[0] || "0", cents: bits[1] || "00" };
  }

  function offPct(price, oldPrice) {
    var p = Number(price) || 0;
    var o = Number(oldPrice) || 0;
    if (o <= 0 || p >= o) return 68;
    return Math.max(1, Math.min(95, Math.round((1 - p / o) * 100)));
  }

  function setText(sel, text) {
    document.querySelectorAll(sel).forEach(function (el) {
      el.textContent = text;
    });
  }

  function fillPriceEls(root, price) {
    var parts = priceParts(price);
    (root || document).querySelectorAll(".price-int").forEach(function (el) {
      el.textContent = parts.int;
    });
    (root || document).querySelectorAll(".price-cents").forEach(function (el) {
      el.textContent = "," + parts.cents;
    });
  }

  function avatars() {
    return [
      "/jaqueta/images/av-1.png",
      "/jaqueta/images/av-2.png",
      "/jaqueta/images/av-3.png",
      "/jaqueta/images/av-4.png",
      "/jaqueta/images/av-5.png",
      "/jaqueta/images/av-6.png",
      "/jaqueta/images/av-7.png",
      "/jaqueta/images/av-8.png",
    ];
  }

  function hydrate(cfg) {
    if (!cfg || !cfg.slug) return cfg;
    window.TTK_STORE = cfg.slug;
    window.TTK_STOREFRONT = cfg;

    var title = String(cfg.title || "Oferta");
    var price = Number(cfg.price) || 0;
    var oldPrice = Number(cfg.oldPrice);
    if (!oldPrice || oldPrice <= price) oldPrice = Math.round((price / 0.32) * 100) / 100;
    var off = offPct(price, oldPrice);
    var gallery = Array.isArray(cfg.gallery) && cfg.gallery.length ? cfg.gallery : [];
    var options = Array.isArray(cfg.options) && cfg.options.length ? cfg.options : [];
    var reviews = Array.isArray(cfg.reviews) ? cfg.reviews : [];
    var reviewCount = Number(cfg.reviewCount);
    if (!isFinite(reviewCount) || reviewCount < 0) reviewCount = reviews.length || 0;
    var rating = String(cfg.rating || "4.8").trim() || "4.8";
    var ratingShow = rating.replace(",", ".");
    var optionLabel = String(cfg.optionLabel || "Cor");
    var shortTitle = title.length > 36 ? title.slice(0, 34) + "…" : title;
    var sold = String(cfg.soldLabel || "").trim();
    if (sold && !/vendid/i.test(sold)) sold += " vendidos";
    if (!sold) sold = "1,2 mil vendidos";

    document.title = "Ofertas De Mulher - " + title;
    var search = document.querySelector(".search-text");
    if (search) search.textContent = title;

    var flash = document.querySelector(".flash-block");
    if (flash) {
      flash.classList.remove("flash-theme-orange", "flash-theme-rgb");
      flash.classList.add(cfg.flashTheme === "rgb" ? "flash-theme-rgb" : "flash-theme-orange");
    }
    setText(".flash-off, .discount-badge", "-" + off + "%");
    fillPriceEls(document, price);
    setText(".flash-old, .price-old", "R$ " + moneyBR(oldPrice));
    var inst = document.querySelector(".inst-text");
    if (inst && price > 0) {
      inst.textContent = "12x R$ " + moneyBR(price / 12);
    }

    var h1 = document.querySelector(".product-title");
    if (h1) h1.textContent = title;

    var ratingB = document.getElementById("sf-rating") || document.querySelector(".rating-row b");
    if (ratingB) ratingB.textContent = ratingShow;
    var countLink = document.getElementById("sf-reviews-n") || document.querySelector(".rating-row .count-link");
    if (countLink) countLink.textContent = "(" + reviewCount + ")";
    var soldEl = document.getElementById("sf-sold") || document.querySelector(".rating-row .muted");
    if (soldEl) soldEl.textContent = sold;

    var hero = document.getElementById("hero-carousel");
    if (hero && gallery.length) {
      hero.innerHTML = gallery
        .map(function (src, i) {
          return (
            '<img src="' +
            esc(mediaUrl(src)) +
            '" alt="' +
            esc(title) +
            '" loading="' +
            (i === 0 ? "eager" : "lazy") +
            '" />'
          );
        })
        .join("");
    }
    var counter = document.getElementById("hero-counter");
    if (counter) counter.textContent = "1/" + Math.max(gallery.length, 1);

    var rh = document.querySelector(".rh-title");
    if (rh) {
      rh.innerHTML = ratingShow + "&nbsp; Avaliações dos clientes (" + reviewCount + ")";
    }
    var coHead = document.querySelector(".co-header-title");
    if (coHead) {
      coHead.innerHTML = '<span class="star-glyph">★</span> Ótima avaliação! ' + ratingShow + "/5,0";
    }

    var preview = document.querySelector(".reviews-preview");
    if (preview) {
      var headBtn = preview.querySelector(".reviews-head");
      var miniHtml = reviews
        .slice(0, 2)
        .map(function (rv, i) {
          var photos = Array.isArray(rv.photos) ? rv.photos.filter(Boolean) : [];
          var av = avatars()[i % avatars().length];
          var media = photos
            .slice(0, 2)
            .map(function (src, pi) {
              var badge =
                pi === 1 && photos.length > 2
                  ? '<i class="thumb-badge">+' + (photos.length - 1) + "</i>"
                  : "";
              return '<span class="rm-thumb"><img src="' + esc(mediaUrl(src)) + '" alt="" />' + badge + "</span>";
            })
            .join("");
          return (
            '<article class="review-mini" data-open-reviews>' +
            '<div class="rm-left">' +
            '<div class="rm-userline">' +
            '<img class="avatar" src="' +
            esc(av) +
            '" alt="" />' +
            '<span class="stars">★★★★★</span>' +
            (rv.variant ? '<span class="variant">• ' + esc(rv.variant) + "</span>" : "") +
            "</div>" +
            '<p class="rm-line">' +
            esc(rv.text || "") +
            "</p>" +
            "</div>" +
            (media ? '<div class="rm-media">' + media + "</div>" : "") +
            "</article>"
          );
        })
        .join("");
      preview.innerHTML = (headBtn ? headBtn.outerHTML : "") + miniHtml;
    }

    var fullWrap = document.querySelector(".reviews-body");
    if (fullWrap && reviews.length) {
      var existingArts = fullWrap.querySelectorAll("article.full-review");
      existingArts.forEach(function (n) {
        n.parentNode.removeChild(n);
      });
      var html = reviews
        .map(function (rv, i) {
          var photos = Array.isArray(rv.photos) ? rv.photos.filter(Boolean) : [];
          var av = avatars()[i % avatars().length];
          var thumbs = photos
            .map(function (src) {
              return '<span class="rm-thumb"><img src="' + esc(mediaUrl(src)) + '" alt="" /></span>';
            })
            .join("");
          return (
            '<article class="full-review">' +
            '<div class="fr-user">' +
            '<img class="avatar" src="' +
            esc(av) +
            '" alt="" />' +
            "<div><b>" +
            esc(rv.name || "Cliente") +
            "</b><span class=\"stars\">★★★★★</span></div></div>" +
            (rv.variant ? '<p class="fr-variant">' + esc(rv.variant) + "</p>" : "") +
            "<p>" +
            esc(rv.text || "") +
            "</p>" +
            (thumbs ? '<div class="fr-photos">' + thumbs + "</div>" : "") +
            "</article>"
          );
        })
        .join("");
      var anchor = fullWrap.querySelector(".reviews-footer") || null;
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      while (tmp.firstChild) {
        if (anchor) fullWrap.insertBefore(tmp.firstChild, anchor);
        else fullWrap.appendChild(tmp.firstChild);
      }
    }

    var desc = document.querySelector(".desc-content");
    if (desc) {
      var body = String(cfg.description || "").trim();
      var paras = body
        ? body
            .split(/\n{2,}/)
            .map(function (p) {
              return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
            })
            .join("")
        : "<p>" + esc(title) + "</p>";
      var photosBlock = function (list) {
        var imgs = Array.isArray(list) ? list.filter(Boolean) : [];
        if (!imgs.length) return "";
        return (
          '<div class="desc-photos">' +
          imgs
            .map(function (src) {
              return '<img src="' + esc(mediaUrl(src)) + '" alt="" />';
            })
            .join("") +
          "</div>"
        );
      };
      var startImgs = Array.isArray(cfg.descImagesStart) ? cfg.descImagesStart : [];
      var endImgs = Array.isArray(cfg.descImagesEnd) ? cfg.descImagesEnd : [];
      if (!startImgs.length && !endImgs.length && Array.isArray(cfg.descImages) && cfg.descImages.length) {
        if (cfg.descImagesPos === "start") startImgs = cfg.descImages;
        else endImgs = cfg.descImages;
      }
      var lessBtn = desc.querySelector(".ver-menos");
      var mainHtml = photosBlock(startImgs) + paras + photosBlock(endImgs);
      desc.innerHTML =
        '<h4 class="desc-h">' +
        esc(title) +
        "</h4>" +
        mainHtml +
        (lessBtn ? lessBtn.outerHTML : "");
    }

    /* Guia P/M/G da jaqueta não entra nas lojas do painel — só a descrição salva. */
    document.querySelectorAll("#section-descricao .size-guide, #size-guide-block").forEach(function (el) {
      el.hidden = true;
      el.style.display = "none";
    });
    document.querySelectorAll("#section-descricao .sub-title").forEach(function (el) {
      if (/guia de tamanhos|tamanho/i.test(el.textContent || "") && !/descri/i.test(el.textContent || "")) {
        el.hidden = true;
        el.style.display = "none";
      }
    });

    var pickN = parseInt(cfg.optionPickCount, 10);
    if (!isFinite(pickN) || pickN < 1) pickN = 1;
    pickN = Math.max(1, Math.min(8, pickN));
    var optionLabelLow = String(optionLabel || "Cor").toLowerCase();
    var optHeadK = document.getElementById("opt-head-k");
    var optHeadV = document.getElementById("opt-head-v");
    var optHeadSub = document.getElementById("opt-head-sub");
    if (optHeadK) optHeadK.textContent = optionLabelLow + ":";
    if (optHeadV) optHeadV.textContent = pickN > 1 ? "Selecione" : (options[0] && options[0].name) || "Selecione";
    if (optHeadSub) {
      if (pickN > 1) {
        optHeadSub.hidden = false;
        optHeadSub.textContent = "Toque nas opções até escolher " + pickN;
      } else {
        optHeadSub.hidden = true;
      }
    }
    var kitBanner = document.getElementById("kit-banner");
    if (kitBanner) {
      kitBanner.hidden = pickN <= 1;
      var kt = document.getElementById("kit-banner-title");
      var ks = document.getElementById("kit-banner-sub");
      if (kt) kt.textContent = "Kit com " + pickN;
      if (ks) ks.textContent = "Toque nas opções até escolher " + pickN;
    }
    var pickProgress = document.getElementById("pick-progress");
    if (pickProgress) pickProgress.hidden = pickN <= 1;
    var pickLbl = document.getElementById("pick-count-label");
    if (pickLbl) pickLbl.textContent = "0 de " + pickN;

    var skuH = document.querySelector(".sku-scroll > .sku-h");
    if (skuH && !document.getElementById("opt-head-k")) skuH.textContent = optionLabel + " (" + options.length + ")";
    var optThumbs = document.getElementById("opt-thumbs");
    var thumbSrc = [];
    options.forEach(function (op) {
      var im = op && String(op.image || op.img || "").trim();
      if (im && thumbSrc.indexOf(im) === -1) thumbSrc.push(im);
    });
    thumbSrc = thumbSrc.slice(0, 5);
    if (optThumbs) {
      optThumbs.innerHTML = thumbSrc
        .map(function (src, i) {
          var half = i === thumbSrc.length - 1 && thumbSrc.length > 1 ? " half" : "";
          return '<img class="opt-thumb' + half + '" src="' + esc(mediaUrl(src)) + '" alt="" />';
        })
        .join("");
      optThumbs.hidden = !thumbSrc.length;
    }
    var optLab = document.getElementById("sf-options-label") || document.querySelector(".options-label");
    if (optLab) {
      var nOpt = Math.max(options.length, 1);
      optLab.textContent =
        nOpt === 1 ? "1 opção disponível" : nOpt + " opções disponíveis";
    }
    var grid = document.getElementById("sku-grid");
    if (grid && options.length) {
      grid.innerHTML = options
        .map(function (op, i) {
          var img = op.image || "";
          var name = op.name || "Opção " + (i + 1);
          var opPrice = Number(op.price);
          var priceAttr = opPrice > 0 ? String(opPrice) : "";
          var priceBit =
            opPrice > 0
              ? '<span class="sku-opt-price">R$ ' + moneyBR(opPrice) + "</span>"
              : "";
          return (
            '<button class="sku-opt' +
            (pickN <= 1 && i === 0 ? " selected" : "") +
            '" type="button" data-color="' +
            esc(name) +
            '" data-img="' +
            esc(mediaUrl(img)) +
            '" data-price="' +
            esc(priceAttr) +
            '">' +
            (img
              ? '<span class="sku-opt-img"><img src="' + esc(mediaUrl(img)) + '" alt="" /><i class="expand-ico"></i><b class="sku-qty-badge" hidden>0</b></span>'
              : '<b class="sku-qty-badge" hidden>0</b>') +
            '<span class="sku-opt-label">' +
            esc(name) +
            "</span>" +
            priceBit +
            "</button>"
          );
        })
        .join("");
    }
    var thumb = document.getElementById("sku-thumb");
    if (thumb) {
      thumb.src = mediaUrl((options[0] && options[0].image) || gallery[0] || "") || thumb.src;
    }

    var sizeList = Array.isArray(cfg.sizes)
      ? cfg.sizes.map(function (s) { return String(s || "").trim(); }).filter(Boolean)
      : [];
    var showSizesOn = sizeList.length > 0;
    var sizeHead = document.getElementById("size-head") || document.querySelector(".size-head");
    var sizeGrid = document.getElementById("size-grid");
    var sizeHeadK = document.getElementById("size-head-k");
    var sizeHintEl = document.getElementById("size-hint");
    if (sizeHeadK) sizeHeadK.textContent = String(cfg.sizeLabel || "Tamanho").toLowerCase() + ":";
    if (sizeHintEl) sizeHintEl.textContent = "Selecione";
    if (showSizesOn && sizeGrid) {
      if (sizeHead) {
        sizeHead.hidden = false;
        sizeHead.style.display = "";
      }
      sizeGrid.hidden = false;
      sizeGrid.style.display = "";
      sizeGrid.innerHTML = sizeList
        .map(function (sz) {
          return '<button class="size-opt" type="button" data-size="' + esc(sz) + '">' + esc(sz) + "</button>";
        })
        .join("");
    } else {
      if (sizeHead) {
        sizeHead.hidden = true;
        sizeHead.style.display = "none";
      }
      if (sizeGrid) {
        sizeGrid.hidden = true;
        sizeGrid.style.display = "none";
        sizeGrid.innerHTML = "";
      }
    }

    var extraList = document.getElementById("extra-list");
    if (extraList) {
      var upsells = [];
      if (Array.isArray(cfg.upsells) && cfg.upsells.length) {
        upsells = cfg.upsells.filter(function (u) {
          return u && String(u.title || "").trim() && Number(u.price) > 0;
        });
      } else if (cfg.extraEnabled && Number(cfg.extraPrice) > 0) {
        upsells = [
          {
            title: cfg.extraTitle || "Leve +1 unidade",
            sub: cfg.extraSub || "",
            price: cfg.extraPrice,
          },
        ];
      }
      if (upsells.length) {
        extraList.hidden = false;
        extraList.innerHTML = upsells
          .map(function (u, i) {
            var sub = String(u.sub || "").trim();
            return (
              '<div class="extra-row" role="checkbox" aria-checked="false" tabindex="0" data-ui="' +
              i +
              '">' +
              '<span class="extra-check" aria-hidden="true"></span>' +
              '<span class="extra-info"><span class="extra-title">' +
              esc(u.title) +
              "</span>" +
              (sub ? '<span class="extra-sub">' + esc(sub) + "</span>" : "") +
              "</span>" +
              '<span class="extra-price">+ R$ ' +
              moneyBR(u.price) +
              "</span></div>"
            );
          })
          .join("");
      } else {
        extraList.hidden = true;
        extraList.innerHTML = "";
      }
    }

    var logos = document.querySelectorAll(".store-logo");
    logos.forEach(function (img) {
      img.src = "/images/logo-loja.png";
      img.alt = "Ofertas De Mulher";
    });

    document.querySelectorAll(".pix-logo").forEach(function (img) {
      if (!img.getAttribute("src") || String(img.getAttribute("src")).indexOf("images/") === 0) {
        img.src = "/store-engine/images/pix.png";
      }
    });

    window.__ttkSfCartTitle = shortTitle;
    window.__ttkSfFullTitle = title;
    window.__ttkSfOldPriceLabel = "R$ " + moneyBR(oldPrice);
    window.__ttkSfOffLabel = "-" + off + "%";
    return cfg;
  }

  function loadPixels(slug) {
    return fetch(apiBase() + "/api/pixel/public?store=" + encodeURIComponent(slug), { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        var ids = ((j && j.pixels) || [])
          .map(function (p) {
            return String((p && p.id) || "").trim();
          })
          .filter(Boolean);
        window.tikTokPixelIds = ids;
        window.tikTokPixelId = ids[0] || "";
        window.tikTokAttributionPixelId = String(window.tikTokPixelId || "");
        try {
          var ttq = window.ttq;
          if (ttq && typeof ttq.load === "function") {
            ids.forEach(function (id) {
              if (id) ttq.load(id);
            });
            if (ids.length && typeof ttq.page === "function") ttq.page();
          }
        } catch (ePx) {}
        return ids;
      })
      .catch(function () {
        return [];
      });
  }

  var slug = slugFromPath();
  window.TTK_STOREFRONT_READY = (function () {
    function done(cfg) {
      try {
        document.body.classList.remove("sf-wait");
      } catch (eD) {}
      return cfg;
    }
    if (!slug) return Promise.resolve(done(null));
    return fetch(apiBase() + "/api/storefront/" + encodeURIComponent(slug), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("storefront " + r.status);
        return r.json();
      })
      .then(function (cfg) {
        hydrate(cfg);
        loadPixels(cfg.slug || slug);
        return cfg;
      })
      .catch(function (err) {
        console.warn("[store-engine]", err && err.message ? err.message : err);
        return null;
      })
      .then(done);
  })();
})();
