(function () {
  "use strict";

  function authHeaders() {
    var t = "";
    try {
      t = localStorage.getItem("admin_token") || "";
    } catch (e) {}
    return t ? { Authorization: "Bearer " + t } : {};
  }

  function val(id, fallback) {
    var el = document.getElementById(id);
    if (!el || el.value == null || String(el.value) === "") return fallback == null ? "" : fallback;
    return String(el.value);
  }

  function apiUrl(path) {
    var p = path.charAt(0) === "/" ? path : "/" + path;
    var base = "";
    try {
      base = String(window.TTK_RENDER_API || "").replace(/\/$/, "");
    } catch (e) {}
    return base + p;
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function compressImageFile(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve("");
      var failEmpty = function () {
        resolve("");
      };
      var mime = String(file.type || "");
      if (mime && mime.indexOf("image/") !== 0) return failEmpty();
      if (file.size && file.size < 220000 && /^image\/jpe?g$/i.test(mime)) {
        return fileToDataUrl(file).then(function (u) {
          resolve(u || "");
        }, failEmpty);
      }
      var objUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          URL.revokeObjectURL(objUrl);
        } catch (e0) {}
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (!w || !h) return failEmpty();
        var scale = Math.min(1, 1280 / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext("2d");
        if (!ctx) return failEmpty();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        var out = "";
        try {
          out = canvas.toDataURL("image/jpeg", 0.8);
          if (out.length > 1400000) out = canvas.toDataURL("image/jpeg", 0.62);
        } catch (eC) {
          return failEmpty();
        }
        if (!out || out.indexOf("data:image/") !== 0 || out.length > 2200000) return failEmpty();
        resolve(out);
      };
      img.onerror = function () {
        try {
          URL.revokeObjectURL(objUrl);
        } catch (e1) {}
        failEmpty();
      };
      img.src = objUrl;
    });
  }

  function filesToDataUrls(input) {
    var files = input && input.files ? Array.prototype.slice.call(input.files, 0) : [];
    return Promise.all(files.map(compressImageFile)).then(function (urls) {
      return urls.filter(Boolean);
    });
  }

  function selectedFileCount(input) {
    return input && input.files ? input.files.length : 0;
  }

  function readRes(r) {
    return r.text().then(function (t) {
      var j = {};
      try {
        j = t ? JSON.parse(t) : {};
      } catch (eP) {
        var html = /<\s*html|<\s*title|bad gateway|entity too large/i.test(t || "");
        j = {
          error:
            r.status === 413 || /too large/i.test(t || "")
              ? "As fotos estão pesadas demais. Manda JPG/PNG menores."
              : r.status === 502 || html
                ? "O servidor recusou o envio (fotos grandes). Tenta JPG menores ou menos fotos."
                : r.status === 401
                  ? "Sessão expirada. Entra de novo no admin."
                  : "Resposta inválida do servidor (HTTP " + r.status + "). Recarrega o admin com Ctrl+F5.",
        };
      }
      return { ok: r.ok, status: r.status, j: j };
    });
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function moneyInput(n) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) return "";
    return v.toFixed(2).replace(".", ",");
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v == null ? "" : String(v);
  }

  var overlay = document.getElementById("store-builder");
  var grid = document.getElementById("stores-grid");
  var optWrap = document.getElementById("sb-options");
  var revWrap = document.getElementById("sb-reviews");
  var upWrap = document.getElementById("sb-upsells");
  var sizeWrap = document.getElementById("sb-sizes-list");
  var descPrevStart = document.getElementById("sb-desc-preview-start");
  var descPrevEnd = document.getElementById("sb-desc-preview-end");
  var galPrev = document.getElementById("sb-gallery-preview");
  var editingSlug = "";
  var existingGallery = [];
  var existingDescStart = [];
  var existingDescEnd = [];
  var lastStores = [];
  var DEFAULT_SIZES = ["PP", "P", "M", "G", "GG", "EXG", "G3", "G4", "G5", "G6"];

  function status(msg, kind) {
    var el = document.getElementById("sb-status");
    if (!el) return;
    el.hidden = !msg;
    el.className = "sb-status" + (kind ? " " + kind : "");
    el.textContent = msg || "";
  }

  function showGalleryThumbs(urls) {
    if (!galPrev) return;
    galPrev.innerHTML = "";
    (urls || []).forEach(function (u) {
      if (!u) return;
      var img = document.createElement("img");
      img.src = u;
      galPrev.appendChild(img);
    });
  }

  function showDescThumbs(el, urls) {
    if (!el) return;
    el.innerHTML = "";
    (urls || []).forEach(function (u) {
      if (!u) return;
      var img = document.createElement("img");
      img.src = u;
      el.appendChild(img);
    });
  }

  function addSizeRow(val) {
    if (!sizeWrap) return;
    if (sizeWrap.querySelectorAll(".sb-size-chip").length >= 20) return;
    var row = document.createElement("div");
    row.className = "sb-size-chip";
    row.innerHTML =
      '<input type="text" class="sb-size-val" maxlength="16" placeholder="ex.: 42" />' +
      '<button type="button" class="sb-size-del" aria-label="Remover">×</button>';
    if (val) row.querySelector(".sb-size-val").value = val;
    row.querySelector(".sb-size-del").addEventListener("click", function () {
      row.remove();
    });
    sizeWrap.appendChild(row);
  }

  function collectSizes() {
    return Array.prototype.slice
      .call(document.querySelectorAll(".sb-size-val"))
      .map(function (inp) {
        return (inp.value || "").trim();
      })
      .filter(Boolean);
  }

  function fillSizes(list) {
    if (!sizeWrap) return;
    sizeWrap.innerHTML = "";
    (list || []).forEach(function (s) {
      addSizeRow(s);
    });
  }

  function isAutoOptionImage(url) {
    return /\/gallery[-_/]/i.test(String(url || ""));
  }

  function addOptionRow(name, imageUrl, price) {
    if (!optWrap) return;
    if (isAutoOptionImage(imageUrl)) imageUrl = "";
    var row = document.createElement("div");
    row.className = "sb-opt";
    if (imageUrl) row.dataset.existing = imageUrl;
    row.innerHTML =
      '<div class="sb-opt-row">' +
      '<input type="text" class="sb-opt-name" placeholder="Nome da opção (ex.: Preto)" />' +
      '<input type="file" class="sb-opt-img" accept="image/*" />' +
      '<button class="btn btn-ghost sb-opt-del" type="button">Remover</button>' +
      "</div>" +
      '<label class="sb-opt-price-wrap">Preço desta opção (R$)' +
      '<input type="text" class="sb-opt-price" inputmode="decimal" placeholder="vazio = preço da loja" />' +
      "</label>" +
      (imageUrl
        ? '<div class="sb-opt-preview"><img class="sb-exist-thumb" src="' +
          String(imageUrl).replace(/"/g, "") +
          '" alt="" /><button class="btn btn-ghost sb-opt-clear" type="button">Tirar foto</button></div>'
        : "");
    if (name) row.querySelector(".sb-opt-name").value = name;
    if (price != null && Number(String(price).replace(",", ".")) > 0) {
      row.querySelector(".sb-opt-price").value = moneyInput(price);
    }
    row.querySelector(".sb-opt-del").addEventListener("click", function () {
      row.remove();
    });
    var clearBtn = row.querySelector(".sb-opt-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        delete row.dataset.existing;
        var prev = row.querySelector(".sb-opt-preview");
        if (prev) prev.remove();
        var fileIn = row.querySelector(".sb-opt-img");
        if (fileIn) fileIn.value = "";
      });
    }
    optWrap.appendChild(row);
  }

  function addReviewRow(rev) {
    if (!revWrap) return;
    rev = rev || {};
    var photos = Array.isArray(rev.photos) ? rev.photos.filter(Boolean) : [];
    var row = document.createElement("div");
    row.className = "sb-rev";
    if (photos.length) row.dataset.existing = JSON.stringify(photos);
    row.innerHTML =
      '<input type="text" class="sb-rev-name" placeholder="Nome (ex.: Maria S.)" />' +
      '<input type="text" class="sb-rev-variant" placeholder="Variante (opcional, ex.: Preto, M)" />' +
      '<textarea class="sb-rev-text" rows="3" placeholder="Mensagem da avaliação"></textarea>' +
      '<input type="file" class="sb-rev-photos" accept="image/*" multiple />' +
      (photos.length
        ? '<div class="sb-thumbs">' +
          photos
            .map(function (u) {
              return '<img src="' + String(u).replace(/"/g, "") + '" alt="" />';
            })
            .join("") +
          "</div>"
        : "") +
      '<button class="btn btn-ghost sb-rev-del" type="button">Remover</button>';
    row.querySelector(".sb-rev-name").value = rev.name || "";
    row.querySelector(".sb-rev-variant").value = rev.variant || "";
    row.querySelector(".sb-rev-text").value = rev.text || "";
    row.querySelector(".sb-rev-del").addEventListener("click", function () {
      row.remove();
    });
    revWrap.appendChild(row);
  }

  function addUpsellRow(u) {
    if (!upWrap) return;
    if (upWrap.querySelectorAll(".sb-upsell").length >= 8) return;
    u = u || {};
    var imageUrl = String(u.image || "").trim();
    var row = document.createElement("div");
    row.className = "sb-upsell";
    if (imageUrl) row.dataset.existing = imageUrl;
    row.innerHTML =
      '<div class="sb-grid">' +
      '<label>Título do upsell' +
      '<input type="text" class="sb-up-title" placeholder="Leve +10 facas de cozinha" />' +
      "</label>" +
      "<label>Subtítulo" +
      '<input type="text" class="sb-up-sub" placeholder="Receba uma cor surpresa adicional" />' +
      "</label>" +
      '<label>Preço extra (R$)' +
      '<input type="text" class="sb-up-price" inputmode="decimal" placeholder="19,99" />' +
      "</label>" +
      "</div>" +
      '<label class="sb-upsell-file">Foto no checkout (opcional — não aparece nas opções)' +
      '<input type="file" class="sb-up-img" accept="image/*" />' +
      "</label>" +
      (imageUrl
        ? '<div class="sb-opt-preview"><img class="sb-exist-thumb" src="' +
          String(imageUrl).replace(/"/g, "") +
          '" alt="" /><button class="btn btn-ghost sb-up-clear" type="button">Tirar foto</button></div>'
        : "") +
      '<button class="btn btn-ghost sb-up-del" type="button">Remover</button>';
    if (u.title) row.querySelector(".sb-up-title").value = u.title;
    if (u.sub) row.querySelector(".sb-up-sub").value = u.sub;
    if (u.price != null && u.price !== "") {
      var p = moneyInput(u.price);
      if (p) row.querySelector(".sb-up-price").value = p;
    }
    row.querySelector(".sb-up-del").addEventListener("click", function () {
      row.remove();
    });
    var clearBtn = row.querySelector(".sb-up-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        delete row.dataset.existing;
        var prev = row.querySelector(".sb-opt-preview");
        if (prev) prev.remove();
        var fileIn = row.querySelector(".sb-up-img");
        if (fileIn) fileIn.value = "";
      });
    }
    upWrap.appendChild(row);
  }

  function storeUpsells(s) {
    if (!s) return [];
    if (Array.isArray(s.upsells) && s.upsells.length) {
      return s.upsells.filter(function (u) {
        return u && String(u.title || "").trim() && Number(u.price) > 0;
      });
    }
    if (s.extraEnabled && Number(s.extraPrice) > 0) {
      return [
        {
          title: s.extraTitle || "",
          sub: s.extraSub || "",
          price: s.extraPrice,
          image: s.extraImage || "",
        },
      ];
    }
    return [];
  }

  function setMode(editSlug) {
    editingSlug = editSlug ? String(editSlug) : "";
    var head = document.getElementById("sb-head-title");
    var desc = document.getElementById("sb-head-desc");
    var saveBtn = document.getElementById("sb-save");
    var slugIn = document.getElementById("sb-slug");
    var galHint = document.getElementById("sb-gallery-hint");
    if (head) head.textContent = editingSlug ? "Editar loja" : "Criar loja";
    if (desc) {
      desc.textContent = editingSlug
        ? "Altera a vitrine. A URL /" + editingSlug + " continua a mesma."
        : "Mesmo layout TikTok das lojas atuais. O link público fica em ofertasgrandes.vercel.app/sua-url. Pixels e /loja entram sozinhos.";
    }
    if (saveBtn) saveBtn.textContent = editingSlug ? "Salvar alterações" : "Criar loja";
    if (slugIn) {
      slugIn.disabled = !!editingSlug;
      if (editingSlug) slugIn.dataset.touched = "1";
      else delete slugIn.dataset.touched;
    }
    if (galHint) {
      galHint.textContent = editingSlug
        ? "Deixe em branco para manter as fotos atuais. Se enviar novas, a galeria inteira é trocada."
        : "Galeria do topo da vitrine. A primeira vira capa no /loja e nas recomendações.";
    }
  }

  function resetForm() {
    editingSlug = "";
    existingGallery = [];
    existingDescStart = [];
    existingDescEnd = [];
    ["sb-title", "sb-slug", "sb-price", "sb-old", "sb-reviews-n", "sb-sold", "sb-desc"].forEach(function (id) {
      setVal(id, "");
    });
    setVal("sb-rating", "4.8");
    setVal("sb-opt-label", "Cor");
    setVal("sb-opt-pick", "1");
    setVal("sb-size-label", "Tamanho");
    var sizesCkGone = document.getElementById("sb-sizes");
    if (sizesCkGone) sizesCkGone.checked = false;
    var orange = document.querySelector('input[name="sb-flash"][value="orange"]');
    if (orange) orange.checked = true;
    var gal = document.getElementById("sb-gallery");
    if (gal) gal.value = "";
    ["sb-desc-imgs-start", "sb-desc-imgs-end"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    if (optWrap) optWrap.innerHTML = "";
    if (revWrap) revWrap.innerHTML = "";
    if (upWrap) upWrap.innerHTML = "";
    fillSizes([]);
    showGalleryThumbs([]);
    showDescThumbs(descPrevStart, []);
    showDescThumbs(descPrevEnd, []);
    addOptionRow();
    addReviewRow();
    addUpsellRow();
    setMode("");
    status("", "");
  }

  function fillForm(s) {
    resetForm();
    if (!s || !s.slug) return;
    setMode(s.slug);
    setVal("sb-title", s.title || s.name || "");
    setVal("sb-slug", s.slug);
    setVal("sb-price", moneyInput(s.price));
    setVal("sb-old", moneyInput(s.oldPrice));
    setVal("sb-reviews-n", s.reviewCount != null && s.reviewCount !== "" ? s.reviewCount : "");
    setVal("sb-rating", s.rating || "4.8");
    setVal("sb-sold", s.soldLabel || "");
    setVal("sb-opt-label", s.optionLabel || "Cor");
    setVal("sb-opt-pick", s.optionPickCount > 1 ? String(s.optionPickCount) : "1");
    setVal("sb-size-label", s.sizeLabel || "Tamanho");
    setVal("sb-desc", s.description || "");
    var flash = document.querySelector('input[name="sb-flash"][value="' + (s.flashTheme === "rgb" ? "rgb" : "orange") + '"]');
    if (flash) flash.checked = true;
    var sizeVals = Array.isArray(s.sizes) ? s.sizes.filter(Boolean) : s.showSizes === false ? [] : DEFAULT_SIZES.slice();
    fillSizes(sizeVals);
    existingGallery = Array.isArray(s.gallery) ? s.gallery.slice() : [];
    showGalleryThumbs(existingGallery);
    existingDescStart = Array.isArray(s.descImagesStart)
      ? s.descImagesStart.slice()
      : s.descImagesPos === "start" && Array.isArray(s.descImages)
        ? s.descImages.slice()
        : [];
    existingDescEnd = Array.isArray(s.descImagesEnd)
      ? s.descImagesEnd.slice()
      : s.descImagesPos !== "start" && Array.isArray(s.descImages) && !Array.isArray(s.descImagesStart)
        ? s.descImages.slice()
        : [];
    showDescThumbs(descPrevStart, existingDescStart);
    showDescThumbs(descPrevEnd, existingDescEnd);
    if (optWrap) optWrap.innerHTML = "";
    var opts = Array.isArray(s.options) ? s.options : [];
    if (opts.length) {
      opts.forEach(function (o) {
        addOptionRow(o.name || o.label || "", o.image || o.img || "", o.price);
      });
    } else {
      addOptionRow();
    }
    if (revWrap) revWrap.innerHTML = "";
    var revs = Array.isArray(s.reviews) ? s.reviews.filter(function (r) { return r && r.text; }) : [];
    if (revs.length) {
      revs.forEach(addReviewRow);
    } else {
      addReviewRow();
    }
    if (upWrap) upWrap.innerHTML = "";
    var ups = storeUpsells(s);
    if (ups.length) {
      ups.forEach(addUpsellRow);
    } else {
      addUpsellRow();
    }
    status("", "");
  }

  function openBuilder() {
    if (!overlay) return;
    resetForm();
    overlay.hidden = false;
  }

  function openEditor(slug) {
    if (!overlay) return;
    var found = lastStores.filter(function (s) {
      return s && s.dynamic && String(s.slug) === String(slug);
    })[0];
    overlay.hidden = false;
    status("Carregando loja…", "");
    var apply = function (s) {
      if (!s) {
        status("Loja não encontrada.", "err");
        return;
      }
      fillForm(s);
    };
    if (found && (found.gallery || found.description || found.options)) {
      apply(found);
      return;
    }
    fetch("/api/admin/stores/" + encodeURIComponent(slug), { headers: authHeaders() })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || "Falha ao carregar");
        apply(res.j.store || res.j);
      })
      .catch(function (e) {
        status(e.message || "Falha ao carregar loja", "err");
      });
  }

  function closeBuilder() {
    if (overlay) overlay.hidden = true;
    editingSlug = "";
  }

  function renderStores(list) {
    if (!grid) return;
    lastStores = list || [];
    if (!list || !list.length) {
      grid.innerHTML = '<div class="empty">Nenhuma loja ainda. Clique em Criar loja.</div>';
      return;
    }
    grid.innerHTML = list
      .map(function (s) {
        var tag = s.builtin
          ? '<span class="store-tag">nativa</span>'
          : '<span class="store-tag dyn">criada no painel</span>';
        var publicUrl = s.publicUrl || s.url || "/" + s.slug;
        var links =
          '<div class="store-links">' +
          '<a href="' +
          publicUrl +
          '" target="_blank" rel="noopener">' +
          String(publicUrl).replace(/^https?:\/\//, "") +
          "</a>" +
          (s.dynamic ? '<a href="/loja/" target="_blank" rel="noopener">/loja</a>' : "") +
          (s.dynamic
            ? '<button type="button" class="store-edit" data-slug="' +
              String(s.slug).replace(/"/g, "") +
              '">Editar</button>'
            : "") +
          "</div>";
        return (
          '<article class="store-card">' +
          "<h4>" +
          String(s.name || s.slug) +
          "</h4>" +
          "<p>" +
          String(s.publicUrl || "/" + s.slug) +
          "</p>" +
          tag +
          links +
          "</article>"
        );
      })
      .join("");
  }

  function loadStores() {
    if (!grid) return;
    fetch("/api/admin/stores", { headers: authHeaders() })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          grid.innerHTML = '<div class="empty">' + (res.j.error || "Falha ao carregar lojas") + "</div>";
          return;
        }
        renderStores(res.j.stores || []);
        window.__TTK_ADMIN_STORES = (res.j.stores || []).map(function (s) {
          return { val: s.slug || s.id, label: s.name || s.slug };
        });
      })
      .catch(function () {
        grid.innerHTML = '<div class="empty">Servidor indisponível.</div>';
      });
  }

  function collectPayload() {
    var title = (document.getElementById("sb-title").value || "").trim();
    var slug = editingSlug || slugify(document.getElementById("sb-slug").value || title);
    var flash = (document.querySelector('input[name="sb-flash"]:checked') || {}).value || "orange";
    var optRows = Array.prototype.slice.call(document.querySelectorAll(".sb-opt"));
    var revRows = Array.prototype.slice.call(document.querySelectorAll(".sb-rev"));
    var upRows = Array.prototype.slice.call(document.querySelectorAll(".sb-upsell"));
    return Promise.all([
      filesToDataUrls(document.getElementById("sb-gallery")),
      Promise.all(
        optRows.map(function (row) {
          var name = (row.querySelector(".sb-opt-name").value || "").trim();
          var price = ((row.querySelector(".sb-opt-price") || {}).value || "").trim();
          return filesToDataUrls(row.querySelector(".sb-opt-img")).then(function (imgs) {
            return { name: name, price: price, image: imgs[0] || row.dataset.existing || "" };
          });
        })
      ),
      Promise.all(
        revRows.map(function (row) {
          var existing = [];
          try {
            existing = JSON.parse(row.dataset.existing || "[]");
          } catch (e) {
            existing = [];
          }
          return filesToDataUrls(row.querySelector(".sb-rev-photos")).then(function (photos) {
            return {
              name: (row.querySelector(".sb-rev-name").value || "").trim() || "Cliente",
              variant: (row.querySelector(".sb-rev-variant").value || "").trim(),
              text: (row.querySelector(".sb-rev-text").value || "").trim(),
              photos: photos.length ? photos : existing,
            };
          });
        })
      ),
      Promise.all(
        upRows.map(function (row) {
          var title = (row.querySelector(".sb-up-title").value || "").trim();
          var sub = (row.querySelector(".sb-up-sub").value || "").trim();
          var price = (row.querySelector(".sb-up-price").value || "").trim();
          return filesToDataUrls(row.querySelector(".sb-up-img")).then(function (imgs) {
            return {
              title: title,
              sub: sub,
              price: price,
              image: imgs[0] || row.dataset.existing || "",
            };
          });
        })
      ),
      filesToDataUrls(document.getElementById("sb-desc-imgs-start")),
      filesToDataUrls(document.getElementById("sb-desc-imgs-end")),
    ]).then(function (pack) {
      var incomplete = pack[3].some(function (u) {
        var hasAny = !!(u.title || u.sub || u.price || u.image);
        var priceN = Number(String(u.price || "").replace(",", "."));
        if (!hasAny) return false;
        return !u.title || !(priceN > 0);
      });
      if (incomplete) throw new Error("Cada upsell precisa de título e preço.");
      var upsells = pack[3].filter(function (u) {
        return u.title && Number(String(u.price || "").replace(",", ".")) > 0;
      });
      var first = upsells[0];
      var galIn = document.getElementById("sb-gallery");
      if (selectedFileCount(galIn) && !pack[0].length) {
        throw new Error("Não deu pra ler as fotos da galeria. Manda JPG ou PNG (não HEIC).");
      }
      if (selectedFileCount(document.getElementById("sb-desc-imgs-start")) && !(pack[4] && pack[4].length)) {
        throw new Error("Não deu pra ler as fotos do começo da descrição. Manda JPG ou PNG.");
      }
      if (selectedFileCount(document.getElementById("sb-desc-imgs-end")) && !(pack[5] && pack[5].length)) {
        throw new Error("Não deu pra ler as fotos do final da descrição. Manda JPG ou PNG.");
      }
      return {
        title: title,
        slug: slug,
        price: val("sb-price"),
        oldPrice: val("sb-old"),
        reviewCount: val("sb-reviews-n"),
        rating: val("sb-rating", "4.8"),
        soldLabel: val("sb-sold"),
        optionLabel: val("sb-opt-label", "Cor"),
        optionPickCount: val("sb-opt-pick", "1"),
        sizeLabel: val("sb-size-label", "Tamanho"),
        sizes: collectSizes(),
        description: val("sb-desc"),
        descImagesStart: pack[4] && pack[4].length ? pack[4] : existingDescStart.slice(),
        descImagesEnd: pack[5] && pack[5].length ? pack[5] : existingDescEnd.slice(),
        flashTheme: flash,
        extraEnabled: upsells.length > 0,
        extraTitle: first ? first.title : "",
        extraSub: first ? first.sub : "",
        extraPrice: first ? first.price : "",
        extraImage: first ? first.image : "",
        upsells: upsells,
        gallery: pack[0].length ? pack[0] : existingGallery.slice(),
        options: pack[1].filter(function (o) {
          return o.name;
        }).map(function (o) {
          var pn = Number(String(o.price || "").replace(",", "."));
          return {
            name: o.name,
            image: isAutoOptionImage(o.image) ? "" : o.image,
            price: pn > 0 ? pn : 0,
          };
        }),
        reviews: pack[2].filter(function (r) {
          return r.text;
        }),
      };
    });
  }

  function save() {
    var btn = document.getElementById("sb-save");
    var isEdit = !!editingSlug;
    status(isEdit ? "Salvando alterações…" : "Enviando imagens e criando a loja…", "");
    if (btn) {
      btn.disabled = true;
      btn.textContent = isEdit ? "Salvando…" : "Criando…";
    }
    collectPayload()
      .then(function (payload) {
        if (!payload.title) throw new Error("Informe o título.");
        if (!payload.slug) throw new Error("Informe a URL (slug).");
        if (!payload.price) throw new Error("Informe o preço atual.");
        if (!payload.oldPrice) throw new Error("Informe o preço antigo (o valor riscado).");
        var priceN = Number(String(payload.price).replace(",", "."));
        var oldN = Number(String(payload.oldPrice).replace(",", "."));
        if (!(oldN > priceN)) throw new Error("O preço antigo precisa ser maior que o preço atual.");
        if (!payload.gallery.length) throw new Error("Envie pelo menos 1 imagem principal.");
        var raw = JSON.stringify(payload);
        if (raw.length > 9e6) {
          throw new Error("As fotos juntas ficaram pesadas. Manda menos fotos, ou JPG menores.");
        }
        var url = isEdit
          ? apiUrl("/api/admin/stores/" + encodeURIComponent(editingSlug))
          : apiUrl("/api/admin/stores");
        return fetch(url, {
          method: isEdit ? "PUT" : "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: raw,
        });
      })
      .then(readRes)
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || (isEdit ? "Falha ao salvar" : "Falha ao criar"));
        var links = res.j.links || {};
        status(
          isEdit
            ? "Loja atualizada. Link: " + (links.vitrine || "")
            : "Loja criada. Link: " + (links.vitrine || "") + " · Pixels e /loja já aparecem no painel.",
          "ok"
        );
        loadStores();
        setTimeout(closeBuilder, 1400);
      })
      .catch(function (e) {
        var msg = (e && e.message) || "Falha ao salvar loja";
        if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
          msg = "Não chegou no servidor. Se mandou várias fotos grandes, tenta JPG menores.";
        }
        status(msg, "err");
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = editingSlug ? "Salvar alterações" : "Criar loja";
        }
      });
  }

  var titleIn = document.getElementById("sb-title");
  var slugIn = document.getElementById("sb-slug");
  if (titleIn && slugIn) {
    titleIn.addEventListener("input", function () {
      if (!editingSlug && !slugIn.dataset.touched) slugIn.value = slugify(titleIn.value);
    });
    slugIn.addEventListener("input", function () {
      slugIn.dataset.touched = "1";
    });
  }

  var gal = document.getElementById("sb-gallery");
  if (gal && galPrev) {
    gal.addEventListener("change", function () {
      galPrev.innerHTML = "";
      Array.prototype.slice.call(gal.files || []).forEach(function (f) {
        var img = document.createElement("img");
        img.src = URL.createObjectURL(f);
        galPrev.appendChild(img);
      });
    });
  }

  function bindDescInput(inputId, previewEl, existingRef) {
    var input = document.getElementById(inputId);
    if (input && previewEl) {
      input.addEventListener("change", function () {
        previewEl.innerHTML = "";
        Array.prototype.slice.call(input.files || []).forEach(function (f) {
          var img = document.createElement("img");
          img.src = URL.createObjectURL(f);
          previewEl.appendChild(img);
        });
      });
    }
    return input;
  }
  var descInStart = bindDescInput("sb-desc-imgs-start", descPrevStart);
  var descInEnd = bindDescInput("sb-desc-imgs-end", descPrevEnd);
  var descClearStart = document.getElementById("sb-desc-clear-start");
  if (descClearStart) {
    descClearStart.addEventListener("click", function () {
      existingDescStart = [];
      showDescThumbs(descPrevStart, []);
      if (descInStart) descInStart.value = "";
    });
  }
  var descClearEnd = document.getElementById("sb-desc-clear-end");
  if (descClearEnd) {
    descClearEnd.addEventListener("click", function () {
      existingDescEnd = [];
      showDescThumbs(descPrevEnd, []);
      if (descInEnd) descInEnd.value = "";
    });
  }

  var addSize = document.getElementById("sb-add-size");
  if (addSize) addSize.addEventListener("click", function () {
    addSizeRow("");
  });
  var sizePpg6 = document.getElementById("sb-sizes-ppg6");
  if (sizePpg6) {
    sizePpg6.addEventListener("click", function () {
      fillSizes(DEFAULT_SIZES.slice());
    });
  }

  var btnCreate = document.getElementById("btn-create-store");
  if (btnCreate) btnCreate.addEventListener("click", openBuilder);
  ["sb-close", "sb-cancel"].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener("click", closeBuilder);
  });
  var addOpt = document.getElementById("sb-add-opt");
  if (addOpt) addOpt.addEventListener("click", function () {
    addOptionRow();
  });
  var addRev = document.getElementById("sb-add-rev");
  if (addRev) addRev.addEventListener("click", function () {
    addReviewRow();
  });
  var addUp = document.getElementById("sb-add-upsell");
  if (addUp) addUp.addEventListener("click", function () {
    addUpsellRow();
  });
  var saveBtn = document.getElementById("sb-save");
  if (saveBtn) saveBtn.addEventListener("click", save);

  if (grid) {
    grid.addEventListener("click", function (e) {
      var btn = e.target.closest(".store-edit");
      if (!btn) return;
      openEditor(btn.getAttribute("data-slug"));
    });
  }

  window.TTK_STORE_BUILDER = { load: loadStores, open: openBuilder, edit: openEditor };

  if (document.getElementById("page-stores") && document.getElementById("page-stores").classList.contains("active")) {
    loadStores();
  }
})();
