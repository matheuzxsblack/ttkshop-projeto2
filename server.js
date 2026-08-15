/**
 * Servidor local: arquivos estáticos + proxy Pixzy.
 * A chave fica só no servidor (nunca no front).
 *
 * Uso: node server.js
 * Abra: http://localhost:8765
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 8765;
const ROOT = __dirname;
/* Disco persistente (Render Disk) — igual ofertasdetudo. Sem isso o free apaga saves no restart. */
const DATA_DIR = (process.env.DATA_DIR || process.env.RENDER_DISK_PATH || ROOT).replace(/\/+$/, "");
try {
  if (DATA_DIR !== ROOT && !fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (eDir) {
  console.log("[data] não criou DATA_DIR:", eDir.message);
}
const PIXZY_TOKEN =
  process.env.PIXZY_TOKEN ||
  "280|Hxjk6w8xqskHB98aGM2oGB0qDE4tf7Hem2kgjLm5a2ceb486";
const PIXZY_HOST = "app.pixzypay.com";

const BUCKPAY_API_KEY = String(process.env.BUCKPAY_API_KEY || "").trim();
const BUCKPAY_HOST = "api.realtechdev.com.br";
const BUCKPAY_USER_AGENTS = String(process.env.BUCKPAY_USER_AGENT || "Buckpay API,BuckPay API")
  .split(",")
  .map(function (s) {
    return s.trim();
  })
  .filter(Boolean);

const IRONPAY_API_TOKEN = String(process.env.IRONPAY_API_TOKEN || "").trim();
const IRONPAY_HOST = "api.ironpayapp.com.br";
const IRONPAY_API_PREFIX = "/api/public/v1";
const IRONPAY_PRODUCT_HASH = String(process.env.IRONPAY_PRODUCT_HASH || "uixau19jm5").trim();
const IRONPAY_OFFER_HASH = String(process.env.IRONPAY_OFFER_HASH || "rrwhyd8eys").trim();

const BLACKCAT_API_KEY = String(process.env.BLACKCAT_API_KEY || "").trim();
const BLACKCAT_HOST = "api.blackcatoficial.com";
const BLACKCAT_API_PREFIX = "/api";

const PURINCASH_API_KEY = String(process.env.PURINCASH_API_KEY || "").trim();
const PURINCASH_WEBHOOK_SECRET = String(process.env.PURINCASH_WEBHOOK_SECRET || "").trim();
const PURINCASH_HOST = "api.purincash.com";
const PURINCASH_API_PREFIX = "/v1";

const SHARPIFY_CLIENT_ID = String(process.env.SHARPIFY_CLIENT_ID || "").trim();
const SHARPIFY_CLIENT_SECRET = String(process.env.SHARPIFY_CLIENT_SECRET || "").trim();
const SHARPIFY_HOST = "api.sharpify.com.br";
const SHARPIFY_GATEWAY_METHOD = String(process.env.SHARPIFY_GATEWAY_METHOD || "PIX").trim();

const PAYMENT_GATEWAY_IDS = ["ironpay", "purincash"];
const PAYMENT_GATEWAY_META = {
  ironpay: { label: "Iron Pay" },
  purincash: { label: "PurinCash" },
};
const PAYMENT_GATEWAY_CONFIG_FILE = path.join(DATA_DIR, "payment-gateway-config.json");
const PAYMENT_GATEWAY_CONFIG_BOOTSTRAP = path.join(ROOT, "payment-gateway-config.json");

function gatewayCredentialsConfigured(id) {
  var g = String(id || "").toLowerCase();
  if (g === "sharpify") return !!(SHARPIFY_CLIENT_ID && SHARPIFY_CLIENT_SECRET);
  if (g === "purincash") return !!PURINCASH_API_KEY;
  if (g === "blackcat") return !!BLACKCAT_API_KEY;
  if (g === "ironpay") return !!IRONPAY_API_TOKEN;
  if (g === "buckpay") return !!BUCKPAY_API_KEY;
  if (g === "pixzy") return !!PIXZY_TOKEN;
  return false;
}

function loadPaymentGatewayConfig() {
  try {
    if (fs.existsSync(PAYMENT_GATEWAY_CONFIG_FILE)) {
      var raw = JSON.parse(fs.readFileSync(PAYMENT_GATEWAY_CONFIG_FILE, "utf8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch (e) {}
  try {
    if (
      PAYMENT_GATEWAY_CONFIG_BOOTSTRAP !== PAYMENT_GATEWAY_CONFIG_FILE &&
      fs.existsSync(PAYMENT_GATEWAY_CONFIG_BOOTSTRAP)
    ) {
      var boot = JSON.parse(fs.readFileSync(PAYMENT_GATEWAY_CONFIG_BOOTSTRAP, "utf8"));
      if (boot && typeof boot === "object") return boot;
    }
  } catch (e2) {}
  return {};
}

function savePaymentGatewayConfig(cfg) {
  var json = JSON.stringify(cfg, null, 2);
  fs.writeFileSync(PAYMENT_GATEWAY_CONFIG_FILE, json);
  try {
    if (PAYMENT_GATEWAY_CONFIG_BOOTSTRAP !== PAYMENT_GATEWAY_CONFIG_FILE) {
      fs.writeFileSync(PAYMENT_GATEWAY_CONFIG_BOOTSTRAP, json);
    }
  } catch (eM) {}
}

function persistPaymentGatewayConfigToGithub() {
  if (!shouldSyncTxGithub()) return Promise.resolve({ ok: false, reason: "sync off" });
  var json = JSON.stringify(loadPaymentGatewayConfig(), null, 2);
  return githubUpsertFile("payment-gateway-config.json", json, "chore(gateway): sync payment gateway");
}

function normalizePaymentGatewayId(raw) {
  var g = String(raw || "").toLowerCase().trim();
  return PAYMENT_GATEWAY_IDS.indexOf(g) !== -1 ? g : "";
}

function getAdminSelectedPaymentGateway() {
  var cfg = loadPaymentGatewayConfig();
  return normalizePaymentGatewayId(cfg.gateway);
}

function paymentGatewaySourceInfo() {
  var adminG = getAdminSelectedPaymentGateway();
  if (adminG) {
    return { source: "admin", selected: adminG };
  }
  var envG = normalizePaymentGatewayId(process.env.PAYMENT_GATEWAY || "");
  if (envG) {
    return { source: "env", selected: envG };
  }
  return { source: "auto", selected: "" };
}

function paymentGatewayName() {
  var adminG = getAdminSelectedPaymentGateway();
  if (adminG) return adminG;

  var envG = normalizePaymentGatewayId(process.env.PAYMENT_GATEWAY || "");
  if (envG) return envG;

  if (IRONPAY_API_TOKEN) return "ironpay";
  if (PURINCASH_API_KEY) return "purincash";
  return "ironpay";
}

function paymentGatewayOptionsForAdmin() {
  return PAYMENT_GATEWAY_IDS.map(function (id) {
    var meta = PAYMENT_GATEWAY_META[id] || { label: id };
    return {
      id: id,
      label: meta.label,
      configured: gatewayCredentialsConfigured(id),
    };
  }).filter(function (o) {
    return o.configured;
  });
}

function paymentUsesSharpify() {
  return paymentGatewayName() === "sharpify";
}

function paymentUsesPurincash() {
  return paymentGatewayName() === "purincash";
}

function paymentUsesBlackcat() {
  return paymentGatewayName() === "blackcat";
}

function paymentUsesIronPay() {
  return paymentGatewayName() === "ironpay";
}

function paymentUsesBuckPay() {
  return paymentGatewayName() === "buckpay";
}

/* ---------- admin ---------- */
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "Ma@303030";
/* Alias opcional — mesmo painel completo (não é login separado) */
const PIXEL_ADMIN_USER = process.env.PIXEL_ADMIN_USER || "linuxfodaooo";
const PIXEL_ADMIN_PASS = process.env.PIXEL_ADMIN_PASS || "PixelLab!2026#Chuteira";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; /* 30 dias — sobrevive F5 / redeploy */
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update((process.env.WEBHOOK_SECRET || "whk_ttkshop_2026_ax9Q") + "|achadofertas-admin-session-v2")
    .digest("hex");
var revokedTokens = new Set(); /* tokens invalidado no logout */

const PIXEL_CONFIG_FILE = path.join(DATA_DIR, "pixel-config.json");
const PIXEL_CONFIG_BOOTSTRAP = path.join(ROOT, "pixel-config.json");
const STORE_PATHS = {
  panelas: { label: "Panela", dir: "panela", index: "index.html" },
  jaqueta: { label: "Jaqueta", dir: "jaqueta", index: "index.html" },
  bobojaco: { label: "Bobojaco", dir: "bobojaco", index: "index.html" },
  teddy: { label: "Casaquinho Teddy", dir: "teddy", index: "index.html" },
  roupao: { label: "Roupão Microfibra Plush", dir: "roupao", index: "index.html" },
  toalha: { label: "Toalhas Gigante", dir: "toalha", index: "index.html" },
};

/* ---------- modo de checkout por loja (tiktok = original | simple = simplificado) ---------- */
const CHECKOUT_CONFIG_FILE = path.join(DATA_DIR, "checkout-config.json");
const CHECKOUT_CONFIG_BOOTSTRAP = path.join(ROOT, "checkout-config.json");
const CHECKOUT_MODES = ["tiktok", "simple"];
/* lojas que já têm o checkout simples implementado no front */
const SIMPLE_CHECKOUT_STORES = ["jaqueta", "bobojaco", "teddy", "roupao", "panelas", "toalha"];

/* ---------- cloaker por loja (URLs /n7*, + vitrine padrão) ---------- */
const CLOAKER_CONFIG_FILE = path.join(DATA_DIR, "cloaker-config.json");
const CLOAKER_CONFIG_BOOTSTRAP = path.join(ROOT, "cloaker-config.json");
const CLOAKER_STORES = {
  jaqueta: { label: "Jaqueta Puffer", entryPath: "/n7jq" },
  toalha: { label: "Kit Toalhas", entryPath: "/n7tl" },
  bobojaco: { label: "Bobojaco (casaco)", entryPath: "/n7bb" },
  roupao: { label: "Roupão plush", entryPath: "/n7rp" },
  teddy: { label: "Casaquinho Teddy", entryPath: "/n7td" },
};
const CLOAK_ENTRY_TO_HTML = {
  "/n7jq": "/n7jq/index.html",
  "/n7jq/": "/n7jq/index.html",
  "/n7tl": "/n7tl/index.html",
  "/n7tl/": "/n7tl/index.html",
  "/n7bb": "/n7bb/index.html",
  "/n7bb/": "/n7bb/index.html",
  "/n7rp": "/n7rp/index.html",
  "/n7rp/": "/n7rp/index.html",
  "/n7td": "/n7td/index.html",
  "/n7td/": "/n7td/index.html",
};

function loadCloakerConfig() {
  try {
    if (fs.existsSync(CLOAKER_CONFIG_FILE)) {
      var rawC = JSON.parse(fs.readFileSync(CLOAKER_CONFIG_FILE, "utf8"));
      if (rawC && typeof rawC === "object") return rawC;
    }
  } catch (eC) {}
  try {
    if (CLOAKER_CONFIG_BOOTSTRAP !== CLOAKER_CONFIG_FILE && fs.existsSync(CLOAKER_CONFIG_BOOTSTRAP)) {
      var bootC = JSON.parse(fs.readFileSync(CLOAKER_CONFIG_BOOTSTRAP, "utf8"));
      if (bootC && typeof bootC === "object") return bootC;
    }
  } catch (eC2) {}
  return {};
}
function saveCloakerConfig(cfg) {
  var jsonC = JSON.stringify(cfg, null, 2);
  fs.writeFileSync(CLOAKER_CONFIG_FILE, jsonC);
  try {
    if (CLOAKER_CONFIG_BOOTSTRAP !== CLOAKER_CONFIG_FILE) {
      fs.writeFileSync(CLOAKER_CONFIG_BOOTSTRAP, jsonC);
    }
  } catch (eM) {}
}
function persistCloakerConfigToGithub() {
  if (!shouldSyncTxGithub()) return Promise.resolve({ ok: false, reason: "sync off" });
  var jsonC = JSON.stringify(loadCloakerConfig(), null, 2);
  return githubUpsertFile("cloaker-config.json", jsonC, "chore(cloaker): sync modes");
}
function getCloakerEnabled(storeKey) {
  var cfgC = loadCloakerConfig();
  return !!cfgC[storeKey];
}

function loadCheckoutConfig() {
  try {
    if (fs.existsSync(CHECKOUT_CONFIG_FILE)) {
      var raw = JSON.parse(fs.readFileSync(CHECKOUT_CONFIG_FILE, "utf8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch (e) {}
  try {
    if (CHECKOUT_CONFIG_BOOTSTRAP !== CHECKOUT_CONFIG_FILE && fs.existsSync(CHECKOUT_CONFIG_BOOTSTRAP)) {
      var boot = JSON.parse(fs.readFileSync(CHECKOUT_CONFIG_BOOTSTRAP, "utf8"));
      if (boot && typeof boot === "object") return boot;
    }
  } catch (e2) {}
  return {};
}
function saveCheckoutConfig(cfg) {
  var json = JSON.stringify(cfg, null, 2);
  fs.writeFileSync(CHECKOUT_CONFIG_FILE, json);
  try {
    if (CHECKOUT_CONFIG_BOOTSTRAP !== CHECKOUT_CONFIG_FILE) {
      fs.writeFileSync(CHECKOUT_CONFIG_BOOTSTRAP, json);
    }
  } catch (eM) {}
}

function persistCheckoutConfigToGithub() {
  if (!shouldSyncTxGithub()) return Promise.resolve({ ok: false, reason: "sync off" });
  var json = JSON.stringify(loadCheckoutConfig(), null, 2);
  return githubUpsertFile("checkout-config.json", json, "chore(checkout): sync modes");
}
function getCheckoutMode(storeKey) {
  var cfg = loadCheckoutConfig();
  var m = String(cfg[storeKey] || "").toLowerCase();
  return CHECKOUT_MODES.indexOf(m) !== -1 ? m : "tiktok";
}

function loadPixelConfig() {
  try {
    if (fs.existsSync(PIXEL_CONFIG_FILE)) {
      var raw = JSON.parse(fs.readFileSync(PIXEL_CONFIG_FILE, "utf8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch (e) {}
  try {
    if (PIXEL_CONFIG_BOOTSTRAP !== PIXEL_CONFIG_FILE && fs.existsSync(PIXEL_CONFIG_BOOTSTRAP)) {
      var boot = JSON.parse(fs.readFileSync(PIXEL_CONFIG_BOOTSTRAP, "utf8"));
      if (boot && typeof boot === "object") return boot;
    }
  } catch (e2) {}
  return {};
}
function savePixelConfig(cfg) {
  var json = JSON.stringify(cfg, null, 2);
  fs.writeFileSync(PIXEL_CONFIG_FILE, json);
  try {
    if (PIXEL_CONFIG_BOOTSTRAP !== PIXEL_CONFIG_FILE) {
      fs.writeFileSync(PIXEL_CONFIG_BOOTSTRAP, json);
    }
  } catch (eMirror) {}
}

/** Grava pixel-config + HTML da loja no GitHub (senão redeploy apaga Access Token) */
function normalizeGithubText(text) {
  var s = String(text || "");
  if (!s.endsWith("\n")) s += "\n";
  return s;
}

/** Commits de backup (tx/funnel) não devem disparar build no Render. */
function githubCommitMessage(message) {
  var base = String(message || "chore: sync data").trim();
  if (/\[(skip render|render skip|skip deploy|deploy skip|skip cd|cd skip)\]/i.test(base)) {
    return base;
  }
  var allowDeploy = String(process.env.GITHUB_SYNC_TRIGGER_DEPLOY || "").toLowerCase();
  if (allowDeploy === "1" || allowDeploy === "true" || allowDeploy === "on") {
    return base;
  }
  return base + " [skip render]";
}

function githubUpsertFile(repoPath, content, message) {
  return new Promise(function (resolve) {
    var token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
    var repo = process.env.GITHUB_REPO || "matheuzxsblack/ttkshop-panelas";
    if (!token) {
      return resolve({ ok: false, reason: "GITHUB_TOKEN ausente" });
    }
    content = normalizeGithubText(content);
    var apiBase = "/repos/" + repo + "/contents/" + repoPath.replace(/^\//, "");

    function put(sha) {
      var bodyObj = {
        message: githubCommitMessage(message || "chore: sync pixel config"),
        content: Buffer.from(content, "utf8").toString("base64"),
        branch: process.env.GITHUB_BRANCH || "main",
      };
      if (sha) bodyObj.sha = sha;
      var body = JSON.stringify(bodyObj);
      var req = https.request(
        {
          hostname: "api.github.com",
          path: apiBase,
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.github+json",
            "User-Agent": "ttkshop-panelas",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
        function (res) {
          var chunks = [];
          res.on("data", function (c) {
            chunks.push(c);
          });
          res.on("end", function () {
            var raw = Buffer.concat(chunks).toString("utf8");
            var json = null;
            try {
              json = JSON.parse(raw);
            } catch (e) {
              json = { raw: raw };
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, status: res.statusCode });
            } else {
              resolve({
                ok: false,
                reason: (json && (json.message || json.error)) || ("HTTP " + res.statusCode),
              });
            }
          });
        }
      );
      req.on("error", function (e) {
        resolve({ ok: false, reason: e.message });
      });
      req.write(body);
      req.end();
    }

    var getReq = https.request(
      {
        hostname: "api.github.com",
        path: apiBase + "?ref=" + encodeURIComponent(process.env.GITHUB_BRANCH || "main"),
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "User-Agent": "ttkshop-panelas",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          var raw = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = {};
          }
          if (res.statusCode === 200 && json.sha) {
            try {
              var remoteText = Buffer.from(String(json.content || "").replace(/\n/g, ""), "base64").toString("utf8");
              if (normalizeGithubText(remoteText) === content) {
                return resolve({ ok: true, status: 200, skipped: true });
              }
            } catch (eSkip) {}
            put(json.sha);
          } else if (res.statusCode === 404) put(null);
          else resolve({ ok: false, reason: json.message || ("GET HTTP " + res.statusCode) });
        });
      }
    );
    getReq.on("error", function (e) {
      resolve({ ok: false, reason: e.message });
    });
    getReq.end();
  });
}

async function persistPixelsDurable(storeKey) {
  var results = { disk: true, github: null, githubHtml: null };
  try {
    var cfgJson = JSON.stringify(loadPixelConfig(), null, 2);
    results.github = await githubUpsertFile(
      "pixel-config.json",
      cfgJson,
      "chore(pixels): sync config (" + storeKey + ")"
    );
    var targets = pixelHtmlTargets(storeKey);
    results.githubHtml = [];
    for (var hi = 0; hi < targets.length; hi++) {
      var indexFile = targets[hi];
      var indexRel = path.relative(ROOT, indexFile).replace(/\\/g, "/");
      var ghHtml = await githubUpsertFile(
        indexRel,
        fs.readFileSync(indexFile, "utf8"),
        "chore(pixels): sync " + indexRel
      );
      results.githubHtml.push(ghHtml);
      if (ghHtml && !ghHtml.ok) {
        results.github = results.github || ghHtml;
      }
    }
  } catch (e) {
    results.github = { ok: false, reason: e.message || String(e) };
  }
  if (results.github && !results.github.ok) {
    console.log("[pixel] GitHub sync falhou:", results.github.reason);
  } else if (results.github && results.github.ok) {
    console.log("[pixel] GitHub sync OK — tokens não somem no redeploy");
  }
  return results;
}

/** Normaliza config antiga {pixelId,accessToken} → {pixels:[{id,label,accessToken,enabled}]} */
function normalizeStoreCfg(c) {
  if (!c || typeof c !== "object") {
    return { pixels: [], updatedAt: null, testEventCode: "", testEventEnabled: false };
  }
  var testEventCode = String(c.testEventCode || c.test_event_code || "").trim();
  var testEventEnabled = c.testEventEnabled === true || c.test_event_enabled === true;
  if (Array.isArray(c.pixels)) {
    return {
      pixels: c.pixels
        .map(function (p) {
          return {
            id: String((p && p.id) || "").trim(),
            label: String((p && p.label) || "").trim() || "Pixel",
            accessToken: String((p && p.accessToken) || ""),
            enabled: p && p.enabled === false ? false : true,
          };
        })
        .filter(function (p) {
          return !!p.id;
        }),
      updatedAt: c.updatedAt || null,
      testEventCode: testEventCode,
      testEventEnabled: testEventEnabled,
    };
  }
  var pixels = [];
  if (c.pixelId) {
    pixels.push({
      id: String(c.pixelId).trim(),
      label: "Principal",
      accessToken: String(c.accessToken || ""),
      enabled: true,
    });
  }
  return {
    pixels: pixels,
    updatedAt: c.updatedAt || null,
    testEventCode: testEventCode,
    testEventEnabled: testEventEnabled,
  };
}

function readPixelsFromStoreHtml(storeKey) {
  var meta = STORE_PATHS[storeKey];
  if (!meta) return [];
  var file = path.join(ROOT, meta.dir, meta.index);
  if (!fs.existsSync(file)) return [];
  var html = fs.readFileSync(file, "utf8");
  var ids = [];
  var mArr = html.match(/window\.tikTokPixelIds\s*=\s*(\[[^\]]*\])/);
  if (mArr) {
    try {
      var arr = JSON.parse(mArr[1]);
      if (Array.isArray(arr)) {
        arr.forEach(function (id) {
          id = String(id || "").trim();
          if (id && ids.indexOf(id) === -1) ids.push(id);
        });
      }
    } catch (e) {
      /* ignore */
    }
  }
  var mOne = html.match(/window\.tikTokPixelId\s*=\s*["']([^"']+)["']/);
  if (mOne) {
    var one = String(mOne[1] || "").trim();
    if (one && ids.indexOf(one) === -1) ids.push(one);
  }
  var mTtq = html.match(/ttq\.load\(\s*["']([^"']+)["']\s*\)/g) || [];
  mTtq.forEach(function (chunk) {
    var mm = chunk.match(/ttq\.load\(\s*["']([^"']+)["']\s*\)/);
    if (mm && mm[1] && ids.indexOf(mm[1]) === -1) ids.push(mm[1]);
  });
  return ids.map(function (id, i) {
    return { id: id, label: i === 0 ? "Principal" : "Pixel " + (i + 1), accessToken: "", enabled: true };
  });
}

function getStorePixels(storeKey) {
  var all = loadPixelConfig();
  /* se a loja já foi salva no config (mesmo com lista vazia), NÃO volta do HTML */
  if (Object.prototype.hasOwnProperty.call(all, storeKey)) {
    return normalizeStoreCfg(all[storeKey]);
  }
  /* fallback só na 1ª vez: IDs ainda gravados no HTML */
  var fromHtml = readPixelsFromStoreHtml(storeKey);
  return {
    pixels: fromHtml,
    updatedAt: null,
    fromHtml: fromHtml.length > 0,
    testEventCode: "",
    testEventEnabled: false,
  };
}

function buildPixelBootstrapBlock(ids) {
  var primary = String(ids[0] || "").replace(/"/g, "");
  var idsJson = JSON.stringify(ids);
  /* IDs + ttq nativo (multi) + UTMify (primary). Antes só gravava variável e nada disparava.
     ?pixel=ID ou ?loja=N na URL da campanha define a loja de atribuição (Performance). */
  return (
    "<!--PIXEL_MULTI_START-->\n" +
    "  <script>\n" +
    "    window.tikTokPixelIds = " + idsJson + ";\n" +
    "    window.tikTokPixelId = " + JSON.stringify(primary) + ";\n" +
    "    (function () {\n" +
    "      try {\n" +
    "        var q = new URLSearchParams(location.search || \"\");\n" +
    "        var want = String(q.get(\"pixel\") || q.get(\"px\") || q.get(\"pixel_id\") || \"\").trim();\n" +
    "        var lojaN = parseInt(q.get(\"loja\") || \"\", 10);\n" +
    "        var ids = (window.tikTokPixelIds || []).slice();\n" +
    "        if (!want && lojaN >= 1 && ids[lojaN - 1]) want = String(ids[lojaN - 1]);\n" +
    "        if (want) {\n" +
    "          if (ids.indexOf(want) === -1) ids.unshift(want);\n" +
    "          else ids = [want].concat(ids.filter(function (id) { return id !== want; }));\n" +
    "          window.tikTokPixelIds = ids;\n" +
    "          window.tikTokPixelId = want;\n" +
    "        }\n" +
    "        window.tikTokAttributionPixelId = String(window.tikTokPixelId || (ids[0] || \"\") || \"\");\n" +
    "      } catch (eAttr) {\n" +
    "        window.tikTokAttributionPixelId = String(window.tikTokPixelId || \"\");\n" +
    "      }\n" +
    "    })();\n" +
    "    !function (w, d, t) {\n" +
    "      w.TiktokAnalyticsObject = t;\n" +
    "      var ttq = (w[t] = w[t] || []);\n" +
    "      ttq.methods = [\"page\",\"track\",\"identify\",\"instances\",\"debug\",\"on\",\"off\",\"once\",\"ready\",\"alias\",\"group\",\"enableCookie\",\"disableCookie\",\"holdConsent\",\"revokeConsent\",\"grantConsent\"];\n" +
    "      ttq.setAndDefer = function (obj, method) {\n" +
    "        obj[method] = function () { obj.push([method].concat(Array.prototype.slice.call(arguments, 0))); };\n" +
    "      };\n" +
    "      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);\n" +
    "      ttq.instance = function (id) {\n" +
    "        var e = (ttq._i[id] = ttq._i[id] || []);\n" +
    "        for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);\n" +
    "        return e;\n" +
    "      };\n" +
    "      ttq.load = function (e, n) {\n" +
    "        var r = \"https://analytics.tiktok.com/i18n/pixel/events.js\";\n" +
    "        ttq._i = ttq._i || {};\n" +
    "        ttq._i[e] = [];\n" +
    "        ttq._i[e]._u = r;\n" +
    "        ttq._t = ttq._t || {};\n" +
    "        ttq._t[e] = +new Date();\n" +
    "        ttq._o = ttq._o || {};\n" +
    "        ttq._o[e] = n || {};\n" +
    "        if (!d.getElementById(\"tiktok-pixel-sdk\")) {\n" +
    "          var o = d.createElement(\"script\");\n" +
    "          o.id = \"tiktok-pixel-sdk\";\n" +
    "          o.type = \"text/javascript\";\n" +
    "          o.async = true;\n" +
    "          o.src = r + \"?sdkid=\" + e + \"&lib=\" + t;\n" +
    "          var a = d.getElementsByTagName(\"script\")[0];\n" +
    "          a.parentNode.insertBefore(o, a);\n" +
    "        }\n" +
    "      };\n" +
    "      (window.tikTokPixelIds || []).forEach(function (id) { if (id) ttq.load(id); });\n" +
    "      ttq.page();\n" +
    "    }(window, document, \"ttq\");\n" +
    "    (function () {\n" +
    "      if (document.getElementById(\"utmify-tiktok-pixel\")) return;\n" +
    "      var a = document.createElement(\"script\");\n" +
    "      a.id = \"utmify-tiktok-pixel\";\n" +
    "      a.async = true;\n" +
    "      a.defer = true;\n" +
    "      a.src = \"https://cdn.utmify.com.br/scripts/pixel/pixel-tiktok.js\";\n" +
    "      document.head.appendChild(a);\n" +
    "    })();\n" +
    "  </script>\n" +
    "<!--PIXEL_MULTI_END-->"
  );
}

function pixelHtmlTargets(storeKey) {
  var meta = STORE_PATHS[storeKey];
  if (!meta) return [];
  var files = [path.join(ROOT, meta.dir, meta.index)];
  /* jaqueta também é a home (/) e o front da Vercel — igual ofertasdetudo (pixel na raiz).
     Sem isso o pixel novo só entra em /jaqueta/ e a home/vercel ficam com o pixel antigo. */
  if (storeKey === "jaqueta") {
    var rootIndex = path.join(ROOT, "index.html");
    if (files.indexOf(rootIndex) === -1) files.push(rootIndex);
  }
  return files.filter(function (f) {
    return fs.existsSync(f);
  });
}

function clearPixelsFromStoreHtml(storeKey) {
  var files = pixelHtmlTargets(storeKey);
  if (!files.length) return { ok: false, error: "index.html não encontrado" };
  var emptyBlock =
    "<!--PIXEL_MULTI_START-->\n" +
    "  <script>\n" +
    "    window.tikTokPixelIds = [];\n" +
    "    window.tikTokPixelId = \"\";\n" +
    "  </script>\n" +
    "<!--PIXEL_MULTI_END-->";
  var touched = 0;
  files.forEach(function (file) {
    var html = fs.readFileSync(file, "utf8");
    var next = html;
    if (/<!--PIXEL_MULTI_START-->[\s\S]*?<!--PIXEL_MULTI_END-->/.test(next)) {
      next = next.replace(/<!--PIXEL_MULTI_START-->[\s\S]*?<!--PIXEL_MULTI_END-->/, emptyBlock);
    } else if (/window\.tikTokPixelIds\s*=/.test(next)) {
      next = next.replace(/window\.tikTokPixelIds\s*=\s*\[[^\]]*\]/, "window.tikTokPixelIds = []");
      next = next.replace(/window\.tikTokPixelId\s*=\s*["'][^"']*["']/, 'window.tikTokPixelId = ""');
    }
    if (next !== html) {
      fs.writeFileSync(file, next);
      touched++;
    }
  });
  return { ok: true, count: 0, cleared: true, files: touched };
}

function applyPixelsToStoreHtml(storeKey, pixelIds) {
  var files = pixelHtmlTargets(storeKey);
  if (!files.length) return { ok: false, error: "index.html não encontrado" };
  var ids = (pixelIds || []).map(function (id) {
    return String(id || "").trim();
  }).filter(Boolean);
  if (!ids.length) return clearPixelsFromStoreHtml(storeKey);
  var primary = ids[0].replace(/"/g, "");
  var idsJson = JSON.stringify(ids);
  var multiBlock = buildPixelBootstrapBlock(ids);
  var touched = 0;

  files.forEach(function (file) {
    var html = fs.readFileSync(file, "utf8");
    var next = html;

    /* atualiza IDs soltos fora do bloco (legado) */
    if (/window\.tikTokPixelIds\s*=/.test(next) && !/<!--PIXEL_MULTI_START-->/.test(next)) {
      next = next.replace(/window\.tikTokPixelIds\s*=\s*\[[^\]]*\]/, "window.tikTokPixelIds = " + idsJson);
    }
    if (/window\.tikTokPixelId\s*=\s*["'][^"']*["']/.test(next) && !/<!--PIXEL_MULTI_START-->/.test(next)) {
      next = next.replace(
        /window\.tikTokPixelId\s*=\s*["'][^"']*["']/,
        'window.tikTokPixelId = "' + primary + '"'
      );
    } else if (/ttq\.load\(\s*["'][^"']+["']\s*\)/.test(next) && !/<!--PIXEL_MULTI_START-->/.test(next)) {
      next = next.replace(/ttq\.load\(\s*["'][^"']+["']\s*\)/, 'ttq.load("' + primary + '")');
    }

    if (/<!--PIXEL_MULTI_START-->[\s\S]*?<!--PIXEL_MULTI_END-->/.test(next)) {
      next = next.replace(/<!--PIXEL_MULTI_START-->[\s\S]*?<!--PIXEL_MULTI_END-->/, multiBlock);
    } else if (next.includes("</head>")) {
      next = next.replace("</head>", multiBlock + "\n</head>");
    }

    if (next !== html) {
      fs.writeFileSync(file, next);
      touched++;
    }
  });
  return { ok: true, count: ids.length, files: touched };
}

/* ---------- visitantes online (presença por ping — sem SSE fantasma) ---------- */
var onlinePresence = new Map(); /* key -> { t, path, host } */
var adminOnlineSSE = new Set(); /* res objects dos admins ouvindo o contador */
var lastBroadcastCount = -1;
var lastBroadcastPagesKey = "";
/* fallback se o browser crashar sem mandar leave (ping a cada 5s) */
var ONLINE_TTL_MS = 12 * 1000;

function onlinePresenceKey(req, urlObj) {
  var qid = String((urlObj.searchParams && urlObj.searchParams.get("sid")) || "").trim();
  if (qid && qid.length >= 8 && qid.length <= 64) return "s:" + qid;
  return "ip:" + getClientIp(req);
}

function sanitizeOnlinePath(raw) {
  var s = String(raw || "").trim().slice(0, 200);
  if (!s) return "/";
  if (s.charAt(0) !== "/") s = "/" + s;
  s = s.replace(/[^\w\-./?=&%~]/g, "");
  return s || "/";
}

function sanitizeOnlineHost(raw) {
  var s = String(raw || "").trim().toLowerCase().slice(0, 120);
  if (!/^[a-z0-9.-]+$/.test(s)) return "";
  return s;
}

function sanitizeOnlineAudience(raw) {
  var a = String(raw || "").trim().toLowerCase();
  if (a === "cloaker" || a === "cloak" || a === "safe") return "cloaker";
  if (a === "store" || a === "loja" || a === "vitrine") return "store";
  return "store";
}

function touchOnlinePresence(req, urlObj) {
  var key = onlinePresenceKey(req, urlObj);
  var path = sanitizeOnlinePath(
    (urlObj.searchParams && (urlObj.searchParams.get("page") || urlObj.searchParams.get("path"))) || ""
  );
  var host = sanitizeOnlineHost(
    (urlObj.searchParams && urlObj.searchParams.get("host")) || ""
  );
  var audience = sanitizeOnlineAudience(
    (urlObj.searchParams && (urlObj.searchParams.get("audience") || urlObj.searchParams.get("aud"))) || ""
  );
  if (!host) {
    try {
      var ref = String(req.headers.referer || "");
      if (ref) host = sanitizeOnlineHost(new URL(ref).hostname);
    } catch (eHost) {}
  }
  if (path.indexOf("/compra") === 0) audience = "cloaker";
  onlinePresence.set(key, { t: Date.now(), path: path, host: host, audience: audience });
}

function dropOnlinePresence(req, urlObj) {
  onlinePresence.delete(onlinePresenceKey(req, urlObj));
}

function pruneOnlinePresence() {
  var now = Date.now();
  onlinePresence.forEach(function (info, key) {
    var ts = info && typeof info === "object" ? info.t : info;
    if (!ts || now - ts > ONLINE_TTL_MS) onlinePresence.delete(key);
  });
}

function onlineCountNow() {
  pruneOnlinePresence();
  return onlinePresence.size;
}

function onlinePagesNow(audienceFilter) {
  pruneOnlinePresence();
  var map = {};
  onlinePresence.forEach(function (info) {
    if (!info || typeof info !== "object") return;
    var aud = info.audience || "store";
    if (audienceFilter && aud !== audienceFilter) return;
    var path = info.path || "/";
    var host = info.host || "";
    var url = host ? host + path : path;
    map[url] = (map[url] || 0) + 1;
  });
  return Object.keys(map)
    .map(function (url) {
      return { url: url, count: map[url] };
    })
    .sort(function (a, b) {
      return b.count - a.count || String(a.url).localeCompare(String(b.url));
    });
}

function onlinePayload() {
  pruneOnlinePresence();
  var storeN = 0;
  var cloakerN = 0;
  onlinePresence.forEach(function (info) {
    if (!info || typeof info !== "object") return;
    if (info.audience === "cloaker") cloakerN++;
    else storeN++;
  });
  return {
    online: onlineCountNow(),
    pages: onlinePagesNow(),
    pages_store: onlinePagesNow("store"),
    pages_cloaker: onlinePagesNow("cloaker"),
    counts: { store: storeN, cloaker: cloakerN },
  };
}

/* ---------- funil multi-loja (visitas → produto → checkout → pix) ---------- */
var FUNNEL_FILE = path.join(DATA_DIR, "funnel-analytics.json");
var FUNNEL_BOOT = path.join(ROOT, "funnel-analytics.json");
var funnelData = { sessions: {} };
var funnelSaveTimer = null;
var FUNNEL_MAX_SESSIONS = 15000;
var FUNNEL_TTL_MS = 30 * 24 * 3600 * 1000;

function defaultFunnelData() {
  return { sessions: {} };
}

function normalizeFunnelStore(raw) {
  var k = String(raw || "")
    .trim()
    .toLowerCase();
  if (k && Object.prototype.hasOwnProperty.call(STORE_PATHS, k)) return k;
  return "";
}

function isValidOnlineSid(raw) {
  var qid = String(raw || "").trim();
  return qid.length >= 8 && qid.length <= 64 && /^[A-Za-z0-9_-]+$/.test(qid);
}

function isOnlineBotUa(ua) {
  var s = String(ua || "");
  if (!s || s.length < 10) return true;
  return /bot|spider|crawl|slurp|curl\/|wget|python-requests|httpclient|go-http|libwww|uptime|pingdom|headless|phantom|selenium|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|quora|redditbot|ahrefs|semrush|petalbot|bytespider|gptbot|claudebot|render/i.test(
    s
  );
}

function isAllowedOnlineHost(host) {
  var h = sanitizeOnlineHost(host);
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (/\.vercel\.app$/.test(h)) return true;
  if (h === "ofertasgrandes.com" || h === "www.ofertasgrandes.com") return true;
  if (h === "achadofertas.com" || h === "www.achadofertas.com") return true;
  if (/\.onrender\.com$/.test(h) && h.indexOf("ttkshop") !== -1) return true;
  return false;
}

function funnelStorefrontOk(origin, ref) {
  var o = String(origin || "").toLowerCase();
  var r = String(ref || "").toLowerCase();
  return (
    o.indexOf(".vercel.app") !== -1 ||
    o.indexOf("ofertasgrandes.com") !== -1 ||
    o.indexOf("achadofertas.com") !== -1 ||
    r.indexOf(".vercel.app") !== -1 ||
    r.indexOf("ofertasgrandes.com") !== -1 ||
    r.indexOf("grandesofertas.vercel.app") !== -1 ||
    r.indexOf("ofertasonlineshop.vercel.app") !== -1 ||
    r.indexOf("/jaqueta") !== -1 ||
    r.indexOf("/bobojaco") !== -1 ||
    r.indexOf("/teddy") !== -1 ||
    r.indexOf("/roupao") !== -1 ||
    r.indexOf("/n7bb") !== -1 ||
    r.indexOf("/n7jq") !== -1 ||
    r.indexOf("/n7tl") !== -1 ||
    r.indexOf("/n7rp") !== -1 ||
    r.indexOf("/n7td") !== -1 ||
    r.indexOf("/compra") !== -1 ||
    r.indexOf("/panela") !== -1 ||
    r.indexOf("/toalha") !== -1
  );
}

function loadFunnelData() {
  var paths = [FUNNEL_FILE];
  if (FUNNEL_BOOT !== FUNNEL_FILE) paths.push(FUNNEL_BOOT);
  for (var i = 0; i < paths.length; i++) {
    try {
      if (!fs.existsSync(paths[i])) continue;
      var raw = JSON.parse(fs.readFileSync(paths[i], "utf8"));
      if (raw && typeof raw === "object") {
        funnelData.sessions = raw.sessions && typeof raw.sessions === "object" ? raw.sessions : {};
        return;
      }
    } catch (eF) {}
  }
  funnelData = defaultFunnelData();
}

function pruneFunnelData() {
  var now = Date.now();
  var sessions = funnelData.sessions || {};
  var keys = Object.keys(sessions);
  keys.forEach(function (k) {
    var s = sessions[k];
    if (!s || !s.last || now - Number(s.last) > FUNNEL_TTL_MS) delete sessions[k];
  });
  keys = Object.keys(sessions);
  if (keys.length > FUNNEL_MAX_SESSIONS) {
    keys
      .sort(function (a, b) {
        return Number(sessions[a].last || 0) - Number(sessions[b].last || 0);
      })
      .slice(0, keys.length - FUNNEL_MAX_SESSIONS)
      .forEach(function (k) {
        delete sessions[k];
      });
  }
}

function saveFunnelData() {
  pruneFunnelData();
  try {
    fs.writeFileSync(FUNNEL_FILE, JSON.stringify(funnelData, null, 2), "utf8");
  } catch (eSave) {
    console.error("[funnel] save:", eSave.message);
  }
}

function scheduleFunnelSave() {
  if (funnelSaveTimer) clearTimeout(funnelSaveTimer);
  funnelSaveTimer = setTimeout(function () {
    funnelSaveTimer = null;
    saveFunnelData();
    scheduleFunnelGithubSync();
  }, 2500);
}

var funnelGithubTimer = null;
var lastFunnelGithubAt = 0;

function mergeFunnelSessions(localS, remoteS) {
  var out = Object.assign({}, localS || {});
  var remote = remoteS || {};
  Object.keys(remote).forEach(function (k) {
    var r = remote[k];
    var l = out[k];
    if (!r || typeof r !== "object") return;
    if (!l || typeof l !== "object") {
      out[k] = r;
      return;
    }
    var mergedProducts = Object.assign({}, r.products || {});
    Object.keys(l.products || {}).forEach(function (pk) {
      mergedProducts[pk] = Math.max(Number(mergedProducts[pk] || 0), Number(l.products[pk] || 0));
    });
    out[k] = {
      sid: l.sid || r.sid,
      store: l.store || r.store,
      first: Math.min(Number(l.first) || 0, Number(r.first) || 0) || Number(l.first) || Number(r.first),
      last: Math.max(Number(l.last) || 0, Number(r.last) || 0),
      home: !!(l.home || r.home),
      product: !!(l.product || r.product),
      checkout: !!(l.checkout || r.checkout),
      pix: !!(l.pix || r.pix),
      success: !!(l.success || r.success),
      cloak_hit: !!(l.cloak_hit || r.cloak_hit),
      cloak_pass: !!(l.cloak_pass || r.cloak_pass),
      host: l.host || r.host || "",
      products: mergedProducts,
    };
  });
  return out;
}

function shouldSyncFunnelGithub() {
  if (!shouldSyncTxGithub()) return false;
  var flag = String(process.env.GITHUB_FUNNEL_SYNC || "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  /* padrão: funnel só em disco — evita commit a cada visita */
  return false;
}

function persistFunnelToGithub() {
  if (!shouldSyncFunnelGithub()) return Promise.resolve({ ok: false, reason: "funnel sync off" });
  pruneFunnelData();
  var json = JSON.stringify(funnelData, null, 2);
  return githubUpsertFile("funnel-analytics.json", json, "chore(funnel): sync analytics");
}

function scheduleFunnelGithubSync() {
  if (!shouldSyncFunnelGithub()) return;
  if (funnelGithubTimer) return;
  funnelGithubTimer = setTimeout(function () {
    funnelGithubTimer = null;
    if (Date.now() - lastFunnelGithubAt < 300000) return;
    lastFunnelGithubAt = Date.now();
    persistFunnelToGithub().catch(function () {});
  }, 15000);
}

function funnelOutcomeLabel(s) {
  if (!s) return "bounce";
  if (s.success) return "success";
  if (s.pix) return "pix_abandon";
  if (s.checkout) return "checkout_abandon";
  if (s.product) return "product_only";
  return "bounce";
}

function funnelOutcomeText(code) {
  var map = {
    bounce: "Só entrou e saiu",
    product_only: "Viu produto, não foi ao checkout",
    checkout_abandon: "Foi ao checkout, não gerou Pix",
    pix_abandon: "Gerou Pix, não pagou",
    success: "Concluiu pagamento",
  };
  return map[code] || code;
}

function funnelSessionKey(store, sid) {
  var sk = normalizeFunnelStore(store);
  if (!sk || !isValidOnlineSid(sid)) return "";
  return sk + ":" + sid;
}

function touchFunnelSession(store, sid, patch) {
  var key = funnelSessionKey(store, sid);
  if (!key) return null;
  var now = Date.now();
  var s = funnelData.sessions[key];
  if (!s) {
    s = {
      sid: sid,
      store: normalizeFunnelStore(store),
      first: now,
      last: now,
      home: false,
      product: false,
      checkout: false,
      pix: false,
      success: false,
      cloak_hit: false,
      cloak_pass: false,
      products: {},
      host: "",
    };
    funnelData.sessions[key] = s;
  }
  s.last = now;
  if (patch && typeof patch === "object") {
    if (patch.host) s.host = String(patch.host).slice(0, 120);
    if (patch.product_id) {
      s.product = true;
      s.products[String(patch.product_id)] = (s.products[String(patch.product_id)] || 0) + 1;
    }
    if (patch.home) s.home = true;
    if (patch.product) s.product = true;
    if (patch.checkout) s.checkout = true;
    if (patch.pix) s.pix = true;
    if (patch.success) s.success = true;
    if (patch.cloak_hit) s.cloak_hit = true;
    if (patch.cloak_pass) s.cloak_pass = true;
  }
  return s;
}

function recordFunnelEvent(req, urlObj) {
  var sid = String((urlObj.searchParams && urlObj.searchParams.get("sid")) || "").trim();
  var store = normalizeFunnelStore((urlObj.searchParams && urlObj.searchParams.get("store")) || "");
  var ev = String((urlObj.searchParams && urlObj.searchParams.get("event")) || "")
    .trim()
    .toLowerCase();
  if (!sid || !store || !ev) return { ok: false };
  var host = sanitizeOnlineHost((urlObj.searchParams && urlObj.searchParams.get("host")) || "");
  var productId = String((urlObj.searchParams && urlObj.searchParams.get("product_id")) || "")
    .trim()
    .slice(0, 40);
  if (!productId && (ev === "product" || ev === "home")) productId = store;
  var patch = { host: host };
  if (ev === "home") patch.home = true;
  if (ev === "product") {
    patch.product = true;
    if (productId) patch.product_id = productId;
  }
  if (ev === "checkout") patch.checkout = true;
  if (ev === "pix") patch.pix = true;
  if (ev === "success") {
    patch.success = true;
    patch.pix = true;
    patch.checkout = true;
  }
  if (ev === "cloak_hit") patch.cloak_hit = true;
  if (ev === "cloak_pass") patch.cloak_pass = true;
  touchFunnelSession(store, sid, patch);
  scheduleFunnelSave();
  return { ok: true };
}

function funnelFromPixBody(body, stage) {
  if (!body || typeof body !== "object") return;
  var sid = String(body.funnel_sid || body.funnelSid || "").trim();
  var store =
    normalizeFunnelStore(body.funnel_store || body.funnelStore || "") ||
    normalizeFunnelStore(String(body.origem || "").replace(/-ttkshop$/i, ""));
  if (!sid || !store) return;
  var patch = { host: String(body.funnel_host || "").slice(0, 120) };
  if (stage === "pix" || stage === "checkout") {
    patch.checkout = true;
    patch.pix = true;
    patch.product = true;
  }
  if (stage === "success") {
    patch.success = true;
    patch.pix = true;
    patch.checkout = true;
    patch.product = true;
  }
  touchFunnelSession(store, sid, patch);
  scheduleFunnelSave();
}

function emptyFunnelAgg() {
  return {
    sessions: 0,
    home: 0,
    product: 0,
    checkout: 0,
    pix: 0,
    success: 0,
    bounce: 0,
    product_only: 0,
    checkout_abandon: 0,
    pix_abandon: 0,
    cloak_hit: 0,
    cloak_pass: 0,
    by_product: {},
    by_host: {},
  };
}

function funnelAggFromSessions(sessions, cutoff, storeFilter) {
  var agg = emptyFunnelAgg();
  var storeKey = normalizeFunnelStore(storeFilter);
  var allStores = !storeKey;
  Object.keys(sessions).forEach(function (k) {
    var s = sessions[k];
    if (!s || Number(s.first) < cutoff) return;
    if (!allStores && s.store !== storeKey) return;
    agg.sessions += 1;
    if (s.home) agg.home += 1;
    if (s.product) agg.product += 1;
    if (s.checkout) agg.checkout += 1;
    if (s.pix) agg.pix += 1;
    if (s.success) agg.success += 1;
    var out = funnelOutcomeLabel(s);
    if (out === "bounce") agg.bounce += 1;
    if (out === "product_only") agg.product_only += 1;
    if (out === "checkout_abandon") agg.checkout_abandon += 1;
    if (out === "pix_abandon") agg.pix_abandon += 1;
    if (s.cloak_hit) agg.cloak_hit += 1;
    if (s.cloak_pass) agg.cloak_pass += 1;
    var hostKey = String(s.host || "").trim().slice(0, 120) || "(desconhecido)";
    if (!agg.by_host[hostKey]) {
      agg.by_host[hostKey] = { host: hostKey, sessions: 0, product: 0, checkout: 0, success: 0 };
    }
    agg.by_host[hostKey].sessions += 1;
    if (s.product) agg.by_host[hostKey].product += 1;
    if (s.checkout) agg.by_host[hostKey].checkout += 1;
    if (s.success) agg.by_host[hostKey].success += 1;
    var prods = s.products || {};
    Object.keys(prods).forEach(function (pid) {
      agg.by_product[pid] = (agg.by_product[pid] || 0) + Number(prods[pid] || 1);
    });
  });
  agg.by_host_list = Object.keys(agg.by_host || {})
    .map(function (h) {
      return agg.by_host[h];
    })
    .sort(function (a, b) {
      return (b.sessions || 0) - (a.sessions || 0);
    });
  return agg;
}

/** Mescla sessões salvas + vendas reais (sid gravado no pedido) — corrige funil subcontado. */
function funnelSessionsForReport(cutoff) {
  var sessions = JSON.parse(JSON.stringify(funnelData.sessions || {}));
  pixzyTxList().forEach(function (t) {
    if (!t || t.simulate) return;
    var ts = new Date(t.paid_at || t.created_at).getTime();
    if (isNaN(ts) || ts < cutoff) return;
    var sk = storeKeyFromTx(t);
    var sid = String(t.funnel_sid || "").trim();
    if (!sk || !sid || !isValidOnlineSid(sid)) return;
    var key = funnelSessionKey(sk, sid);
    if (!key) return;
    var s = sessions[key];
    if (!s) {
      sessions[key] = {
        sid: sid,
        store: sk,
        first: ts,
        last: ts,
        home: true,
        product: true,
        checkout: true,
        pix: true,
        success: t.status === "paid",
        cloak_hit: false,
        cloak_pass: false,
        products: {},
        host: "",
      };
      return;
    }
    s.product = true;
    s.checkout = true;
    s.pix = true;
    if (t.status === "paid") s.success = true;
    s.last = Math.max(Number(s.last) || 0, ts);
    s.first = Math.min(Number(s.first) || ts, ts);
  });
  pixzyTxList().forEach(function (t) {
    if (!t || t.simulate || t.status === "paid") return;
    var ts = new Date(t.created_at).getTime();
    if (isNaN(ts) || ts < cutoff) return;
    var sk = storeKeyFromTx(t);
    var sid = String(t.funnel_sid || "").trim();
    if (!sk || !sid || !isValidOnlineSid(sid)) return;
    var key = funnelSessionKey(sk, sid);
    if (!key || sessions[key]) return;
    sessions[key] = {
      sid: sid,
      store: sk,
      first: ts,
      last: ts,
      home: true,
      product: true,
      checkout: true,
      pix: true,
      success: false,
      cloak_hit: false,
      cloak_pass: false,
      products: {},
      host: "",
    };
  });
  return sessions;
}

/** Contagens mínimas a partir das TX reais (pedidos sem funnel_sid no passado). */
function funnelTxFloorAgg(cutoff, storeFilter) {
  var floor = emptyFunnelAgg();
  var storeKey = normalizeFunnelStore(storeFilter);
  pixzyTxList().forEach(function (t) {
    if (!t || t.simulate) return;
    var ts = new Date(t.created_at).getTime();
    if (isNaN(ts) || ts < cutoff) return;
    var sk = storeKeyFromTx(t);
    if (!sk || !STORE_PATHS[sk]) return;
    if (storeKey && sk !== storeKey) return;
    floor.sessions += 1;
    floor.product += 1;
    floor.checkout += 1;
    floor.pix += 1;
    if (t.status === "paid") floor.success += 1;
  });
  return floor;
}

function mergeFunnelAggMax(base, extra) {
  var out = Object.assign({}, base || emptyFunnelAgg());
  var e = extra || emptyFunnelAgg();
  ["sessions", "home", "product", "checkout", "pix", "success", "bounce", "product_only", "checkout_abandon", "pix_abandon"].forEach(
    function (k) {
      out[k] = Math.max(Number(out[k] || 0), Number(e[k] || 0));
    }
  );
  return out;
}

function funnelProductVisitorsFromTx(cutoff, storeFilter, existingRows) {
  var storeKey = normalizeFunnelStore(storeFilter);
  var seen = Object.create(null);
  (existingRows || []).forEach(function (r) {
    var k = String(r.store || "") + "|" + String(r.sid || "");
    seen[k] = 1;
  });
  var extra = [];
  pixzyTxList().forEach(function (t) {
    if (!t || t.simulate) return;
    var ts = new Date(t.paid_at || t.created_at).getTime();
    if (isNaN(ts) || ts < cutoff) return;
    var sk = storeKeyFromTx(t);
    if (!sk || !STORE_PATHS[sk]) return;
    if (storeKey && sk !== storeKey) return;
    var sidRaw = String(t.funnel_sid || "").trim();
    var sid = sidRaw && isValidOnlineSid(sidRaw) ? sidRaw.slice(0, 10) : "tx-" + String(t.id || "").slice(0, 8);
    var dedupe = sk + "|" + sid;
    if (seen[dedupe]) return;
    seen[dedupe] = 1;
    var outPv = t.status === "paid" ? "success" : t.status === "pending" ? "pix_abandon" : "checkout_abandon";
    extra.push({
      sid: sid,
      store: sk,
      store_label: STORE_PATHS[sk].label,
      first: ts,
      last: ts,
      host: "(pedido)",
      products: (function () {
        var p = {};
        p[sk] = 1;
        return p;
      })(),
      outcome: outPv,
      label: funnelOutcomeText(outPv),
      from_tx: true,
    });
  });
  extra.sort(function (a, b) {
    return Number(b.last || 0) - Number(a.last || 0);
  });
  return extra;
}

function buildFunnelReport(daysBack, storeFilter) {
  var days = Math.max(1, Math.min(90, Math.round(Number(daysBack) || 7)));
  var cutoff = Date.now() - days * 24 * 3600 * 1000;
  var sessions = funnelSessionsForReport(cutoff);
  var storeKey = normalizeFunnelStore(storeFilter);
  var agg = mergeFunnelAggMax(
    funnelAggFromSessions(sessions, cutoff, storeKey),
    funnelTxFloorAgg(cutoff, storeKey)
  );
  var byStore = [];
  if (!storeKey) {
    Object.keys(STORE_PATHS).forEach(function (sk) {
      var sub = mergeFunnelAggMax(
        funnelAggFromSessions(sessions, cutoff, sk),
        funnelTxFloorAgg(cutoff, sk)
      );
      byStore.push({
        key: sk,
        label: STORE_PATHS[sk].label,
        sessions: sub.sessions,
        product: sub.product,
        checkout: sub.checkout,
        pix: sub.pix,
        success: sub.success,
        bounce: sub.bounce,
      });
    });
    byStore.sort(function (a, b) {
      return (b.sessions || 0) - (a.sessions || 0);
    });
  }
  var productVisitors = [];
  Object.keys(sessions).forEach(function (k) {
    var s = sessions[k];
    if (!s || Number(s.first) < cutoff || !s.product) return;
    if (storeKey && s.store !== storeKey) return;
    var outPv = funnelOutcomeLabel(s);
    var sk = s.store || "";
    productVisitors.push({
      sid: String(s.sid || k).slice(0, 10),
      store: sk,
      store_label: (STORE_PATHS[sk] && STORE_PATHS[sk].label) || sk,
      first: s.first,
      last: s.last,
      host: s.host || "",
      products: s.products || {},
      outcome: outPv,
      label: funnelOutcomeText(outPv),
    });
  });
  productVisitors.sort(function (a, b) {
    return Number(b.last || 0) - Number(a.last || 0);
  });
  var txVisitors = funnelProductVisitorsFromTx(cutoff, storeKey, productVisitors);
  productVisitors = txVisitors.concat(productVisitors);
  productVisitors.sort(function (a, b) {
    return Number(b.last || 0) - Number(a.last || 0);
  });
  if (productVisitors.length > 500) productVisitors = productVisitors.slice(0, 500);
  return {
    days: days,
    store: storeKey || "all",
    stores: Object.keys(STORE_PATHS).map(function (k) {
      return { key: k, label: STORE_PATHS[k].label };
    }),
    stats: agg,
    by_store: byStore,
    product_visitors: productVisitors,
  };
}

loadFunnelData();

function isDeadSse(res) {
  return !res || res.writableEnded || res.destroyed || res.finished;
}

function pruneAdminOnlineSSE() {
  adminOnlineSSE.forEach(function (res) {
    if (isDeadSse(res)) {
      adminOnlineSSE.delete(res);
      return;
    }
    try {
      res.write(": ping\n\n");
    } catch (e) {
      adminOnlineSSE.delete(res);
    }
  });
}

function broadcastOnlineCount() {
  pruneAdminOnlineSSE();
  var payload = onlinePayload();
  var pagesKey = JSON.stringify({
    p: payload.pages || [],
    s: payload.pages_store || [],
    c: payload.pages_cloaker || [],
    n: payload.counts || {},
  });
  if (
    payload.online === lastBroadcastCount &&
    pagesKey === lastBroadcastPagesKey &&
    adminOnlineSSE.size === 0
  ) {
    return;
  }
  lastBroadcastCount = payload.online;
  lastBroadcastPagesKey = pagesKey;
  var data = "data: " + JSON.stringify(payload) + "\n\n";
  adminOnlineSSE.forEach(function (res) {
    try {
      res.write(data);
    } catch (e) {
      adminOnlineSSE.delete(res);
    }
  });
}

/* broadcast a cada 3s */
setInterval(broadcastOnlineCount, 3000);

/* ---------- keep-alive: impede o Render free de dormir ---------- */
/* Faz um request em si mesmo a cada 5 min (só em produção) */
const KEEP_ALIVE_MS = 5 * 60 * 1000; /* 5 minutos */

/* IPs confiáveis: ip -> role ("admin" | "pixel") */
const TRUSTED_IPS_FILE = path.join(DATA_DIR, "admin-ips.json");
const TRUSTED_IPS_BOOTSTRAP = path.join(ROOT, "admin-ips.json");
function loadTrustedIps() {
  var map = new Map();
  function ingest(file) {
    try {
      if (!fs.existsSync(file)) return;
      var raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        raw.forEach(function (ip) {
          if (ip) map.set(String(ip), "admin");
        });
      } else if (raw && typeof raw === "object") {
        Object.keys(raw).forEach(function (ip) {
          var role = raw[ip] === "pixel" ? "pixel" : "admin";
          map.set(String(ip), role);
        });
      }
    } catch (e) {}
  }
  ingest(TRUSTED_IPS_FILE);
  if (TRUSTED_IPS_BOOTSTRAP !== TRUSTED_IPS_FILE) ingest(TRUSTED_IPS_BOOTSTRAP);
  return map;
}
function saveTrustedIps() {
  try {
    var obj = {};
    TRUSTED_IPS.forEach(function (role, ip) {
      obj[ip] = role;
    });
    var json = JSON.stringify(obj, null, 2);
    fs.writeFileSync(TRUSTED_IPS_FILE, json);
    try {
      if (TRUSTED_IPS_BOOTSTRAP !== TRUSTED_IPS_FILE) {
        fs.writeFileSync(TRUSTED_IPS_BOOTSTRAP, json);
      }
    } catch (e2) {}
  } catch (e) {
    console.error("Falha ao salvar admin-ips.json:", e.message);
  }
}
var TRUSTED_IPS = loadTrustedIps();

function rememberTrustedIp(ip, role) {
  if (!ip) return;
  TRUSTED_IPS.set(ip, role === "pixel" ? "pixel" : "admin");
  saveTrustedIps();
}

function getClientIp(req) {
  /* NUNCA confiar no 1º hop de X-Forwarded-For (cliente pode spoofar → bypass /api/admin/auto).
     Cloudflare manda o IP real em CF-Connecting-IP; senão usa o ÚLTIMO hop do XFF (injetado pelo proxy). */
  var cf = String(req.headers["cf-connecting-ip"] || "").trim();
  if (cf) return cf.replace(/^::ffff:/, "");
  var trueClient = String(req.headers["true-client-ip"] || "").trim();
  if (trueClient) return trueClient.replace(/^::ffff:/, "");
  var xff = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var fwd = xff.length ? xff[xff.length - 1] : "";
  var ip = fwd || (req.socket && req.socket.remoteAddress) || "";
  return ip.replace(/^::ffff:/, "");
}

function b64urlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function b64urlDecode(str) {
  var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function issueToken(role) {
  var payload = JSON.stringify({
    exp: Date.now() + SESSION_TTL,
    role: role || "admin",
    r: crypto.randomBytes(8).toString("hex"),
  });
  var body = b64urlEncode(payload);
  var sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return body + "." + sig;
}

function getSession(req) {
  var token = getBearer(req);
  if (!token) return null;
  if (revokedTokens.has(token)) return null;

  var parts = String(token).split(".");
  if (parts.length !== 2) return null;
  var body = parts[0];
  var sig = parts[1];
  var expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  try {
    var a = Buffer.from(sig);
    var b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch (e) {
    return null;
  }
  try {
    var data = JSON.parse(b64urlDecode(body));
    if (!data || !data.exp || Date.now() > Number(data.exp)) return null;
    return { exp: Number(data.exp), role: data.role || "admin" };
  } catch (e2) {
    return null;
  }
}

function isAdmin(req) {
  var s = getSession(req);
  /* admin e pixel veem estatísticas */
  return !!(s && (s.role === "admin" || s.role === "pixel"));
}

function isPixelAdmin(req) {
  var s = getSession(req);
  /* igual ofertasdetudo: admin E pixel acessam APIs/UI de pixel */
  return !!(s && (s.role === "admin" || s.role === "pixel"));
}

function applyPixelToStoreHtml(storeKey, pixelId) {
  return applyPixelsToStoreHtml(storeKey, [pixelId]);
}

/** SHA-256 hex (TikTok Events API exige PII hasheada) */
function tiktokSha256(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex");
}

/** E-mail + telefone aleatórios hasheados pra Advanced Matching */
function fakeTikTokMatch(seed) {
  var n = Math.abs(Number(seed) || 0);
  if (!n) n = crypto.randomBytes(4).readUInt32BE(0);
  var email = ("cliente" + n + "@gmail.com").toLowerCase();
  var ddds = ["11", "21", "31", "41", "51", "61", "71", "81", "85"];
  var ddd = ddds[n % ddds.length];
  var phoneE164 = "+55" + ddd + "9" + String(10000000 + (n % 89999999)).padStart(8, "0");
  return {
    email: tiktokSha256(email),
    phone_number: tiktokSha256(phoneE164),
  };
}

function withTikTokMatch(user, seed) {
  var u = user && typeof user === "object" ? Object.assign({}, user) : {};
  var fake = fakeTikTokMatch(seed);
  if (!u.email) u.email = fake.email;
  if (!u.phone_number) u.phone_number = fake.phone_number;
  return u;
}

function tiktokApiAccepted(result) {
  if (!result || result.status < 200 || result.status >= 300) return false;
  var j = result.json;
  if (!j) return false;
  if (j.code === 0 || j.code === "0") return true;
  if (j.code == null && (j.message === "OK" || !j.message)) return true;
  return false;
}

function tiktokApiErrorText(result) {
  if (!result || !result.json) return "sem resposta TikTok";
  var j = result.json;
  return String(j.message || j.msg || j.code || "erro TikTok");
}

/**
 * TikTok Events API.
 * test_event_code DEVE ir na RAIZ do body (não dentro de cada evento).
 */
function tiktokTrackEvents(pixelId, accessToken, events, testEventCode) {
  return new Promise(function (resolve, reject) {
    var cleanEvents = (events || []).map(function (ev) {
      if (!ev || typeof ev !== "object") return ev;
      var copy = Object.assign({}, ev);
      delete copy.test_event_code;
      return copy;
    });
    var body = {
      event_source: "web",
      event_source_id: String(pixelId),
      data: cleanEvents,
    };
    var code = String(testEventCode || "").trim();
    if (code) body.test_event_code = code;

    var payload = JSON.stringify(body);
    var req = https.request(
      {
        hostname: "business-api.tiktok.com",
        path: "/open_api/v1.3/event/track/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": accessToken,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          var raw = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = { raw: raw };
          }
          resolve({ status: res.statusCode, json: json, request: body });
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/* taxas da Pixzy (sobre transação aprovada) */
const FEE_FIXED_CENTS = 199; /* R$ 1,99 */
const FEE_PERCENT = 0.0699; /* 6,99% */

/* webhook: URL pública onde a Pixzy vai avisar os pagamentos.
   Ex.: PUBLIC_BASE="https://seusite.com"  (deixe vazio em localhost)
   No Render a RENDER_EXTERNAL_URL já vem preenchida automaticamente,
   então o keep-alive e o webhook funcionam sem configurar nada. */
const PUBLIC_BASE = (process.env.PUBLIC_BASE || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
/* Servidor que tem transactions.json (painel). Mirrors/proxy usam isso no rastreio. */
const TRACKING_UPSTREAM_API = String(
  process.env.TRACKING_UPSTREAM_API ||
    process.env.TTK_UPSTREAM_API ||
    "https://ttkshop-projeto2.onrender.com"
).replace(/\/+$/, "");

/** Outros backends (projeto 2, etc.) — rastreio no ofertasgrandes.com acha TX em qualquer um. */
function trackingPeerBases() {
  var self = String(PUBLIC_BASE || "").replace(/\/+$/, "");
  var raw = String(
    process.env.TRACKING_PEER_APIS || process.env.TRACKING_UPSTREAM_API || ""
  ).trim();
  if (!raw) return [];
  var out = [];
  raw.split(/[,;\s]+/).forEach(function (part) {
    var b = String(part || "").replace(/\/+$/, "");
    if (!b || b === self || out.indexOf(b) !== -1) return;
    out.push(b);
  });
  return out;
}
/* segredo que protege o webhook (a Pixzy chama com ?key=...) */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "whk_ttkshop_2026_ax9Q";
const OPS_BOOT_KEY = process.env.OPS_BOOT_KEY || "odt_repair_2026_boot";

function opsAuthorized(urlObj) {
  var key = String((urlObj && urlObj.searchParams && urlObj.searchParams.get("key")) || "");
  if (WEBHOOK_SECRET && key === WEBHOOK_SECRET) return true;
  if (OPS_BOOT_KEY && key === OPS_BOOT_KEY) return true;
  return false;
}

/* baseline: total JÁ vendido na Pixzy antes de ligar o webhook.
   Assim os totais não começam do zero. Valores em CENTAVOS. */
const BASELINE_GROSS = parseInt(process.env.BASELINE_GROSS_CENTS || "0", 10) || 0;
const BASELINE_PAID = parseInt(process.env.BASELINE_PAID_COUNT || "0", 10) || 0;

/* ---------- store local de transações (a Pixzy não lista, só consulta por id) ---------- */
const DATA_FILE = path.join(DATA_DIR, "transactions.json");
const DATA_FILE_BOOTSTRAP = path.join(ROOT, "transactions.json");
const TX_TOMBSTONE_FILE = path.join(DATA_DIR, "tx-tombstones.json");
const TX_TOMBSTONE_BOOTSTRAP = path.join(ROOT, "tx-tombstones.json");
const AD_SPEND_FILE = path.join(DATA_DIR, "ad-spend.json");
const AD_SPEND_BOOTSTRAP = path.join(ROOT, "ad-spend.json");
var TX_TOMBSTONES = new Set();
var txGithubSyncTimer = null;

function loadTxTombstones() {
  var set = new Set();
  [TX_TOMBSTONE_FILE, TX_TOMBSTONE_BOOTSTRAP].forEach(function (p) {
    try {
      if (!fs.existsSync(p)) return;
      var arr = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!Array.isArray(arr)) return;
      arr.forEach(function (x) {
        if (x != null && String(x)) set.add(String(x));
      });
    } catch (e) {}
  });
  return set;
}
function saveTxTombstones() {
  var arr = Array.from(TX_TOMBSTONES)
    .map(function (x) {
      return String(x || "").trim();
    })
    .filter(Boolean)
    .sort();
  var json = JSON.stringify(arr, null, 2) + "\n";
  try {
    fs.writeFileSync(TX_TOMBSTONE_FILE, json);
  } catch (e) {}
  try {
    if (TX_TOMBSTONE_BOOTSTRAP !== TX_TOMBSTONE_FILE) {
      fs.writeFileSync(TX_TOMBSTONE_BOOTSTRAP, json);
    }
  } catch (e2) {}
  if (shouldSyncTxGithub() && (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)) {
    if (txTombstoneGithubTimer) clearTimeout(txTombstoneGithubTimer);
    txTombstoneGithubTimer = setTimeout(function () {
      txTombstoneGithubTimer = null;
      githubUpsertFile("tx-tombstones.json", json, "chore(tx): sync tombstones").catch(function () {});
    }, 60000);
  }
}
function isTxTombstoned(t) {
  if (!t) return false;
  if (t.id != null && TX_TOMBSTONES.has(String(t.id))) return true;
  if (t.external_id != null && TX_TOMBSTONES.has(String(t.external_id))) return true;
  return false;
}

function txKey(t) {
  if (!t) return "";
  if (t.id != null && String(t.id)) return "id:" + String(t.id);
  if (t.external_id != null && String(t.external_id)) return "ext:" + String(t.external_id);
  return "";
}
function txStatusRank(st) {
  st = String(st || "").toLowerCase();
  if (st === "paid") return 3;
  if (st === "pending") return 2;
  if (st === "cancelled" || st === "canceled" || st === "expired") return 1;
  return 0;
}
function pickRicherTx(a, b) {
  if (!a) return b;
  if (!b) return a;
  var out = Object.assign({}, a);
  var keys = Object.keys(b);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var bv = b[k];
    var av = out[k];
    if (bv == null || bv === "") continue;
    if (av == null || av === "") {
      out[k] = bv;
      continue;
    }
    if (k === "status") {
      if (txStatusRank(bv) > txStatusRank(av)) out.status = bv;
      continue;
    }
    if (k === "paid_at" && !av && bv) out.paid_at = bv;
    if (k === "address" && bv && typeof bv === "object") {
      var aa = av && typeof av === "object" ? av : {};
      var mergedAddr = Object.assign({}, aa);
      Object.keys(bv).forEach(function (ak) {
        if (bv[ak] && !mergedAddr[ak]) mergedAddr[ak] = bv[ak];
      });
      out.address = mergedAddr;
    }
    if (k === "items_detail" && Array.isArray(bv) && bv.length && (!Array.isArray(av) || !av.length)) {
      out.items_detail = bv;
    }
  }
  return out;
}
function mergeTxLists(a, b) {
  var map = Object.create(null);
  var order = [];
  function ingest(list) {
    (list || []).forEach(function (t) {
      if (!t || isTxTombstoned(t)) return;
      var k = txKey(t);
      if (!k) return;
      if (!map[k]) {
        map[k] = t;
        order.push(k);
      } else {
        map[k] = pickRicherTx(map[k], t);
      }
    });
  }
  ingest(a);
  ingest(b);
  return order.map(function (k) {
    return map[k];
  });
}

function githubGetFile(repoPath) {
  return new Promise(function (resolve) {
    var token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
    var repo = process.env.GITHUB_REPO || "matheuzxsblack/ttkshop-panelas";
    if (!token) return resolve({ ok: false, reason: "GITHUB_TOKEN ausente" });
    var apiBase =
      "/repos/" + repo + "/contents/" + String(repoPath || "").replace(/^\//, "");
    var req = https.request(
      {
        hostname: "api.github.com",
        path: apiBase + "?ref=" + encodeURIComponent(process.env.GITHUB_BRANCH || "main"),
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "User-Agent": "ttkshop-panelas",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          var raw = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = {};
          }
          if (res.statusCode === 404) return resolve({ ok: true, missing: true, text: "[]", sha: null });
          if (res.statusCode !== 200 || !json.content) {
            return resolve({ ok: false, reason: json.message || "GET HTTP " + res.statusCode });
          }
          try {
            var text = Buffer.from(json.content.replace(/\n/g, ""), "base64").toString("utf8");
            resolve({ ok: true, text: text, sha: json.sha || null });
          } catch (e2) {
            resolve({ ok: false, reason: e2.message || "decode" });
          }
        });
      }
    );
    req.on("error", function (e) {
      resolve({ ok: false, reason: e.message });
    });
    req.end();
  });
}

function shouldSyncTxGithub() {
  var flag = String(process.env.GITHUB_TX_SYNC || "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return String(process.env.RENDER || "").toLowerCase() === "true";
}

var txGithubSyncTimer = null;
var txGithubSyncInFlight = false;
var txTombstoneGithubTimer = null;

function txGithubSyncDebounceMs() {
  var n = parseInt(process.env.GITHUB_TX_SYNC_DEBOUNCE_MS || "120000", 10);
  if (!isFinite(n) || n < 15000) return 120000;
  return Math.min(n, 600000);
}

async function syncTxToGithubMerged() {
  if (!shouldSyncTxGithub()) {
    return { ok: false, reason: "sync desligado" };
  }
  if (txGithubSyncInFlight) return { ok: false, reason: "sync em andamento" };
  txGithubSyncInFlight = true;
  try {
    var remote = await githubGetFile("transactions.json");
    if (!remote.ok) {
      console.log("[data] sync ABORTADO — não leu remoto:", remote.reason || "erro");
      return { ok: false, reason: remote.reason || "get falhou" };
    }
    var remoteArr = [];
    try {
      remoteArr = JSON.parse(remote.text || "[]");
    } catch (eParse) {
      return { ok: false, reason: "json remoto inválido" };
    }
    if (!Array.isArray(remoteArr)) return { ok: false, reason: "remoto não é array" };

    /* NUNCA sobrescrever backup remoto com painel vazio (redeploy efêmero) */
    if (TX.length === 0 && remoteArr.length > 0) {
      console.log(
        "[data] sync ABORTADO — local vazio e remoto tem " + remoteArr.length + " tx (protegendo backup)"
      );
      TX = mergeTxLists([], remoteArr).filter(function (t) {
        return !isTxTombstoned(t);
      });
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(TX, null, 2));
      } catch (eDisk0) {}
      return { ok: false, reason: "local vazio; restaurou do remoto sem push" };
    }

    var before = TX.length;
    var merged = mergeTxLists(TX, remoteArr);
    var mergedKeys = Object.create(null);
    merged.forEach(function (t) {
      var k = txKey(t);
      if (k) mergedKeys[k] = true;
    });
    var missing = 0;
    remoteArr.forEach(function (t) {
      var k = txKey(t);
      if (k && !mergedKeys[k] && !isTxTombstoned(t)) missing++;
    });
    if (missing > 0) {
      console.log("[data] sync ABORTADO — merge perderia " + missing + " tx do remoto");
      return { ok: false, reason: "merge perderia ids" };
    }

    TX = merged.filter(function (t) {
      return !isTxTombstoned(t);
    });
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(TX, null, 2));
    } catch (eDisk) {}
    if (TX.length !== before) {
      console.log(
        "[data] merge pré-sync: local=" + before + " remoto=" + remoteArr.length + " → " + TX.length
      );
    }

    var r = await githubUpsertFile(
      "transactions.json",
      JSON.stringify(TX, null, 2),
      "chore(tx): sync transactions (" + TX.length + ")"
    );
    if (r && r.ok) console.log("[data] GitHub sync OK — " + TX.length + " tx");
    else if (r && !r.ok) console.log("[data] GitHub sync falhou:", r.reason);
    return r;
  } finally {
    txGithubSyncInFlight = false;
  }
}

function loadStore() {
  /* une DATA_DIR + bootstrap (igual ofertasdetudo) */
  var paths = [DATA_FILE];
  if (DATA_FILE_BOOTSTRAP !== DATA_FILE) paths.push(DATA_FILE_BOOTSTRAP);
  var merged = [];
  var loadedFrom = [];
  for (var pi = 0; pi < paths.length; pi++) {
    try {
      if (!fs.existsSync(paths[pi])) continue;
      var arr = JSON.parse(fs.readFileSync(paths[pi], "utf8"));
      if (Array.isArray(arr) && arr.length) {
        merged = mergeTxLists(merged, arr);
        loadedFrom.push(paths[pi] + "(" + arr.length + ")");
      }
    } catch (e) {}
  }
  merged = merged.filter(function (t) {
    if (!t || isTxTombstoned(t)) return false;
    if (t.source === "admin-reminder") return false;
    if (String(t.id || "").indexOf("remind-") === 0) return false;
    return true;
  });
  if (loadedFrom.length) {
    console.log(
      "[data] carregou tx de " + loadedFrom.join(" + ") + " → " + merged.length + " unificadas"
    );
  }
  return merged;
}
function saveStore() {
  try {
    var json = JSON.stringify(TX, null, 2);
    fs.writeFileSync(DATA_FILE, json);
    try {
      if (DATA_FILE_BOOTSTRAP !== DATA_FILE) fs.writeFileSync(DATA_FILE_BOOTSTRAP, json);
    } catch (eBoot) {}
    if (!shouldSyncTxGithub()) return;
    if (!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)) {
      console.log("[data] GitHub sync pulado — GITHUB_TOKEN ausente no Render (ofertasdetudo tem; copie pra cá)");
      return;
    }
    if (txGithubSyncTimer) clearTimeout(txGithubSyncTimer);
    txGithubSyncTimer = setTimeout(function () {
      syncTxToGithubMerged().catch(function (e) {
        console.log("[data] GitHub sync erro:", e.message || e);
      });
    }, txGithubSyncDebounceMs());
  } catch (e) {
    console.error("Falha ao salvar transactions.json:", e.message);
  }
}

/** Grava vendas no GitHub na hora (e-mail / rastreio — evita perder código no redeploy). */
async function saveStoreUrgent() {
  saveStore();
  if (txGithubSyncTimer) {
    clearTimeout(txGithubSyncTimer);
    txGithubSyncTimer = null;
  }
  if (!shouldSyncTxGithub()) return { ok: false, reason: "sync off" };
  if (!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)) {
    return { ok: false, reason: "no token" };
  }
  try {
    return await syncTxToGithubMerged();
  } catch (eUrg) {
    return { ok: false, reason: eUrg.message || String(eUrg) };
  }
}
TX_TOMBSTONES = loadTxTombstones();
var TX = loadStore();
console.log(
  "[data] DATA_DIR=" +
    DATA_DIR +
    " github_token=" +
    !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN) +
    " tx=" +
    TX.length
);

/* no boot em produção: puxa vendas do GitHub (disco do Render é efêmero) */
(async function bootMergeTxFromGithub() {
  if (!shouldSyncTxGithub()) {
    console.log("[data] boot merge OFF — defina GITHUB_TOKEN + RENDER/GITHUB_TX_SYNC no Render");
    return;
  }
  try {
    var remote = await githubGetFile("transactions.json");
    if (!remote.ok) {
      console.log("[data] boot merge falhou get:", remote.reason || "erro");
      return;
    }
    if (remote.missing) {
      console.log("[data] boot merge: transactions.json ainda não existe no GitHub — criando no 1º save");
      return;
    }
    var arr = JSON.parse(remote.text || "[]");
    if (!Array.isArray(arr) || !arr.length) {
      console.log("[data] boot merge: remoto vazio");
      return;
    }
    var before = TX.length;
    TX = mergeTxLists(TX, arr).filter(function (t) {
      return !isTxTombstoned(t);
    });
    if (TX.length !== before) {
      console.log("[data] boot merge GitHub: " + before + " → " + TX.length + " tx");
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(TX, null, 2));
      } catch (e) {}
    } else {
      console.log("[data] boot merge GitHub: " + TX.length + " tx (sem mudança)");
    }
  } catch (e) {
    console.log("[data] boot merge falhou:", e.message || e);
  }
})();

/* checkout modes: mesmo problema do painel — disco efêmero; puxa do GitHub */
(async function bootMergeCheckoutFromGithub() {
  if (!shouldSyncTxGithub()) return;
  try {
    var remote = await githubGetFile("checkout-config.json");
    if (!remote.ok) {
      console.log("[checkout] boot merge falhou get:", remote.reason || "erro");
      return;
    }
    if (remote.missing) return;
    var remoteObj = JSON.parse(remote.text || "{}");
    if (!remoteObj || typeof remoteObj !== "object") return;
    var local = loadCheckoutConfig();
    var merged = Object.assign({}, local, remoteObj);
    saveCheckoutConfig(merged);
    console.log("[checkout] boot merge GitHub OK — " + Object.keys(merged).length + " loja(s)");
  } catch (eCk) {
    console.log("[checkout] boot merge falhou:", eCk.message || eCk);
  }
})();

(async function bootMergePaymentGatewayFromGithub() {
  if (!shouldSyncTxGithub()) return;
  try {
    var remoteGw = await githubGetFile("payment-gateway-config.json");
    if (!remoteGw.ok) {
      console.log("[gateway] boot merge falhou get:", remoteGw.reason || "erro");
      return;
    }
    if (remoteGw.missing) return;
    var remoteObj = JSON.parse(remoteGw.text || "{}");
    if (!remoteObj || typeof remoteObj !== "object") return;
    var localGw = loadPaymentGatewayConfig();
    var mergedGw = Object.assign({}, localGw, remoteObj);
    savePaymentGatewayConfig(mergedGw);
    console.log("[gateway] boot merge GitHub OK — ativo: " + (mergedGw.gateway || "(env/auto)"));
  } catch (eGw) {
    console.log("[gateway] boot merge falhou:", eGw.message || eGw);
  }
})();

(async function bootMergeFunnelFromGithub() {
  if (!shouldSyncTxGithub()) return;
  try {
    var remoteFn = await githubGetFile("funnel-analytics.json");
    if (!remoteFn.ok) {
      console.log("[funnel] boot merge falhou get:", remoteFn.reason || "erro");
      return;
    }
    if (remoteFn.missing) return;
    var remoteObj = JSON.parse(remoteFn.text || "{}");
    if (!remoteObj || typeof remoteObj !== "object") return;
    var localS = funnelData.sessions || {};
    var remoteS = remoteObj.sessions && typeof remoteObj.sessions === "object" ? remoteObj.sessions : {};
    funnelData.sessions = mergeFunnelSessions(localS, remoteS);
    pruneFunnelData();
    saveFunnelData();
    console.log("[funnel] boot merge GitHub OK — " + Object.keys(funnelData.sessions).length + " sessão(ões)");
  } catch (eFn) {
    console.log("[funnel] boot merge falhou:", eFn.message || eFn);
  }
})();

(async function bootMergeCloakerFromGithub() {
  if (!shouldSyncTxGithub()) return;
  try {
    var remoteCl = await githubGetFile("cloaker-config.json");
    if (!remoteCl.ok) {
      console.log("[cloaker] boot merge falhou get:", remoteCl.reason || "erro");
      return;
    }
    if (remoteCl.missing) return;
    var remoteObjCl = JSON.parse(remoteCl.text || "{}");
    if (!remoteObjCl || typeof remoteObjCl !== "object") return;
    var localCl = loadCloakerConfig();
    var mergedCl = Object.assign({}, localCl, remoteObjCl);
    saveCloakerConfig(mergedCl);
    console.log("[cloaker] boot merge GitHub OK — " + Object.keys(mergedCl).length + " loja(s)");
  } catch (eCl) {
    console.log("[cloaker] boot merge falhou:", eCl.message || eCl);
  }
})();

/* pixels: tokens no GitHub — disco efêmero perdia o 2º pixel após redeploy */
(async function bootMergePixelConfigFromGithub() {
  if (!shouldSyncTxGithub()) return;
  try {
    var remote = await githubGetFile("pixel-config.json");
    if (!remote.ok) {
      console.log("[pixel] boot merge falhou get:", remote.reason || "erro");
      return;
    }
    if (remote.missing) return;
    var remoteObj = JSON.parse(remote.text || "{}");
    if (!remoteObj || typeof remoteObj !== "object") return;
    var localPx = loadPixelConfig();
    var mergedPx = Object.assign({}, localPx, remoteObj);
    savePixelConfig(mergedPx);
    var nStores = Object.keys(mergedPx).length;
    var nPix = 0;
    Object.keys(mergedPx).forEach(function (k) {
      var c = normalizeStoreCfg(mergedPx[k]);
      nPix += (c.pixels || []).length;
    });
    console.log("[pixel] boot merge GitHub OK — " + nStores + " loja(s), " + nPix + " pixel(s)");
  } catch (ePx) {
    console.log("[pixel] boot merge falhou:", ePx.message || ePx);
  }
})();

/* remove lixo / testes que não devem aparecer no painel */
(function purgeJunkTx() {
  var before = TX.length;
  TX = TX.filter(function (t) {
    var n = String((t && t.client_name) || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (n.indexOf("redkill") !== -1) return false;
    if (n === "matheus lima" || n.indexOf("matheus lima") === 0) return false;
    return true;
  });
  if (TX.length !== before) {
    saveStore();
    console.log("[purge] removidas " + (before - TX.length) + " transação(ões) de teste");
  }
})();

/* Pixzy marca expired — no painel fica pendente (não some da fila / X1) */
(function reviveExpiredToPending() {
  var n = 0;
  TX.forEach(function (t) {
    if (!t) return;
    var st = String(t.status || "").toLowerCase();
    if (st === "expired" || st === "cancelled" || st === "canceled" || st === "failed") {
      t.status = "pending";
      t.paid_at = null;
      n++;
    }
  });
  if (n) {
    saveStore();
    console.log("[data] " + n + " pedido(s) expirado/cancelado → pendente");
  }
})();

function netCents(amount) {
  return Math.max(0, amount - FEE_FIXED_CENTS - Math.round(amount * FEE_PERCENT));
}

/* ---------- rastreio: código único por pedido ---------- */
const SITE_BASE = process.env.SITE_BASE || "https://ofertasgrandes.com";
const STOREFRONT_VERCEL_BASE = String(
  process.env.STOREFRONT_BASE || "https://ofertaslindas.vercel.app"
).replace(/\/+$/, "");
const CANONICAL_TRACKING_BASE = "https://ofertasgrandes.com";

function isSecondaryHostBase(url) {
  var u = String(url || "").toLowerCase();
  if (!u) return true;
  return u.indexOf("vercel.app") !== -1 || u.indexOf("onrender.com") !== -1;
}

function genTrackingCode() {
  /* sem 0/O/1/I para não confundir o cliente */
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var body = "";
  for (var i = 0; i < 10; i++) {
    body += chars[crypto.randomInt(chars.length)];
  }
  return "SO" + body + "BR";
}

function genUniqueTrackingCode() {
  var code = genTrackingCode();
  while (
    TX.some(function (t) {
      return t.tracking_code === code;
    })
  ) {
    code = genTrackingCode();
  }
  return code;
}

function findTxByTracking(code) {
  var c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return (
    TX.find(function (t) {
      return String(t.tracking_code || "").toUpperCase() === c;
    }) || null
  );
}

function shouldProxyRastreio(req, codeR) {
  if (!TRACKING_UPSTREAM_API) return false;
  if (findTxByTracking(codeR)) return false;
  var host = String((req && req.headers && req.headers.host) || "")
    .toLowerCase()
    .split(":")[0];
  if (host.endsWith(".onrender.com")) return false;
  return true;
}

function fetchRastreioFromBase(baseApi, code) {
  return new Promise(function (resolve) {
    var base = String(baseApi || "").replace(/\/+$/, "");
    if (!base) return resolve(null);
    var c = String(code || "").trim();
    if (!c) return resolve(null);
    var full = base + "/api/rastreio/" + encodeURIComponent(c);
    var lib = full.indexOf("https:") === 0 ? https : http;
    var settled = false;
    function finish(val) {
      if (settled) return;
      settled = true;
      resolve(val);
    }
    try {
      var reqUp = lib.get(
        full,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "OfertasGrandes-Rastreio/1.0",
          },
        },
        function (resp) {
          var buf = "";
          resp.on("data", function (chunk) {
            buf += chunk;
          });
          resp.on("end", function () {
            finish({ status: resp.statusCode || 502, body: buf });
          });
        }
      );
      reqUp.on("error", function () {
        finish(null);
      });
      reqUp.setTimeout(18000, function () {
        try {
          reqUp.destroy();
        } catch (eT) {}
        finish(null);
      });
    } catch (eReq) {
      finish(null);
    }
  });
}

function fetchRastreioUpstream(code) {
  return fetchRastreioFromBase(TRACKING_UPSTREAM_API, code);
}

async function fetchRastreioAnyPeer(codeR, req) {
  var peers = trackingPeerBases();
  for (var pi = 0; pi < peers.length; pi++) {
    var upR = await fetchRastreioFromBase(peers[pi], codeR);
    if (upR && upR.status >= 200 && upR.status < 300 && upR.body) return upR;
  }
  if (shouldProxyRastreio(req, codeR)) {
    return fetchRastreioUpstream(codeR);
  }
  return null;
}

/* linha do tempo do rastreio, calculada a partir do pagamento */
const TRACK_SHIP_MS = 6 * 3600 * 1000;    /* 6h  → enviado (China) */
const TRACK_TRANSIT_MS = 24 * 3600 * 1000; /* 24h → em transporte p/ Brasil */

function trackingEvents(tx) {
  var base = new Date(tx.paid_at || tx.created_at).getTime();
  if (isNaN(base)) base = Date.now();
  var now = Date.now();
  var events = [
    {
      status: "PAGAMENTO CONFIRMADO — PEDIDO REGISTRADO",
      detail: "Ofertas Online confirmou o pagamento. Encomenda aguardando separação no centro logístico.",
      at: new Date(base).toISOString(),
      reached: true,
    },
    {
      status: "OBJETO POSTADO",
      detail: "Encomenda despachada pelo parceiro logístico.",
      at: new Date(base + TRACK_SHIP_MS).toISOString(),
      reached: now >= base + TRACK_SHIP_MS,
    },
    {
      status: "EM TRÂNSITO PARA ENTREGA",
      detail: "A caminho da região de destino. Prazo estimado: 15 a 30 dias úteis após postagem.",
      at: new Date(base + TRACK_TRANSIT_MS).toISOString(),
      reached: now >= base + TRACK_TRANSIT_MS,
    },
  ];
  return events;
}

/* ---------- e-mail automático (Resend API — https, sem dependências) ---------- */
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM_FALLBACK = "Ofertas Online <pedidos@ofertasgrandes.com>";
function resolveMailFrom(raw) {
  var s = String(raw || "").trim();
  var emailMatch = s.match(/[\w.+-]+@([\w.-]+\.[A-Za-z]{2,})/);
  if (!emailMatch) return MAIL_FROM_FALLBACK;
  var domain = String(emailMatch[1] || "").toLowerCase();
  /* domínio antigo no Render env — Resend não verifica mais achadofertas */
  if (
    !domain ||
    domain === "achadofertas.com" ||
    domain === "tiktok.com" ||
    domain === "seudominio.com" ||
    domain === "example.com"
  ) {
    return MAIL_FROM_FALLBACK;
  }
  return s;
}
const MAIL_FROM = resolveMailFrom(process.env.MAIL_FROM || MAIL_FROM_FALLBACK);

function isRealEmail(e) {
  var s = String(e || "").trim().toLowerCase();
  if (!s || s === "cliente@email.com") return false;
  if (/@example\.com$|@test\.com$|@email\.com$/.test(s)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function sendEmail(to, subject, html) {
  return new Promise(function (resolve, reject) {
    if (!RESEND_API_KEY) {
      return reject(new Error("RESEND_API_KEY não configurada"));
    }
    var payload = JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: subject,
      html: html,
    });
    var req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) { buf += c; });
        resp.on("end", function () {
          if (resp.statusCode >= 200 && resp.statusCode < 300) return resolve(true);
          reject(new Error("Resend HTTP " + resp.statusCode + ": " + buf.slice(0, 300)));
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function trackingSiteBase() {
  /* E-mails e admin: rastreio sempre no domínio da loja — nunca *.vercel.app secundário */
  var candidates = [process.env.TRACKING_SITE_BASE, process.env.SITE_BASE, CANONICAL_TRACKING_BASE];
  for (var i = 0; i < candidates.length; i++) {
    var b = String(candidates[i] || "").replace(/\/+$/, "");
    if (!b || isSecondaryHostBase(b)) continue;
    return b;
  }
  return CANONICAL_TRACKING_BASE;
}

function trackingPageUrl(code) {
  return trackingSiteBase() + "/rastreio/?c=" + encodeURIComponent(code || "");
}

function orderEmailHtml(tx) {
  var a = tx.address || {};
  var link = trackingPageUrl(tx.tracking_code || "");
  var itens = (tx.items_detail || [])
    .map(function (it) {
      return (
        '<tr><td style="padding:6px 0;color:#161823;font-size:14px">' +
        escHtml(it.qtd + "x " + it.variante) +
        "</td></tr>"
      );
    })
    .join("");
  var quando = new Date(tx.paid_at || tx.created_at).toLocaleString("pt-BR");
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f6;padding:24px">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">' +
    '<h1 style="margin:0 0 4px;font-size:22px;color:#161823">Ofertas Online</h1>' +
    '<p style="margin:0 0 20px;color:#fe2c55;font-weight:bold;font-size:13px">PEDIDO CONFIRMADO ✔</p>' +
    '<p style="color:#161823;font-size:14px">Olá, <b>' + escHtml(tx.client_name) + "</b>! Recebemos o seu pagamento em " + escHtml(quando) + ".</p>" +
    '<h3 style="font-size:14px;color:#8a8b91;margin:22px 0 6px">O QUE VOCÊ COMPROU</h3>' +
    '<table style="width:100%;border-collapse:collapse">' + itens + "</table>" +
    '<p style="font-size:15px;color:#161823"><b>Total pago: R$ ' + (tx.amount / 100).toFixed(2).replace(".", ",") + "</b></p>" +
    '<h3 style="font-size:14px;color:#8a8b91;margin:22px 0 6px">ENDEREÇO DE ENTREGA</h3>' +
    '<p style="font-size:14px;color:#161823;margin:0">' +
    escHtml(a.rua + ", " + a.numero + (a.complemento ? ", " + a.complemento : "")) + "<br>" +
    escHtml(a.bairro + " — " + a.cidade + "/" + a.uf) + "<br>CEP " + escHtml(a.cep) + "</p>" +
    '<h3 style="font-size:14px;color:#8a8b91;margin:22px 0 6px">CÓDIGO DE RASTREIO</h3>' +
    '<p style="font-size:20px;letter-spacing:2px;color:#161823;margin:0 0 14px"><b>' + escHtml(tx.tracking_code || "") + "</b></p>" +
    '<a href="' + link + '" style="display:inline-block;background:#fe2c55;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px;font-size:15px">Rastrear meu pedido</a>' +
    '<p style="color:#8a8b91;font-size:12px;margin-top:22px;word-break:break-all">Se o botão não funcionar, copie e cole este link:<br><a href="' +
    link +
    '" style="color:#fe2c55">' +
    escHtml(link) +
    "</a></p>" +
    '<p style="color:#8a8b91;font-size:12px;margin-top:14px">Não encontrou? Verifique também a caixa de spam ou lixo eletrônico.</p>' +
    "</div></div>"
  );
}

/* envio direto (admin) — sem os guards do automático, devolve promise */
async function sendOrderEmailNow(tx) {
  if (!tx.tracking_code) {
    tx.tracking_code = genUniqueTrackingCode();
    saveStore();
  }
  if (!isRealEmail(tx.client_email)) {
    throw new Error("E-mail do cliente inválido.");
  }
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no servidor.");
  }
  await sendEmail(
    tx.client_email,
    "Pedido confirmado! Seu código de rastreio — Ofertas Online",
    orderEmailHtml(tx)
  );
  tx.email_sent = true;
  saveStore();
  await saveStoreUrgent();
  if (!findTxByTracking(tx.tracking_code)) {
    throw new Error("Código de rastreio não ficou salvo no servidor — peça reenvio pelo admin.");
  }
  return true;
}

function findTxByEmail(email) {
  var e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  var matches = TX.filter(function (t) {
    return String(t.client_email || "").trim().toLowerCase() === e;
  });
  if (!matches.length) return null;
  /* prioriza pendente (X1) mais recente; senão a paga mais recente */
  var pending = matches.filter(function (t) {
    return t.status === "pending";
  });
  if (pending.length) return pending[pending.length - 1];
  var paid = matches.filter(function (t) {
    return t.status === "paid";
  });
  var pool = paid.length ? paid : matches;
  return pool[pool.length - 1];
}


function storeKeyFromTx(tx) {
  if (!tx) return "";
  var o = String(tx.origem || "").toLowerCase();
  if (o.indexOf("simular") !== -1) return "";
  if (o.indexOf("toalha") !== -1) return "toalha";
  if (o.indexOf("bobojaco") !== -1) return "bobojaco";
  if (o.indexOf("teddy") !== -1) return "teddy";
  if (o.indexOf("roupao") !== -1) return "roupao";
  if (o.indexOf("jaqueta") !== -1) return "jaqueta";
  if (o.indexOf("chuteira") !== -1) return "jaqueta";
  if (o.indexOf("panela") !== -1 || o.indexOf("panelas") !== -1) return "panelas";
  if (tx.funnel_store && STORE_PATHS[tx.funnel_store]) return String(tx.funnel_store);
  var attrPix = txAttributionPixelId(tx);
  if (attrPix) {
    var lojaPx = lojaForPixelId(attrPix);
    if (lojaPx && lojaPx.store) return lojaPx.store;
  }
  var items = (tx.items_detail || [])
    .map(function (it) {
      return String((it && it.variante) || "").toLowerCase();
    })
    .join(" ");
  if (items.indexOf("toalha") !== -1) return "toalha";
  if (items.indexOf("roup") !== -1) return "roupao";
  if (items.indexOf("jaqueta") !== -1 || items.indexOf("casaco") !== -1) return "jaqueta";
  if (items.indexOf("bobojaco") !== -1) return "bobojaco";
  if (items.indexOf("teddy") !== -1 || items.indexOf("casaquinho") !== -1) return "teddy";
  if (items.indexOf("panela") !== -1) return "panelas";
  if (typeof isPlausibleToalhaAmount === "function" && isPlausibleToalhaAmount(tx.amount)) return "toalha";
  return "";
}

/** Cada pixel ativo vira "Loja N" automaticamente (ordem do painel Pixels). */
function listPixelLojas() {
  var out = [];
  var n = 0;
  Object.keys(STORE_PATHS).forEach(function (storeKey) {
    var cfg = getStorePixels(storeKey);
    (cfg.pixels || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (p.enabled === false) return;
      n += 1;
      out.push({
        loja: n,
        store: storeKey,
        store_label: STORE_PATHS[storeKey].label,
        pixel_id: String(p.id),
        label: String(p.label || "Principal"),
        name: "Loja " + n + " — " + String(p.label || "Principal") + " (" + p.id + ")",
      });
    });
  });
  return out;
}

function lojaForPixelId(pixelId) {
  var id = String(pixelId || "").trim();
  if (!id) return null;
  var list = listPixelLojas();
  for (var i = 0; i < list.length; i++) {
    if (list[i].pixel_id === id) return list[i];
  }
  return null;
}

function txAttributionPixelId(tx) {
  if (!tx) return "";
  return String(
    tx.attribution_pixel_id ||
      tx.pixel_id ||
      (tx.metadata && tx.metadata.pixel_id) ||
      ""
  ).trim();
}

function productLabelFromTx(tx) {
  var items = (tx && tx.items_detail) || [];
  if (items.length) {
    return items
      .map(function (it) {
        return String((it && it.variante) || "Item");
      })
      .join(" + ");
  }
  return STORE_PATHS[storeKeyFromTx(tx)] ? STORE_PATHS[storeKeyFromTx(tx)].label : "Produto";
}

function unitsFromTx(tx) {
  var items = (tx && tx.items_detail) || [];
  if (!items.length) return 1;
  var n = 0;
  items.forEach(function (it) {
    n += Math.max(1, parseInt((it && it.qtd) || 1, 10) || 1);
  });
  return n;
}

function buildPerformanceReport() {
  var lojas = listPixelLojas();
  var byPixel = {};
  lojas.forEach(function (L) {
    byPixel[L.pixel_id] = {
      loja: L.loja,
      pixel_id: L.pixel_id,
      label: L.label,
      name: L.name,
      store: L.store,
      pedidos: 0,
      pagos: 0,
      unidades: 0,
      receita: 0,
      products: {},
    };
  });
  var unassigned = {
    loja: 0,
    pixel_id: "",
    label: "Sem pixel",
    name: "Sem loja / pixel",
    store: "",
    pedidos: 0,
    pagos: 0,
    unidades: 0,
    receita: 0,
    products: {},
  };

  var productRank = {};
  var log = [];
  var totals = { pedidos: 0, pagos: 0, unidades: 0, receita: 0 };

  pixzyTxList().forEach(function (t) {
    totals.pedidos += 1;
    var pid = txAttributionPixelId(t);
    /* vendas antigas sem pixel: se só existe 1 loja de pixel, conta nela */
    if (!pid && lojas.length === 1) pid = lojas[0].pixel_id;
    var bucket = pid && byPixel[pid] ? byPixel[pid] : unassigned;
    bucket.pedidos += 1;
    if (String(t.status || "").toLowerCase() !== "paid") return;
    totals.pagos += 1;
    var units = unitsFromTx(t);
    var amount = Math.round(Number(t.amount) || 0);
    totals.unidades += units;
    totals.receita += amount;
    bucket.pagos += 1;
    bucket.unidades += units;
    bucket.receita += amount;
    var prod = productLabelFromTx(t);
    if (!bucket.products[prod]) bucket.products[prod] = { produto: prod, vendas: 0, unidades: 0, receita: 0 };
    bucket.products[prod].vendas += 1;
    bucket.products[prod].unidades += units;
    bucket.products[prod].receita += amount;
    if (!productRank[prod]) productRank[prod] = { produto: prod, vendas: 0, unidades: 0, receita: 0 };
    productRank[prod].vendas += 1;
    productRank[prod].unidades += units;
    productRank[prod].receita += amount;
    var lojaMeta = lojaForPixelId(pid);
    log.push({
      at: t.paid_at || t.created_at,
      pixel_id: pid || "",
      loja_name: lojaMeta ? lojaMeta.name : bucket.name,
      produto: prod,
      amount: amount,
      client_name: t.client_name || "",
      id: t.id,
    });
  });

  var stores = Object.keys(byPixel)
    .map(function (k) {
      return byPixel[k];
    })
    .sort(function (a, b) {
      return a.loja - b.loja;
    });
  if (unassigned.pedidos || unassigned.pagos) stores.push(unassigned);

  stores.forEach(function (s) {
    s.conversao = s.pedidos > 0 ? Math.round((s.pagos / s.pedidos) * 1000) / 10 : 0;
    s.products = Object.keys(s.products)
      .map(function (k) {
        return s.products[k];
      })
      .sort(function (a, b) {
        return b.receita - a.receita;
      });
  });

  var ranking = Object.keys(productRank)
    .map(function (k) {
      return productRank[k];
    })
    .sort(function (a, b) {
      return b.receita - a.receita;
    });

  log.sort(function (a, b) {
    return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
  });

  return {
    summary: totals,
    lojas: lojas,
    stores: stores,
    ranking: ranking,
    log: log.slice(0, 300),
  };
}

/* Events API: Purchase real quando o Pix confirma */
function firePurchaseCapi(tx, opts) {
  opts = opts || {};
  if (!tx) return Promise.resolve();
  if (tx.simulate) return Promise.resolve();
  if (!opts.force && tx.pixel_purchase_sent) return Promise.resolve();
  if (String(tx.status || "").toLowerCase() !== "paid") return Promise.resolve();
  var storeKey = storeKeyFromTx(tx);
  var cfg = getStorePixels(storeKey);
  var attrPix = txAttributionPixelId(tx);
  var targets = (cfg.pixels || []).filter(function (p) {
    if (p.enabled === false) return false;
    if (!p.accessToken || String(p.accessToken).length <= 4) return false;
    return true;
  });
  if (attrPix && !targets.some(function (p) { return String(p.id) === attrPix; })) {
    console.log("[pixel] CAPI: attribution " + attrPix + " sem token — enviando para todos os pixels da loja");
  }
  if (!targets.length) {
    console.log("[pixel] CAPI Purchase pulado — nenhum pixel com Access Token (" + storeKey + ")");
    return Promise.resolve();
  }
  if (!attrPix && targets[0] && targets[0].id) {
    tx.attribution_pixel_id = String(targets[0].id);
  }
  var value = Math.round(Number(tx.amount) || 0) / 100;
  var nowSec = Math.floor(Date.now() / 1000);
  var pageUrl = checkoutUrlFromTx(tx);
  var emailHash = "";
  if (isRealEmail(tx.client_email)) {
    emailHash = tiktokSha256(String(tx.client_email).trim().toLowerCase());
  }
  var phoneHash = "";
  var phoneDig = String(tx.client_phone || "").replace(/\D/g, "");
  if (phoneDig.length >= 10) {
    if (phoneDig.charAt(0) !== "55") phoneDig = "55" + phoneDig;
    phoneHash = tiktokSha256("+" + phoneDig);
  }
  var label = (STORE_PATHS[storeKey] && STORE_PATHS[storeKey].label) || storeKey;
  var contents = (tx.items_detail || []).map(function (it, i) {
    return {
      content_id: storeKey + "-" + i,
      content_type: "product",
      content_name: String(it.variante || label),
      quantity: Number(it.qtd) || 1,
    };
  });
  if (!contents.length) {
    contents = [
      {
        content_id: storeKey,
        content_type: "product",
        content_name: label,
        quantity: 1,
      },
    ];
  }

  return Promise.all(
    targets.map(function (p) {
      var matchSeed = String(tx.id || "").replace(/\D/g, "").slice(-8) || nowSec;
      var userPaid = withTikTokMatch(
        {
          external_id: String(tx.id || tx.tracking_code || ""),
          email: emailHash || undefined,
          phone_number: phoneHash || undefined,
          ttclid: tx.ttclid || undefined,
          ttp: tx.ttp || undefined,
        },
        matchSeed
      );
      var props = {
        contents: contents,
        content_type: "product",
        currency: "BRL",
        value: value,
        description: "Venda paga — " + (tx.tracking_code || tx.id),
      };
      var evComplete = {
        event: "CompletePayment",
        event_time: nowSec,
        event_id: "paid-" + String(tx.id) + "-" + p.id,
        user: userPaid,
        properties: props,
        page: { url: pageUrl },
      };
      /* Purchase também — campanhas/Ads costumam olhar este nome (igual browser) */
      var evPurchase = {
        event: "Purchase",
        event_time: nowSec,
        event_id: "paid-purchase-" + String(tx.id) + "-" + p.id,
        user: userPaid,
        properties: props,
        page: { url: pageUrl },
      };
      return tiktokTrackEvents(p.id, p.accessToken, [evComplete, evPurchase])
        .then(function (r) {
          var ok = r && r.status >= 200 && r.status < 300;
          var ttOk =
            !r ||
            !r.json ||
            r.json.code === 0 ||
            r.json.code === "0" ||
            r.json.code == null;
          console.log(
            "[pixel] CAPI CompletePayment+Purchase → " +
              p.id +
              " HTTP " +
              (r && r.status) +
              (r && r.json && r.json.message ? " " + r.json.message : "")
          );
          return !!(ok && ttOk);
        })
        .catch(function (e) {
          console.log("[pixel] CAPI falhou " + p.id + ": " + (e.message || e));
          return false;
        });
    })
  ).then(function (results) {
    var anyOk = (results || []).some(Boolean);
    if (anyOk) {
      tx.pixel_purchase_sent = true;
      saveStore();
    } else {
      console.log(
        "[pixel] CAPI Purchase sem sucesso — pixel_purchase_sent NÃO marcado (" + tx.id + ")"
      );
    }
  });
}

function markPixelPurchaseAck(tx) {
  if (!tx || String(tx.status || "").toLowerCase() !== "paid") return false;
  /* NÃO marca pixel_purchase_sent — senão a CAPI (Events API) é pulada e o Ads fica sem evento se o browser falhar */
  if (tx.pixel_purchase_ack === "browser") return false;
  tx.pixel_purchase_ack = "browser";
  tx.pixel_purchase_ack_at = new Date().toISOString();
  saveStore();
  return true;
}

function maybeSendOrderEmail(tx) {
  if (!tx) return;
  if (tx.status === "paid") {
    firePurchaseCapi(tx).catch(function () {});
  }
  if (tx.email_sent) return;
  if (tx.status !== "paid") return;
  if (!tx.tracking_code) {
    tx.tracking_code = genUniqueTrackingCode();
    saveStore();
  }
  if (!isRealEmail(tx.client_email)) return;
  if (!RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY não configurada — e-mail de pedido não enviado para " + tx.client_email);
    return;
  }
  sendEmail(
    tx.client_email,
    "Pedido confirmado! Seu código de rastreio — Ofertas Online",
    orderEmailHtml(tx)
  )
    .then(function () {
      tx.email_sent = true;
      saveStore();
      console.log("[email] pedido " + tx.id + " → e-mail enviado para " + tx.client_email);
    })
    .catch(function (e) {
      console.log("[email] falha ao enviar para " + tx.client_email + ": " + e.message);
    });
}

/* ---------- X1 automático: lembretes 5 min e 30 min (Pix gerado, não pago) ---------- */
const REMINDER_5_MS = 5 * 60 * 1000;
const REMINDER_30_MS = 30 * 60 * 1000;

function storePublicPath(storeKey) {
  var k = String(storeKey || "").toLowerCase();
  if (k === "jaqueta") return "/"; /* anúncio usa a raiz; /jaqueta/ também funciona */
  if (k === "bobojaco") return "/bobojaco/";
  if (k === "teddy") return "/teddy/";
  if (k === "roupao") return "/roupao/";
  if (k === "panelas") return "/panela/";
  if (k === "toalha") return "/toalha/";
  return "/";
}

function checkoutUrlFromTx(tx) {
  var o = String((tx && tx.origem) || "").toLowerCase();
  if (o.indexOf("toalha") !== -1) return SITE_BASE + "/toalha/";
  if (o.indexOf("bobojaco") !== -1) return SITE_BASE + "/bobojaco/";
  if (o.indexOf("teddy") !== -1) return SITE_BASE + "/teddy/";
  if (o.indexOf("roupao") !== -1) return SITE_BASE + "/roupao/";
  if (o.indexOf("jaqueta") !== -1) return SITE_BASE + "/";
  if (o.indexOf("panela") !== -1 || o.indexOf("panelas") !== -1) return SITE_BASE + "/panela/";
  return SITE_BASE + "/";
}

function moneyBrFromCents(cents) {
  return "R$ " + (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
}

function reminderEmailHtml(tx, kind) {
  var itens = (tx.items_detail || [])
    .map(function (it) {
      return escHtml(it.qtd + "x " + it.variante);
    })
    .join("<br>");
  var link = checkoutUrlFromTx(tx);
  var valor = moneyBrFromCents(tx.amount);
  var is30 = kind === 30;
  var headline = is30
    ? "Última chance! Seu pedido ainda está reservado"
    : "Você esqueceu de finalizar o pagamento";
  var body = is30
    ? "Já faz um tempo e o Pix do seu pedido ainda não foi pago. Complete agora para garantir o preço promocional — a reserva pode expirar."
    : "Geramos o Pix da sua compra, mas o pagamento ainda não caiu. Finalize em poucos segundos e garanta seu desconto.";
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f6;padding:24px">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">' +
    '<h1 style="margin:0 0 4px;font-size:22px;color:#161823">Ofertas Online</h1>' +
    '<p style="margin:0 0 18px;color:#fe2c55;font-weight:bold;font-size:13px">' +
    (is30 ? "OFERTA EXPIRANDO" : "PAGAMENTO PENDENTE") +
    "</p>" +
    '<p style="color:#161823;font-size:15px;font-weight:bold;margin:0 0 10px">' + headline + "</p>" +
    '<p style="color:#555;font-size:14px;line-height:1.5">' + body + "</p>" +
    '<p style="color:#161823;font-size:14px;margin:18px 0 6px">Olá, <b>' + escHtml(tx.client_name || "cliente") + "</b></p>" +
    (itens
      ? '<p style="font-size:13px;color:#8a8b91;margin:12px 0 4px">SEU PEDIDO</p><p style="font-size:14px;color:#161823;margin:0">' + itens + "</p>"
      : "") +
    '<p style="font-size:16px;color:#161823;margin:14px 0"><b>Total: ' + valor + "</b></p>" +
    '<a href="' + link + '" style="display:inline-block;background:#fe2c55;color:#fff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px;font-size:15px">Finalizar pagamento agora</a>' +
    '<p style="color:#8a8b91;font-size:12px;margin-top:20px">Se o botão não abrir, acesse: ' + link + "</p>" +
    "</div></div>"
  );
}

function sendReminderEmail(tx, kind, opts) {
  opts = opts || {};
  if (!tx || tx.status !== "pending") {
    return Promise.reject(new Error("Pedido não está pendente."));
  }
  if (!isRealEmail(tx.client_email)) {
    return Promise.reject(new Error("Cliente sem e-mail válido."));
  }
  if (!RESEND_API_KEY) {
    return Promise.reject(new Error("RESEND_API_KEY não configurada no servidor."));
  }
  if (!opts.force) {
    if (kind === 5 && tx.reminder_5_sent) {
      return Promise.reject(new Error("Lembrete de 5 min já enviado."));
    }
    if (kind === 30 && tx.reminder_30_sent) {
      return Promise.reject(new Error("Lembrete de 30 min já enviado."));
    }
  }
  var subject =
    kind === 30
      ? "Última chance: complete seu pedido — Ofertas Online"
      : "Seu Pix ainda está aguardando pagamento — Ofertas Online";
  var persist =
    tx &&
    tx.id &&
    String(tx.id).indexOf("ephemeral-") !== 0 &&
    tx.source !== "admin-reminder-ephemeral";
  return sendEmail(tx.client_email, subject, reminderEmailHtml(tx, kind)).then(function () {
    if (kind === 5) tx.reminder_5_sent = true;
    if (kind === 30) {
      tx.reminder_30_sent = true;
      tx.x1 = true; /* X1 automático */
    }
    if (persist) saveStore();
    return true;
  });
}

function processPendingReminders() {
  if (!RESEND_API_KEY) return;
  var now = Date.now();
  TX.forEach(function (tx) {
    if (!tx || tx.status !== "pending" || tx.manual || tx.simulate) return;
    if (!isRealEmail(tx.client_email)) return;
    var created = new Date(tx.created_at).getTime();
    if (isNaN(created)) return;
    var age = now - created;

    if (!tx.reminder_5_sent && age >= REMINDER_5_MS) {
      sendReminderEmail(tx, 5)
        .then(function () {
          console.log("[x1] lembrete 5min → " + tx.client_email + " (" + tx.id + ")");
        })
        .catch(function (e) {
          console.log("[x1] falha 5min " + tx.id + ": " + e.message);
        });
    }

    if (!tx.reminder_30_sent && age >= REMINDER_30_MS) {
      sendReminderEmail(tx, 30)
        .then(function () {
          console.log("[x1] lembrete 30min + X1 → " + tx.client_email + " (" + tx.id + ")");
        })
        .catch(function (e) {
          console.log("[x1] falha 30min " + tx.id + ": " + e.message);
        });
    }
  });
}

/* roda a cada 60s */
setInterval(processPendingReminders, 60 * 1000);
setTimeout(processPendingReminders, 20 * 1000);

/* líquido real (da Pixzy) quando existir; senão estima pelas taxas */
function txNet(t) {
  if (t.net_amount != null && !isNaN(t.net_amount)) return t.net_amount;
  return netCents(t.amount);
}

function updateTxStatus(id, status, extra) {
  var tx = findTxByGatewayId(id);
  if (!tx) return false;
  var st = String(status || "").toLowerCase();
  /* igual ofertasdetudo: não vira "expirado" no painel — fica pendente */
  if (st === "expired" || st === "cancelled" || st === "canceled" || st === "failed") {
    st = "pending";
  }
  if (!st || st === tx.status) return false;
  /* nunca rebaixa pago */
  if (tx.status === "paid" && st !== "paid") return false;
  tx.status = st;
  if (st === "paid" && !tx.paid_at) {
    tx.paid_at = (extra && extra.paid_at) || new Date().toISOString();
  }
  if (extra && extra.net_amount != null) {
    tx.net_amount = Math.round(Number(extra.net_amount));
  }
  saveStore();
  if (st === "paid") {
    if (tx.funnel_sid && tx.funnel_store) {
      funnelFromPixBody(
        { funnel_sid: tx.funnel_sid, funnel_store: tx.funnel_store, origem: tx.origem },
        "success"
      );
    }
    maybeSendOrderEmail(tx);
  }
  return true;
}

/* atualiza status dos pendentes na Pixzy (mais recentes primeiro, com limite) */
/* Pixzy rate-limit: admin a cada 5s + Promise.all(40) = Too Many Attempts no checkout.
   Throttle + cooldown iguais nos dois projetos (moda + grandes). */
var PIXZY_COOLDOWN_UNTIL = 0;
var PIXZY_STATUS_CACHE = Object.create(null);
var PIXZY_STATUS_TTL_MS = 20 * 1000;
var PIXZY_PENDING_REFRESH_AT = 0;
var PIXZY_PENDING_REFRESH_MIN_MS = 60 * 1000;

function pixzyInCooldown() {
  return Date.now() < PIXZY_COOLDOWN_UNTIL;
}
function markPixzyCooldown(ms) {
  var until = Date.now() + (ms || 90 * 1000);
  if (until > PIXZY_COOLDOWN_UNTIL) PIXZY_COOLDOWN_UNTIL = until;
}

async function refreshPendingTx(limit, opts) {
  opts = opts || {};
  if (pixzyInCooldown()) return;
  if (!opts.force && Date.now() - PIXZY_PENDING_REFRESH_AT < PIXZY_PENDING_REFRESH_MIN_MS) {
    return;
  }
  PIXZY_PENDING_REFRESH_AT = Date.now();

  var activeGw = String(paymentGatewayName() || "").toLowerCase();
  var pending = pixzyTxList()
    .filter(function (t) {
      return t.status === "pending" && !t.simulate;
    })
    .sort(function (a, b) {
      var aPri = txGatewayId(a) === activeGw ? 1 : 0;
      var bPri = txGatewayId(b) === activeGw ? 1 : 0;
      if (aPri !== bPri) return bPri - aPri;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    })
    .slice(0, limit || 8);

  for (var i = 0; i < pending.length; i++) {
    if (pixzyInCooldown()) break;
    var t = pending[i];
    try {
      if (t.gateway === "sharpify" && t.id) {
        var sfPath =
          "/api/v1/checkout/payment-link/get?paymentLinkId=" + encodeURIComponent(t.id);
        var sfr = await sharpifyRequest("GET", sfPath);
        if (sfr.status === 429) break;
        var spl = sharpifyPaymentLinkData(sfr.json) || {};
        var sst = sharpifyStatusNorm(spl.status);
        if (sst === "paid") {
          var sfNet =
            spl.pricing && spl.pricing.total != null
              ? Math.round(Number(spl.pricing.total) * 100)
              : spl.payment && spl.payment.amount != null
                ? Math.round(Number(spl.payment.amount) * 100)
                : undefined;
          updateTxStatus(t.id, "paid", {
            paid_at: spl.lastTimeStatusUpdated || spl.paid_at,
            net_amount: sfNet,
          });
        }
        continue;
      }
      if (t.gateway === "purincash" && t.id) {
        var pc = await purincashRequest("GET", "/payments/" + encodeURIComponent(t.id));
        if (pc.status === 429) break;
        var pdata = purincashPaymentData(pc.json) || {};
        var pst = purincashStatusNorm(pdata.status);
        if (pst === "paid") {
          updateTxStatus(t.id, "paid", {
            paid_at: pdata.paidAt,
            net_amount:
              pdata.amountCents != null ? Math.round(Number(pdata.amountCents)) : undefined,
          });
        }
        continue;
      }
      if (t.gateway === "blackcat" && t.id) {
        var bc = await blackcatRequest(
          "GET",
          "/sales/" + encodeURIComponent(t.id) + "/status"
        );
        if (bc.status === 429) break;
        var bdata = blackcatSaleData(bc.json) || {};
        var bst = blackcatStatusNorm(bdata.status);
        if (bst === "paid") {
          updateTxStatus(t.id, "paid", {
            paid_at: bdata.paidAt,
            net_amount: bdata.netAmount != null ? Math.round(Number(bdata.netAmount)) : undefined,
          });
        }
        continue;
      }
      if (t.gateway === "ironpay" && t.id) {
        var ir = await ironPayRequest("GET", "/transactions/" + encodeURIComponent(t.id));
        if (ir.status === 429) break;
        var idata = ironPayTxData(ir.json) || {};
        var ist = ironPayStatusNorm(idata.payment_status || idata.status);
        if (ist === "paid") {
          updateTxStatus(t.id, "paid", {
            paid_at: idata.updated_at || idata.paid_at,
            net_amount:
              idata.amount_liquid != null ? Math.round(Number(idata.amount_liquid)) : undefined,
          });
        }
        continue;
      }
      if (t.gateway === "buckpay") {
        var br = null;
        if (t.external_id) {
          br = await buckpayRequest(
            "GET",
            "/v1/transactions/external_id/" + encodeURIComponent(t.external_id)
          );
        }
        if ((!br || br.status === 404 || br.status >= 500) && t.id) {
          br = await buckpayRequest("GET", "/v1/transactions/" + encodeURIComponent(t.id));
        }
        if (br && br.status === 429) break;
        if (br && br.status >= 200 && br.status < 300) {
          var bd = (br.json && (br.json.data || br.json)) || {};
          var bst = String(bd.status || "").toLowerCase();
          if (bst === "paid" || bst === "approved" || bst === "completed") {
            updateTxStatus(t.id, "paid", {
              paid_at: bd.updated_at || bd.paid_at,
              net_amount: bd.net_amount != null ? Math.round(Number(bd.net_amount)) : undefined,
            });
          }
        }
        continue;
      }
      var r = await pixzyRequest("GET", "/transactions/" + encodeURIComponent(t.id));
      if (r.status === 429) break;
      var d = (r.json && (r.json.data || r.json)) || {};
      var st = String(d.status || "").toLowerCase();
      /* só promove a paid; expired/cancel mantém pendente */
      if (st === "paid" || st === "approved" || st === "completed") {
        updateTxStatus(t.id, "paid", d);
      }
    } catch (e) {
      /* mantém pendente; tenta na próxima */
    }
  }
}

/* cache do saldo REAL da Pixzy — /account tem rate-limit (429).
   Persiste em disco pra não cair em "estimado" após restart. */
var PIXZY_ACCOUNT_FILE = path.join(DATA_DIR, "pixzy-account.json");
var PIXZY_ACCOUNT_CACHE = { at: 0, account: null };
var PIXZY_ACCOUNT_TTL_MS = 90 * 1000;

function loadPixzyAccountDisk() {
  try {
    if (!fs.existsSync(PIXZY_ACCOUNT_FILE)) return null;
    var raw = JSON.parse(fs.readFileSync(PIXZY_ACCOUNT_FILE, "utf8"));
    if (!raw || raw.balance == null || raw.estimated) return null;
    return {
      name: String(raw.name || "Pixzy"),
      balance: Math.round(Number(raw.balance) || 0),
      estimated: false,
      cached: true,
      saved_at: raw.saved_at || null,
    };
  } catch (e) {
    return null;
  }
}

function savePixzyAccountDisk(account) {
  if (!account || account.estimated || account.balance == null) return;
  try {
    fs.writeFileSync(
      PIXZY_ACCOUNT_FILE,
      JSON.stringify(
        {
          name: account.name || "Pixzy",
          balance: Math.round(Number(account.balance) || 0),
          estimated: false,
          saved_at: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (e) {
    console.log("[pixzy] falha ao salvar saldo em disco: " + (e.message || e));
  }
}

(function bootPixzyAccountCache() {
  var disk = loadPixzyAccountDisk();
  if (disk) {
    PIXZY_ACCOUNT_CACHE = { at: Date.now(), account: disk };
    console.log("[pixzy] saldo real carregado do disco: " + disk.balance);
  }
})();

function coercePixzyCents(v) {
  var n = Number(v);
  if (isNaN(n) || !isFinite(n)) return null;
  if (Math.abs(n) < 100000 && String(v).indexOf(".") !== -1) {
    return Math.round(n * 100);
  }
  return Math.round(n);
}

function pickPixzyBalance(json) {
  if (!json || typeof json !== "object") return null;
  var d = json.data && typeof json.data === "object" ? json.data : json;
  var candidates = [
    d.balance,
    d.available_balance,
    d.available,
    d.saldo,
    d.amount,
    d.wallet && d.wallet.balance,
    d.account && d.account.balance,
    d.balances && d.balances.available,
    d.balances && d.balances.balance,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var cents = coercePixzyCents(candidates[i]);
    if (cents != null) return cents;
  }
  try {
    var stack = [json];
    var seen = 0;
    while (stack.length && seen < 40) {
      seen++;
      var cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;
      var keys = Object.keys(cur);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var val = cur[key];
        if (/balance|saldo|available/i.test(key) && (typeof val === "number" || typeof val === "string")) {
          var c2 = coercePixzyCents(val);
          if (c2 != null) return c2;
        }
        if (val && typeof val === "object") stack.push(val);
      }
    }
  } catch (ePick) {}
  return null;
}

function lastRealPixzyAccount() {
  if (
    PIXZY_ACCOUNT_CACHE.account &&
    !PIXZY_ACCOUNT_CACHE.account.estimated &&
    PIXZY_ACCOUNT_CACHE.account.balance != null
  ) {
    var mem = Object.assign({}, PIXZY_ACCOUNT_CACHE.account);
    mem.cached = true;
    return mem;
  }
  var disk = loadPixzyAccountDisk();
  if (disk) {
    PIXZY_ACCOUNT_CACHE = { at: Date.now(), account: disk };
    return Object.assign({}, disk);
  }
  return null;
}

/** Saldo REAL da Pixzy via GET /account. Cacheia + disco; NÃO troca por líquido local. */
async function fetchPixzyAccount() {
  var now = Date.now();
  if (
    PIXZY_ACCOUNT_CACHE.account &&
    !PIXZY_ACCOUNT_CACHE.account.estimated &&
    PIXZY_ACCOUNT_CACHE.account.balance != null &&
    now - PIXZY_ACCOUNT_CACHE.at < PIXZY_ACCOUNT_TTL_MS
  ) {
    return Object.assign({}, PIXZY_ACCOUNT_CACHE.account);
  }

  var account = { name: "Pixzy", balance: null, estimated: false };
  try {
    var acc = await pixzyRequest("GET", "/account");
    if (acc.status === 200 && acc.json) {
      var bal = pickPixzyBalance(acc.json);
      var name =
        acc.json.name ||
        (acc.json.data && acc.json.data.name) ||
        "Pixzy";
      if (bal != null) {
        account.name = name;
        account.balance = bal;
        account.estimated = false;
        PIXZY_ACCOUNT_CACHE = { at: now, account: Object.assign({}, account) };
        savePixzyAccountDisk(account);
        return account;
      }
      console.log("[pixzy] /account 200 sem balance:", JSON.stringify(acc.json).slice(0, 200));
    } else {
      console.log("[pixzy] /account HTTP " + acc.status);
    }
  } catch (e) {
    console.log("[pixzy] /account falhou: " + (e.message || e));
  }

  var cached = lastRealPixzyAccount();
  if (cached) return cached;

  var sum = 0;
  pixzyTxList().forEach(function (t) {
    if (t.status === "paid" && !t.simulate) sum += txNet(t);
  });
  account.balance = sum;
  account.estimated = true;
  account.name = "Pixzy (estimado)";
  return account;
}

/* só transações reais da Pixzy — nunca pedido montado à mão no admin */
function isPixzyTx(t) {
  if (!t) return false;
  if (t.manual) return false;
  if (t.simulate) return false;
  if (t.source === "manual-admin" || t.source === "simulate" || t.source === "admin-reminder") return false;
  if (String(t.id || "").indexOf("manual-") === 0) return false;
  if (String(t.id || "").indexOf("sim-") === 0) return false;
  if (String(t.id || "").indexOf("remind-") === 0) return false;
  return true;
}

function sumPaidNetLocal() {
  var sum = 0;
  pixzyTxList().forEach(function (t) {
    if (t.status === "paid") sum += txNet(t);
  });
  return sum;
}

function txGatewayId(t) {
  return String((t && (t.gateway || t.source)) || "pixzy").toLowerCase();
}

function sumPaidNetForGateway(gwFilter) {
  var gw = String(gwFilter || "").toLowerCase();
  if (!gw) return 0;
  var sum = 0;
  pixzyTxList().forEach(function (t) {
    if (t.status !== "paid") return;
    if (txGatewayId(t) !== gw) return;
    sum += txNet(t);
  });
  return sum;
}

function gatewayStatsBreakdown() {
  var out = {};
  pixzyTxList().forEach(function (t) {
    var gw = txGatewayId(t);
    if (!out[gw]) out[gw] = { paid: 0, pending: 0, net: 0, gross: 0 };
    if (t.status === "paid") {
      out[gw].paid++;
      out[gw].net += txNet(t);
      out[gw].gross += t.amount || 0;
    } else if (t.status === "pending") {
      out[gw].pending++;
    }
  });
  return out;
}

async function fetchPurincashAccountBalance() {
  if (!PURINCASH_API_KEY) return null;
  var paths = ["/balance", "/wallet", "/wallet/balance", "/account"];
  for (var i = 0; i < paths.length; i++) {
    try {
      var r = await purincashRequest("GET", paths[i]);
      if (r.status >= 200 && r.status < 300 && r.json) {
        var bal = pickPixzyBalance(r.json);
        if (bal != null) {
          return { balance: bal, from_api: true, path: paths[i] };
        }
      }
    } catch (ePcBal) {}
  }
  return null;
}

async function fetchSharpifyAccountBalance() {
  if (!SHARPIFY_CLIENT_ID || !SHARPIFY_CLIENT_SECRET) return null;
  try {
    var r = await sharpifyRequest("GET", "/api/v1/management/withdrawal/data");
    if (r.status >= 200 && r.status < 300 && r.json) {
      var d = r.json.data || r.json;
      var brl =
        d.availableBalance != null && !isNaN(Number(d.availableBalance))
          ? Number(d.availableBalance)
          : d.balance != null && !isNaN(Number(d.balance))
            ? Number(d.balance)
            : null;
      if (brl != null) {
        return {
          balance: Math.round(brl * 100),
          from_api: true,
          path: "/api/v1/management/withdrawal/data",
        };
      }
    }
  } catch (eSfBal) {}
  return null;
}

async function fetchBuckpayAccountBalance() {
  if (!BUCKPAY_API_KEY) return null;
  var paths = [
    "/v1/balance",
    "/v1/account",
    "/v1/wallet",
    "/v1/wallet/balance",
    "/v1/merchants/balance",
  ];
  for (var i = 0; i < paths.length; i++) {
    try {
      var r = await buckpayRequest("GET", paths[i]);
      if (r.status >= 200 && r.status < 300 && r.json) {
        var bal = pickPixzyBalance(r.json);
        if (bal != null) {
          return { balance: bal, from_api: true, path: paths[i] };
        }
      }
    } catch (eBpBal) {}
  }
  return null;
}

/** Painel: saldo geral (Pixzy + gateway ativo) e breakdown. */
async function fetchAdminAccountDisplay() {
  var gw = paymentGatewayName();
  var pixzyAcc = await fetchPixzyAccount();
  var pixzyBal =
    pixzyAcc.balance != null && !isNaN(pixzyAcc.balance) ? Math.round(Number(pixzyAcc.balance)) : 0;
  var localNetAll = sumPaidNetLocal();
  var out = Object.assign({}, pixzyAcc, {
    gateway_active: gw,
    local_paid_net: localNetAll,
    pixzy_balance: pixzyBal,
  });

  if (!gw || gw === "pixzy") {
    out.balance = pixzyAcc.balance;
    out.balance_general = pixzyBal;
    out.balance_note = pixzyAcc.estimated
      ? "estimado pelas vendas no painel (API Pixzy indisponível)"
      : "conta Pixzy";
    return out;
  }

  var gwPanelNet = sumPaidNetForGateway(gw);
  var gwApi = null;
  if (gw === "buckpay") gwApi = await fetchBuckpayAccountBalance();
  if (gw === "purincash") gwApi = await fetchPurincashAccountBalance();
  if (gw === "sharpify") gwApi = await fetchSharpifyAccountBalance();
  var gwPart = gwApi && gwApi.balance != null ? Math.round(Number(gwApi.balance)) : gwPanelNet;
  var general = pixzyBal + gwPart;
  var gwLabel = (PAYMENT_GATEWAY_META[gw] && PAYMENT_GATEWAY_META[gw].label) || gw;

  out.balance = general;
  out.balance_general = general;
  out.gateway_balance = gwPart;
  out.gateway_balance_panel = gwPanelNet;
  out.gateway_balance_from_api = !!(gwApi && gwApi.from_api);
  out.balance_breakdown =
    "Pixzy " +
    (pixzyBal / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) +
    " + " +
    gwLabel +
    " " +
    (gwPart / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) +
    (gwApi && gwApi.from_api ? " (API)" : " (vendas pagas no painel)");
  out.balance_note = out.balance_breakdown + " · saque em cada gateway";
  out.name = out.name || "Saldo geral";
  return out;
}

function pixzyTxList() {
  return TX.filter(isPixzyTx);
}

function mapTxRowAdmin(t) {
  return {
    id: t.id,
    external_id: t.external_id || "",
    amount: t.amount,
    net: txNet(t),
    status: t.status,
    gateway: txGatewayId(t),
    client_name: t.client_name,
    client_email: t.client_email || "",
    client_doc: t.client_doc || "",
    client_phone: t.client_phone || "",
    address: t.address || null,
    items_detail: t.items_detail || [],
    x1: !!t.x1,
    source: t.source || t.gateway || "pixzy",
    created_at: t.created_at,
    paid_at: t.paid_at,
  };
}

function filterAdminTxList(list, opts) {
  opts = opts || {};
  var status = String(opts.status || "all").toLowerCase();
  var q = String(opts.q || "")
    .trim()
    .toLowerCase();
  var fromMs = opts.fromMs;
  var toMs = opts.toMs;
  return list
    .filter(function (t) {
      if (status === "pending" && t.status !== "pending") return false;
      if (status === "paid" && t.status !== "paid") return false;
      if (fromMs != null || toMs != null) {
        var ts = new Date(t.created_at).getTime();
        if (isNaN(ts)) return false;
        if (fromMs != null && ts < fromMs) return false;
        if (toMs != null && ts >= toMs) return false;
      }
      if (q) {
        var hay = [
          t.id,
          t.external_id,
          t.client_name,
          t.client_email,
          t.client_phone,
          t.client_doc,
          t.tracking_code,
        ]
          .join(" ")
          .toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    })
    .sort(function (a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
}

function adminTxCounts(list) {
  var out = { total: list.length, pending: 0, paid: 0 };
  list.forEach(function (t) {
    if (t.status === "pending") out.pending++;
    else if (t.status === "paid") out.paid++;
  });
  return out;
}


const RECONCILE_HISTORY_FILE = path.join(DATA_DIR, "reconcile-history.json");

function loadReconcileHistory() {
  try {
    var arr = JSON.parse(fs.readFileSync(RECONCILE_HISTORY_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function pushReconcileHistory(entry) {
  var hist = loadReconcileHistory();
  hist.unshift(entry);
  if (hist.length > 40) hist = hist.slice(0, 40);
  try {
    fs.writeFileSync(RECONCILE_HISTORY_FILE, JSON.stringify(hist, null, 2));
  } catch (eH) {}
  return hist;
}

function txCampaignLabel(t) {
  var camp = String((t && t.utm_campaign) || "").trim();
  if (camp) return camp;
  return "—";
}
function txOrigemLabel(t) {
  var src = String((t && (t.utm_source || t.origem)) || "").trim();
  if (!src || /ttkshop$/i.test(src) || src.indexOf("-ttkshop") !== -1) {
    var camp = String((t && t.utm_campaign) || "").trim();
    var medium = String((t && t.utm_medium) || "").trim();
    if (!camp && !medium) return "(direto / sem UTM)";
  }
  if (!src) return "(direto / sem UTM)";
  return src;
}

function buildReconcileReport() {
  var paid = pixzyTxList().filter(function (t) {
    return t.status === "paid";
  });
  var tracked = paid.filter(function (t) {
    return !!t.pixel_purchase_sent;
  });
  var missingList = paid.filter(function (t) {
    return !t.pixel_purchase_sent;
  });
  var byKey = {};
  paid.forEach(function (t) {
    var o = txOrigemLabel(t);
    var c = txCampaignLabel(t);
    var key = o + "||" + c;
    if (!byKey[key]) {
      byKey[key] = { origem: o, campanha: c, pagos: 0, enviados: 0, delta: 0 };
    }
    byKey[key].pagos++;
    if (t.pixel_purchase_sent) byKey[key].enviados++;
  });
  var byOrigin = Object.keys(byKey)
    .map(function (k) {
      var row = byKey[k];
      row.delta = Math.max(0, row.pagos - row.enviados);
      return row;
    })
    .sort(function (a, b) {
      return b.pagos - a.pagos || b.delta - a.delta;
    });
  return {
    ok: true,
    paid: paid.length,
    tracked: tracked.length,
    missing: missingList.length,
    delta: missingList.length,
    byOrigin: byOrigin,
    missingOrders: missingList.slice(0, 50).map(function (t) {
      return {
        id: t.id,
        tracking_code: t.tracking_code || "",
        client_name: t.client_name || "",
        amount: t.amount || 0,
        paid_at: t.paid_at || t.created_at || null,
        origem: txOrigemLabel(t),
        campanha: txCampaignLabel(t),
        store: storeKeyFromTx(t),
      };
    }),
    history: loadReconcileHistory(),
    updatedAt: new Date().toISOString(),
  };
}


function calcPeriod(fromMs, toMs) {
  var out = {
    generated: 0,
    paid_count: 0,
    gross: 0,
    net: 0,
    pending_count: 0,
    pending_value: 0,
  };
  pixzyTxList().forEach(function (t) {
    var ts = new Date(t.created_at).getTime();
    if (isNaN(ts) || ts < fromMs || ts >= toMs) return;
    out.generated++;
    if (t.status === "paid") {
      out.paid_count++;
      out.gross += t.amount;
      out.net += txNet(t);
    } else if (t.status === "pending") {
      out.pending_count++;
      out.pending_value += t.amount;
    }
  });
  return out;
}

/* Painel em horário de Brasília (Render roda em UTC — senão "hoje" vira dia seguinte às 21h) */
const ADMIN_TZ = process.env.ADMIN_TZ || "America/Sao_Paulo";

function ymdInTz(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || ADMIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date instanceof Date ? date : new Date(date));
}

/** Meia-noite no fuso (epoch ms) do dia civil de `date` (ou de YYYY-MM-DD). */
function startOfDayInTz(dateOrYmd, timeZone) {
  var tz = timeZone || ADMIN_TZ;
  var ymd =
    typeof dateOrYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOrYmd)
      ? dateOrYmd
      : ymdInTz(dateOrYmd || new Date(), tz);
  var probe = Date.parse(ymd + "T00:00:00Z");
  if (isNaN(probe)) return startOfDayLocalFallback(dateOrYmd);

  function offsetAt(ms) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    var m = {};
    parts.forEach(function (p) {
      if (p.type !== "literal") m[p.type] = p.value;
    });
    var asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
    return asUtc - ms;
  }

  var start = probe - offsetAt(probe);
  if (ymdInTz(new Date(start), tz) !== ymd) {
    start = probe - offsetAt(probe + 12 * 3600 * 1000);
  }
  return start;
}

function startOfDayLocalFallback(d) {
  var x = new Date(d || Date.now());
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function startOfDay(d) {
  return startOfDayInTz(d || new Date(), ADMIN_TZ);
}

/* ---------- ROI / gasto com anúncio (por dia + loja) ---------- */
function loadAdSpend() {
  var out = {};
  [AD_SPEND_FILE, AD_SPEND_BOOTSTRAP].forEach(function (p) {
    try {
      if (!fs.existsSync(p)) return;
      var raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!raw || typeof raw !== "object") return;
      Object.keys(raw).forEach(function (ymd) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
        var day = raw[ymd];
        if (!out[ymd]) out[ymd] = {};
        if (day && typeof day === "object" && !Array.isArray(day)) {
          Object.keys(day).forEach(function (store) {
            var n = Math.round(Number(day[store]) || 0);
            if (n < 0) n = 0;
            out[ymd][store] = n;
          });
        } else if (typeof day === "number") {
          out[ymd].jaqueta = Math.max(0, Math.round(Number(day) || 0));
        }
      });
    } catch (e) {}
  });
  return out;
}

function saveAdSpend(cfg) {
  var json = JSON.stringify(cfg || {}, null, 2);
  try {
    fs.writeFileSync(AD_SPEND_FILE, json);
  } catch (e) {
    console.log("[roi] saveAdSpend disk:", e.message);
  }
  try {
    if (AD_SPEND_BOOTSTRAP !== AD_SPEND_FILE) {
      fs.writeFileSync(AD_SPEND_BOOTSTRAP, json);
    }
  } catch (e2) {}
}

function roiTxDayKey(t) {
  var raw = (t && (t.paid_at || t.created_at)) || null;
  if (!raw) return null;
  var ms = new Date(raw).getTime();
  if (isNaN(ms)) return null;
  return ymdInTz(new Date(ms), ADMIN_TZ);
}

function buildRoiReport(daysN) {
  var days = Math.max(1, Math.min(90, parseInt(daysN, 10) || 7));
  var todayYmd = ymdInTz(new Date(), ADMIN_TZ);
  var today0 = startOfDayInTz(todayYmd, ADMIN_TZ);
  var DAY = 24 * 3600 * 1000;
  var spendMap = loadAdSpend();
  var storeKeys = Object.keys(STORE_PATHS);

  /* receita líquida paga por dia+loja */
  var rev = {}; /* ymd|store -> cents */
  var paid = {}; /* ymd|store -> count */
  pixzyTxList().forEach(function (t) {
    if (!t || t.status !== "paid") return;
    var ymd = roiTxDayKey(t);
    if (!ymd) return;
    var sk = storeKeyFromTx(t);
    if (!sk || !STORE_PATHS[sk]) return;
    var key = ymd + "|" + sk;
    rev[key] = (rev[key] || 0) + txNet(t);
    paid[key] = (paid[key] || 0) + 1;
  });

  var rows = [];
  var sumRevenue = 0;
  var sumSpend = 0;
  var sumPaid = 0;

  for (var i = 0; i < days; i++) {
    var dayStart = today0 - i * DAY;
    var ymd = ymdInTz(new Date(dayStart + 12 * 3600 * 1000), ADMIN_TZ);
    var dayRev = 0;
    var daySpend = 0;
    var dayPaid = 0;
    var spendDay = spendMap[ymd] || {};

    storeKeys.forEach(function (sk) {
      var revenue = Math.round(rev[ymd + "|" + sk] || 0);
      var spend = Math.round(Number(spendDay[sk]) || 0);
      var profit = revenue - spend;
      var roiPct = spend > 0 ? Math.round((profit / spend) * 10000) / 100 : null;
      var paid_count = paid[ymd + "|" + sk] || 0;
      dayRev += revenue;
      daySpend += spend;
      dayPaid += paid_count;
      rows.push({
        date: ymd,
        store: sk,
        label: STORE_PATHS[sk].label,
        revenue: revenue,
        spend: spend,
        profit: profit,
        roi: roiPct,
        paid_count: paid_count,
        is_today: ymd === todayYmd,
        is_total: false,
      });
    });

    var dayProfit = dayRev - daySpend;
    rows.push({
      date: ymd,
      store: "",
      label: "TOTAL",
      revenue: dayRev,
      spend: daySpend,
      profit: dayProfit,
      roi: daySpend > 0 ? Math.round((dayProfit / daySpend) * 10000) / 100 : null,
      paid_count: dayPaid,
      is_today: ymd === todayYmd,
      is_total: true,
    });

    sumRevenue += dayRev;
    sumSpend += daySpend;
    sumPaid += dayPaid;
  }

  var profitTotal = sumRevenue - sumSpend;
  return {
    days: days,
    today: todayYmd,
    stores: storeKeys.map(function (k) {
      return { key: k, label: STORE_PATHS[k].label };
    }),
    multi_store: true,
    summary: {
      revenue: sumRevenue,
      spend: sumSpend,
      profit: profitTotal,
      roi: sumSpend > 0 ? Math.round((profitTotal / sumSpend) * 10000) / 100 : null,
      paid_count: sumPaid,
    },
    rows: rows,
  };
}

function getBearer(req) {
  var h = String(req.headers.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }, corsHeaders()));
  res.end(raw);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
      if (Buffer.concat(chunks).length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function ironPayRequest(method, apiPath, payload) {
  return new Promise(function (resolve, reject) {
    if (!IRONPAY_API_TOKEN) {
      return resolve({ status: 503, json: { success: false, message: "Iron Pay não configurado." } });
    }
    var data = payload ? JSON.stringify(payload) : null;
    var q = apiPath.indexOf("?") >= 0 ? "&" : "?";
    var fullPath =
      IRONPAY_API_PREFIX +
      apiPath +
      q +
      "api_token=" +
      encodeURIComponent(IRONPAY_API_TOKEN);
    var req = https.request(
      {
        hostname: IRONPAY_HOST,
        path: fullPath,
        method: method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) {
          buf += c;
        });
        resp.on("end", function () {
          var json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (e) {
            json = { raw: buf };
          }
          resolve({ status: resp.statusCode || 500, json: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function ironPayStatusNorm(raw) {
  var s = String(raw || "").toLowerCase();
  if (s === "paid" || s === "approved" || s === "completed") return "paid";
  if (s === "waiting_payment" || s === "pending") return "pending";
  return s || "pending";
}

function ironPayBrCode(data) {
  if (!data || typeof data !== "object") return "";
  var px = data.pix || {};
  return String(px.pix_qr_code || data.pix_qr_code || data.qr_code || "").trim();
}

function ironPhoneDigits(raw) {
  return buckPhoneDigits(raw);
}

function ironCustomerFromPixBody(body, clientName, clientEmail, clientDoc, clientPhone) {
  var addr = body.address && typeof body.address === "object" ? body.address : {};
  var cust = {
    name: clientName.slice(0, 100),
    email: clientEmail.slice(0, 100),
    document: clientDoc,
  };
  var ph = ironPhoneDigits(clientPhone);
  if (ph) cust.phone_number = ph;
  if (addr.cep) cust.zip_code = String(addr.cep).replace(/\D/g, "").slice(0, 8);
  if (addr.rua) cust.street_name = String(addr.rua).slice(0, 120);
  if (addr.numero) cust.number = String(addr.numero).slice(0, 20);
  if (addr.complemento) cust.complement = String(addr.complemento).slice(0, 80);
  if (addr.bairro) cust.neighborhood = String(addr.bairro).slice(0, 80);
  if (addr.cidade) cust.city = String(addr.cidade).slice(0, 80);
  if (addr.uf) cust.state = String(addr.uf).slice(0, 2).toUpperCase();
  cust.country = "br";
  return cust;
}

function ironTrackingFromBody(utmSource, utmMedium, utmCampaign, utmContent) {
  var has = !!(utmSource || utmMedium || utmCampaign || utmContent);
  if (!has) return undefined;
  return {
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    utm_content: utmContent || null,
  };
}

function ironErrorText(json) {
  if (!json) return "";
  if (typeof json.message === "string" && json.message && json.message.indexOf("Server Error") === -1) {
    return json.message;
  }
  if (json.errors && typeof json.errors === "object") {
    try {
      return Object.keys(json.errors)
        .map(function (k) {
          var v = json.errors[k];
          return k + ": " + (Array.isArray(v) ? v.join(", ") : String(v));
        })
        .join(" ");
    } catch (eE) {}
  }
  return String(json.message || json.error || "Erro Iron Pay");
}

function ironPayTxData(json) {
  if (!json) return null;
  if (json.hash || json.payment_status) return json;
  if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) return json.data;
  return json;
}

function blackcatRequest(method, apiPath, payload) {
  return new Promise(function (resolve, reject) {
    if (!BLACKCAT_API_KEY) {
      return resolve({ status: 503, json: { success: false, message: "BlackCat não configurado." } });
    }
    var data = payload ? JSON.stringify(payload) : null;
    var req = https.request(
      {
        hostname: BLACKCAT_HOST,
        path: BLACKCAT_API_PREFIX + apiPath,
        method: method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": BLACKCAT_API_KEY,
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) {
          buf += c;
        });
        resp.on("end", function () {
          var json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (e) {
            json = { raw: buf };
          }
          resolve({ status: resp.statusCode || 500, json: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function blackcatSaleData(json) {
  if (!json) return null;
  if (json.transactionId || json.status) return json;
  if (json.data && typeof json.data === "object") return json.data;
  return null;
}

function blackcatStatusNorm(raw) {
  var s = String(raw || "").toUpperCase();
  if (s === "PAID" || s === "APPROVED" || s === "COMPLETED") return "paid";
  if (s === "PENDING" || s === "PROCESSING") return "pending";
  if (s === "CANCELLED" || s === "CANCELED" || s === "FAILED" || s === "REFUNDED") {
    return "pending";
  }
  return String(raw || "pending").toLowerCase() || "pending";
}

function blackcatBrCode(data) {
  if (!data || typeof data !== "object") return "";
  var pd = data.paymentData || {};
  return String(pd.copyPaste || pd.qrCode || data.qrCode || "").trim();
}

function genBlackExternalRef() {
  return ("ttk_" + Date.now().toString(36) + "_" + crypto.randomBytes(5).toString("hex")).slice(0, 64);
}

function blackcatPhoneDigits(raw) {
  var d = String(raw || "").replace(/\D/g, "");
  if (d.length >= 10) return d.slice(0, 13);
  return "11999999999";
}

function blackcatDocType(doc) {
  return String(doc || "").replace(/\D/g, "").length > 11 ? "cnpj" : "cpf";
}

function blackcatShippingFromBody(body, clientName) {
  var addr = body.address && typeof body.address === "object" ? body.address : {};
  var cep = String(addr.cep || "").replace(/\D/g, "").slice(0, 8);
  if (cep.length < 8) cep = "01310100";
  return {
    name: clientName.slice(0, 100),
    street: String(addr.rua || "Rua").slice(0, 120),
    number: String(addr.numero || "S/N").slice(0, 20),
    complement: String(addr.complemento || "").slice(0, 80),
    neighborhood: String(addr.bairro || "Centro").slice(0, 80),
    city: String(addr.cidade || "Sao Paulo").slice(0, 80),
    state: String(addr.uf || "SP").slice(0, 2).toUpperCase(),
    zipCode: cep,
  };
}

function blackcatErrorText(json) {
  if (!json) return "";
  if (typeof json.message === "string" && json.message) return json.message;
  if (typeof json.error === "string" && json.error) return json.error;
  return "Erro BlackCat";
}

function purincashRequest(method, apiPath, payload) {
  return new Promise(function (resolve, reject) {
    if (!PURINCASH_API_KEY) {
      return resolve({ status: 503, json: { error: "PurinCash não configurado." } });
    }
    var data = payload ? JSON.stringify(payload) : null;
    var req = https.request(
      {
        hostname: PURINCASH_HOST,
        path: PURINCASH_API_PREFIX + apiPath,
        method: method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + PURINCASH_API_KEY,
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) {
          buf += c;
        });
        resp.on("end", function () {
          var json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (e) {
            json = { raw: buf };
          }
          resolve({ status: resp.statusCode || 500, json: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function purincashPaymentData(json) {
  if (!json) return null;
  if (json.paymentId || json.status) return json;
  if (json.data && typeof json.data === "object") return json.data;
  return null;
}

function purincashStatusNorm(raw) {
  var s = String(raw || "").toLowerCase();
  if (s === "paid" || s === "approved" || s === "completed") return "paid";
  if (s === "pending") return "pending";
  if (s === "expired" || s === "refunded" || s === "failed" || s === "cancelled") {
    return "pending";
  }
  return s || "pending";
}

function purincashBrCode(data) {
  if (!data || typeof data !== "object") return "";
  var px = data.pix || {};
  return String(px.brCode || px.copyPaste || data.brCode || "").trim();
}

function purincashErrorText(json, status) {
  if (!json) return "";
  if (typeof json.error === "string" && json.error) {
    if (/verifique sua conta|chave pix/i.test(json.error)) {
      return "Conta PurinCash pendente: verifique a chave PIX no painel (Carteira → Verificar Chave PIX).";
    }
    return json.error;
  }
  if (status === 403) {
    return "PurinCash recusou a cobrança. Verifique a chave PIX no painel PurinCash.";
  }
  return "Erro PurinCash";
}

function purincashWebhookSignatureOk(rawBody, signatureHeader) {
  if (!PURINCASH_WEBHOOK_SECRET) return true;
  var sig = String(signatureHeader || "").trim();
  if (!sig) return false;
  var expected = crypto
    .createHmac("sha256", PURINCASH_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch (eSig) {
    return sig === expected;
  }
}

function sharpifyRequest(method, apiPath, payload) {
  return new Promise(function (resolve, reject) {
    if (!SHARPIFY_CLIENT_ID || !SHARPIFY_CLIENT_SECRET) {
      return resolve({ status: 503, json: { error: "Sharpify não configurado." } });
    }
    var data = payload ? JSON.stringify(payload) : null;
    var req = https.request(
      {
        hostname: SHARPIFY_HOST,
        path: apiPath,
        method: method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "OfertasGrandes-Pix/1.0",
          "x-sharpify-client-id": SHARPIFY_CLIENT_ID,
          "x-sharpify-client-secret": SHARPIFY_CLIENT_SECRET,
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) {
          buf += c;
        });
        resp.on("end", function () {
          var json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (e) {
            json = { raw: buf };
          }
          resolve({ status: resp.statusCode || 500, json: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function sharpifyPaymentLinkData(json) {
  if (!json) return null;
  if (json.id && (json.status || json.payment)) return json;
  if (json.data && typeof json.data === "object") {
    if (json.data.id) return json.data;
    if (json.data.data && typeof json.data.data === "object") return json.data.data;
  }
  if (json.paymentLink && typeof json.paymentLink === "object") return json.paymentLink;
  return null;
}

function sharpifyStatusNorm(raw) {
  var s = String(raw || "").toUpperCase();
  if (s === "APPROVED" || s === "PAID" || s === "COMPLETED") return "paid";
  if (s === "PENDING") return "pending";
  if (s === "CANCELLED" || s === "CANCELED" || s === "EXPIRED" || s === "FAILED") {
    return "pending";
  }
  return String(raw || "pending").toLowerCase() || "pending";
}

function sharpifyBrCode(data) {
  if (!data || typeof data !== "object") return "";
  var pay = data.payment || {};
  var gw = pay.gateway || {};
  var gd = gw.data || {};
  return String(gd.code || gd.qrCode || gd.paymentLink || "").trim();
}

function sharpifyAmountCentsFromLink(pl, fallbackCents) {
  if (!pl || typeof pl !== "object") return fallbackCents;
  if (pl.pricing && pl.pricing.total != null) return Math.round(Number(pl.pricing.total) * 100);
  if (pl.payment && pl.payment.amount != null) return Math.round(Number(pl.payment.amount) * 100);
  return fallbackCents;
}

function sharpifyGatewayDisabled(json) {
  if (!json) return false;
  try {
    var blob = JSON.stringify(json);
    if (/GATEWAY_NOT_ENABLED|pagamento n[aã]o habilitado/i.test(blob)) return true;
  } catch (eJ) {}
  var err = json.error;
  if (err && typeof err === "object") {
    if (/GATEWAY_NOT_ENABLED/i.test(String(err.message || err.name || ""))) return true;
    if (/n[aã]o habilitado/i.test(String(err.name || err.message || ""))) return true;
  }
  return false;
}

function sharpifyErrorText(json, status) {
  if (!json) return "";
  if (sharpifyGatewayDisabled(json)) {
    return (
      "PIX não está habilitado na sua loja Sharpify. No painel Sharpify, vá em Configurações → " +
      "Pagamentos e ative o método PIX (e cadastre a chave PIX da loja). Depois tente de novo."
    );
  }
  var err = json.error;
  if (err && typeof err === "object") {
    if (typeof err.message === "string" && err.message && err.message !== "An error occurred") {
      return err.message;
    }
    if (typeof err.name === "string" && err.name) return err.name;
  }
  if (typeof json.message === "string" && json.message) return json.message;
  try {
    var blob = JSON.stringify(json);
    if (/GATEWAY_NOT_ENABLED/i.test(blob)) {
      return "PIX não está habilitado na loja Sharpify. Ative em Configurações → Pagamentos.";
    }
  } catch (eJ) {}
  if (status === 403) return "Sharpify recusou a credencial (permissões ou IP).";
  return "Erro Sharpify";
}

function applySharpifyWebhookPayload(hook) {
  if (!hook || typeof hook !== "object") return;
  var ev = hook.event && typeof hook.event === "object" ? hook.event : {};
  var evName = String(ev.name || hook.eventName || hook.name || "").toUpperCase();
  var data = hook.data && typeof hook.data === "object" ? hook.data : hook;
  var statusRaw = String(data.status || "").toUpperCase();
  var isPaid =
    evName === "PAYMENT_LINK_APPROVED" ||
    evName === "ORDER_APPROVED" ||
    statusRaw === "APPROVED";
  if (!isPaid) return;
  var id = String(
    ev.contextId || data.id || hook.paymentLinkId || hook.orderId || ""
  ).trim();
  if (!id) return;
  var existing = findTxByGatewayId(id);
  if (!existing) return;
  var netAmt = sharpifyAmountCentsFromLink(data, undefined);
  updateTxStatus(existing.id, "paid", {
    paid_at: data.lastTimeStatusUpdated || ev.createdAt || hook.createdAt,
    net_amount: netAmt,
  });
  saveStore();
  firePurchaseCapi(existing).catch(function () {});
}

function buckpayRequest(method, apiPath, payload, uaTry) {
  return new Promise(function (resolve, reject) {
    uaTry = uaTry || 0;
    if (!BUCKPAY_API_KEY) {
      return resolve({ status: 503, json: { error: { message: "BuckPay não configurado." } } });
    }
    var data = payload ? JSON.stringify(payload) : null;
    var ua = BUCKPAY_USER_AGENTS[uaTry] || BUCKPAY_USER_AGENTS[0] || "BuckPay API";
    var req = https.request(
      {
        hostname: BUCKPAY_HOST,
        path: apiPath,
        method: method,
        headers: {
          Authorization: "Bearer " + BUCKPAY_API_KEY,
          "User-Agent": ua,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) {
          buf += c;
        });
        resp.on("end", function () {
          var json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (e) {
            json = { raw: buf };
          }
          var status = resp.statusCode || 500;
          if (status === 401 && uaTry + 1 < BUCKPAY_USER_AGENTS.length) {
            buckpayRequest(method, apiPath, payload, uaTry + 1).then(resolve).catch(reject);
            return;
          }
          if (status === 403 && uaTry + 1 < BUCKPAY_USER_AGENTS.length) {
            buckpayRequest(method, apiPath, payload, uaTry + 1).then(resolve).catch(reject);
            return;
          }
          resolve({ status: status, json: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function genBuckExternalId() {
  return ("ttk_" + Date.now().toString(36) + "_" + crypto.randomBytes(5).toString("hex")).slice(0, 255);
}

function buckPhoneDigits(raw) {
  var d = String(raw || "").replace(/\D/g, "");
  if (!d) return undefined;
  if (d.length >= 12) return d.slice(0, 13);
  if (d.length >= 10) return "55" + d.slice(0, 11);
  return undefined;
}

function buckTrackingFromBody(utmSource, utmMedium, utmCampaign, utmContent) {
  var has =
    !!(utmSource || utmMedium || utmCampaign || utmContent);
  if (!has) return undefined;
  return {
    ref: null,
    src: null,
    sck: null,
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    utm_id: null,
    utm_term: null,
    utm_content: utmContent || null,
  };
}

function isValidCpf11(cpf) {
  cpf = String(cpf || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  var sum = 0;
  var i;
  for (i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  var d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf.charAt(9), 10)) return false;
  sum = 0;
  for (i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  var d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf.charAt(10), 10);
}

function isValidClientDocument(doc) {
  var d = String(doc || "").replace(/\D/g, "");
  if (d.length === 11) return isValidCpf11(d);
  if (d.length === 14) return !/^(\d)\1{13}$/.test(d);
  return false;
}

const PIX_FALLBACK_CPF = String(process.env.PIX_FALLBACK_CPF || "16473249044").replace(/\D/g, "");

/** CPF/CNPJ enviado ao gateway — usa fallback se vazio ou inválido. */
function resolvePixClientDocument(rawDoc) {
  var entered = String(rawDoc || "").replace(/\D/g, "");
  if (isValidClientDocument(entered)) {
    return { doc: entered, entered: entered, fallback: false };
  }
  var fb = PIX_FALLBACK_CPF;
  if (!isValidClientDocument(fb)) fb = "16473249044";
  return { doc: fb, entered: entered, fallback: true };
}

function buckErrorText(json) {
  if (!json) return "";
  var err = json.error;
  if (!err) return String(json.message || "");
  var detail = err.detail;
  if (detail && typeof detail === "object") {
    var buyer = detail.buyer;
    if (Array.isArray(buyer) && buyer.length) {
      var btxt = buyer.join(" ").toLowerCase();
      if (btxt.indexOf("cpf") !== -1 || btxt.indexOf("cnpj") !== -1) {
        return "CPF inválido. Digite um CPF válido com 11 dígitos.";
      }
    }
  }
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    try {
      return String(err.message || "Erro BuckPay") + ": " + JSON.stringify(detail);
    } catch (eJ) {
      return String(err.message || "Erro BuckPay");
    }
  }
  return String(err.message || err.detail || "Erro BuckPay");
}

function findTxByGatewayId(id) {
  var q = String(id || "");
  if (!q) return null;
  return (
    TX.find(function (t) {
      return String(t.id) === q || String(t.external_id || "") === q;
    }) || null
  );
}

function pixzyRequest(method, apiPath, payload) {
  return new Promise(function (resolve, reject) {
    var isCreate = method === "POST" && String(apiPath || "").indexOf("/transactions") === 0;
    if (pixzyInCooldown() && !isCreate) {
      return resolve({
        status: 429,
        json: { message: "Too Many Attempts." },
      });
    }
    var data = payload ? JSON.stringify(payload) : null;
    var req = https.request(
      {
        hostname: PIXZY_HOST,
        path: "/api" + apiPath,
        method: method,
        headers: {
          Authorization: "Bearer " + PIXZY_TOKEN,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      function (resp) {
        var buf = "";
        resp.on("data", function (c) {
          buf += c;
        });
        resp.on("end", function () {
          var json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (e) {
            json = { raw: buf };
          }
          var status = resp.statusCode || 500;
          if (status === 429) markPixzyCooldown(90 * 1000);
          resolve({ status: status, json: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function serveStatic(req, res, pathname) {
  /* anúncio / TikTok Pixel Helper batem na raiz — serve a jaqueta (pixel ativo),
     igual ofertasdetudo.com que tem o pixel no index da home. */
  var rel =
    pathname === "/" || pathname === "/index.html"
      ? "/jaqueta/index.html"
      : CLOAK_ENTRY_TO_HTML[pathname]
        ? CLOAK_ENTRY_TO_HTML[pathname]
        : pathname === "/compra" || pathname === "/compra/"
        ? "/compra.html"
        : pathname === "/pedido-confirmado" || pathname === "/pedido-confirmado/"
        ? "/pedido-confirmado.html"
        : pathname;
  rel = decodeURIComponent(rel).replace(/\0/g, "");
  if (rel.includes("..")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  var file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  /* pasta (ex.: /jaqueta): redireciona para /jaqueta/ e serve o index.html dela.
     IMPORTANTE: preservar query string (?c=CODIGO). Sem isso, /rastreio?c=X
     vira /rastreio/ e a página fica sem código (spinner eterno / formulário vazio). */
  try {
    if (fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith("/")) {
        var qDir = "";
        try {
          var qiDir = String(req.url || "").indexOf("?");
          if (qiDir >= 0) qDir = String(req.url).slice(qiDir);
        } catch (eQ) {}
        res.writeHead(301, { Location: pathname + "/" + qDir });
        return res.end();
      }
      file = path.join(file, "index.html");
    }
  } catch (e) {
    /* não existe: readFile abaixo devolve 404 */
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    var ext = path.extname(file).toLowerCase();
    var headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    /* html/css/js sempre frescos — evita front antigo em cache gerando venda sem endereço */
    if (ext === ".html" || ext === ".css" || ext === ".js") {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}


/* preços oficiais da loja toalha (centavos)
   Kit: R$ 30,77 / 4 toalhas · desconto R$ 6,82 a cada 8 · extra R$ 27,84 (mais 4 aleatórias) */
var TOALHA_KIT_CENTS = 3499;
var TOALHA_DISC_8_CENTS = 682;
var TOALHA_EXTRA_CENTS = 2784;
function toalhaAmountCents(n, extraPacks) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  extraPacks = Math.max(0, Math.floor(Number(extraPacks) || 0));
  if (n <= 0 && extraPacks <= 0) return 0;
  var base = n > 0 ? Math.round((n * TOALHA_KIT_CENTS) / 4) : 0;
  var disc = Math.floor(n / 8) * TOALHA_DISC_8_CENTS;
  return Math.max(0, base - disc) + extraPacks * TOALHA_EXTRA_CENTS;
}
function isPlausibleToalhaAmount(cents) {
  var c = Math.round(Number(cents) || 0);
  if (c < 500 || c > 20000) return false;
  for (var n = 0; n <= 30; n++) {
    for (var e = 0; e <= 8; e++) {
      if (n === 0 && e === 0) continue;
      if (n > 0 && n < 4) continue;
      if (n === 0) continue;
      var t = toalhaAmountCents(n, e);
      if (t > 20000) t = 20000;
      if (t === c) return true;
    }
  }
  return false;
}

/* ---------- Cloaker Pro (backend proprio do projeto2, campanhas independentes do panelas) ---------- */
const CAMPAIGNS_CONFIG_FILE = path.join(DATA_DIR, "campaigns-config.json");
const CAMPAIGNS_CONFIG_BOOTSTRAP = path.join(ROOT, "campaigns-config.json");
const CAMPAIGNS_STATS_FILE = path.join(DATA_DIR, "campaigns-stats.json");

function loadCampaignsConfig() {
  try {
    if (fs.existsSync(CAMPAIGNS_CONFIG_FILE)) {
      var raw = JSON.parse(fs.readFileSync(CAMPAIGNS_CONFIG_FILE, "utf8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch (e) {}
  try {
    if (CAMPAIGNS_CONFIG_BOOTSTRAP !== CAMPAIGNS_CONFIG_FILE && fs.existsSync(CAMPAIGNS_CONFIG_BOOTSTRAP)) {
      var boot = JSON.parse(fs.readFileSync(CAMPAIGNS_CONFIG_BOOTSTRAP, "utf8"));
      if (boot && typeof boot === "object") return boot;
    }
  } catch (e2) {}
  return { campaigns: [] };
}

function saveCampaignsConfig(cfg) {
  var json = JSON.stringify(cfg, null, 2);
  fs.writeFileSync(CAMPAIGNS_CONFIG_FILE, json);
  try {
    if (CAMPAIGNS_CONFIG_BOOTSTRAP !== CAMPAIGNS_CONFIG_FILE) {
      fs.writeFileSync(CAMPAIGNS_CONFIG_BOOTSTRAP, json);
    }
  } catch (eM) {}
}

function persistCampaignsConfigToGithub() {
  return Promise.resolve({ ok: false, reason: "sync off (projeto2 nao sincroniza campanhas)" });
}

function genToken() {
  return crypto.randomBytes(5).toString("hex");
}

function slugify(name, existingSlugs) {
  var base = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!base) base = "campaign";
  var slug = base;
  var n = 2;
  existingSlugs = existingSlugs || [];
  while (existingSlugs.indexOf(slug) !== -1) {
    slug = base + "-" + n;
    n++;
  }
  return slug;
}

function defaultCampaign(body) {
  var b = body || {};
  return {
    id: "cp_" + crypto.randomBytes(4).toString("hex"),
    name: String(b.name || "Nova campanha").trim(),
    slug: "",
    token: genToken(),
    tokenEnabled: true,
    source: "tiktok",
    domain: "*",
    entryStore: "sabonete",
    enabled: true,
    safe: { method: "redirect", url: "" },
    offer: { method: "internal", type: "single", urls: ["/sabonete/"] },
    targeting: { device: "all", countryMode: "off", countries: [] },
    filters: {
      botUa: true,
      automation: true,
      softwareGl: true,
      desktopLike: true,
      datacenterIp: true,
      proxy: true,
      tor: false,
      ttclidBypass: true
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/* ---------- Campaign stats ---------- */
var campStatsCache = null;
var campStatsSaveTimer = null;
var campStatsDirty = false;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadCampStats() {
  if (campStatsCache) return campStatsCache;
  try {
    if (fs.existsSync(CAMPAIGNS_STATS_FILE)) {
      var raw = JSON.parse(fs.readFileSync(CAMPAIGNS_STATS_FILE, "utf8"));
      if (raw && typeof raw === "object") {
        campStatsCache = raw;
        return raw;
      }
    }
  } catch (e) {}
  campStatsCache = {};
  return campStatsCache;
}

function recordCampEvent(campId, kind) {
  var cache = loadCampStats();
  var day = todayKey();
  if (!cache[day]) cache[day] = {};
  if (!cache[day][campId]) cache[day][campId] = { requests: 0, offer: 0, safe: 0, bots: 0 };
  cache[day][campId].requests++;
  if (kind === "offer" || kind === "safe" || kind === "bots") {
    cache[day][campId][kind]++;
  }
  campStatsDirty = true;
  if (campStatsSaveTimer) clearTimeout(campStatsSaveTimer);
  campStatsSaveTimer = setTimeout(function() {
    if (campStatsDirty) {
      try {
        fs.writeFileSync(CAMPAIGNS_STATS_FILE, JSON.stringify(cache, null, 2));
        campStatsDirty = false;
      } catch (e) {}
    }
  }, 2000);
}

/* ---------- IP Intel ---------- */
var ipIntelCache = new Map();

var CAMP_LOG_FILE = path.join(DATA_DIR, "campaigns-log.json");
var campLogCache = null;
var campLogSaveT = null;
function loadCampLog() {
  if (campLogCache) return campLogCache;
  try {
    if (fs.existsSync(CAMP_LOG_FILE)) {
      var rawL = JSON.parse(fs.readFileSync(CAMP_LOG_FILE, "utf8"));
      if (Array.isArray(rawL)) { campLogCache = rawL; return campLogCache; }
    }
  } catch (e) {}
  campLogCache = [];
  return campLogCache;
}
function saveCampLog() {
  try { fs.writeFileSync(CAMP_LOG_FILE, JSON.stringify(loadCampLog())); } catch (e) {}
}
function recordCampAccess(entry) {
  var log = loadCampLog();
  log.unshift(entry);
  if (log.length > 300) log.length = 300;
  campLogCache = log;
  if (campLogSaveT) clearTimeout(campLogSaveT);
  campLogSaveT = setTimeout(saveCampLog, 2000);
}
function clientIpOf(req) {
  var xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  var ip = xff || String(req.socket.remoteAddress || "");
  return ip.replace(/^::ffff:/, "");
}
function fetchIpIntel(ip) {
  return new Promise(function(resolve) {
    var cached = ipIntelCache.get(ip);
    if (cached && Date.now() - cached.t < 1800000) {
      return resolve(cached.data);
    }
    var req = http.get("http://ip-api.com/json/" + ip + "?fields=status,proxy,hosting,as,org,countryCode,mobile", function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        try {
          var parsed = JSON.parse(data);
          ipIntelCache.set(ip, { t: Date.now(), data: parsed });
          resolve(parsed);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on("error", function() { resolve(null); });
    req.setTimeout(2500, function() {
      req.destroy();
      resolve(null);
    });
    setTimeout(function() {
      req.destroy();
      resolve(null);
    }, 3000);
  });
}

/* ---------- Server-side bot detection ---------- */
function serverBotUa(u) {
  return /headlesschrome|phantomjs|selenium|webdriver|puppeteer|playwright|slurp|crawl|spider|facebookexternalhit|whatsapp|telegrambot|preview|lighthouse|pagespeed|gptbot|claudebot|anthropic|bytespider|petalbot|semrush|ahrefs|bingbot|googlebot|yandexbot|applebot|curl\/|python-requests|go-http-client|wget|tiktokbot|adsbot/i.test(u);
}

function serverAutomationUa(u) {
  return /headless|webdriver|phantom|nightmare|selenium|puppeteer|playwright|httrack|scrapy/i.test(u);
}

function serverDesktopUa(u) {
  return !/android|iphone|ipad|ipod|mobile|silk|kindle/i.test(u);
}

var TOR_ASNS = ["as13329", "as207446", "as396522"];
var DC_ASNS = [
  "as136907", "as55990", "as9808", "as132203", "as138699", "as396986",
  "as16509", "as14618", "as15169", "as8075", "as14061", "as20473",
  "as45090", "as31898", "as54113"
];
var DC_ORGS = [
  "amazon", "google cloud", "microsoft azure", "digitalocean", "vultr", "linode",
  "ovh", "hetzner", "m247", "datacamp"
];

async function decideCampaign(campaign, req, url) {
  var clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim().replace(/:.*$/, "");
  var ua = String(req.headers["user-agent"] || "").toLowerCase();
  var hasTtclid = url.searchParams && url.searchParams.get("ttclid") && url.searchParams.get("ttclid").trim();

  var botLike = false;
  var outcome = "offer";
  var reason = "";

  if (campaign.filters.botUa && serverBotUa(ua)) {
    botLike = true;
    outcome = "safe";
    reason = "bot-ua";
  } else if (campaign.filters.automation && serverAutomationUa(ua)) {
    botLike = true;
    outcome = "safe";
    reason = "automation";
  }

  /* Dispositivo "Nenhum" = nao deixa entrar dispositivo algum (todo trafego vai pra safe page) */
  if (!botLike && campaign.targeting && campaign.targeting.device === "none") {
    outcome = "safe";
    reason = "device";
  }
  if (hasTtclid && campaign.filters.ttclidBypass && !botLike) {
    // skip remaining filters
  } else if (!botLike) {
    if (campaign.filters.desktopLike) {
      if (campaign.targeting.device === "mobile" && serverDesktopUa(ua)) {
        outcome = "safe";
        reason = "device";
      } else if (campaign.targeting.device === "desktop" && !serverDesktopUa(ua)) {
        outcome = "safe";
        reason = "device";
      }
    }

    if (outcome === "offer") {
      var intel = await fetchIpIntel(clientIp);
      if (intel) {
        if (campaign.filters.proxy && intel.proxy === true) {
          botLike = true;
          outcome = "safe";
          reason = "proxy";
        } else if (campaign.filters.tor) {
          var asn = String(intel.as || "").toLowerCase();
          var org = String(intel.org || "").toLowerCase();
          if (TOR_ASNS.some(function(a) { return asn.indexOf(a) !== -1; }) || org.indexOf("tor exit") !== -1) {
            botLike = true;
            outcome = "safe";
            reason = "tor";
          }
        } else if (campaign.filters.datacenterIp) {
          var asn2 = String(intel.as || "").toLowerCase();
          var org2 = String(intel.org || "").toLowerCase();
          if (intel.hosting === true || DC_ASNS.some(function(a) { return asn2.indexOf(a) !== -1; }) || DC_ORGS.some(function(o) { return org2.indexOf(o) !== -1; })) {
            botLike = true;
            outcome = "safe";
            reason = "datacenter";
          }
        }

        if (outcome === "offer" && campaign.targeting.countryMode !== "off") {
          var cc = String(intel.countryCode || "").toUpperCase();
          var countries = (campaign.targeting.countries || []).map(function(c) { return String(c).toUpperCase().trim(); });
          if (campaign.targeting.countryMode === "allow" && countries.indexOf(cc) === -1) {
            outcome = "safe";
            reason = "country";
          } else if (campaign.targeting.countryMode === "block" && countries.indexOf(cc) !== -1) {
            outcome = "safe";
            reason = "country";
          }
        }
      }
    }
  }

  var offerUrl = null;
  if (outcome === "offer") {
    if (campaign.offer.type === "ab" && campaign.offer.urls.length > 1) {
      var hash = (clientIp + ua).split("").reduce(function(a, b) { return ((a << 5) - a + b.charCodeAt(0)) | 0; }, 0);
      var idx = Math.abs(hash) % campaign.offer.urls.length;
      offerUrl = campaign.offer.urls[idx];
    } else {
      offerUrl = campaign.offer.urls[0] || "/";
    }
    if (campaign.offer.method === "redirect" && campaign.tokenEnabled) {
      offerUrl = offerUrl + (offerUrl.indexOf("?") !== -1 ? "&" : "?") + "tk=" + encodeURIComponent(campaign.token);
      if (url.searchParams) {
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ttclid"].forEach(function(p) {
          var v = url.searchParams.get(p);
          if (v) offerUrl = offerUrl + "&" + p + "=" + encodeURIComponent(v);
        });
      }
    }
  }

  return { outcome: outcome, reason: reason, botLike: botLike, offerUrl: offerUrl };
}

/* ---------- Delivery helpers ---------- */
function serveInternalStore(res, storeKey, pathname, req) {
  var dir = STORE_PATHS[storeKey] ? STORE_PATHS[storeKey].dir : storeKey;
  var file = path.join(ROOT, dir, "index.html");
  try {
    var html = fs.readFileSync(file, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

function proxyHtml(res, targetUrl, req, fallbackRedirect) {
  var parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    res.writeHead(302, { Location: fallbackRedirect || targetUrl });
    return res.end();
  }
  var lib = parsed.protocol === "https:" ? https : http;
  var req2 = lib.get(targetUrl, {
    headers: {
      "user-agent": req.headers["user-agent"] || "Mozilla/5.0",
      "accept-language": "pt-BR,pt;q=0.9"
    }
  }, function(resp) {
    var chunks = [];
    resp.on("data", function(c) { chunks.push(c); });
    resp.on("end", function() {
      var body = Buffer.concat(chunks).toString("utf8");
      var ct = resp.headers["content-type"] || "text/html";
      if (ct.indexOf("text/html") !== -1) {
        var origin = parsed.origin;
        if (body.indexOf("<head>") !== -1) {
          body = body.replace(/<head>/i, "<head><base href=\"" + origin + "/\">");
        } else {
          body = "<base href=\"" + origin + "/\">" + body;
        }
      }
      res.writeHead(resp.statusCode || 200, { "Content-Type": ct, "Cache-Control": "no-store" });
      res.end(body);
    });
  });
  req2.on("error", function() {
    res.writeHead(302, { Location: fallbackRedirect || targetUrl });
    res.end();
  });
  req2.setTimeout(4000, function() {
    req2.destroy();
    res.writeHead(302, { Location: fallbackRedirect || targetUrl });
    res.end();
  });
}

function withParams(urlStr, paramsObj) {
  var u = urlStr;
  var sep = u.indexOf("?") !== -1 ? "&" : "?";
  var parts = [];
  Object.keys(paramsObj || {}).forEach(function(k) {
    if (paramsObj[k]) parts.push(k + "=" + encodeURIComponent(paramsObj[k]));
  });
  return parts.length ? u + sep + parts.join("&") : u;
}


var server = http.createServer(async function (req, res) {
  var url = new URL(req.url || "/", "http://" + (req.headers.host || "localhost"));
  var pathname = url.pathname;

  var legacyCloakTopic = {
    "/bbj": "casaco",
    "/jqt": "jaqueta",
    "/tlh": "toalha",
    "/rp": "roupao",
    "/tdd": "casaquinho",
  }[(pathname || "").replace(/\/+$/, "")];
  if (legacyCloakTopic) {
    var legDest = "/compra?topic=" + encodeURIComponent(legacyCloakTopic);
    if (url.search) legDest += (legDest.indexOf("?") >= 0 ? "&" : "?") + url.search.slice(1);
    res.writeHead(302, { Location: legDest });
    return res.end();
  }

  if (pathname === "/simular" || pathname === "/simular/") {
    var simQ = new URLSearchParams(url.searchParams);
    simQ.set("simular", "1");
    res.writeHead(302, { Location: "/?" + simQ.toString() });
    return res.end();
  }

  /* atalho /c=CODIGO (e-mail às vezes mostra/abre assim) → página de rastreio */
  if (/^\/c=/i.test(pathname)) {
    var codeShortcut = decodeURIComponent(pathname.slice(3)).trim();
    res.writeHead(302, {
      Location: "/rastreio/?c=" + encodeURIComponent(codeShortcut),
    });
    return res.end();
  }

  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  /* ---------- browser confirma Purchase (reconciliação) ---------- */
  if (req.method === "POST" && pathname === "/api/pixel/purchase-ack") {
    try {
      var rawAck = await readBody(req);
      var bodyAck = rawAck ? JSON.parse(rawAck) : {};
      var txAck =
        findTxByTracking(bodyAck.code || bodyAck.tracking_code) ||
        TX.find(function (t) {
          return t.id === String(bodyAck.id || "");
        });
      if (!txAck) return sendJson(res, 404, { error: "Pedido não encontrado." });
      if (String(txAck.status || "").toLowerCase() !== "paid") {
        return sendJson(res, 409, { error: "Pedido ainda não está pago." });
      }
      var marked = markPixelPurchaseAck(txAck);
      firePurchaseCapi(txAck).catch(function () {});
      return sendJson(res, 200, {
        ok: true,
        marked: marked,
        pixel_purchase_sent: !!txAck.pixel_purchase_sent,
      });
    } catch (eAck) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  /* ---------- ping de presença (loja) — JSON curto, sem SSE ---------- */
  if (req.method === "GET" && pathname === "/api/online-ping") {
    var originPing = String(req.headers.origin || "").toLowerCase();
    var refPing = String(req.headers.referer || "").toLowerCase();
    var qClient = String((url.searchParams && url.searchParams.get("client")) || "") === "1";
    var fromStorefront =
      originPing.indexOf("ofertasonlineshop.vercel.app") !== -1 ||
      originPing.indexOf(".vercel.app") !== -1 ||
      originPing.indexOf("ofertasgrandes.com") !== -1 ||
      originPing.indexOf("achadofertas.com") !== -1 ||
      refPing.indexOf("ofertasonlineshop.vercel.app") !== -1 ||
      refPing.indexOf("ofertasgrandes.com") !== -1 ||
      refPing.indexOf("grandesofertas.vercel.app") !== -1 ||
      refPing.indexOf("/jaqueta") !== -1 ||
      refPing.indexOf("/bobojaco") !== -1 ||
      refPing.indexOf("/teddy") !== -1 ||
      refPing.indexOf("/roupao") !== -1 ||
      refPing.indexOf("/n7bb") !== -1 ||
      refPing.indexOf("/n7jq") !== -1 ||
      refPing.indexOf("/n7tl") !== -1 ||
      refPing.indexOf("/n7rp") !== -1 ||
      refPing.indexOf("/n7td") !== -1 ||
      refPing.indexOf("/compra") !== -1 ||
      refPing.indexOf("/panela") !== -1 ||
      refPing.indexOf("/toalha") !== -1 ||
      false;
    var isRealClient = qClient || fromStorefront;
    if (isRealClient) {
      touchOnlinePresence(req, url);
      broadcastOnlineCount();
    }
    return sendJson(res, 200, {
      ok: true,
      online: onlineCountNow(),
      counted: !!isRealClient,
    });
  }

  /* ---------- sai na hora (aba fechou / trocou de página) ---------- */
  if (
    (req.method === "GET" || req.method === "POST") &&
    pathname === "/api/online-leave"
  ) {
    dropOnlinePresence(req, url);
    broadcastOnlineCount();
    return sendJson(res, 200, { ok: true, online: onlineCountNow() });
  }

  /* ---------- funil: eventos das lojas ---------- */
  if (
    (req.method === "GET" || req.method === "POST") &&
    pathname === "/api/funnel/event"
  ) {
    var originFn = String(req.headers.origin || "").toLowerCase();
    var refFn = String(req.headers.referer || "").toLowerCase();
    var uaFn = String(req.headers["user-agent"] || "");
    var qClientFn = String((url.searchParams && url.searchParams.get("client")) || "") === "1";
    var sidFn = String((url.searchParams && url.searchParams.get("sid")) || "").trim();
    var hostFn = sanitizeOnlineHost((url.searchParams && url.searchParams.get("host")) || "");
    var storeFn = normalizeFunnelStore((url.searchParams && url.searchParams.get("store")) || "");
    var okFunnel =
      qClientFn &&
      storeFn &&
      isValidOnlineSid(sidFn) &&
      !isOnlineBotUa(uaFn) &&
      (isAllowedOnlineHost(hostFn) || funnelStorefrontOk(originFn, refFn));
    if (!okFunnel) return sendJson(res, 200, { ok: true, counted: false });
    var rFn = recordFunnelEvent(req, url);
    return sendJson(res, 200, { ok: true, counted: !!(rFn && rFn.ok) });
  }

  /* ---------- SSE: admin recebe contagem em tempo real ---------- */
  if (req.method === "GET" && pathname === "/api/admin/online") {
    /* sem verificação de auth aqui pra não complicar SSE; a contagem não é dado sensível */
    res.writeHead(200, Object.assign({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    }, corsHeaders()));
    /* envia o valor atual imediatamente */
    res.write("data: " + JSON.stringify(onlinePayload()) + "\n\n");
    adminOnlineSSE.add(res);
    function dropAdmin() {
      adminOnlineSSE.delete(res);
    }
    req.on("close", dropAdmin);
    req.on("aborted", dropAdmin);
    res.on("close", dropAdmin);
    return;
  }

  /* ---------- health check (keep-alive do Render) ---------- */
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok", uptime: process.uptime() });
  }

  if (req.method === "POST" && pathname === "/api/pix") {
    try {
      var raw = await readBody(req);
      var body = raw ? JSON.parse(raw) : {};
      var amount = Math.round(Number(body.amount) || 0);
      var minPixCents = paymentUsesBuckPay() ? 600 : 500;
      if (!Number.isFinite(amount) || amount < minPixCents) {
        return sendJson(res, 422, {
          error: minPixCents === 600 ? "Valor mínimo é R$ 6,00." : "Valor mínimo é R$ 5,00.",
        });
      }
      /* limite do ticket */
      if (amount > 20000) amount = 20000;

      var clientName = String(body.client_name || "").trim();
      var clientEmail = String(body.client_email || "").trim() || "cliente@email.com";
      var clientDoc = String(body.client_doc || "").replace(/\D/g, "");
      var clientPhone = String(body.client_phone || "").trim();

      if (!clientName) {
        return sendJson(res, 422, {
          error: "Nome é obrigatório para gerar o Pix.",
        });
      }
      var docPix = resolvePixClientDocument(clientDoc);
      clientDoc = docPix.doc;

      var origemPix =
        typeof body.origem === "string" && body.origem.trim()
          ? body.origem.trim().slice(0, 40)
          : (function () {
              var fs = normalizeFunnelStore(body.funnel_store || body.funnelStore || "");
              if (fs) return fs + "-ttkshop";
              return "jaqueta-ttkshop";
            })();
      var funnelSid = String(body.funnel_sid || body.funnelSid || "").trim();
      var funnelStore = normalizeFunnelStore(body.funnel_store || body.funnelStore || "") ||
        normalizeFunnelStore(String(origemPix).replace(/-ttkshop$/i, ""));
      var origemLower = String(origemPix).toLowerCase();
      if (origemLower.indexOf("toalha") !== -1 && !isPlausibleToalhaAmount(amount)) {
        return sendJson(res, 422, {
          error: "Valor do pedido inválido. Atualize a página e tente de novo.",
        });
      }
      var utmSource = String(body.utm_source || body.utmSource || "").trim().slice(0, 80);
      var utmCampaign = String(body.utm_campaign || body.utmCampaign || "").trim().slice(0, 120);
      var utmMedium = String(body.utm_medium || body.utmMedium || "").trim().slice(0, 80);
      var utmContent = String(body.utm_content || body.utmContent || "").trim().slice(0, 120);
      var attributionPixelId = String(
        body.attribution_pixel_id || body.pixel_id || body.pixelId || ""
      ).trim().slice(0, 80);
      var ttclidPix = String(body.ttclid || "").trim().slice(0, 200);
      var ttpPix = String(body.ttp || "").trim().slice(0, 200);

      /* ---------- MODO SIMULAÇÃO (?simular=1): Pix fake, paga sozinho em 60s ---------- */
      var wantSim =
        body.simulate === true ||
        body.simulate === 1 ||
        body.simulate === "1" ||
        String(body.simulate || "").toLowerCase() === "true";
      if (wantSim) {
        var simId = "sim-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");
        var simTrack = genUniqueTrackingCode();
        var simAddr = body.address && typeof body.address === "object" ? body.address : {};
        var simBr =
          "00020126580014BR.GOV.BCB.PIX0136" +
          crypto.randomBytes(16).toString("hex") +
          "520400005303986540" +
          (amount / 100).toFixed(2) +
          "5802BR5914OFERTAS ONLINE6009SAO PAULO62070503***6304ABCD";
        var productNameSim = "Produto";
        if (Array.isArray(body.items_detail) && body.items_detail[0] && body.items_detail[0].variante) {
          productNameSim = String(body.items_detail[0].variante).slice(0, 100);
        }
        TX.push({
          id: simId,
          tracking_code: simTrack,
          amount: amount,
          net_amount: netCents(amount),
          status: "pending",
          client_name: clientName,
          client_email: clientEmail,
          client_doc: clientDoc,
          client_phone: clientPhone,
          origem: origemPix === "panelas-ttkshop" ? "simular" : origemPix,
          utm_source: utmSource || "simular",
          utm_campaign: utmCampaign || "simular",
          utm_medium: utmMedium || "simular",
          utm_content: utmContent,
          ttclid: ttclidPix,
          ttp: ttpPix,
          attribution_pixel_id: attributionPixelId,
          pixel_purchase_sent: false,
          simulate: true,
          simulate_pay_at: Date.now() + 60 * 1000,
          address: {
            cep: String(simAddr.cep || ""),
            uf: String(simAddr.uf || ""),
            cidade: String(simAddr.cidade || ""),
            bairro: String(simAddr.bairro || ""),
            rua: String(simAddr.rua || ""),
            numero: String(simAddr.numero || ""),
            complemento: String(simAddr.complemento || ""),
          },
          items_detail: Array.isArray(body.items_detail)
            ? body.items_detail.slice(0, 10).map(function (it) {
                return { variante: String(it.variante || ""), qtd: Number(it.qtd) || 1 };
              })
            : [{ variante: productNameSim, qtd: 1 }],
          x1: false,
          reminder_5_sent: false,
          reminder_30_sent: false,
          email_sent: false,
          source: "simulate",
          br_code: simBr,
          created_at: new Date().toISOString(),
          paid_at: null,
        });
        saveStore();
        return sendJson(res, 200, {
          status: "success",
          data: {
            transaction_id: simId,
            br_code: simBr,
            amount: amount,
            status: "pending",
            tracking_code: simTrack,
            simulate: true,
            simulate_pay_in_ms: 60 * 1000,
          },
        });
      }

      function pushLocalTxRecord(txId, extraTx) {
        extraTx = extraTx || {};
        var trackingCode = genUniqueTrackingCode();
        var addr = body.address && typeof body.address === "object" ? body.address : {};
        var already = findTxByGatewayId(txId);
        if (already) return already.tracking_code || trackingCode;
        TX.push(
          Object.assign(
            {
              id: txId,
              tracking_code: trackingCode,
              amount: amount,
              status: "pending",
              client_name: clientName,
              client_email: clientEmail,
              client_doc: clientDoc,
              client_doc_entered: docPix.entered || "",
              doc_pix_fallback: !!docPix.fallback,
              client_phone: clientPhone,
              origem: origemPix,
              utm_source: utmSource,
              utm_campaign: utmCampaign,
              utm_medium: utmMedium,
              utm_content: utmContent,
              ttclid: ttclidPix,
              ttp: ttpPix,
              attribution_pixel_id: attributionPixelId,
              pixel_purchase_sent: false,
              funnel_sid: funnelSid,
              funnel_store: funnelStore,
              address: {
                cep: String(addr.cep || ""),
                uf: String(addr.uf || ""),
                cidade: String(addr.cidade || ""),
                bairro: String(addr.bairro || ""),
                rua: String(addr.rua || ""),
                numero: String(addr.numero || ""),
                complemento: String(addr.complemento || ""),
              },
              items_detail: Array.isArray(body.items_detail)
                ? body.items_detail.slice(0, 10).map(function (it) {
                    return { variante: String(it.variante || ""), qtd: Number(it.qtd) || 1 };
                  })
                : [],
              x1: false,
              reminder_5_sent: false,
              reminder_30_sent: false,
              source: extraTx.source || "pixzy",
              gateway: extraTx.gateway || "pixzy",
              external_id: extraTx.external_id || "",
              br_code: extraTx.br_code || "",
              created_at: new Date().toISOString(),
              paid_at: null,
            },
            extraTx
          )
        );
        saveStore();
        funnelFromPixBody(body, "pix");
        return trackingCode;
      }

      /* ---------- Sharpify (PIX via link de pagamento) ---------- */
      if (paymentUsesSharpify()) {
        var productNameSf = "Pedido Ofertas Online";
        if (Array.isArray(body.items_detail) && body.items_detail[0] && body.items_detail[0].variante) {
          productNameSf = String(body.items_detail[0].variante).slice(0, 120);
        }
        var amountBrlSf = Number((amount / 100).toFixed(2));
        var sfPayload = {
          name: productNameSf.slice(0, 120),
          description: (clientName + " · " + clientEmail).slice(0, 200),
          amount: amountBrlSf,
          gatewayMethod: SHARPIFY_GATEWAY_METHOD || "PIX",
        };
        var sfResult = await sharpifyRequest(
          "POST",
          "/api/v1/checkout/payment-link/create",
          sfPayload
        );
        var sfPl = sharpifyPaymentLinkData(sfResult.json);
        if (sfResult.status >= 200 && sfResult.status < 300 && sfPl && sfPl.id) {
          var sfTxId = String(sfPl.id).trim();
          var brCodeSf = sharpifyBrCode(sfPl);
          var sfSt = sharpifyStatusNorm(sfPl.status);
          var sfAmt = sharpifyAmountCentsFromLink(sfPl, amount);
          var trackingSf = sfTxId
            ? pushLocalTxRecord(sfTxId, {
                gateway: "sharpify",
                source: "sharpify",
                br_code: brCodeSf,
                amount: sfAmt,
                status: sfSt,
              })
            : null;
          return sendJson(res, 200, {
            status: "success",
            data: {
              transaction_id: sfTxId,
              br_code: brCodeSf,
              amount: sfAmt,
              status: sfSt,
              tracking_code: trackingSf,
              gateway: "sharpify",
            },
          });
        }
        var sfmsg =
          sharpifyErrorText(sfResult.json, sfResult.status) ||
          "Não foi possível gerar o Pix (Sharpify).";
        return sendJson(res, sfResult.status >= 400 ? sfResult.status : 502, { error: String(sfmsg) });
      }

      /* ---------- PurinCash (PIX) ---------- */
      if (paymentUsesPurincash()) {
        var productNamePc = "Pedido Ofertas Online";
        if (Array.isArray(body.items_detail) && body.items_detail[0] && body.items_detail[0].variante) {
          productNamePc = String(body.items_detail[0].variante).slice(0, 120);
        }
        var pcMeta = {
          origem: origemPix,
          funnel_store: funnelStore || "",
        };
        var pcPayload = {
          paymentMethod: "pix",
          valueCents: amount,
          description: productNamePc.slice(0, 200),
          customer: {
            name: clientName.slice(0, 100),
            email: clientEmail.slice(0, 100),
            externalId: genBlackExternalRef().slice(0, 64),
          },
          metadata: JSON.stringify(pcMeta).slice(0, 2000),
        };
        if (PUBLIC_BASE) {
          pcPayload.callbackUrl =
            PUBLIC_BASE + "/api/purincash-webhook?key=" + encodeURIComponent(WEBHOOK_SECRET);
        }
        var pcResult = await purincashRequest("POST", "/payments", pcPayload);
        var pcData = purincashPaymentData(pcResult.json);
        if (pcResult.status >= 200 && pcResult.status < 300 && pcData && pcData.paymentId) {
          var pcTxId = String(pcData.paymentId).trim();
          var brCodePc = purincashBrCode(pcData);
          var pcSt = purincashStatusNorm(pcData.status);
          var trackingPc = pcTxId
            ? pushLocalTxRecord(pcTxId, {
                gateway: "purincash",
                source: "purincash",
                external_id: pcPayload.customer.externalId || "",
                br_code: brCodePc,
                amount: Math.round(Number(pcData.amountCents) || amount),
                status: pcSt,
              })
            : null;
          return sendJson(res, 200, {
            status: "success",
            data: {
              transaction_id: pcTxId,
              br_code: brCodePc,
              amount: Math.round(Number(pcData.amountCents) || amount),
              status: pcSt,
              tracking_code: trackingPc,
              gateway: "purincash",
            },
          });
        }
        var pcmsg =
          purincashErrorText(pcResult.json, pcResult.status) ||
          "Não foi possível gerar o Pix (PurinCash).";
        return sendJson(res, pcResult.status >= 400 ? pcResult.status : 502, { error: String(pcmsg) });
      }

      /* ---------- BlackCat (PIX) ---------- */
      if (paymentUsesBlackcat()) {
        var productNameBc = "Pedido Ofertas Online";
        if (Array.isArray(body.items_detail) && body.items_detail[0] && body.items_detail[0].variante) {
          productNameBc = String(body.items_detail[0].variante).slice(0, 100);
        }
        var externalRefBc = genBlackExternalRef();
        var bcPayload = {
          amount: amount,
          currency: "BRL",
          paymentMethod: "pix",
          items: [
            {
              title: productNameBc.slice(0, 120),
              unitPrice: amount,
              quantity: 1,
              tangible: true,
            },
          ],
          customer: {
            name: clientName.slice(0, 100),
            email: clientEmail.slice(0, 100),
            phone: blackcatPhoneDigits(clientPhone),
            document: {
              number: clientDoc,
              type: blackcatDocType(clientDoc),
            },
          },
          shipping: blackcatShippingFromBody(body, clientName),
          externalRef: externalRefBc,
          pix: { expiresInDays: 1 },
        };
        if (utmSource) bcPayload.utm_source = utmSource;
        if (utmMedium) bcPayload.utm_medium = utmMedium;
        if (utmCampaign) bcPayload.utm_campaign = utmCampaign;
        if (utmContent) bcPayload.utm_content = utmContent;
        if (PUBLIC_BASE) {
          bcPayload.postbackUrl =
            PUBLIC_BASE + "/api/blackcat-webhook?key=" + encodeURIComponent(WEBHOOK_SECRET);
        }
        var bcResult = await blackcatRequest("POST", "/sales/create-sale", bcPayload);
        var bcData = blackcatSaleData(bcResult.json);
        if (bcResult.status >= 200 && bcResult.status < 300 && bcData && bcData.transactionId) {
          var bcTxId = String(bcData.transactionId).trim();
          var brCodeBc = blackcatBrCode(bcData);
          var bcSt = blackcatStatusNorm(bcData.status);
          var trackingBc = bcTxId
            ? pushLocalTxRecord(bcTxId, {
                gateway: "blackcat",
                source: "blackcat",
                external_id: externalRefBc,
                br_code: brCodeBc,
                amount: Math.round(Number(bcData.amount) || amount),
                status: bcSt,
              })
            : null;
          return sendJson(res, 200, {
            status: "success",
            data: {
              transaction_id: bcTxId,
              br_code: brCodeBc,
              amount: Math.round(Number(bcData.amount) || amount),
              status: bcSt,
              tracking_code: trackingBc,
              gateway: "blackcat",
            },
          });
        }
        var bcmsg = blackcatErrorText(bcResult.json) || "Não foi possível gerar o Pix (BlackCat).";
        return sendJson(res, bcResult.status >= 400 ? bcResult.status : 502, { error: String(bcmsg) });
      }

      /* ---------- Iron Pay (PIX) ---------- */
      if (paymentUsesIronPay()) {
        if (!IRONPAY_OFFER_HASH || !IRONPAY_PRODUCT_HASH) {
          return sendJson(res, 503, {
            error: "Iron Pay sem oferta/produto. Defina IRONPAY_OFFER_HASH e IRONPAY_PRODUCT_HASH no Render.",
          });
        }
        var productNameIp = "Pedido Ofertas Online";
        if (Array.isArray(body.items_detail) && body.items_detail[0] && body.items_detail[0].variante) {
          productNameIp = String(body.items_detail[0].variante).slice(0, 100);
        }
        var ironPayload = {
          offer_hash: IRONPAY_OFFER_HASH,
          amount: amount,
          payment_method: "pix",
          installments: 1,
          cart: [
            {
              product_hash: IRONPAY_PRODUCT_HASH,
              offer_hash: IRONPAY_OFFER_HASH,
              title: productNameIp.slice(0, 100),
              price: amount,
              quantity: 1,
              operation_type: 1,
            },
          ],
          customer: ironCustomerFromPixBody(body, clientName, clientEmail, clientDoc, clientPhone),
        };
        var ironTrack = ironTrackingFromBody(utmSource, utmMedium, utmCampaign, utmContent);
        if (ironTrack) ironPayload.tracking = ironTrack;
        if (PUBLIC_BASE) {
          ironPayload.postback_url =
            PUBLIC_BASE + "/api/ironpay-webhook?key=" + encodeURIComponent(WEBHOOK_SECRET);
        }
        var ironResult = await ironPayRequest("POST", "/transactions", ironPayload);
        var ironData = ironPayTxData(ironResult.json);
        if (ironResult.status >= 200 && ironResult.status < 300 && ironData && ironData.hash) {
          var ironHash = String(ironData.hash).trim();
          var brCodeIp = ironPayBrCode(ironData);
          var ironSt = ironPayStatusNorm(ironData.payment_status || ironData.status);
          var trackingIp = ironHash
            ? pushLocalTxRecord(ironHash, {
                gateway: "ironpay",
                source: "ironpay",
                br_code: brCodeIp,
                amount: Math.round(Number(ironData.amount) || amount),
                status: ironSt,
              })
            : null;
          return sendJson(res, 200, {
            status: "success",
            data: {
              transaction_id: ironHash,
              br_code: brCodeIp,
              amount: Math.round(Number(ironData.amount) || amount),
              status: ironSt,
              tracking_code: trackingIp,
              gateway: "ironpay",
            },
          });
        }
        var imsg = ironErrorText(ironResult.json) || "Não foi possível gerar o Pix (Iron Pay).";
        return sendJson(res, ironResult.status >= 400 ? ironResult.status : 502, { error: String(imsg) });
      }

      /* ---------- BuckPay (PIX) ---------- */
      if (paymentUsesBuckPay()) {
        var productNameBp = "Pedido Ofertas Online";
        if (Array.isArray(body.items_detail) && body.items_detail[0] && body.items_detail[0].variante) {
          productNameBp = String(body.items_detail[0].variante).slice(0, 100);
        }
        var externalId = genBuckExternalId();
        var buckPayload = {
          external_id: externalId,
          payment_method: "pix",
          amount: amount,
          buyer: {
            name: clientName.slice(0, 100),
            email: clientEmail.slice(0, 100),
            document: clientDoc,
          },
          product: { name: productNameBp },
        };
        var buckTrack = buckTrackingFromBody(utmSource, utmMedium, utmCampaign, utmContent);
        if (buckTrack) buckPayload.tracking = buckTrack;
        var ph = buckPhoneDigits(clientPhone);
        if (ph) buckPayload.buyer.phone = ph;
        if (PUBLIC_BASE) {
          buckPayload.postbackUrl =
            PUBLIC_BASE + "/api/buckpay-webhook?key=" + encodeURIComponent(WEBHOOK_SECRET);
        }
        var buckResult = await buckpayRequest("POST", "/v1/transactions", buckPayload);
        if (buckResult.status >= 200 && buckResult.status < 300 && buckResult.json) {
          var bdata = buckResult.json.data || buckResult.json;
          var buckId = String(bdata.id || "").trim();
          var brCode =
            (bdata.pix && bdata.pix.code) ||
            bdata.pix_code ||
            (bdata.pix && bdata.pix.pix_code) ||
            "";
          var trackingBp = buckId
            ? pushLocalTxRecord(buckId, {
                gateway: "buckpay",
                external_id: externalId,
                source: "buckpay",
                br_code: brCode,
                amount: Math.round(Number(bdata.total_amount) || amount),
                status: String(bdata.status || "pending").toLowerCase(),
              })
            : null;
          return sendJson(res, 200, {
            status: "success",
            data: {
              transaction_id: buckId || externalId,
              br_code: brCode,
              amount: Math.round(Number(bdata.total_amount) || amount),
              status: bdata.status || "pending",
              tracking_code: trackingBp,
              gateway: "buckpay",
            },
          });
        }
        var bmsg = buckErrorText(buckResult.json) || "Não foi possível gerar o Pix (BuckPay).";
        if (buckResult.status === 403 && String(bmsg).toLowerCase() === "forbidden") {
          bmsg =
            "Gateway BuckPay recusou (User-Agent). No Render, use BUCKPAY_USER_AGENT=Buckpay API (p minúsculo).";
        }
        return sendJson(res, buckResult.status || 502, { error: String(bmsg) });
      }

      var payload = {
        amount: amount,
        client_name: clientName,
        client_email: clientEmail,
        client_doc: clientDoc,
        client_phone: clientPhone || undefined,
        metadata: {
          origem: origemPix,
          items: body.items || 1,
        },
      };

      /* pede pra Pixzy avisar este servidor quando o status mudar */
      if (PUBLIC_BASE) {
        payload.webhook_url = PUBLIC_BASE + "/api/pixzy-webhook?key=" + encodeURIComponent(WEBHOOK_SECRET);
      }

      if (pixzyInCooldown()) {
        var waitMs = Math.min(12000, Math.max(0, PIXZY_COOLDOWN_UNTIL - Date.now()));
        if (waitMs > 0) {
          await new Promise(function (r) {
            setTimeout(r, waitMs);
          });
        }
      }

      var result = await pixzyRequest("POST", "/transactions", payload);
      if (result.status === 429) {
        await new Promise(function (r) {
          setTimeout(r, 4000);
        });
        result = await pixzyRequest("POST", "/transactions", payload);
      }
      if (result.status >= 200 && result.status < 300 && result.json) {
        var data = result.json.data || result.json;
        /* Pixzy devolve `id` (uuid); alguns ambientes usam `transaction_id` */
        var txId = String(data.transaction_id || data.id || "").trim();

        /* registra a venda para o painel /admin — SEM isso o webhook cria órfão sem endereço */
        var trackingCode = null;
        if (txId) {
          trackingCode = pushLocalTxRecord(txId, {
            amount: Math.round(Number(data.amount) || amount),
            status: String(data.status || "pending").toLowerCase(),
            br_code: data.br_code || "",
            gateway: "pixzy",
            source: "pixzy",
          });
        } else {
          console.error("[pix] Pixzy OK mas sem id/transaction_id — pedido não gravado no painel");
        }

        return sendJson(res, 200, {
          status: "success",
          data: {
            transaction_id: txId || null,
            br_code: data.br_code,
            amount: data.amount,
            status: data.status || "pending",
            tracking_code: trackingCode,
          },
        });
      }

      var msg =
        (result.json && (result.json.error || result.json.errors || result.json.message)) ||
        "Não foi possível gerar o Pix.";
      return sendJson(res, result.status || 502, { error: String(msg) });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Erro interno" });
    }
  }

  /* ---------- webhook Sharpify (HTTP) ---------- */
  if (req.method === "POST" && pathname === "/api/sharpify-webhook") {
    try {
      if (WEBHOOK_SECRET && url.searchParams.get("key") !== WEBHOOK_SECRET) {
        res.writeHead(200);
        return res.end("ok");
      }
      var rawSfHook = await readBody(req);
      var hookSf = rawSfHook ? JSON.parse(rawSfHook) : {};
      applySharpifyWebhookPayload(hookSf);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    } catch (eSfHook) {
      res.writeHead(200);
      return res.end("ok");
    }
  }

  /* ---------- webhook PurinCash ---------- */
  if (req.method === "POST" && pathname === "/api/purincash-webhook") {
    try {
      if (WEBHOOK_SECRET && url.searchParams.get("key") !== WEBHOOK_SECRET) {
        res.writeHead(200);
        return res.end("ok");
      }
      var rawPcHook = await readBody(req);
      var sigPc = req.headers["x-webhook-signature"] || req.headers["X-Webhook-Signature"];
      if (PURINCASH_WEBHOOK_SECRET && sigPc) {
        if (!purincashWebhookSignatureOk(rawPcHook, sigPc)) {
          res.writeHead(401);
          return res.end("invalid signature");
        }
      }
      var hookPc = rawPcHook ? JSON.parse(rawPcHook) : {};
      var hookData = hookPc.data && typeof hookPc.data === "object" ? hookPc.data : hookPc;
      var statusPc = purincashStatusNorm(hookData.status || hookPc.status);
      var evPc = String(hookPc.event || hookData.event || "").toLowerCase();
      if (evPc === "payment.paid" || evPc === "charge.paid" || String(hookData.status || hookPc.status || "").toLowerCase() === "paid") {
        statusPc = "paid";
      }
      var idPc = String(
        hookData.paymentId ||
          hookData.payment_id ||
          hookData.id ||
          hookPc.paymentId ||
          hookPc.payment_id ||
          hookPc.id ||
          ""
      ).trim();
      var existingPc = findTxByGatewayId(idPc);
      if (existingPc) {
        if (statusPc === "paid") {
          updateTxStatus(existingPc.id, "paid", {
            paid_at: hookData.paidAt || hookData.paid_at || hookPc.paidAt,
            net_amount:
              hookData.amountCents != null
                ? Math.round(Number(hookData.amountCents))
                : hookPc.amountCents != null
                  ? Math.round(Number(hookPc.amountCents))
                  : undefined,
          });
          saveStore();
          try {
            await firePurchaseCapi(existingPc);
          } catch (eCapPc) {}
        } else if (existingPc.status !== "paid") {
          existingPc.status = statusPc || existingPc.status;
          saveStore();
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    } catch (ePcHook) {
      res.writeHead(200);
      return res.end("ok");
    }
  }

  /* ---------- webhook BlackCat ---------- */
  if (req.method === "POST" && pathname === "/api/blackcat-webhook") {
    try {
      if (WEBHOOK_SECRET && url.searchParams.get("key") !== WEBHOOK_SECRET) {
        res.writeHead(200);
        return res.end("ok");
      }
      var rawBc = await readBody(req);
      var hookBc = rawBc ? JSON.parse(rawBc) : {};
      var statusBc = blackcatStatusNorm(hookBc.status);
      var evBc = String(hookBc.event || "").toLowerCase();
      if (evBc === "transaction.paid" || String(hookBc.status || "").toUpperCase() === "PAID") {
        statusBc = "paid";
      }
      if (statusBc !== "paid" && (evBc === "transaction.failed" || evBc === "transaction.cancelled")) {
        statusBc = "pending";
      }
      var idBc = hookBc.transactionId ? String(hookBc.transactionId) : "";
      var existingBc = findTxByGatewayId(idBc);
      if (!existingBc && hookBc.externalReference) {
        existingBc = findTxByGatewayId(String(hookBc.externalReference));
      }
      if (existingBc) {
        if (statusBc === "paid") {
          updateTxStatus(existingBc.id, "paid", {
            paid_at: hookBc.paidAt || hookBc.timestamp,
            net_amount: hookBc.netAmount != null ? Math.round(Number(hookBc.netAmount)) : undefined,
          });
          saveStore();
          try {
            await firePurchaseCapi(existingBc);
          } catch (eCapBc) {}
        } else if (existingBc.status !== "paid") {
          existingBc.status = statusBc || existingBc.status;
          saveStore();
        }
      }
      res.writeHead(200);
      return res.end("ok");
    } catch (eBcHook) {
      res.writeHead(200);
      return res.end("ok");
    }
  }

  /* ---------- webhook Iron Pay ---------- */
  if (req.method === "POST" && pathname === "/api/ironpay-webhook") {
    try {
      if (WEBHOOK_SECRET && url.searchParams.get("key") !== WEBHOOK_SECRET) {
        res.writeHead(200);
        return res.end("ok");
      }
      var rawIp = await readBody(req);
      var hookIp = rawIp ? JSON.parse(rawIp) : {};
      var statusIp = ironPayStatusNorm(hookIp.status || hookIp.payment_status);
      if (statusIp !== "paid" && String(hookIp.status || "").toLowerCase() === "paid") {
        statusIp = "paid";
      }
      if (
        statusIp === "expired" ||
        statusIp === "cancelled" ||
        statusIp === "canceled" ||
        statusIp === "failed"
      ) {
        statusIp = "pending";
      }
      var idIp = hookIp.transaction_hash
        ? String(hookIp.transaction_hash)
        : hookIp.hash
          ? String(hookIp.hash)
          : "";
      var existingIp = findTxByGatewayId(idIp);
      if (existingIp) {
        if (statusIp === "paid") {
          updateTxStatus(existingIp.id, "paid", {
            paid_at: hookIp.paid_at || hookIp.updated_at,
            net_amount: hookIp.amount_liquid != null ? Math.round(Number(hookIp.amount_liquid)) : undefined,
          });
          var brIp = ironPayBrCode(hookIp) || existingIp.br_code || "";
          if (brIp) existingIp.br_code = brIp;
          saveStore();
          try {
            await firePurchaseCapi(existingIp);
          } catch (eCapIp) {}
        } else if (existingIp.status !== "paid") {
          existingIp.status = statusIp || existingIp.status;
          saveStore();
        }
      }
      res.writeHead(200);
      return res.end("ok");
    } catch (eIpHook) {
      res.writeHead(200);
      return res.end("ok");
    }
  }

  /* ---------- webhook BuckPay ---------- */
  if (req.method === "POST" && pathname === "/api/buckpay-webhook") {
    try {
      if (WEBHOOK_SECRET && url.searchParams.get("key") !== WEBHOOK_SECRET) {
        res.writeHead(200);
        return res.end("ok");
      }
      var rawBp = await readBody(req);
      var hookBp = rawBp ? JSON.parse(rawBp) : {};
      var evBp = String(hookBp.event || "").toLowerCase();
      var dataBp = hookBp.data || {};
      var statusBp = String(dataBp.status || "").toLowerCase();
      if (evBp === "transaction.processed") statusBp = "paid";
      if (
        statusBp === "expired" ||
        statusBp === "cancelled" ||
        statusBp === "canceled" ||
        statusBp === "failed"
      ) {
        statusBp = "pending";
      }
      var idBp = dataBp.id != null ? String(dataBp.id) : "";
      var existingBp = findTxByGatewayId(idBp);
      if (!existingBp && dataBp.external_id) {
        existingBp = findTxByGatewayId(String(dataBp.external_id));
      }
      if (existingBp) {
        if (statusBp === "paid") {
          updateTxStatus(existingBp.id, "paid", {
            paid_at: dataBp.updated_at || dataBp.paid_at,
            net_amount: dataBp.net_amount != null ? Math.round(Number(dataBp.net_amount)) : undefined,
          });
          var brFix =
            dataBp.pix_code ||
            (dataBp.pix && dataBp.pix.code) ||
            existingBp.br_code ||
            "";
          if (brFix) existingBp.br_code = brFix;
          saveStore();
          try {
            await firePurchaseCapi(existingBp);
          } catch (eCap) {}
        } else if (existingBp.status !== "paid") {
          existingBp.status = statusBp || existingBp.status;
          saveStore();
        }
      }
      res.writeHead(200);
      return res.end("ok");
    } catch (eBpHook) {
      res.writeHead(200);
      return res.end("ok");
    }
  }

  /* ---------- webhook da Pixzy: fonte da verdade dos pagamentos ---------- */
  if (req.method === "POST" && pathname === "/api/pixzy-webhook") {
    /* responde 2xx sempre (a Pixzy reenvia em erro); processa por dentro */
    try {
      if (WEBHOOK_SECRET && url.searchParams.get("key") !== WEBHOOK_SECRET) {
        res.writeHead(200);
        return res.end("ok");
      }
      var rawHook = await readBody(req);
      var hook = rawHook ? JSON.parse(rawHook) : {};
      var tx = hook.transaction || {};
      var ev = String(hook.event || "").toLowerCase();
      var status = String(tx.status || "").toLowerCase();
      if (ev === "transaction_paid" || ev === "paid") status = "paid";
      /* expirado/cancelado/falhou na Pixzy → mantém PENDENTE no painel (igual ofertasdetudo).
         Assim continua no X1 e não some da fila de pendentes. */
      if (
        status === "expired" ||
        status === "cancelled" ||
        status === "canceled" ||
        status === "failed" ||
        ev === "expired" ||
        ev === "transaction_cancelled" ||
        ev === "failed"
      ) {
        status = "pending";
      }

      var id = tx.id != null ? String(tx.id) : "";
      var existing = findTxByGatewayId(id);
      if (!existing && tx.external_id) existing = findTxByGatewayId(String(tx.external_id));

      var client = hook.client || {};
      if (existing) {
        if (status) {
          /* nunca rebaixa um pedido já pago */
          if (existing.status === "paid" && status !== "paid") {
            /* ignora expired/pending depois do paid */
          } else {
            existing.status = status;
            if (status === "paid" && !existing.paid_at) {
              existing.paid_at = tx.updated_at || new Date().toISOString();
            }
          }
        }
        if (tx.net_amount != null) existing.net_amount = Number(tx.net_amount);
        /* completa campos vazios com o que a Pixzy mandar — nunca apaga endereço/itens locais */
        function fillEmpty(obj, key, val) {
          if (val == null || val === "") return;
          var cur = obj[key];
          /* placeholder do checkout sem e-mail — trata como vazio p/ Pixzy preencher o real */
          if (
            key === "client_email" &&
            cur &&
            !isRealEmail(cur)
          ) {
            obj[key] = val;
            return;
          }
          if (cur == null || cur === "") obj[key] = val;
        }
        fillEmpty(existing, "client_name", client.name || tx.client_name || "");
        fillEmpty(existing, "client_email", client.email || tx.client_email || "");
        fillEmpty(existing, "client_doc", (client.doc || "").replace(/\D/g, ""));
        fillEmpty(existing, "client_phone", client.phone || "");
        if (!existing.address || typeof existing.address !== "object") existing.address = {};
        var ea = existing.address;
        fillEmpty(ea, "cep", client.zip || "");
        fillEmpty(ea, "uf", client.state || "");
        fillEmpty(ea, "cidade", client.city || "");
        fillEmpty(ea, "bairro", client.neighborhood || "");
        fillEmpty(ea, "rua", client.address || "");
        fillEmpty(ea, "numero", client.number || "");
        fillEmpty(ea, "complemento", client.complement || "");
        if (
          (!existing.items_detail || !existing.items_detail.length) &&
          Array.isArray(hook.products) &&
          hook.products.length
        ) {
          existing.items_detail = hook.products.map(function (p) {
            return { variante: p.name || "", qtd: 1 };
          });
        }
        saveStore();
        if (existing.status === "paid") maybeSendOrderEmail(existing);
      } else if (id) {
        var metaOrig =
          (tx.metadata && tx.metadata.origem) ||
          (hook.metadata && hook.metadata.origem) ||
          "";
        /* venda que não passou por este site (ex.: outra origem): registra */
        TX.push({
          id: id,
          tracking_code: genUniqueTrackingCode(),
          amount: Math.round(Number(tx.amount) || 0),
          net_amount: tx.net_amount != null ? Number(tx.net_amount) : null,
          status: status || "pending",
          client_name: client.name || tx.client_name || "",
          client_email: client.email || tx.client_email || "",
          client_doc: (client.doc || "").replace(/\D/g, ""),
          client_phone: client.phone || "",
          origem: metaOrig || "jaqueta-ttkshop",
          address: {
            cep: client.zip || "",
            uf: client.state || "",
            cidade: client.city || "",
            bairro: client.neighborhood || "",
            rua: client.address || "",
            numero: client.number || "",
            complemento: client.complement || "",
          },
          items_detail: Array.isArray(hook.products)
            ? hook.products.map(function (p) {
                return { variante: p.name || "", qtd: 1 };
              })
            : [],
          x1: false,
          source: tx.sale_origin || "pixzy",
          created_at: tx.created_at || new Date().toISOString(),
          paid_at: status === "paid" ? tx.updated_at || new Date().toISOString() : null,
        });
        saveStore();
        var orphanTx = TX[TX.length - 1];
        if (orphanTx && orphanTx.status === "paid") maybeSendOrderEmail(orphanTx);
      }
      res.writeHead(200);
      return res.end("ok");
    } catch (e) {
      res.writeHead(200);
      return res.end("ok");
    }
  }

  /* ---------- rastreio público: dados do pedido pelo código ---------- */
  if (req.method === "GET" && (pathname.startsWith("/api/rastreio/") || pathname === "/api/rastreio")) {
    var codeR = "";
    if (pathname.startsWith("/api/rastreio/")) {
      codeR = decodeURIComponent(pathname.slice("/api/rastreio/".length)).split(/[/?#]/)[0];
    }
    if (!codeR) {
      codeR = String(url.searchParams.get("c") || url.searchParams.get("codigo") || "").trim();
    }
    var txR = findTxByTracking(codeR);
    if (!txR) {
      var upR = null;
      if (shouldProxyRastreio(req, codeR) || trackingPeerBases().length) {
        upR = await fetchRastreioAnyPeer(codeR, req);
      }
      if (upR && upR.body) {
        if (upR.status >= 200 && upR.status < 300) {
          res.writeHead(200, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders()));
          return res.end(upR.body);
        }
        try {
          var upJson = JSON.parse(upR.body);
          return sendJson(res, upR.status, upJson);
        } catch (eUpJ) {
          return sendJson(res, upR.status, { error: "Rastreio indisponível. Tente de novo." });
        }
      }
    }
    if (!txR) {
      return sendJson(res, 404, { error: "Código de rastreio não encontrado. Confira e tente de novo." });
    }
    var aR = txR.address || {};
    return sendJson(res, 200, {
      tracking_code: txR.tracking_code,
      client_name: txR.client_name || "",
      status: txR.status,
      paid_at: txR.paid_at,
      created_at: txR.created_at,
      address: {
        rua: aR.rua || "",
        numero: aR.numero || "",
        complemento: aR.complemento || "",
        bairro: aR.bairro || "",
        cidade: aR.cidade || "",
        uf: aR.uf || "",
        cep: aR.cep || "",
      },
      items: (txR.items_detail || []).map(function (it) {
        return { variante: it.variante, qtd: it.qtd };
      }),
      amount: txR.amount,
      email_ok: isRealEmail(txR.client_email),
      events: trackingEvents(txR),
    });
  }

  /* ---------- cliente adiciona/corrige o e-mail depois da compra ---------- */
  if (req.method === "POST" && pathname === "/api/order-email") {
    try {
      var rawEm = await readBody(req);
      var bodyEm = rawEm ? JSON.parse(rawEm) : {};
      var txEm = findTxByTracking(bodyEm.code);
      if (!txEm) return sendJson(res, 404, { error: "Pedido não encontrado." });
      var emailEm = String(bodyEm.email || "").trim().toLowerCase();
      if (!isRealEmail(emailEm)) {
        return sendJson(res, 422, { error: "Digite um e-mail válido." });
      }
      txEm.client_email = emailEm;
      txEm.email_sent = false; /* reenvia para o e-mail novo */
      saveStore();
      maybeSendOrderEmail(txEm);
      return sendJson(res, 200, { ok: true, email: emailEm });
    } catch (e) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/pix/")) {
    try {
      var id = decodeURIComponent(pathname.slice("/api/pix/".length));
      if (!id || id.includes("..")) return sendJson(res, 400, { error: "ID inválido" });

      var local = findTxByGatewayId(id);

      /* simulação: após 60s marca pago sem Pixzy */
      if (local && local.simulate && local.status !== "paid") {
        var payAt = Number(local.simulate_pay_at) || 0;
        if (payAt && Date.now() >= payAt) {
          local.status = "paid";
          local.paid_at = new Date().toISOString();
          saveStore();
          maybeSendOrderEmail(local);
        }
        return sendJson(res, 200, {
          status: "success",
          data: {
            transaction_id: local.id,
            status: local.status,
            amount: local.amount,
            br_code: local.br_code || "",
            tracking_code: local.tracking_code || "",
            simulate: true,
            simulate_pay_in_ms: Math.max(0, payAt - Date.now()),
          },
        });
      }
      if (local && local.simulate && local.status === "paid") {
        return sendJson(res, 200, {
          status: "success",
          data: {
            transaction_id: local.id,
            status: "paid",
            amount: local.amount,
            br_code: local.br_code || "",
            tracking_code: local.tracking_code || "",
            simulate: true,
            simulate_pay_in_ms: 0,
          },
        });
      }

      /* paid local SEMPRE antes do cache — senão poll fica pending até 20s após webhook */
      if (local && local.status === "paid") {
        return sendJson(res, 200, {
          status: "success",
          data: {
            id: local.id,
            status: "paid",
            amount: local.amount,
            br_code: local.br_code || "",
            tracking_code: local.tracking_code || "",
          },
        });
      }
      var cacheKey = String(id);
      var cached = PIXZY_STATUS_CACHE[cacheKey];
      if (cached && Date.now() - cached.at < PIXZY_STATUS_TTL_MS) {
        return sendJson(res, 200, cached.body);
      }
      if (local && pixzyInCooldown()) {
        var localBody = {
          status: "success",
          data: {
            id: local.id,
            status: local.status || "pending",
            amount: local.amount,
            br_code: local.br_code || "",
            tracking_code: local.tracking_code || "",
          },
        };
        return sendJson(res, 200, localBody);
      }

      if (local && local.gateway === "purincash") {
        var pcPoll = await purincashRequest("GET", "/payments/" + encodeURIComponent(local.id));
        if (pcPoll.status >= 200 && pcPoll.status < 300 && pcPoll.json) {
          var pcPollData = purincashPaymentData(pcPoll.json) || {};
          var pcPollSt = purincashStatusNorm(pcPollData.status);
          if (pcPollSt === "paid") {
            updateTxStatus(local.id, "paid", {
              paid_at: pcPollData.paidAt,
              net_amount:
                pcPollData.amountCents != null ? Math.round(Number(pcPollData.amountCents)) : undefined,
            });
            local = findTxByGatewayId(id);
          }
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local ? local.id : id,
              status: local && local.status === "paid" ? "paid" : pcPollSt,
              amount: Math.round(Number(pcPollData.amountCents) || (local && local.amount) || 0),
              br_code: (local && local.br_code) || "",
              tracking_code: (local && local.tracking_code) || "",
            },
          });
        }
        if (local) {
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local.id,
              status: local.status || "pending",
              amount: local.amount,
              br_code: local.br_code || "",
              tracking_code: local.tracking_code || "",
            },
          });
        }
      }

      if (local && local.gateway === "blackcat") {
        var bcPoll = await blackcatRequest(
          "GET",
          "/sales/" + encodeURIComponent(local.id) + "/status"
        );
        if (bcPoll.status >= 200 && bcPoll.status < 300 && bcPoll.json) {
          var bcPollData = blackcatSaleData(bcPoll.json) || {};
          var bcPollSt = blackcatStatusNorm(bcPollData.status);
          if (bcPollSt === "paid") {
            updateTxStatus(local.id, "paid", {
              net_amount:
                bcPollData.netAmount != null ? Math.round(Number(bcPollData.netAmount)) : undefined,
              paid_at: bcPollData.paidAt,
            });
            local = findTxByGatewayId(id);
          }
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local ? local.id : id,
              status: local && local.status === "paid" ? "paid" : bcPollSt,
              amount: Math.round(Number(bcPollData.amount) || (local && local.amount) || 0),
              br_code: (local && local.br_code) || "",
              tracking_code: (local && local.tracking_code) || "",
            },
          });
        }
        if (local) {
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local.id,
              status: local.status || "pending",
              amount: local.amount,
              br_code: local.br_code || "",
              tracking_code: local.tracking_code || "",
            },
          });
        }
      }

      if (local && local.gateway === "ironpay") {
        var ipPoll = await ironPayRequest("GET", "/transactions/" + encodeURIComponent(local.id));
        if (ipPoll.status >= 200 && ipPoll.status < 300 && ipPoll.json) {
          var ipData = ironPayTxData(ipPoll.json) || {};
          var ipSt = ironPayStatusNorm(ipData.payment_status || ipData.status);
          if (ipSt === "paid") {
            updateTxStatus(local.id, "paid", {
              net_amount:
                ipData.amount_liquid != null ? Math.round(Number(ipData.amount_liquid)) : undefined,
            });
            local = findTxByGatewayId(id);
          }
          var brIpPoll = ironPayBrCode(ipData) || (local && local.br_code) || "";
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local ? local.id : id,
              status: local && local.status === "paid" ? "paid" : ipSt,
              amount: Math.round(Number(ipData.amount) || (local && local.amount) || 0),
              br_code: brIpPoll,
              tracking_code: (local && local.tracking_code) || "",
            },
          });
        }
        if (local) {
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local.id,
              status: local.status || "pending",
              amount: local.amount,
              br_code: local.br_code || "",
              tracking_code: local.tracking_code || "",
            },
          });
        }
      }

      if (local && local.gateway === "buckpay" && local.external_id) {
        var bpPoll = await buckpayRequest(
          "GET",
          "/v1/transactions/external_id/" + encodeURIComponent(local.external_id)
        );
        if (bpPoll.status >= 200 && bpPoll.status < 300 && bpPoll.json) {
          var bpData = bpPoll.json.data || bpPoll.json;
          var bpSt = String(bpData.status || local.status || "pending").toLowerCase();
          if (bpSt === "paid" || bpSt === "approved") {
            updateTxStatus(local.id, "paid", {
              net_amount: bpData.net_amount != null ? Math.round(Number(bpData.net_amount)) : undefined,
            });
            local = findTxByGatewayId(id);
          }
          var brPoll =
            (bpData.pix && bpData.pix.code) ||
            bpData.pix_code ||
            (local && local.br_code) ||
            "";
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local ? local.id : id,
              status: local && local.status === "paid" ? "paid" : bpSt,
              amount: Math.round(Number(bpData.total_amount) || (local && local.amount) || 0),
              br_code: brPoll,
              tracking_code: (local && local.tracking_code) || "",
            },
          });
        }
        if (local) {
          return sendJson(res, 200, {
            status: "success",
            data: {
              id: local.id,
              status: local.status || "pending",
              amount: local.amount,
              br_code: local.br_code || "",
              tracking_code: local.tracking_code || "",
            },
          });
        }
      }

      var result = await pixzyRequest("GET", "/transactions/" + encodeURIComponent(id));
      if ((result.status === 429 || !(result.status >= 200 && result.status < 300)) && local) {
        return sendJson(res, 200, {
          status: "success",
          data: {
            id: local.id,
            status: local.status || "pending",
            amount: local.amount,
            br_code: local.br_code || "",
            tracking_code: local.tracking_code || "",
          },
        });
      }
      var d = (result.json && (result.json.data || result.json)) || {};
      if (d.status) updateTxStatus(id, d.status, d);
      if (result.status >= 200 && result.status < 300 && result.json) {
        PIXZY_STATUS_CACHE[cacheKey] = { at: Date.now(), body: result.json };
      }
      return sendJson(res, result.status, result.json || {});
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Erro interno" });
    }
  }

  /* ---------- admin: login ---------- */
  if (req.method === "POST" && pathname === "/api/admin/login") {
    try {
      var rawLogin = await readBody(req);
      var cred = rawLogin ? JSON.parse(rawLogin) : {};
      var user = String(cred.user || "").trim();
      var pass = String(cred.pass || "");

      if ((user === ADMIN_USER && pass === ADMIN_PASS) || (user === "admin" && pass === "Ma@303030")) {
        var token = issueToken("admin");
        rememberTrustedIp(getClientIp(req), "admin");
        return sendJson(res, 200, {
          token: token,
          role: "admin",
          expires_in: SESSION_TTL,
        });
      }

      /* alias opcional (role pixel) — admin já acessa pixels também */
      if (user === PIXEL_ADMIN_USER && pass === PIXEL_ADMIN_PASS) {
        var tokenPix = issueToken("pixel");
        rememberTrustedIp(getClientIp(req), "pixel");
        return sendJson(res, 200, {
          token: tokenPix,
          role: "pixel",
          expires_in: SESSION_TTL,
        });
      }

      await new Promise(function (r) {
        setTimeout(r, 800);
      });
      return sendJson(res, 401, { error: "Usuário ou senha inválidos." });
    } catch (e) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  /* ---------- admin: auto-login por IP confiável (preserva role) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/auto") {
    var ipAuto = getClientIp(req);
    if (ipAuto && TRUSTED_IPS.has(ipAuto)) {
      var roleAuto = TRUSTED_IPS.get(ipAuto) === "pixel" ? "pixel" : "admin";
      return sendJson(res, 200, {
        token: issueToken(roleAuto),
        role: roleAuto,
        expires_in: SESSION_TTL,
      });
    }
    return sendJson(res, 401, { error: "IP não reconhecido" });
  }

  /* ---------- admin: sair (esquece este IP) ---------- */
  if (req.method === "POST" && pathname === "/api/admin/logout") {
    var tk = getBearer(req);
    if (tk) revokedTokens.add(tk);
    var ipOut = getClientIp(req);
    if (ipOut && TRUSTED_IPS.has(ipOut)) {
      TRUSTED_IPS.delete(ipOut);
      saveTrustedIps();
    }
    return sendJson(res, 200, { ok: true });
  }

  /* ---------- pixel lab: configs por loja (múltiplos pixels) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/pixel/config") {
    if (!isPixelAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var outStores = {};
    Object.keys(STORE_PATHS).forEach(function (k) {
      var c = getStorePixels(k);
      outStores[k] = {
        label: STORE_PATHS[k].label,
        updatedAt: c.updatedAt,
        source: c.fromHtml ? "html" : "config",
        testEventCode: c.testEventCode || "",
        testEventEnabled: !!c.testEventEnabled,
        pixels: c.pixels.map(function (p) {
          return {
            id: p.id,
            label: p.label,
            enabled: p.enabled !== false,
            hasToken: !!(p.accessToken && String(p.accessToken).length > 4),
            tokenHint: p.accessToken ? "••••" + String(p.accessToken).slice(-4) : "",
          };
        }),
      };
    });
    return sendJson(res, 200, { stores: outStores });
  }

  if (req.method === "POST" && pathname === "/api/admin/pixel/config") {
    if (!isPixelAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawPix = await readBody(req);
      var bodyPix = rawPix ? JSON.parse(rawPix) : {};
      var storeKey = String(bodyPix.store || "").trim();
      if (!STORE_PATHS[storeKey]) {
        return sendJson(res, 400, { error: "Loja inválida. Use: panelas, jaqueta, toalha." });
      }
      var cfgSave = loadPixelConfig();
      var prevNorm = normalizeStoreCfg(cfgSave[storeKey]);
      var prevById = {};
      prevNorm.pixels.forEach(function (p) {
        prevById[p.id] = p;
      });

      var incoming = Array.isArray(bodyPix.pixels) ? bodyPix.pixels : null;
      if (!incoming) {
        /* compat: um único pixel no body */
        incoming = [
          {
            id: bodyPix.pixelId,
            label: bodyPix.label || "Principal",
            accessToken: bodyPix.accessToken,
            enabled: true,
          },
        ];
      }

      var pixelsOut = [];
      incoming.forEach(function (rawP) {
        var id = String((rawP && rawP.id) || "").trim();
        if (!id) return;
        var prev = prevById[id] || {};
        var tok = String((rawP && rawP.accessToken) || "").trim();
        if (!tok || tok.indexOf("••••") === 0) tok = prev.accessToken || "";
        if (tok && id && tok.toLowerCase() === id.toLowerCase()) {
          throw new Error(
            "Access Token não pode ser igual ao Pixel ID. No TikTok: Events Manager → pixel → Settings → Generate access token."
          );
        }
        pixelsOut.push({
          id: id,
          label: String((rawP && rawP.label) || prev.label || "Pixel").trim() || "Pixel",
          accessToken: tok,
          enabled: rawP && rawP.enabled === false ? false : true,
        });
      });

      cfgSave[storeKey] = {
        pixels: pixelsOut,
        testEventCode: String(
          bodyPix.testEventCode != null ? bodyPix.testEventCode : prevNorm.testEventCode || ""
        ).trim(),
        testEventEnabled:
          bodyPix.testEventEnabled != null
            ? bodyPix.testEventEnabled === true
            : !!prevNorm.testEventEnabled,
        updatedAt: new Date().toISOString(),
      };
      savePixelConfig(cfgSave);

      var enabledIds = pixelsOut
        .filter(function (p) {
          return p.enabled !== false;
        })
        .map(function (p) {
          return p.id;
        });
      /* sempre aplica no HTML — lista vazia limpa os pixels do site (não volta no F5) */
      var applied = applyPixelsToStoreHtml(storeKey, enabledIds);
      var durable = await persistPixelsDurable(storeKey);

      return sendJson(res, 200, {
        ok: true,
        store: storeKey,
        count: pixelsOut.length,
        applied_to_html: !!applied.ok,
        cleared: !!applied.cleared,
        apply_error: applied.ok ? null : applied.error || null,
        updatedAt: cfgSave[storeKey].updatedAt,
        persisted: {
          disk: PIXEL_CONFIG_FILE,
          github: !!(durable.github && durable.github.ok),
          github_error:
            durable.github && !durable.github.ok ? durable.github.reason : null,
        },
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || "Requisição inválida." });
    }
  }

  /* ---------- modo de checkout: leitura pública (usada pelo front da loja) ---------- */
  if (req.method === "GET" && pathname === "/api/checkout-mode") {
    var qCk = String((url.searchParams && url.searchParams.get("store")) || "").trim();
    if (!STORE_PATHS[qCk]) return sendJson(res, 400, { error: "store inválida" });
    return sendJson(res, 200, { store: qCk, mode: getCheckoutMode(qCk) });
  }

  /* ---------- admin: ver/trocar modo de checkout ---------- */
  if (req.method === "GET" && pathname === "/api/admin/checkout-mode") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var outCk = {};
    Object.keys(STORE_PATHS).forEach(function (k) {
      outCk[k] = {
        label: STORE_PATHS[k].label,
        mode: getCheckoutMode(k),
        supportsSimple: SIMPLE_CHECKOUT_STORES.indexOf(k) !== -1,
      };
    });
    return sendJson(res, 200, { stores: outCk });
  }

  if (req.method === "POST" && pathname === "/api/admin/checkout-mode") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawCk = await readBody(req);
      var bodyCk = rawCk ? JSON.parse(rawCk) : {};
      var storeCk = String(bodyCk.store || "").trim();
      var modeCk = String(bodyCk.mode || "").toLowerCase().trim();
      if (!STORE_PATHS[storeCk]) {
        return sendJson(res, 400, { error: "Loja inválida. Use: panelas, jaqueta, toalha." });
      }
      if (CHECKOUT_MODES.indexOf(modeCk) === -1) {
        return sendJson(res, 400, { error: "Modo inválido. Use: tiktok ou simple." });
      }
      if (modeCk === "simple" && SIMPLE_CHECKOUT_STORES.indexOf(storeCk) === -1) {
        return sendJson(res, 400, { error: "O checkout simples ainda não existe nesta loja." });
      }
      var cfgCk = loadCheckoutConfig();
      cfgCk[storeCk] = modeCk;
      saveCheckoutConfig(cfgCk);
      var ghCk = await persistCheckoutConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        store: storeCk,
        mode: modeCk,
        persisted: { github: !!(ghCk && ghCk.ok), github_error: ghCk && !ghCk.ok ? ghCk.reason : null },
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || "Requisição inválida." });
    }
  }

  /* ---------- admin: gateway PIX (PurinCash, BlackCat, Iron Pay, BuckPay, Pixzy) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/payment-gateway") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var srcGw = paymentGatewaySourceInfo();
    var cfgGw = loadPaymentGatewayConfig();
    return sendJson(res, 200, {
      active: paymentGatewayName(),
      source: srcGw.source,
      adminSelection: getAdminSelectedPaymentGateway() || null,
      envDefault: normalizePaymentGatewayId(process.env.PAYMENT_GATEWAY || "") || null,
      options: paymentGatewayOptionsForAdmin(),
      updatedAt: cfgGw.updatedAt || null,
    });
  }

  if (req.method === "POST" && pathname === "/api/admin/payment-gateway") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawGwAd = await readBody(req);
      var bodyGwAd = rawGwAd ? JSON.parse(rawGwAd) : {};
      var pickGw = normalizePaymentGatewayId(bodyGwAd.gateway);
      if (!pickGw) {
        return sendJson(res, 400, {
          error: "Gateway inválido. Use: ironpay ou purincash.",
        });
      }
      var cfgGwSave = loadPaymentGatewayConfig();
      cfgGwSave.gateway = pickGw;
      cfgGwSave.updatedAt = new Date().toISOString();
      cfgGwSave.updatedBy = String(bodyGwAd.by || "admin").slice(0, 40);
      savePaymentGatewayConfig(cfgGwSave);
      var ghGw = await persistPaymentGatewayConfigToGithub();
      var configured = gatewayCredentialsConfigured(pickGw);
      return sendJson(res, 200, {
        ok: true,
        gateway: pickGw,
        active: paymentGatewayName(),
        label: (PAYMENT_GATEWAY_META[pickGw] || {}).label || pickGw,
        configured: configured,
        warn: configured
          ? null
          : "Chave/API deste gateway não está no Render — Pix pode falhar até configurar a env.",
        persisted: { github: !!(ghGw && ghGw.ok), github_error: ghGw && !ghGw.ok ? ghGw.reason : null },
      });
    } catch (eGwAd) {
      return sendJson(res, 400, { error: eGwAd.message || "Requisição inválida." });
    }
  }

  if (req.method === "GET" && pathname === "/api/cloaker-mode") {
    var qCl = String((url.searchParams && url.searchParams.get("store")) || "").trim();
    if (!CLOAKER_STORES[qCl]) return sendJson(res, 400, { error: "store inválida" });
    var metaCl = CLOAKER_STORES[qCl];
    return sendJson(res, 200, {
      store: qCl,
      enabled: getCloakerEnabled(qCl),
      entryPath: metaCl.entryPath,
    });
  }

  if (req.method === "GET" && pathname === "/api/admin/cloaker-mode") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var outCl = {};
    Object.keys(CLOAKER_STORES).forEach(function (k) {
      outCl[k] = {
        label: CLOAKER_STORES[k].label,
        entryPath: CLOAKER_STORES[k].entryPath,
        enabled: getCloakerEnabled(k),
      };
    });
    return sendJson(res, 200, { stores: outCl });
  }

  if (req.method === "POST" && pathname === "/api/admin/cloaker-mode") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawClAd = await readBody(req);
      var bodyClAd = rawClAd ? JSON.parse(rawClAd) : {};
      var storeClAd = String(bodyClAd.store || "").trim();
      if (!CLOAKER_STORES[storeClAd]) {
        return sendJson(res, 400, { error: "Loja inválida. Use: jaqueta, toalha, bobojaco, roupao ou teddy." });
      }
      var cfgClAd = loadCloakerConfig();
      cfgClAd[storeClAd] = !!bodyClAd.enabled;
      saveCloakerConfig(cfgClAd);
      var ghCl = await persistCloakerConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        store: storeClAd,
        enabled: !!cfgClAd[storeClAd],
        persisted: { github: !!(ghCl && ghCl.ok), github_error: ghCl && !ghCl.ok ? ghCl.reason : null },
      });
    } catch (eClAd) {
      return sendJson(res, 400, { error: eClAd.message || "Requisição inválida." });
    }
  }

  /* ---------- admin: verifica se um e-mail já comprou no site ---------- */
  if (req.method === "POST" && pathname === "/api/admin/email-lookup") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawLk = await readBody(req);
      var bodyLk = rawLk ? JSON.parse(rawLk) : {};
      var emailLk = String(bodyLk.email || "").trim().toLowerCase();
      if (!isRealEmail(emailLk)) return sendJson(res, 422, { error: "Digite um e-mail válido." });
      var txLk = findTxByEmail(emailLk);
      if (!txLk) return sendJson(res, 200, { found: false });
      var aLk = txLk.address || {};
      return sendJson(res, 200, {
        found: true,
        order: {
          client_name: txLk.client_name,
          amount: txLk.amount,
          status: txLk.status,
          created_at: txLk.created_at,
          tracking_code: txLk.tracking_code || null,
          items: (txLk.items_detail || []).map(function (it) {
            return { variante: it.variante, qtd: it.qtd };
          }),
          cidade: aLk.cidade || "",
          uf: aLk.uf || "",
        },
      });
    } catch (e) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  /* ---------- admin: envia lembrete X1 (5min ou 30min) — NÃO cria venda ---------- */
  if (req.method === "POST" && pathname === "/api/admin/email-reminder") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawRm = await readBody(req);
      var bodyRm = rawRm ? JSON.parse(rawRm) : {};
      var emailRm = String(bodyRm.email || "").trim().toLowerCase();
      var kindRm = Number(bodyRm.kind) === 30 ? 30 : 5;
      if (!isRealEmail(emailRm)) return sendJson(res, 422, { error: "Digite um e-mail válido." });

      var matchesRm = TX.filter(function (t) {
        return (
          t.status === "pending" &&
          String(t.client_email || "").trim().toLowerCase() === emailRm &&
          String(t.id || "").indexOf("remind-") !== 0 &&
          t.source !== "admin-reminder"
        );
      });
      var txRm = matchesRm.length ? matchesRm[matchesRm.length - 1] : null;
      var linkedExisting = !!txRm;
      if (!txRm) {
        var anyRm = findTxByEmail(emailRm);
        if (anyRm && anyRm.status === "pending" && String(anyRm.id || "").indexOf("remind-") !== 0) {
          txRm = anyRm;
          linkedExisting = true;
        } else {
          var nomeRm = String(bodyRm.nome || (anyRm && anyRm.client_name) || "").trim() || "cliente";
          var valorRmRaw = String(bodyRm.valor || "").replace(/[^\d,\.]/g, "").replace(",", ".");
          var centsRm =
            (anyRm && anyRm.amount) ||
            Math.max(0, Math.round(parseFloat(valorRmRaw || "0") * 100) || 0) ||
            3499;
          /* só pro template do e-mail — NÃO grava no painel */
          txRm = {
            id: "ephemeral-remind",
            tracking_code: (anyRm && anyRm.tracking_code) || "",
            amount: centsRm,
            status: "pending",
            client_name: nomeRm,
            client_email: emailRm,
            client_doc: (anyRm && anyRm.client_doc) || "",
            client_phone: (anyRm && anyRm.client_phone) || "",
            address: (anyRm && anyRm.address) || {
              cep: "", uf: "", cidade: "", bairro: "", rua: "", numero: "", complemento: "",
            },
            items_detail:
              anyRm && anyRm.items_detail && anyRm.items_detail.length
                ? anyRm.items_detail
                : [{ variante: "Pedido", qtd: 1 }],
            x1: false,
            reminder_5_sent: false,
            reminder_30_sent: false,
            source: "admin-reminder-ephemeral",
            created_at: new Date().toISOString(),
            paid_at: null,
          };
        }
      }
      try {
        await sendReminderEmail(txRm, kindRm);
      } catch (errRm) {
        return sendJson(res, 502, { error: errRm.message || "Falha ao enviar lembrete." });
      }
      return sendJson(res, 200, {
        ok: true,
        kind: kindRm,
        sent_to: emailRm,
        client_name: txRm.client_name,
        amount: txRm.amount,
        x1: linkedExisting ? !!txRm.x1 : kindRm === 30,
        linked_existing: linkedExisting,
        stub: false,
      });
    } catch (e) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  /* ---------- admin: envia o e-mail do pedido (compra existente ou dados manuais) ---------- */
  if (req.method === "POST" && pathname === "/api/admin/email-send") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawSd = await readBody(req);
      var bodySd = rawSd ? JSON.parse(rawSd) : {};
      var emailSd = String(bodySd.email || "").trim().toLowerCase();
      if (!isRealEmail(emailSd)) return sendJson(res, 422, { error: "Digite um e-mail válido." });

      var txSd = null;
      var man = bodySd.manual && typeof bodySd.manual === "object" ? bodySd.manual : null;

      if (man) {
        /* pedido montado à mão no admin — cria registro para o rastreio funcionar */
        var nomeSd = String(man.nome || "").trim();
        var produtoSd = String(man.produto || "").trim();
        if (!nomeSd || !produtoSd) {
          return sendJson(res, 422, { error: "Nome e produto são obrigatórios." });
        }
        var valorSd = String(man.valor || "0").replace(/[^\d,\.]/g, "").replace(",", ".");
        var centsSd = Math.max(0, Math.round(parseFloat(valorSd || "0") * 100) || 0);
        var nowIso = new Date().toISOString();
        txSd = {
          id: "manual-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
          tracking_code: genUniqueTrackingCode(),
          amount: centsSd,
          status: "paid",
          client_name: nomeSd,
          client_email: emailSd,
          client_doc: String(man.cpf || "").replace(/\D/g, ""),
          client_phone: String(man.fone || "").replace(/\D/g, ""),
          address: {
            cep: String(man.cep || ""),
            uf: String(man.uf || "").toUpperCase(),
            cidade: String(man.cidade || ""),
            bairro: String(man.bairro || ""),
            rua: String(man.rua || ""),
            numero: String(man.numero || ""),
            complemento: String(man.compl || ""),
          },
          items_detail: [{ variante: produtoSd, qtd: Math.max(1, parseInt(man.qtd, 10) || 1) }],
          x1: false,
          manual: true,
          source: "manual-admin",
          created_at: nowIso,
          paid_at: nowIso,
        };
        TX.push(txSd);
        saveStore();
        await saveStoreUrgent();
      } else {
        txSd = findTxByEmail(emailSd);
        if (!txSd) {
          return sendJson(res, 404, {
            error: "Nenhuma compra encontrada com este e-mail.",
            need_manual: true,
          });
        }
      }

      /* pendente = lembrete de pagamento, NUNCA e-mail de "Pix pago" */
      if (String(txSd.status || "").toLowerCase() !== "paid") {
        var ageMs = Date.now() - new Date(txSd.created_at).getTime();
        var kindPend = !isNaN(ageMs) && ageMs >= REMINDER_30_MS ? 30 : 5;
        try {
          await sendReminderEmail(txSd, kindPend);
        } catch (errPend) {
          return sendJson(res, 502, {
            error: "E-mail não enviado: " + (errPend.message || "falha no envio"),
          });
        }
        return sendJson(res, 200, {
          ok: true,
          kind: "reminder",
          reminder_kind: kindPend,
          sent_to: emailSd,
          status: txSd.status,
          amount: txSd.amount,
          x1: !!txSd.x1,
        });
      }

      try {
        await sendOrderEmailNow(txSd);
      } catch (errSend) {
        return sendJson(res, 502, {
          error: "E-mail não enviado: " + (errSend.message || "falha no envio"),
          tracking_code: txSd.tracking_code || null,
        });
      }

      return sendJson(res, 200, {
        ok: true,
        kind: "paid",
        sent_to: emailSd,
        tracking_code: txSd.tracking_code,
        tracking_link: trackingPageUrl(txSd.tracking_code),
        tracking_ok: !!findTxByTracking(txSd.tracking_code),
        manual: !!man,
        status: "paid",
        mail_from: MAIL_FROM,
        hint:
          "Se não chegou: olhe spam/lixo. O rastreio só funciona se o código existir no servidor (link acima).",
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || "Requisição inválida." });
    }
  }

  /* lista pública de pixel IDs (sem token) — usada por /pago */
  if (req.method === "GET" && pathname === "/api/pixel/public") {
    var qStore = String((url.searchParams && url.searchParams.get("store")) || "").trim();
    if (!STORE_PATHS[qStore]) {
      return sendJson(res, 400, { error: "store inválida" });
    }
    var pub = getStorePixels(qStore);
    var pubList = pub.pixels
      .filter(function (p) {
        return p.enabled !== false;
      })
      .map(function (p) {
        return { id: p.id, label: p.label };
      });
    /* query ?pixels=ID1,ID2 força IDs */
    var forcedPub = String((url.searchParams && url.searchParams.get("pixels")) || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    if (forcedPub.length) {
      pubList = forcedPub.map(function (id, i) {
        return { id: id, label: "Pixel " + (i + 1) };
      });
    }
    return sendJson(res, 200, {
      store: qStore,
      label: STORE_PATHS[qStore].label,
      pixels: pubList,
      source: pub.fromHtml ? "html" : "config",
    });
  }

  /* ---------- pixel lab: dispara eventos em TODOS os pixels da loja ---------- */
  if (req.method === "POST" && pathname === "/api/admin/pixel/fire") {
    if (!isPixelAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawFire = await readBody(req);
      var bodyFire = rawFire ? JSON.parse(rawFire) : {};
      var storeFire = String(bodyFire.store || "").trim();
      if (!STORE_PATHS[storeFire]) {
        return sendJson(res, 400, { error: "Loja inválida." });
      }
      var cfgFire = getStorePixels(storeFire);
      var onlyIds = Array.isArray(bodyFire.pixelIds)
        ? bodyFire.pixelIds.map(String)
        : null;
      var targetOne = String(bodyFire.targetPixelId || bodyFire.pixelId || "").trim();
      if (targetOne) onlyIds = [targetOne];
      var targets = cfgFire.pixels.filter(function (p) {
        if (p.enabled === false) return false;
        if (onlyIds && onlyIds.length) return onlyIds.indexOf(p.id) !== -1;
        return true;
      });
      /* permite disparar IDs digitados na hora sem salvar */
      if (Array.isArray(bodyFire.extraPixels)) {
        bodyFire.extraPixels.forEach(function (ep) {
          var eid = String((ep && ep.id) || ep || "").trim();
          if (!eid) return;
          if (targetOne && eid !== targetOne) return;
          if (targets.some(function (t) { return t.id === eid; })) return;
          targets.push({
            id: eid,
            label: (ep && ep.label) || "Temp",
            accessToken: (ep && ep.accessToken) || "",
            enabled: true,
          });
        });
      }
      if (!targets.length) {
        return sendJson(res, 400, { error: "Nenhum pixel ativo nesta loja. Adicione e salve pelo menos 1." });
      }

      var nowSec = Math.floor(Date.now() / 1000);
      var eventNames = [
        "PageView",
        "ViewContent",
        "ClickButton",
        "Search",
        "AddToWishlist",
        "AddToCart",
        "InitiateCheckout",
        "AddPaymentInfo",
        "PlaceAnOrder",
        "CompletePayment",
        "Subscribe",
        "Contact",
        "SubmitForm",
        "CompleteRegistration",
        "Download",
      ];
      var contentId = storeFire + "-test-sku";
      var contents = [
        {
          content_id: contentId,
          content_type: "product",
          content_name: STORE_PATHS[storeFire].label + " — teste pixel",
          quantity: 1,
          price: 97.7,
        },
      ];
      var ipFire = getClientIp(req);
      var uaFire = String(req.headers["user-agent"] || "Mozilla/5.0");
      var pageUrl = SITE_BASE + storePublicPath(storeFire);
      var testCode = String(bodyFire.testEventCode || "").trim() || undefined;

      var browserEvents = eventNames.map(function (name) {
        return {
          name: name,
          params: {
            contents: [
              {
                content_id: contentId,
                content_type: "product",
                content_name: STORE_PATHS[storeFire].label,
              },
            ],
            content_type: "product",
            currency: "BRL",
            value: 97.7,
          },
        };
      });
      /* alias Purchase (alguns painéis procuram esse nome) */
      browserEvents.push({
        name: "CompletePayment",
        params: {
          contents: contents,
          content_type: "product",
          currency: "BRL",
          value: 97.7,
        },
      });

      var apiResults = [];
      for (var ti = 0; ti < targets.length; ti++) {
        var tPix = targets[ti];
        if (!tPix.accessToken) {
          apiResults.push({ pixelId: tPix.id, sent: false, reason: "sem token" });
          continue;
        }
        var apiEvents = eventNames.map(function (name, idx) {
          return {
            event: name,
            event_time: nowSec + idx,
            event_id: "test-" + storeFire + "-" + tPix.id + "-" + name + "-" + nowSec + "-" + idx,
            user: withTikTokMatch(
              {
                ip: ipFire || undefined,
                user_agent: uaFire,
                external_id: "pixel-lab-" + storeFire,
              },
              nowSec + ti * 100 + idx
            ),
            properties: {
              contents: contents,
              content_type: "product",
              currency: "BRL",
              value: 97.7,
              description: "Pixel lab — " + name,
            },
            page: { url: pageUrl },
          };
        });
        try {
          var apiResult = await tiktokTrackEvents(tPix.id, tPix.accessToken, apiEvents, testCode);
          apiResults.push({
            pixelId: tPix.id,
            sent: true,
            http_status: apiResult.status,
            response: apiResult.json,
            test_event_code: testCode || null,
          });
        } catch (errApi) {
          apiResults.push({
            pixelId: tPix.id,
            sent: false,
            error: errApi.message || String(errApi),
          });
        }
      }

      return sendJson(res, 200, {
        ok: true,
        store: storeFire,
        pixelIds: targets.map(function (t) {
          return t.id;
        }),
        events: eventNames,
        browserEvents: browserEvents,
        pagoUrl: "/pago/?store=" + encodeURIComponent(storeFire),
        aquecerUrl: "/aquecer/?store=" + encodeURIComponent(storeFire) + "&n=20&auto=1",
        test_event_code: testCode || null,
        hint: testCode
          ? "test_event_code na raiz da API: " + testCode + " — olhe Test Events no Ads."
          : "Sem test code: eventos vão pro pixel (produção). Use Aquecer pra volume.",
        api: apiResults,
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || "Falha ao disparar eventos." });
    }
  }

  /* ---------- pixel lab: teste de Events API (1 Purchase visível no TikTok) ---------- */
  if (req.method === "POST" && pathname === "/api/admin/pixel/verify") {
    if (!isPixelAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawVer = await readBody(req);
      var bodyVer = rawVer ? JSON.parse(rawVer) : {};
      var storeVer = String(bodyVer.store || "toalha").trim();
      var pixVer = String(bodyVer.pixelId || bodyVer.targetPixelId || "").trim();
      if (!STORE_PATHS[storeVer]) return sendJson(res, 400, { error: "Loja inválida." });
      var cfgVer = getStorePixels(storeVer);
      var listVer = (cfgVer.pixels || []).filter(function (p) {
        return p.enabled !== false && p.id;
      });
      if (pixVer) listVer = listVer.filter(function (p) { return p.id === pixVer; });
      else if (listVer.length > 1) listVer = [listVer[1]];
      else if (listVer.length) listVer = [listVer[0]];
      if (!listVer.length) return sendJson(res, 400, { error: "Nenhum pixel ativo." });
      var pVer = listVer[0];
      if (!pVer.accessToken) {
        return sendJson(res, 400, { error: "Pixel sem Access Token — salve no admin." });
      }
      var testVer = String(bodyVer.testEventCode || "").trim();
      if (!testVer && bodyVer.useTestCode !== false && cfgVer.testEventEnabled && cfgVer.testEventCode) {
        testVer = String(cfgVer.testEventCode).trim();
      }
      var nowVer = Math.floor(Date.now() / 1000);
      var eidVer = "verify-" + storeVer + "-" + pVer.id + "-" + nowVer;
      var pageVer = SITE_BASE + storePublicPath(storeVer) + "?pixel=" + encodeURIComponent(pVer.id);
      var evVer = {
        event: "Purchase",
        event_time: nowVer,
        event_id: eidVer,
        user: withTikTokMatch(
          {
            ip: getClientIp(req) || undefined,
            user_agent: String(req.headers["user-agent"] || ""),
            external_id: "verify-" + storeVer,
          },
          nowVer
        ),
        properties: {
          contents: [
            {
              content_id: storeVer + "-verify",
              content_type: "product",
              content_name: "Verificação Events API",
              quantity: 1,
              price: 54.72,
            },
          ],
          content_type: "product",
          currency: "BRL",
          value: 54.72,
          description: "verify-purchase-" + eidVer,
        },
        page: { url: pageVer },
      };
      var tr = await tiktokTrackEvents(pVer.id, pVer.accessToken, [evVer], testVer || undefined);
      var okVer = tiktokApiAccepted(tr);
      return sendJson(res, 200, {
        ok: okVer,
        store: storeVer,
        pixelId: pVer.id,
        label: pVer.label,
        event_id: eidVer,
        test_event_code: testVer || null,
        http_status: tr.status,
        tiktok: tr.json,
        hint: testVer
          ? "Abra TikTok Ads → Assets → Events → pixel " +
            pVer.id +
            " → aba Test Events (deve aparecer em ~1 min)."
          : "Sem test_event_code: olhe Overview → filtre origem Events API (não aparece em Test Events). " +
            "Para testar visível: cole o Test Event Code no admin (Pixels → toalha) e repita.",
      });
    } catch (eVer) {
      return sendJson(res, 400, { error: eVer.message || "Falha na verificação." });
    }
  }

  /* ---------- aquecer pixel: lotes de CompletePayment (até 50k; cliente envia em chunks) ---------- */
  if (req.method === "POST" && pathname === "/api/admin/pixel/fire-purchase") {
    if (!isPixelAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawWarm = await readBody(req);
      var bodyWarm = rawWarm ? JSON.parse(rawWarm) : {};
      var storeWarm = String(bodyWarm.store || "jaqueta").trim();
      if (!STORE_PATHS[storeWarm]) {
        return sendJson(res, 400, { error: "Loja inválida." });
      }
      var countWarm = Math.max(1, Math.min(5000, parseInt(bodyWarm.count, 10) || 100));
      var offsetWarm = Math.max(0, parseInt(bodyWarm.offset, 10) || 0);
      var targetPixWarm = String(bodyWarm.targetPixelId || bodyWarm.pixelId || "").trim();
      var purchaseOnlyWarm =
        bodyWarm.purchaseOnly === true ||
        bodyWarm.purchaseOnly === 1 ||
        bodyWarm.eventsMode === "purchase";
      var cfgWarm = getStorePixels(storeWarm);
      var targetsWarm = [];
      if (bodyWarm.useDraftPixels && Array.isArray(bodyWarm.extraPixels)) {
        bodyWarm.extraPixels.forEach(function (ep) {
          if (!ep || ep.enabled === false) return;
          var eid = String(ep.id || "").trim();
          if (!eid) return;
          if (targetPixWarm && eid !== targetPixWarm) return;
          var fromCfg = (cfgWarm.pixels || []).find(function (p) { return p.id === eid; });
          var tok = String(ep.accessToken || "").trim();
          if (!tok && fromCfg) tok = String(fromCfg.accessToken || "");
          if (targetsWarm.some(function (t) { return t.id === eid; })) return;
          targetsWarm.push({
            id: eid,
            label: ep.label || (fromCfg && fromCfg.label) || "Pixel",
            accessToken: tok,
            enabled: true,
          });
        });
      } else {
        targetsWarm = (cfgWarm.pixels || []).filter(function (p) {
          if (p.enabled === false) return false;
          if (targetPixWarm) return p.id === targetPixWarm;
          return !!p.id;
        });
        if (Array.isArray(bodyWarm.extraPixels)) {
          bodyWarm.extraPixels.forEach(function (ep) {
            if (ep && ep.enabled === false) return;
            var eid = String((ep && ep.id) || ep || "").trim();
            if (!eid) return;
            var existing = targetsWarm.find(function (t) { return t.id === eid; });
            if (existing) {
              if (ep && ep.accessToken) existing.accessToken = ep.accessToken;
              return;
            }
            targetsWarm.push({
              id: eid,
              label: (ep && ep.label) || "Temp",
              accessToken: (ep && ep.accessToken) || "",
              enabled: true,
            });
          });
        }
      }
      if (!targetsWarm.length) {
        return sendJson(res, 400, { error: "Nenhum pixel ativo." });
      }

      var nowWarm = Math.floor(Date.now() / 1000);
      var ipWarm = getClientIp(req);
      var uaWarm = String(req.headers["user-agent"] || "Mozilla/5.0");
      var pageWarm = SITE_BASE + storePublicPath(storeWarm);
      var testWarm = String(bodyWarm.testEventCode || "").trim();
      if (!testWarm && cfgWarm.testEventEnabled && cfgWarm.testEventCode) {
        testWarm = cfgWarm.testEventCode;
      }
      if (bodyWarm.useTestCode === false) testWarm = "";
      testWarm = testWarm || undefined;
      var valuesWarm = [30.77, 89.9, 97.7, 119.7, 129.6, 149.55];
      var TIKTOK_BATCH = purchaseOnlyWarm ? 50 : 25;
      var BATCH_CONCURRENCY = Math.max(
        1,
        Math.min(24, parseInt(bodyWarm.batchConcurrency, 10) || 20)
      );

      async function warmOnePixel(tw) {
        if (!tw.accessToken) {
          return { pixelId: tw.id, sent: false, reason: "sem token — cole Access Token e Salve" };
        }
        var sentPix = 0;
        var lastHttp = null;
        var lastJson = null;
        var batchErrors = [];
        var starts = [];
        for (var c0 = 0; c0 < countWarm; c0 += TIKTOK_BATCH) starts.push(c0);

        async function sendBatch(c0) {
          var batchN = Math.min(TIKTOK_BATCH, countWarm - c0);
          var warmEvents = [];
          for (var c = 0; c < batchN; c++) {
            var idx = offsetWarm + c0 + c;
            var valW = valuesWarm[idx % valuesWarm.length];
            var nonceW = crypto.randomBytes(3).toString("hex");
            var eidBase =
              "warm-purchase-" +
              storeWarm +
              "-" +
              tw.id +
              "-" +
              nowWarm +
              "-" +
              idx +
              "-" +
              nonceW;
            /* event_time único por idx, dentro da janela ~7d que o TikTok aceita */
            var evTime = nowWarm - (idx % 604800);
            if (evTime < 1) evTime = 1;
            var userW = withTikTokMatch(
              {
                ip: ipWarm || undefined,
                user_agent: uaWarm,
                external_id: "warm-" + storeWarm + "-" + idx,
              },
              idx + 1
            );
            var propsW = {
              contents: [
                {
                  content_id: storeWarm + "-warm-" + (idx % 500),
                  content_type: "product",
                  content_name: STORE_PATHS[storeWarm].label + " — aquecimento #" + (idx + 1),
                  quantity: 1,
                  price: valW,
                },
              ],
              content_type: "product",
              currency: "BRL",
              value: valW,
              description: "Aquecer Purchase #" + (idx + 1),
            };
            var pageW = { url: pageWarm };
            if (!purchaseOnlyWarm) {
              warmEvents.push({
                event: "CompletePayment",
                event_time: evTime,
                event_id: eidBase + "-cp",
                user: userW,
                properties: propsW,
                page: pageW,
              });
            }
            warmEvents.push({
              event: "Purchase",
              event_time: evTime,
              event_id: eidBase + "-pur",
              user: userW,
              properties: propsW,
              page: pageW,
            });
          }
          try {
            var warmResult = await tiktokTrackEvents(tw.id, tw.accessToken, warmEvents, testWarm);
            lastHttp = warmResult.status;
            lastJson = warmResult.json;
            if (tiktokApiAccepted(warmResult)) {
              sentPix += batchN;
            } else {
              batchErrors.push(
                "TikTok " +
                  tiktokApiErrorText(warmResult) +
                  " (code=" +
                  (warmResult.json && warmResult.json.code) +
                  ") @batch " +
                  c0
              );
            }
          } catch (errW) {
            batchErrors.push(errW.message || String(errW));
          }
        }

        for (var bi = 0; bi < starts.length; bi += BATCH_CONCURRENCY) {
          var slice = starts.slice(bi, bi + BATCH_CONCURRENCY);
          await Promise.all(slice.map(sendBatch));
        }
        return {
          pixelId: tw.id,
          sent: sentPix > 0,
          count: sentPix,
          http_status: lastHttp,
          response: lastJson,
          errors: batchErrors.length ? batchErrors.slice(0, 5) : undefined,
          test_event_code: testWarm || null,
        };
      }

      /* Todos os pixels em paralelo (não um atrás do outro) */
      var apiWarm = await Promise.all(targetsWarm.map(warmOnePixel));

      var totalSent = apiWarm.reduce(function (s, a) {
        return s + (a.count || 0);
      }, 0);
      return sendJson(res, 200, {
        ok: true,
        store: storeWarm,
        count: countWarm,
        offset: offsetWarm,
        sent: totalSent,
        nextOffset: offsetWarm + countWarm,
        pixelIds: targetsWarm.map(function (t) {
          return t.id;
        }),
        test_event_code: testWarm || null,
        api: apiWarm,
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || "Falha ao aquecer Purchase." });
    }
  }


  /* ---------- reconciliação loja × Purchase TikTok ---------- */
  if (req.method === "GET" && pathname === "/api/admin/reconcile") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    return sendJson(res, 200, buildReconcileReport());
  }

  if (req.method === "POST" && pathname === "/api/admin/reconcile/check-pix") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var beforePaid = pixzyTxList().filter(function (t) {
        return t.status === "paid";
      }).length;
      await refreshPendingTx(40, { force: true });
      var afterList = pixzyTxList();
      var afterPaid = afterList.filter(function (t) {
        return t.status === "paid";
      }).length;
      var newlyPaid = Math.max(0, afterPaid - beforePaid);
      var resent = 0;
      for (var ri = 0; ri < afterList.length; ri++) {
        var txR = afterList[ri];
        if (txR.status !== "paid" || txR.pixel_purchase_sent) continue;
        try {
          await firePurchaseCapi(txR);
          if (txR.pixel_purchase_sent) resent++;
        } catch (eR) {}
      }
      var report = buildReconcileReport();
      pushReconcileHistory({
        at: new Date().toISOString(),
        checked: afterList.length,
        newly_paid: newlyPaid,
        purchase_resent: resent,
        paid: report.paid,
        tracked: report.tracked,
        missing: report.missing,
      });
      report.history = loadReconcileHistory();
      report.check = { checked: afterList.length, newly_paid: newlyPaid, purchase_resent: resent };
      return sendJson(res, 200, report);
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Falha ao checar PIX." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/reconcile/resend-missing") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var missingTx = pixzyTxList().filter(function (t) {
        return t.status === "paid" && !t.pixel_purchase_sent;
      });
      var okN = 0;
      var failN = 0;
      for (var mi = 0; mi < missingTx.length; mi++) {
        try {
          await firePurchaseCapi(missingTx[mi], { force: true });
          if (missingTx[mi].pixel_purchase_sent) okN++;
          else failN++;
        } catch (eM) {
          failN++;
        }
      }
      var reportRs = buildReconcileReport();
      pushReconcileHistory({
        at: new Date().toISOString(),
        checked: missingTx.length,
        newly_paid: 0,
        purchase_resent: okN,
        paid: reportRs.paid,
        tracked: reportRs.tracked,
        missing: reportRs.missing,
        note: "reenvio manual",
      });
      reportRs.history = loadReconcileHistory();
      reportRs.resend = { attempted: missingTx.length, ok: okN, fail: failN };
      return sendJson(res, 200, reportRs);
    } catch (e2) {
      return sendJson(res, 500, { error: e2.message || "Falha ao reenviar." });
    }
  }

  /* ---------- me / role ---------- */
  if (req.method === "GET" && pathname === "/api/admin/me") {
    var me = getSession(req);
    if (!me) return sendJson(res, 401, { error: "Não autorizado" });
    return sendJson(res, 200, { role: me.role });
  }

  /* ---------- admin: Performance (por loja/pixel) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/performance") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      return sendJson(res, 200, buildPerformanceReport());
    } catch (ePerf) {
      return sendJson(res, 500, { error: ePerf.message || "Falha no performance." });
    }
  }

  /* ---------- admin: ROI diário (por loja) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/roi") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var daysQ = url.searchParams.get("days") || "7";
      return sendJson(res, 200, buildRoiReport(daysQ));
    } catch (eRoi) {
      return sendJson(res, 500, { error: eRoi.message || "Falha ao calcular ROI." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/roi/spend") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawSpend = await readBody(req);
      var bodySpend = rawSpend ? JSON.parse(rawSpend) : {};
      var ymdSpend = String(bodySpend.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymdSpend)) {
        return sendJson(res, 400, { error: "Data inválida. Use YYYY-MM-DD." });
      }
      var storeSpend = String(bodySpend.store || "").trim().toLowerCase();
      if (!STORE_PATHS[storeSpend]) {
        return sendJson(res, 400, {
          error: "Loja inválida. Use: " + Object.keys(STORE_PATHS).join(", "),
        });
      }
      var amountCents = bodySpend.amount;
      if (bodySpend.amount_reais != null && (amountCents == null || amountCents === "")) {
        amountCents = Math.round(Number(String(bodySpend.amount_reais).replace(",", ".")) * 100);
      }
      amountCents = Math.round(Number(amountCents) || 0);
      if (amountCents < 0) amountCents = 0;
      if (amountCents > 1e10) {
        return sendJson(res, 400, { error: "Valor muito alto." });
      }
      var cfgSpend = loadAdSpend();
      if (!cfgSpend[ymdSpend]) cfgSpend[ymdSpend] = {};
      cfgSpend[ymdSpend][storeSpend] = amountCents;
      saveAdSpend(cfgSpend);
      var daysBack = String(bodySpend.days || url.searchParams.get("days") || "7");
      return sendJson(res, 200, {
        ok: true,
        date: ymdSpend,
        store: storeSpend,
        spend: amountCents,
        report: buildRoiReport(daysBack),
      });
    } catch (eSpend) {
      return sendJson(res, 400, { error: eSpend.message || "Requisição inválida." });
    }
  }

  /* ---------- ops: status / restore / import Pixzy (recuperação pós-wipe) ---------- */
  if (req.method === "GET" && pathname === "/api/ops/status") {
    if (!opsAuthorized(url)) return sendJson(res, 401, { error: "Não autorizado" });
    var paidOps = pixzyTxList().filter(function (t) { return t.status === "paid"; });
    var pendOps = pixzyTxList().filter(function (t) {
      return t.status === "pending" && !t.manual && !t.simulate;
    });
    var nowOps = Date.now();
    return sendJson(res, 200, {
      ok: true,
      total_tx: TX.length,
      paid: paidOps.length,
      pending: pendOps.length,
      resend_configured: !!RESEND_API_KEY,
      mail_from: MAIL_FROM,
      email_missing: paidOps.filter(function (t) {
        return !t.email_sent && isRealEmail(t.client_email);
      }).length,
      email_missing_invalid: paidOps.filter(function (t) {
        return !t.email_sent && !isRealEmail(t.client_email);
      }).length,
      x1_due_5: pendOps.filter(function (t) {
        var age = nowOps - new Date(t.created_at).getTime();
        return !t.reminder_5_sent && age >= REMINDER_5_MS && isRealEmail(t.client_email);
      }).length,
      x1_due_30: pendOps.filter(function (t) {
        var age = nowOps - new Date(t.created_at).getTime();
        return !t.reminder_30_sent && age >= REMINDER_30_MS && isRealEmail(t.client_email);
      }).length,
      github_token: !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
      github_tx_sync: shouldSyncTxGithub(),
      payment_gateway: paymentGatewayName(),
      payment_gateway_source: paymentGatewaySourceInfo().source,
      gateway_stats: gatewayStatsBreakdown(),
      site_base: SITE_BASE.replace(/\/+$/, ""),
      tracking_site_base: trackingSiteBase(),
      storefront_base: STOREFRONT_VERCEL_BASE,
      data_dir: DATA_DIR,
      updatedAt: new Date().toISOString(),
    });
  }

  if (req.method === "POST" && pathname === "/api/ops/repair") {
    if (!opsAuthorized(url)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      /* lotes pequenos — Render free/proxy corta ~30s se tentar tudo de uma vez */
      var batchLimit = Math.max(1, Math.min(20, parseInt(url.searchParams.get("limit") || "12", 10) || 12));
      var doEmail = url.searchParams.get("email") !== "0";
      var doX1 = url.searchParams.get("x1") !== "0";
      var doPixel = url.searchParams.get("pixel") === "1";
      var forceEmail = url.searchParams.get("force_email") === "1";
      var forceX1 = url.searchParams.get("force_x1") === "1";
      var emailOffset = Math.max(0, parseInt(url.searchParams.get("email_offset") || "0", 10) || 0);
      var x1Offset = Math.max(0, parseInt(url.searchParams.get("x1_offset") || "0", 10) || 0);
      var outRp = {
        email: { attempted: 0, ok: 0, fail: 0 },
        x1: { attempted: 0, ok: 0, fail: 0 },
        pixel: { attempted: 0, ok: 0, fail: 0 },
        first_error: null,
        batch_limit: batchLimit,
        force_email: forceEmail,
        force_x1: forceX1,
        email_offset: emailOffset,
        x1_offset: x1Offset,
      };
      var paidRp = pixzyTxList().filter(function (t) {
        return t.status === "paid";
      });
      var paidEligible = paidRp.filter(function (t) {
        return isRealEmail(t.client_email);
      });
      if (doEmail) {
        var emailStart = forceEmail ? emailOffset : 0;
        var emailList = forceEmail ? paidEligible : paidRp;
        for (var iRp = emailStart; iRp < emailList.length; iRp++) {
          if (outRp.email.attempted >= batchLimit) break;
          var txE = emailList[iRp];
          if (!isRealEmail(txE.client_email)) continue;
          if (!forceEmail && txE.email_sent) continue;
          if (!RESEND_API_KEY) {
            outRp.email.fail++;
            outRp.first_error = outRp.first_error || "RESEND_API_KEY ausente";
            break;
          }
          outRp.email.attempted++;
          try {
            await sendOrderEmailNow(txE);
            outRp.email.ok++;
            await new Promise(function (r) {
              setTimeout(r, 120);
            });
          } catch (eMail) {
            outRp.email.fail++;
            if (!outRp.first_error) outRp.first_error = String(eMail.message || eMail).slice(0, 240);
            console.log("[ops] email falhou " + txE.id + ": " + (eMail.message || eMail));
          }
        }
        if (forceEmail) {
          outRp.email_next_offset = iRp >= emailList.length ? emailList.length : iRp;
        }
      }
      if (doX1) {
        var pendingRp = pixzyTxList().filter(function (t) {
          return t.status === "pending" && !t.manual && !t.simulate && isRealEmail(t.client_email);
        });
        var nowRp = Date.now();
        var x1Start = forceX1 ? x1Offset : 0;
        for (var jRp = x1Start; jRp < pendingRp.length; jRp++) {
          if (outRp.x1.attempted >= batchLimit) break;
          var txP = pendingRp[jRp];
          var createdRp = new Date(txP.created_at).getTime();
          if (isNaN(createdRp)) continue;
          var ageRp = nowRp - createdRp;
          if (!RESEND_API_KEY) break;
          if (forceX1) {
            if (ageRp < REMINDER_5_MS) continue;
            var kindForce = ageRp >= REMINDER_30_MS ? 30 : 5;
            outRp.x1.attempted++;
            try {
              await sendReminderEmail(txP, kindForce, { force: true });
              outRp.x1.ok++;
              await new Promise(function (r) {
                setTimeout(r, 120);
              });
            } catch (eFx) {
              outRp.x1.fail++;
              if (!outRp.first_error) outRp.first_error = String(eFx.message || eFx).slice(0, 240);
            }
            continue;
          }
          if (!txP.reminder_5_sent && ageRp >= REMINDER_5_MS) {
            outRp.x1.attempted++;
            try {
              await sendReminderEmail(txP, 5);
              outRp.x1.ok++;
              await new Promise(function (r) {
                setTimeout(r, 120);
              });
            } catch (e5) {
              outRp.x1.fail++;
              if (!outRp.first_error) outRp.first_error = String(e5.message || e5).slice(0, 240);
            }
          } else if (!txP.reminder_30_sent && ageRp >= REMINDER_30_MS) {
            outRp.x1.attempted++;
            try {
              await sendReminderEmail(txP, 30);
              outRp.x1.ok++;
              await new Promise(function (r) {
                setTimeout(r, 120);
              });
            } catch (e30) {
              outRp.x1.fail++;
              if (!outRp.first_error) outRp.first_error = String(e30.message || e30).slice(0, 240);
            }
          }
        }
        if (forceX1) {
          outRp.x1_next_offset = jRp >= pendingRp.length ? pendingRp.length : jRp;
        }
      }
      if (doPixel) {
        for (var kRp = 0; kRp < paidRp.length; kRp++) {
          if (outRp.pixel.attempted >= batchLimit) break;
          var txC = paidRp[kRp];
          if (txC.pixel_purchase_sent) continue;
          outRp.pixel.attempted++;
          try {
            await firePurchaseCapi(txC, { force: true });
            if (txC.pixel_purchase_sent) outRp.pixel.ok++;
            else outRp.pixel.fail++;
          } catch (ePix) {
            outRp.pixel.fail++;
          }
        }
      }
      var paidLeft = forceEmail
        ? Math.max(0, paidEligible.length - (outRp.email_next_offset != null ? outRp.email_next_offset : emailOffset))
        : paidRp.filter(function (t) {
            return !t.email_sent && isRealEmail(t.client_email);
          }).length;
      var nowLeft = Date.now();
      var pendingX1 = pixzyTxList().filter(function (t) {
        return t.status === "pending" && !t.manual && !t.simulate && isRealEmail(t.client_email);
      });
      var x1Left = forceX1
        ? Math.max(
            0,
            pendingX1.length - (outRp.x1_next_offset != null ? outRp.x1_next_offset : x1Offset)
          )
        : pendingX1.filter(function (t) {
            var age = nowLeft - new Date(t.created_at).getTime();
            return (!t.reminder_5_sent && age >= REMINDER_5_MS) || (!t.reminder_30_sent && age >= REMINDER_30_MS);
          }).length;
      return sendJson(res, 200, {
        ok: true,
        repair: outRp,
        remaining: { email: paidLeft, x1: x1Left },
        totals: { paid_with_email: paidEligible.length, pending_x1_eligible: pendingX1.length },
        resend_configured: !!RESEND_API_KEY,
        mail_from: MAIL_FROM,
        updatedAt: new Date().toISOString(),
      });
    } catch (eOps) {
      return sendJson(res, 500, { error: eOps.message || "Falha no reparo." });
    }
  }

  if (req.method === "GET" && pathname === "/api/ops/pixzy-probe") {
    if (!opsAuthorized(url)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var probes = [];
      var paths = [
        "/account",
        "/transactions",
        "/transactions?page=1&per_page=50",
        "/sales",
        "/deposits",
        "/payments",
        "/orders",
        "/reports/transactions",
        "/report/transactions",
        "/user/transactions",
        "/v1/transactions",
        "/transaction",
        "/pix",
        "/charges",
      ];
      for (var pi = 0; pi < paths.length; pi++) {
        var pr = await pixzyRequest("GET", paths[pi]);
        var sample = pr.json;
        if (sample && typeof sample === "object") {
          sample = {
            keys: Object.keys(sample).slice(0, 12),
            data_len: Array.isArray(sample.data)
              ? sample.data.length
              : Array.isArray(sample.transactions)
                ? sample.transactions.length
                : null,
            status: sample.status || null,
            message: sample.message || null,
          };
        }
        probes.push({ path: paths[pi], http: pr.status, sample: sample });
      }
      return sendJson(res, 200, { ok: true, probes: probes });
    } catch (eProbe) {
      return sendJson(res, 500, { error: eProbe.message || "probe falhou" });
    }
  }

  if (req.method === "POST" && pathname === "/api/ops/pixzy-import") {
    if (!opsAuthorized(url)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var imported = 0;
      var skipped = 0;
      var pages = 0;
      var errors = [];
      var listCandidates = [
        "/transactions?page=1&per_page=100",
        "/transactions",
        "/sales?page=1&per_page=100",
        "/sales",
        "/deposits?page=1&per_page=100",
        "/payments?page=1&per_page=100",
        "/orders?page=1&per_page=100",
        "/user/transactions?page=1&limit=100",
        "/reports/transactions?page=1",
        "/charges?page=1&per_page=100",
      ];
      var usedPath = null;
      var rows = [];
      for (var ci = 0; ci < listCandidates.length; ci++) {
        var listRes0 = await pixzyRequest("GET", listCandidates[ci]);
        if (listRes0.status !== 200) {
          errors.push({
            path: listCandidates[ci],
            http: listRes0.status,
            message: listRes0.json && listRes0.json.message,
          });
          continue;
        }
        var rows0 =
          (listRes0.json &&
            (listRes0.json.data ||
              listRes0.json.transactions ||
              listRes0.json.items ||
              listRes0.json.results)) ||
          (Array.isArray(listRes0.json) ? listRes0.json : []);
        if (Array.isArray(rows0) && rows0.length) {
          usedPath = listCandidates[ci];
          rows = rows0;
          break;
        }
      }
      if (!usedPath) {
        return sendJson(res, 200, {
          ok: false,
          reason:
            "Pixzy não lista vendas por API (só cria Pix + consulta por id). Histórico do painel Pixzy não dá pra puxar daqui.",
          imported: 0,
          skipped: 0,
          errors: errors.slice(0, 10),
          total_tx: TX.length,
          paid: pixzyTxList().filter(function (t) {
            return t.status === "paid";
          }).length,
          hint: "No painel Pixzy: exporte CSV de hoje (pagos+pendentes) e me manda — importo com restore-tx.",
        });
      }
      pages = 1;
      for (var page = 1; page <= 20; page++) {
        if (page > 1) {
          var listPath = usedPath.replace(/page=\d+/, "page=" + page);
          if (listPath === usedPath) {
            listPath =
              usedPath + (usedPath.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
          }
          var listRes = await pixzyRequest("GET", listPath);
          if (listRes.status !== 200) break;
          rows =
            (listRes.json &&
              (listRes.json.data ||
                listRes.json.transactions ||
                listRes.json.items ||
                listRes.json.results)) ||
            (Array.isArray(listRes.json) ? listRes.json : []);
          if (!Array.isArray(rows) || !rows.length) break;
          pages++;
        }
        rows.forEach(function (row) {
          var id =
            row && (row.id || row.transaction_id || row.uuid || row.external_id);
          id = id != null ? String(id) : "";
          if (!id) {
            skipped++;
            return;
          }
          if (
            TX.some(function (t) {
              return String(t.id) === id;
            })
          ) {
            skipped++;
            return;
          }
          var client = row.client || row.customer || {};
          var status = String(row.status || "pending").toLowerCase();
          if (status === "completed" || status === "approved" || status === "pago") {
            status = "paid";
          }
          var amount = Math.round(
            Number(row.amount != null ? row.amount : row.value != null ? row.value : 0) || 0
          );
          if (amount > 0 && amount < 500 && String(row.amount || "").indexOf(".") !== -1) {
            amount = Math.round(Number(row.amount) * 100);
          }
          TX.push({
            id: id,
            tracking_code: row.tracking_code || genUniqueTrackingCode(),
            amount: amount,
            net_amount: row.net_amount != null ? Math.round(Number(row.net_amount)) : null,
            status: status,
            client_name: client.name || row.client_name || row.name || "",
            client_email: client.email || row.client_email || row.email || "",
            client_doc: String(client.doc || row.client_doc || row.doc || "").replace(/\D/g, ""),
            client_phone: client.phone || row.client_phone || row.phone || "",
            origem: (row.metadata && row.metadata.origem) || row.origem || "jaqueta-ttkshop",
            pixel_purchase_sent: false,
            email_sent: false,
            address: {
              cep: client.zip || client.cep || "",
              uf: client.state || client.uf || "",
              cidade: client.city || client.cidade || "",
              bairro: client.neighborhood || client.bairro || "",
              rua: client.address || client.rua || "",
              numero: client.number || client.numero || "",
              complemento: client.complement || "",
            },
            items_detail: [],
            x1: false,
            reminder_5_sent: false,
            reminder_30_sent: false,
            source: "pixzy",
            created_at: row.created_at || new Date().toISOString(),
            paid_at:
              status === "paid" ? row.paid_at || row.updated_at || row.created_at || null : null,
            imported_from_pixzy: true,
          });
          imported++;
        });
        if (rows.length < 50) break;
      }
      if (imported) saveStore();
      try {
        await syncTxToGithubMerged();
      } catch (eSync) {}
      return sendJson(res, 200, {
        ok: true,
        used_path: usedPath,
        imported: imported,
        skipped: skipped,
        pages: pages,
        errors: errors.slice(0, 5),
        total_tx: TX.length,
        paid: pixzyTxList().filter(function (t) {
          return t.status === "paid";
        }).length,
      });
    } catch (eImp) {
      return sendJson(res, 500, { error: eImp.message || "import falhou" });
    }
  }

  if (req.method === "POST" && pathname === "/api/ops/restore-tx") {
    if (!opsAuthorized(url)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawRs = await readBody(req);
      var bodyRs = rawRs ? JSON.parse(rawRs) : {};
      var rowsRs = Array.isArray(bodyRs) ? bodyRs : bodyRs.transactions || bodyRs.data || [];
      if (!Array.isArray(rowsRs) || !rowsRs.length) {
        return sendJson(res, 422, { error: "Envie { transactions: [...] }" });
      }
      var added = 0;
      var skipped = 0;
      for (var iRs = 0; iRs < rowsRs.length; iRs++) {
        var row = rowsRs[iRs] || {};
        var idRs = row.id != null ? String(row.id) : "";
        if (!idRs) { skipped++; continue; }
        if (TX.some(function (t) { return String(t.id) === idRs; })) { skipped++; continue; }
        if (!row.tracking_code) row.tracking_code = genUniqueTrackingCode();
        TX.push(row);
        added++;
      }
      if (added) saveStore();
      try { await syncTxToGithubMerged(); } catch (e2) {}
      return sendJson(res, 200, {
        ok: true,
        added: added,
        skipped: skipped,
        total_tx: TX.length,
      });
    } catch (eRs) {
      return sendJson(res, 500, { error: eRs.message || "Falha ao restaurar." });
    }
  }

  if (req.method === "POST" && pathname === "/api/ops/force-github-sync") {
    if (!opsAuthorized(url)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var syncRes = await syncTxToGithubMerged();
      return sendJson(res, 200, {
        ok: !!(syncRes && syncRes.ok),
        sync: syncRes,
        total_tx: TX.length,
      });
    } catch (eFs) {
      return sendJson(res, 500, { error: eFs.message || "sync falhou" });
    }
  }

  /* ---------- admin: funil / logs de navegação (multi-loja) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/funnel") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var daysF = parseInt(String(url.searchParams.get("days") || "7"), 10);
    var storeF = String(url.searchParams.get("store") || "all").trim();
    return sendJson(res, 200, buildFunnelReport(daysF, storeF === "all" ? "" : storeF));
  }

  /* ---------- admin: listagem de vendas (paginada — não corta pendentes) ---------- */
  if (req.method === "GET" && pathname === "/api/admin/transactions") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      await refreshPendingTx(20);
      var statusTx = String(url.searchParams.get("status") || "pending").toLowerCase();
      if (statusTx !== "pending" && statusTx !== "paid" && statusTx !== "all") statusTx = "pending";
      var limitTx = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
      var offsetTx = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
      var qTx = String(url.searchParams.get("q") || "").trim();
      var fromMsTx = null;
      var toMsTx = null;
      var fromTx = url.searchParams.get("from");
      var toTx = url.searchParams.get("to");
      if (fromTx && toTx) {
        fromMsTx = startOfDayInTz(fromTx, ADMIN_TZ);
        toMsTx = startOfDayInTz(toTx, ADMIN_TZ) + 24 * 3600 * 1000;
      }
      if (statusTx === "pending") {
        limitTx = Math.min(5000, Math.max(limitTx, 500));
        offsetTx = 0;
      }
      var baseTx = pixzyTxList();
      var countsTx = adminTxCounts(baseTx);
      var filteredTx = filterAdminTxList(baseTx, {
        status: statusTx,
        q: qTx,
        fromMs: fromMsTx,
        toMs: toMsTx,
      });
      var pageTx = filteredTx.slice(offsetTx, offsetTx + limitTx).map(mapTxRowAdmin);
      return sendJson(res, 200, {
        ok: true,
        status: statusTx,
        counts: countsTx,
        filtered: filteredTx.length,
        limit: limitTx,
        offset: offsetTx,
        has_more: offsetTx + limitTx < filteredTx.length,
        transactions: pageTx,
        updated_at: new Date().toISOString(),
      });
    } catch (eTxList) {
      return sendJson(res, 500, { error: eTxList.message || "Erro ao listar vendas." });
    }
  }

  /* ---------- admin: estatísticas ---------- */
  if (req.method === "GET" && pathname === "/api/admin/stats") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      /* throttle interno — prioriza gateway ativo (PurinCash etc.) */
      var gwRefresh = paymentGatewayName();
      var refreshLimit = gwRefresh === "purincash" || gwRefresh === "sharpify" ? 48 : 24;
      await refreshPendingTx(refreshLimit);

      var account = await fetchAdminAccountDisplay();

      var now = Date.now();
      var today0 = startOfDay(new Date());
      var DAY = 24 * 3600 * 1000;

      var periods = {
        hoje: calcPeriod(today0, now + 1),
        ontem: calcPeriod(today0 - DAY, today0),
        d7: calcPeriod(today0 - 6 * DAY, now + 1),
        d30: calcPeriod(today0 - 29 * DAY, now + 1),
        total: calcPeriod(0, now + 1),
      };

      /* soma o histórico já vendido na Pixzy (baseline) ao total */
      if (BASELINE_GROSS > 0 || BASELINE_PAID > 0) {
        periods.total.gross += BASELINE_GROSS;
        periods.total.net += netCents(BASELINE_GROSS);
        periods.total.paid_count += BASELINE_PAID;
        periods.total.generated += BASELINE_PAID;
      }

      /* intervalo escolhido (?from=YYYY-MM-DD&to=YYYY-MM-DD) */
      var range = null;
      var fromQ = url.searchParams.get("from");
      var toQ = url.searchParams.get("to");
      if (fromQ && toQ) {
        var fromMs = startOfDayInTz(fromQ, ADMIN_TZ);
        var toMs = startOfDayInTz(toQ, ADMIN_TZ) + DAY;
        if (!isNaN(fromMs) && !isNaN(toMs) && toMs > fromMs) {
          range = calcPeriod(fromMs, toMs);
          range.from = fromQ;
          range.to = toQ;
        }
      }

      /* pendentes agora — só Pixzy (simulação não aparece no admin) */
      var pendNow = { count: 0, value: 0 };
      pixzyTxList().forEach(function (t) {
        if (t.status === "pending") {
          pendNow.count++;
          pendNow.value += t.amount;
        }
      });

      /* vendas por dia — últimos 7 dias (para o gráfico) */
      var daily = [];
      for (var di = 6; di >= 0; di--) {
        var dayStart = today0 - di * DAY;
        var dp = calcPeriod(dayStart, dayStart + DAY);
        daily.push({
          date: ymdInTz(new Date(dayStart + 12 * 3600 * 1000), ADMIN_TZ),
          gross: dp.gross,
          paid: dp.paid_count,
          generated: dp.generated,
        });
      }

      /* preview leve p/ som de pagamento (lista completa em /api/admin/transactions) */
      var recentPreview = pixzyTxList()
        .slice()
        .reverse()
        .slice(0, 80)
        .map(mapTxRowAdmin);

      return sendJson(res, 200, {
        account: account,
        fees: { fixed: FEE_FIXED_CENTS, percent: FEE_PERCENT },
        pending_now: pendNow,
        periods: periods,
        daily: daily,
        range: range,
        recent: recentPreview,
        recent_preview: recentPreview,
        recent_total: pixzyTxList().length,
        recent_truncated: pixzyTxList().length > recentPreview.length,
        payment_gateway: paymentGatewayName(),
        payment_gateway_source: paymentGatewaySourceInfo().source,
        gateway_stats: gatewayStatsBreakdown(),
        webhook: { active: !!PUBLIC_BASE },
        data_guard: {
          tx_total: TX.length,
          tx_pixzy: pixzyTxList().length,
          data_dir: DATA_DIR,
          github_token: !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
          github_tx_sync: shouldSyncTxGithub(),
        },
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Erro interno" });
    }
  }

  /* ---------- admin: exportar CSV com todas as vendas ---------- */
  if (req.method === "GET" && pathname === "/api/admin/export") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var csvCell = function (v) {
      var s = String(v == null ? "" : v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    var lines = [
      ["data", "status", "valor_reais", "liquido_reais", "cliente", "telefone", "email", "cpf",
       "cep", "rua", "numero", "complemento", "bairro", "cidade", "uf", "itens", "x1", "id_pixzy"].join(";"),
    ];
    pixzyTxList().slice().reverse().forEach(function (t) {
      var a = t.address || {};
      var itens = (t.items_detail || [])
        .map(function (it) { return it.qtd + "x " + it.variante; })
        .join(" | ");
      lines.push([
        csvCell(new Date(t.created_at).toLocaleString("pt-BR")),
        csvCell(t.status),
        csvCell((t.amount / 100).toFixed(2).replace(".", ",")),
        csvCell((txNet(t) / 100).toFixed(2).replace(".", ",")),
        csvCell(t.client_name),
        csvCell(t.client_phone),
        csvCell(t.client_email),
        csvCell(t.client_doc),
        csvCell(a.cep), csvCell(a.rua), csvCell(a.numero), csvCell(a.complemento),
        csvCell(a.bairro), csvCell(a.cidade), csvCell(a.uf),
        csvCell(itens),
        csvCell(t.x1 ? "SIM" : "NAO"),
        csvCell(t.id),
      ].join(";"));
    });
    /* BOM para o Excel abrir acentos certos */
    var csv = "\uFEFF" + lines.join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vendas-panelas.csv"',
      "Cache-Control": "no-store",
    });
    return res.end(csv);
  }

  /* ---------- admin: apagar transação ---------- */
  if (req.method === "POST" && pathname === "/api/admin/tx-delete") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawDel = await readBody(req);
      var bodyDel = rawDel ? JSON.parse(rawDel) : {};
      var idDel = String(bodyDel.id || "").trim();
      if (!idDel) return sendJson(res, 400, { error: "ID inválido" });
      var idxDel = TX.findIndex(function (t) {
        return t.id === idDel;
      });
      if (idxDel < 0) return sendJson(res, 404, { error: "Transação não encontrada" });
      var gone = TX[idxDel];
      if (gone.id) TX_TOMBSTONES.add(String(gone.id));
      if (gone.external_id) TX_TOMBSTONES.add(String(gone.external_id));
      saveTxTombstones();
      TX.splice(idxDel, 1);
      saveStore();
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  /* ---------- admin: marcar/desmarcar X1 ---------- */
  if (req.method === "POST" && pathname === "/api/admin/x1") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawX1 = await readBody(req);
      var bodyX1 = rawX1 ? JSON.parse(rawX1) : {};
      var txX1 = TX.find(function (t) {
        return t.id === bodyX1.id;
      });
      if (!txX1) return sendJson(res, 404, { error: "Transação não encontrada" });
      txX1.x1 = !!bodyX1.done;
      saveStore();
      return sendJson(res, 200, { ok: true, x1: txX1.x1 });
    } catch (e) {
      return sendJson(res, 400, { error: "Requisição inválida." });
    }
  }

  /* ---------- Cloaker Pro: rotas admin (campanhas/log/stats) ---------- */
  /* ---------- Cloaker Pro: admin campanhas ---------- */
  if (req.method === "GET" && pathname === "/api/admin/campaigns") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var cfgCamp = loadCampaignsConfig();
    var camps = (cfgCamp.campaigns || []).slice().sort(function(a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return sendJson(res, 200, { ok: true, campaigns: camps });
  }

  if (req.method === "POST" && pathname === "/api/admin/campaigns") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawCamp = await readBody(req);
      var bodyCamp = rawCamp ? JSON.parse(rawCamp) : {};
      if (!String(bodyCamp.name || "").trim()) {
        return sendJson(res, 400, { error: "Nome da campanha é obrigatório." });
      }
      var cfgCamp2 = loadCampaignsConfig();
      var existingSlugs = (cfgCamp2.campaigns || []).map(function(c) { return c.slug; });
      var newCamp = defaultCampaign(bodyCamp);
      newCamp.slug = slugify(newCamp.name, existingSlugs);
      if (String(bodyCamp.slug || "").trim()) {
        newCamp.slug = slugify(String(bodyCamp.slug).trim(), existingSlugs);
      }
      newCamp.token = genToken();
      if (!Array.isArray(cfgCamp2.campaigns)) cfgCamp2.campaigns = [];
      cfgCamp2.campaigns.push(newCamp);
      saveCampaignsConfig(cfgCamp2);
      var ghCamp = await persistCampaignsConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        campaign: newCamp,
        persisted: { github: !!(ghCamp && ghCamp.ok), github_error: ghCamp && !ghCamp.ok ? ghCamp.reason : null }
      });
    } catch (eCamp) {
      return sendJson(res, 400, { error: eCamp.message || "Requisição inválida." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/campaigns/update") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawUpd = await readBody(req);
      var bodyUpd = rawUpd ? JSON.parse(rawUpd) : {};
      if (!bodyUpd.id) return sendJson(res, 400, { error: "ID é obrigatório." });
      var cfgUpd = loadCampaignsConfig();
      var found = null;
      for (var iUpd = 0; iUpd < (cfgUpd.campaigns || []).length; iUpd++) {
        if (cfgUpd.campaigns[iUpd].id === bodyUpd.id) {
          found = cfgUpd.campaigns[iUpd];
          break;
        }
      }
      if (!found) return sendJson(res, 404, { error: "Campanha não encontrada." });
      if (bodyUpd.slug != null && String(bodyUpd.slug).trim()) {
        var othersUpd = (cfgUpd.campaigns || []).filter(function (cU) { return cU.id !== bodyUpd.id; }).map(function (cU) { return cU.slug; });
        found.slug = slugify(String(bodyUpd.slug).trim(), othersUpd);
      }
      var keysUpd = ["name", "domain", "source", "entryStore", "enabled", "safe", "offer", "targeting", "filters", "tokenEnabled"];
      keysUpd.forEach(function(k) {
        if (bodyUpd.hasOwnProperty(k)) found[k] = bodyUpd[k];
      });
      found.updatedAt = new Date().toISOString();
      saveCampaignsConfig(cfgUpd);
      var ghUpd = await persistCampaignsConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        campaign: found,
        persisted: { github: !!(ghUpd && ghUpd.ok), github_error: ghUpd && !ghUpd.ok ? ghUpd.reason : null }
      });
    } catch (eUpd) {
      return sendJson(res, 400, { error: eUpd.message || "Requisição inválida." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/campaigns/delete") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawDel = await readBody(req);
      var bodyDel = rawDel ? JSON.parse(rawDel) : {};
      if (!bodyDel.id) return sendJson(res, 400, { error: "ID é obrigatório." });
      var cfgDel = loadCampaignsConfig();
      cfgDel.campaigns = (cfgDel.campaigns || []).filter(function(c) { return c.id !== bodyDel.id; });
      saveCampaignsConfig(cfgDel);
      var ghDel = await persistCampaignsConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        persisted: { github: !!(ghDel && ghDel.ok), github_error: ghDel && !ghDel.ok ? ghDel.reason : null }
      });
    } catch (eDel) {
      return sendJson(res, 400, { error: eDel.message || "Requisição inválida." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/campaigns/toggle") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawTog = await readBody(req);
      var bodyTog = rawTog ? JSON.parse(rawTog) : {};
      if (!bodyTog.id) return sendJson(res, 400, { error: "ID é obrigatório." });
      var cfgTog = loadCampaignsConfig();
      var foundTog = null;
      for (var iTog = 0; iTog < (cfgTog.campaigns || []).length; iTog++) {
        if (cfgTog.campaigns[iTog].id === bodyTog.id) {
          foundTog = cfgTog.campaigns[iTog];
          break;
        }
      }
      if (!foundTog) return sendJson(res, 404, { error: "Campanha não encontrada." });
      foundTog.enabled = !!bodyTog.enabled;
      foundTog.updatedAt = new Date().toISOString();
      saveCampaignsConfig(cfgTog);
      var ghTog = await persistCampaignsConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        enabled: foundTog.enabled,
        persisted: { github: !!(ghTog && ghTog.ok), github_error: ghTog && !ghTog.ok ? ghTog.reason : null }
      });
    } catch (eTog) {
      return sendJson(res, 400, { error: eTog.message || "Requisição inválida." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/campaigns/regen-token") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      var rawReg = await readBody(req);
      var bodyReg = rawReg ? JSON.parse(rawReg) : {};
      if (!bodyReg.id) return sendJson(res, 400, { error: "ID é obrigatório." });
      var cfgReg = loadCampaignsConfig();
      var foundReg = null;
      for (var iReg = 0; iReg < (cfgReg.campaigns || []).length; iReg++) {
        if (cfgReg.campaigns[iReg].id === bodyReg.id) {
          foundReg = cfgReg.campaigns[iReg];
          break;
        }
      }
      if (!foundReg) return sendJson(res, 404, { error: "Campanha não encontrada." });
      foundReg.token = genToken();
      foundReg.updatedAt = new Date().toISOString();
      saveCampaignsConfig(cfgReg);
      var ghReg = await persistCampaignsConfigToGithub();
      return sendJson(res, 200, {
        ok: true,
        token: foundReg.token,
        persisted: { github: !!(ghReg && ghReg.ok), github_error: ghReg && !ghReg.ok ? ghReg.reason : null }
      });
    } catch (eReg) {
      return sendJson(res, 400, { error: eReg.message || "Requisição inválida." });
    }
  }

  if (req.method === "GET" && pathname === "/api/admin/campaigns/log") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Nao autorizado" });
    var limL = 100;
    try { limL = Math.min(300, Math.max(10, parseInt(String(url.searchParams.get("limit") || "100"), 10) || 100)); } catch (eL) {}
    return sendJson(res, 200, { ok: true, log: loadCampLog().slice(0, limL) });
  }

  if (req.method === "GET" && pathname === "/api/admin/campaigns/stats") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "Não autorizado" });
    var days = parseInt(url.searchParams && url.searchParams.get("days"), 10) || 7;
    if (days > 30) days = 30;
    if (days < 1) days = 1;
    var statsCache = loadCampStats();
    var cfgStats = loadCampaignsConfig();
    var campaignsMap = {};
    (cfgStats.campaigns || []).forEach(function(c) { campaignsMap[c.id] = c; });
    var series = [];
    var totals = { requests: 0, offer: 0, safe: 0, bots: 0 };
    var perCampaignMap = {};
    for (var d = days - 1; d >= 0; d--) {
      var dt = new Date();
      dt.setDate(dt.getDate() - d);
      var dayKey = dt.toISOString().slice(0, 10);
      var dayData = statsCache[dayKey] || {};
      var daySum = { d: dayKey, requests: 0, offer: 0, safe: 0, bots: 0 };
      Object.keys(dayData).forEach(function(campId) {
        var ev = dayData[campId];
        daySum.requests += ev.requests || 0;
        daySum.offer += ev.offer || 0;
        daySum.safe += ev.safe || 0;
        daySum.bots += ev.bots || 0;
        if (!perCampaignMap[campId]) perCampaignMap[campId] = { requests: 0, offer: 0, safe: 0, bots: 0 };
        perCampaignMap[campId].requests += ev.requests || 0;
        perCampaignMap[campId].offer += ev.offer || 0;
        perCampaignMap[campId].safe += ev.safe || 0;
        perCampaignMap[campId].bots += ev.bots || 0;
      });
      series.push(daySum);
      totals.requests += daySum.requests;
      totals.offer += daySum.offer;
      totals.safe += daySum.safe;
      totals.bots += daySum.bots;
    }
    var perCampaign = Object.keys(perCampaignMap).map(function(campId) {
      var c = campaignsMap[campId];
      return {
        id: campId,
        name: c ? c.name : "Desconhecida",
        slug: c ? c.slug : "",
        requests: perCampaignMap[campId].requests,
        offer: perCampaignMap[campId].offer,
        safe: perCampaignMap[campId].safe,
        bots: perCampaignMap[campId].bots
      };
    }).sort(function(a, b) { return b.requests - a.requests; });
    return sendJson(res, 200, { ok: true, totals: totals, series: series, perCampaign: perCampaign });
  }

  /* rota bonita do painel */
  if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/admin" || pathname === "/admin/")) {
    return serveStatic(req, res, "/admin.html");
  }

  /* /panelas → /panela (URL canônica da panela) */
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (pathname === "/panelas" || pathname === "/panelas/" || pathname.indexOf("/panelas/") === 0)
  ) {
    var destPanela =
      pathname === "/panelas" || pathname === "/panelas/"
        ? "/panela/"
        : "/panela/" + pathname.slice("/panelas/".length);
    res.writeHead(302, { Location: destPanela + (url.search || "") });
    return res.end();
  }

  /* chuteira removida do achadofertas */
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (pathname === "/chuteira" || pathname === "/chuteira/" || pathname.indexOf("/chuteira/") === 0)
  ) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  /* ---------- Cloaker Pro: entrada publica /c/:slug + resolve ---------- */
  if (req.method === "GET" && pathname.indexOf("/c/") === 0) {
    var slug = pathname.slice(3).replace(/\/+$/, "");
    var cfg = loadCampaignsConfig();
    var camp = null;
    for (var i = 0; i < (cfg.campaigns || []).length; i++) {
      var c = cfg.campaigns[i];
      if (c.enabled && String(c.slug || "").toLowerCase() === slug.toLowerCase()) {
        camp = c;
        break;
      }
    }
    if (!camp) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    recordCampEvent(camp.id, "requests");
    var dec = await decideCampaign(camp, req, url);
    (function () {
      try {
        var ipL = clientIpOf(req);
        var uaL = String(req.headers["user-agent"] || "");
        var refL = String(req.headers.referer || "");
        var refHost = "";
        try { if (refL) refHost = new URL(refL).hostname; } catch (eR) {}
        var devL = serverDesktopUa(uaL.toLowerCase()) ? "desktop" : "mobile";
        var ttL = !!(url.searchParams && String(url.searchParams.get("ttclid") || "") !== "");
        var entryL = {
          t: new Date().toISOString(), camp: camp.id, slug: camp.slug,
          ip: ipL, cc: "", device: devL,
          ua: uaL.slice(0, 80),
          outcome: dec.outcome === "offer" ? "offer" : (dec.botLike ? "bot" : "safe"),
          reason: dec.reason || "", ttclid: ttL, ref: refHost
        };
        recordCampAccess(entryL);
        fetchIpIntel(ipL).then(function (d) {
          if (d && d.countryCode) { entryL.cc = String(d.countryCode).toUpperCase(); saveCampLog(); }
        });
      } catch (eLog) {}
    })();
    if (dec.outcome === "safe") {
      recordCampEvent(camp.id, dec.botLike ? "bots" : "safe");
      var safeUrl = camp.safe.url || "/compra";
      if (camp.safe.method === "redirect" || camp.safe.method === "unpack" || camp.safe.method === "mirror") {
        if (url.searchParams) {
          ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ttclid"].forEach(function(p) {
            var v = url.searchParams.get(p);
            if (v) safeUrl = safeUrl + (safeUrl.indexOf("?") !== -1 ? "&" : "?") + p + "=" + encodeURIComponent(v);
          });
        }
        if (camp.safe.method === "redirect") {
          res.writeHead(302, { Location: safeUrl, "Cache-Control": "no-store" });
          return res.end();
        } else {
          return proxyHtml(res, safeUrl, req, safeUrl);
        }
      }
    } else {
      recordCampEvent(camp.id, "offer");
      if (camp.offer.method === "internal") {
        return serveInternalStore(res, camp.entryStore, pathname, req);
      } else if (camp.offer.method === "redirect") {
        res.writeHead(302, { Location: dec.offerUrl, "Cache-Control": "no-store" });
        return res.end();
      } else {
        return proxyHtml(res, dec.offerUrl, req, dec.offerUrl);
      }
    }
  }

  /* ---------- Cloaker Pro: resolver campanha (público, sem auth) ---------- */
  if (req.method === "GET" && pathname === "/api/campaigns/resolve") {
    var qSlug = String((url.searchParams && url.searchParams.get("q")) || "").trim();
    var cfg2 = loadCampaignsConfig();
    var found = null;
    for (var j = 0; j < (cfg2.campaigns || []).length; j++) {
      var c2 = cfg2.campaigns[j];
      if (c2.enabled && String(c2.slug || "").toLowerCase() === qSlug.toLowerCase()) {
        found = {
          id: c2.id,
          slug: c2.slug,
          enabled: c2.enabled,
          safe: c2.safe,
          offer: c2.offer,
          targeting: c2.targeting,
          filters: c2.filters,
          tokenEnabled: c2.tokenEnabled,
          entryStore: c2.entryStore
        };
        break;
      }
    }
    return sendJson(res, 200, { ok: true, campaign: found });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.on("error", function (err) {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      "Porta " + PORT + " já está em uso.\n" +
        "Feche o processo antigo com:\n" +
        "  fuser -k " + PORT + "/tcp\n" +
        "Depois rode de novo: node server.js"
    );
    process.exit(1);
  }
  throw err;
});

try {
  server.requestTimeout = 0;
  server.headersTimeout = 300000;
  server.timeout = 0;
} catch (eTo) {}

server.listen(PORT, "0.0.0.0", function () {
  var os = require("os");
  var nets = os.networkInterfaces();
  var lan = [];
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === "IPv4" && !net.internal) lan.push(net.address);
    });
  });
  console.log("PC:      http://localhost:" + PORT);
  lan.forEach(function (ip) {
    console.log("Celular: http://" + ip + ":" + PORT);
  });
  if (!lan.length) {
    console.log("(mesmo Wi-Fi do PC — use o IP do computador na porta " + PORT + ")");
  }
  /* puxa saldo real logo ao subir — evita 1º load do admin cair em estimado */
  function warmPixzyAccount() {
    fetchPixzyAccount()
      .then(function (a) {
        if (a && !a.estimated && a.balance != null) {
          console.log("[pixzy] saldo real: " + a.balance + " (" + (a.name || "") + ")");
        } else {
          console.log("[pixzy] saldo ainda estimado / indisponível");
        }
      })
      .catch(function () {});
  }
  setTimeout(warmPixzyAccount, 4000);
  setInterval(warmPixzyAccount, 2 * 60 * 1000);

  if (PUBLIC_BASE) {
    console.log("Webhook Pixzy: " + PUBLIC_BASE + "/api/pixzy-webhook?key=" + WEBHOOK_SECRET);
    console.log("Webhook PurinCash: " + PUBLIC_BASE + "/api/purincash-webhook?key=" + WEBHOOK_SECRET);
    console.log("Webhook Sharpify: " + PUBLIC_BASE + "/api/sharpify-webhook?key=" + WEBHOOK_SECRET);
    console.log("Webhook BlackCat: " + PUBLIC_BASE + "/api/blackcat-webhook?key=" + WEBHOOK_SECRET);
    console.log("Webhook Iron Pay: " + PUBLIC_BASE + "/api/ironpay-webhook?key=" + WEBHOOK_SECRET);
    console.log("Webhook BuckPay: " + PUBLIC_BASE + "/api/buckpay-webhook?key=" + WEBHOOK_SECRET);
    var gwLabel = "Pixzy";
    if (paymentUsesSharpify()) gwLabel = "Sharpify (api.sharpify.com.br)";
    else if (paymentUsesPurincash()) gwLabel = "PurinCash (api.purincash.com)";
    else if (paymentUsesBlackcat()) gwLabel = "BlackCat (api.blackcatoficial.com)";
    else if (paymentUsesIronPay()) gwLabel = "Iron Pay (api.ironpayapp.com.br)";
    else if (paymentUsesBuckPay()) gwLabel = "BuckPay (api.realtechdev.com.br)";
    console.log(
      "Gateway PIX: " +
        gwLabel +
        (paymentUsesSharpify() && (!SHARPIFY_CLIENT_ID || !SHARPIFY_CLIENT_SECRET)
          ? " — defina SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET no Render"
          : paymentUsesPurincash() && !PURINCASH_API_KEY
          ? " — defina PURINCASH_API_KEY no Render"
          : paymentUsesBlackcat() && !BLACKCAT_API_KEY
          ? " — defina BLACKCAT_API_KEY no Render"
          : paymentUsesIronPay() && !IRONPAY_API_TOKEN
            ? " — defina IRONPAY_API_TOKEN no Render"
            : paymentUsesBuckPay() && !BUCKPAY_API_KEY
              ? " — defina BUCKPAY_API_KEY no Render"
              : "")
    );
    /* keep-alive: pinga a própria URL pública a cada 5 min — o Render free
       hiberna após ~15 min sem tráfego, então isso o mantém acordado 24h */
    var pingMod = PUBLIC_BASE.startsWith("https") ? https : http;
    var keepAlivePing = function () {
      pingMod.get(PUBLIC_BASE + "/api/health", function (r) {
        r.resume(); /* descarta o body */
        console.log("[keep-alive] ping ok — " + new Date().toLocaleTimeString("pt-BR"));
      }).on("error", function (e) {
        console.log("[keep-alive] ping falhou: " + e.message);
      });
    };
    setTimeout(keepAlivePing, 30 * 1000); /* primeiro ping logo após subir */
    setInterval(keepAlivePing, KEEP_ALIVE_MS);
    console.log("Keep-alive: ping automático a cada 5 min ativado.");
  } else {
    console.log("Webhook: defina PUBLIC_BASE (ex.: https://seusite.com) para receber pagamentos automaticamente.");
  }
});
