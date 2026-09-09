/**
 * Lojas criadas no admin (vitrine genérica store-engine).
 * JSON em DATA_DIR/storefronts.json; imagens em DATA_DIR/storefronts/{slug}/ e ROOT/storefronts-assets/.
 */
module.exports = function install(ctx) {
  var fs = ctx.fs;
  var path = ctx.path;
  var crypto = ctx.crypto;
  var ROOT = ctx.ROOT;
  var DATA_DIR = ctx.DATA_DIR;
  var STORE_PATHS = ctx.STORE_PATHS;
  var SIMPLE_CHECKOUT_STORES = ctx.SIMPLE_CHECKOUT_STORES;
  var CLOAKER_STORES = ctx.CLOAKER_STORES;

  var STOREFRONTS_FILE = path.join(DATA_DIR, "storefronts.json");
  var STOREFRONTS_BOOTSTRAP = path.join(ROOT, "storefronts.json");
  var ASSETS_DATA = path.join(DATA_DIR, "storefronts");
  var ASSETS_ROOT = path.join(ROOT, "storefronts-assets");

  var RESERVED = {
    admin: 1,
    adminv2: 1,
    api: 1,
    js: 1,
    css: 1,
    images: 1,
    loja: 1,
    compra: 1,
    rastreio: 1,
    pago: 1,
    aquecer: 1,
    c: 1,
    "store-engine": 1,
    sf: 1,
    simular: 1,
    "captcha-challenge": 1,
    "pedido-confirmado": 1,
    panelas: 1,
    panela: 1,
    backups: 1,
    "admin-v2": 1,
    n7jq: 1,
    n7cj: 1,
    n7tl: 1,
    n7bb: 1,
    n7rp: 1,
    n7td: 1,
    n7cb: 1,
    n7fd: 1,
    n7t2: 1,
    n7lz: 1,
    jqt: 1,
    cj: 1,
    tlh: 1,
    bbj: 1,
    rp: 1,
    tdd: 1,
    cb: 1,
    fd: 1,
  };
  Object.keys(STORE_PATHS).forEach(function (k) {
    RESERVED[k] = 1;
    if (STORE_PATHS[k] && STORE_PATHS[k].dir) RESERVED[STORE_PATHS[k].dir] = 1;
  });

  function ensureDir(d) {
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    } catch (e) {}
  }

  function loadStorefrontsDoc() {
    function parse(file) {
      try {
        if (!fs.existsSync(file)) return null;
        var raw = JSON.parse(fs.readFileSync(file, "utf8"));
        if (raw && Array.isArray(raw.stores)) return raw;
        if (raw && Array.isArray(raw)) return { stores: raw };
      } catch (e) {}
      return null;
    }
    var bootTime = 0;
    var boot = null;
    try {
      if (fs.existsSync(STOREFRONTS_BOOTSTRAP)) {
        bootTime = fs.statSync(STOREFRONTS_BOOTSTRAP).mtimeMs || 0;
        boot = parse(STOREFRONTS_BOOTSTRAP);
      }
    } catch (eB) {}
    var fileTime = 0;
    var file = parse(STOREFRONTS_FILE);
    try {
      if (fs.existsSync(STOREFRONTS_FILE)) fileTime = fs.statSync(STOREFRONTS_FILE).mtimeMs || 0;
    } catch (eF) {}
    if (boot && bootTime >= fileTime) return boot;
    if (file) return file;
    if (boot) return boot;
    return { stores: [] };
  }

  function loadStorefrontsList() {
    var doc = loadStorefrontsDoc();
    return Array.isArray(doc.stores) ? doc.stores.filter(Boolean) : [];
  }

  function saveStorefrontsList(list) {
    var doc = { stores: list || [], updatedAt: new Date().toISOString() };
    var json = JSON.stringify(doc, null, 2);
    ensureDir(DATA_DIR);
    fs.writeFileSync(STOREFRONTS_FILE, json);
    try {
      if (STOREFRONTS_BOOTSTRAP !== STOREFRONTS_FILE) {
        fs.writeFileSync(STOREFRONTS_BOOTSTRAP, json);
      }
    } catch (eM) {}
    return doc;
  }

  function findStorefront(slug) {
    var k = String(slug || "")
      .trim()
      .toLowerCase();
    if (!k) return null;
    var list = loadStorefrontsList();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].slug || "").toLowerCase() === k) return list[i];
    }
    return null;
  }

  function isDynamicStore(k) {
    k = String(k || "").trim();
    return !!(k && !STORE_PATHS[k] && findStorefront(k));
  }

  function getStoreMeta(k) {
    k = String(k || "").trim();
    if (!k) return null;
    if (STORE_PATHS[k]) return STORE_PATHS[k];
    var sf = findStorefront(k);
    if (!sf) return null;
    return {
      label: sf.title || sf.name || k,
      dir: "store-engine",
      index: "index.html",
      dynamic: true,
    };
  }

  function isKnownStore(k) {
    return !!getStoreMeta(k);
  }

  function storeLabel(k) {
    var m = getStoreMeta(k);
    return (m && m.label) || String(k || "");
  }

  function allStoreKeys() {
    var keys = Object.keys(STORE_PATHS);
    loadStorefrontsList().forEach(function (s) {
      var slug = s && s.slug ? String(s.slug) : "";
      if (slug && keys.indexOf(slug) === -1) keys.push(slug);
    });
    return keys;
  }

  function supportsSimpleCheckout(k) {
    return SIMPLE_CHECKOUT_STORES.indexOf(k) !== -1 || isDynamicStore(k);
  }

  function getCloakerStoreMeta(k) {
    if (CLOAKER_STORES[k]) return CLOAKER_STORES[k];
    var sf = findStorefront(k);
    if (sf) return { label: sf.title || k, entryPath: "/" + k };
    return null;
  }

  function isReservedSlug(slug) {
    var k = String(slug || "")
      .trim()
      .toLowerCase();
    if (!k) return true;
    if (RESERVED[k]) return true;
    if (STORE_PATHS[k]) return true;
    try {
      if (fs.existsSync(path.join(ROOT, k))) return true;
    } catch (e) {}
    return false;
  }

  function normalizeSlug(raw) {
    var s = String(raw || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
    return s.slice(0, 40);
  }

  function mimeToExt(mime) {
    var m = String(mime || "").toLowerCase();
    if (m.indexOf("png") !== -1) return ".png";
    if (m.indexOf("webp") !== -1) return ".webp";
    if (m.indexOf("gif") !== -1) return ".gif";
    if (m.indexOf("svg") !== -1) return ".svg";
    return ".jpg";
  }

  function decodeDataImage(input) {
    if (!input) return null;
    if (typeof input === "object" && input.data) {
      var mime = String(input.mime || input.type || "image/jpeg");
      var raw = String(input.data || "");
      var b64 = raw.indexOf("base64,") !== -1 ? raw.split("base64,").pop() : raw;
      try {
        var buf = Buffer.from(b64, "base64");
        if (!buf.length || buf.length > 2.5e6) return null;
        return { buf: buf, ext: mimeToExt(mime), mime: mime };
      } catch (e) {
        return null;
      }
    }
    var s = String(input);
    var m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return null;
    try {
      var buf2 = Buffer.from(m[2], "base64");
      if (!buf2.length || buf2.length > 2.5e6) return null;
      return { buf: buf2, ext: mimeToExt(m[1]), mime: m[1] };
    } catch (e2) {
      return null;
    }
  }

  function writeStorefrontFile(slug, filename, buf) {
    var dirData = path.join(ASSETS_DATA, slug);
    var dirRoot = path.join(ASSETS_ROOT, slug);
    ensureDir(dirData);
    ensureDir(dirRoot);
    var safe = String(filename || "").replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safe) safe = "img-" + crypto.randomBytes(4).toString("hex") + ".jpg";
    fs.writeFileSync(path.join(dirData, safe), buf);
    try {
      fs.writeFileSync(path.join(dirRoot, safe), buf);
    } catch (eM) {}
    return "/sf/" + slug + "/" + safe;
  }

  function assetLocalPaths(slug, file) {
    return [path.join(ASSETS_DATA, slug, file), path.join(ASSETS_ROOT, slug, file)];
  }

  function normalizeUpsells(sf) {
    if (!sf) return [];
    if (Array.isArray(sf.upsells) && sf.upsells.length) {
      return sf.upsells
        .map(function (u) {
          if (!u) return null;
          var title = String(u.title || "").trim();
          var price = Number(u.price);
          if (!title || !(price > 0)) return null;
          return {
            title: title,
            sub: String(u.sub || "").trim(),
            price: price,
            image: String(u.image || "").trim(),
          };
        })
        .filter(Boolean);
    }
    if (sf.extraEnabled && Number(sf.extraPrice) > 0) {
      return [
        {
          title: String(sf.extraTitle || "Leve +1 unidade").trim() || "Leve +1 unidade",
          sub: String(sf.extraSub || "").trim(),
          price: Number(sf.extraPrice),
          image: String(sf.extraImage || "").trim(),
        },
      ];
    }
    return [];
  }

  function normalizeSizes(sf) {
    if (!sf) return [];
    if (Array.isArray(sf.sizes)) {
      return sf.sizes
        .map(function (s) {
          return String(s || "").trim().slice(0, 16);
        })
        .filter(Boolean)
        .slice(0, 20);
    }
    return [];
  }

  function normalizeOptions(sf) {
    return (Array.isArray(sf && sf.options) ? sf.options : [])
      .map(function (o) {
        if (!o) return null;
        var name = String(o.name || o.label || "").trim();
        if (!name) return null;
        var pr = Number(String(o.price == null ? "" : o.price).toString().replace(",", "."));
        return {
          name: name,
          image: String(o.image || o.img || "").trim(),
          price: pr > 0 ? pr : 0,
        };
      })
      .filter(Boolean);
  }

  function publicStorefront(sf) {
    if (!sf) return null;
    var upsells = normalizeUpsells(sf);
    var first = upsells[0];
    var sizes = normalizeSizes(sf);
    var options = normalizeOptions(sf);
    var pick = parseInt(sf.optionPickCount, 10);
    if (!isFinite(pick) || pick < 1) pick = 1;
    pick = Math.max(1, Math.min(8, pick));
    return {
      slug: sf.slug,
      name: sf.name || sf.title,
      title: sf.title,
      price: Number(sf.price) || 0,
      oldPrice: Number(sf.oldPrice) || 0,
      flashTheme: sf.flashTheme === "rgb" ? "rgb" : "orange",
      rating: sf.rating || "4.8",
      reviewCount: Number(sf.reviewCount) || 0,
      soldLabel: sf.soldLabel || "",
      description: sf.description || "",
      descImagesStart: (function () {
        if (Array.isArray(sf.descImagesStart)) return sf.descImagesStart.filter(Boolean).slice(0, 8);
        if (sf.descImagesPos === "start" && Array.isArray(sf.descImages)) return sf.descImages.filter(Boolean).slice(0, 8);
        return [];
      })(),
      descImagesEnd: (function () {
        if (Array.isArray(sf.descImagesEnd)) return sf.descImagesEnd.filter(Boolean).slice(0, 8);
        if (sf.descImagesPos !== "start" && sf.descImagesPos !== "both" && Array.isArray(sf.descImages)) {
          return sf.descImages.filter(Boolean).slice(0, 8);
        }
        return [];
      })(),
      optionLabel: sf.optionLabel || "Cor",
      optionPickCount: pick,
      sizeLabel: String(sf.sizeLabel || "Tamanho").trim() || "Tamanho",
      sizes: sizes,
      showSizes: sizes.length > 0,
      extraEnabled: upsells.length > 0,
      extraTitle: first ? first.title : "",
      extraSub: first ? first.sub : "",
      extraPrice: first ? first.price : 0,
      extraImage: first ? first.image : "",
      upsells: upsells,
      gallery: Array.isArray(sf.gallery) ? sf.gallery : [],
      options: options,
      reviews: Array.isArray(sf.reviews) ? sf.reviews : [],
      createdAt: sf.createdAt || null,
      enabled: sf.enabled !== false,
    };
  }

  function storefrontToCatalogProduct(sf) {
    var p = publicStorefront(sf);
    if (!p) return null;
    var price = p.price;
    (p.options || []).forEach(function (o) {
      if (Number(o.price) > 0 && Number(o.price) < price) price = Number(o.price);
    });
    var oldP = p.oldPrice > price ? p.oldPrice : price / 0.32;
    var off = oldP > 0 ? Math.round((1 - price / oldP) * 100) : 68;
    var main = price.toFixed(2).replace(".", ",");
    var img =
      (p.gallery && p.gallery[0]) ||
      (p.options[0] && p.options[0].image) ||
      "";
    return {
      id: p.slug,
      title: p.title,
      url: "/" + p.slug,
      image: img,
      priceLabel: "A partir de R$ " + main,
      priceMain: main,
      badge: "-" + Math.max(1, Math.min(95, off)) + "%",
      sold: p.soldLabel || "1,2 mil vendidos",
      rating: String(p.rating || "4.8"),
    };
  }

  function sanitizeReviews(raw) {
    var out = [];
    (Array.isArray(raw) ? raw : []).slice(0, 12).forEach(function (rv) {
      if (!rv) return;
      var text = String(rv.text || rv.message || "").trim();
      if (!text) return;
      out.push({
        name: String(rv.name || "Cliente").trim().slice(0, 40) || "Cliente",
        text: text.slice(0, 600),
        variant: String(rv.variant || "").trim().slice(0, 60),
        photos: Array.isArray(rv.photos) ? rv.photos.filter(Boolean).slice(0, 4) : [],
      });
    });
    return out;
  }

  return {
    STOREFRONTS_FILE: STOREFRONTS_FILE,
    STOREFRONTS_BOOTSTRAP: STOREFRONTS_BOOTSTRAP,
    ASSETS_DATA: ASSETS_DATA,
    ASSETS_ROOT: ASSETS_ROOT,
    loadStorefrontsDoc: loadStorefrontsDoc,
    loadStorefrontsList: loadStorefrontsList,
    saveStorefrontsList: saveStorefrontsList,
    findStorefront: findStorefront,
    isDynamicStore: isDynamicStore,
    getStoreMeta: getStoreMeta,
    isKnownStore: isKnownStore,
    storeLabel: storeLabel,
    allStoreKeys: allStoreKeys,
    supportsSimpleCheckout: supportsSimpleCheckout,
    getCloakerStoreMeta: getCloakerStoreMeta,
    isReservedSlug: isReservedSlug,
    normalizeSlug: normalizeSlug,
    decodeDataImage: decodeDataImage,
    writeStorefrontFile: writeStorefrontFile,
    assetLocalPaths: assetLocalPaths,
    publicStorefront: publicStorefront,
    storefrontToCatalogProduct: storefrontToCatalogProduct,
    sanitizeReviews: sanitizeReviews,
    ensureDir: ensureDir,
  };
};
