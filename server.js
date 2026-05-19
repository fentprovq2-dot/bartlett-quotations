/**
 * Bartlett Quotations — Servidor proxy per a l'API d'Anthropic
 * ─────────────────────────────────────────────────────────────
 * Instal·lació:
 *   npm install
 *
 * Configuració:
 *   Crea un fitxer .env amb:  ANTHROPIC_API_KEY=sk-ant-...
 *
 * Execució:
 *   node server.js
 *   (o amb PM2: pm2 start server.js --name bartlett)
 *
 * Accés:
 *   http://el-teu-servidor:3131
 */

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const url   = require("url");

// ── Carrega la clau API des de .env o variable d'entorn ───────────────────
function loadEnv() {
  try {
    const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    env.split("\n").forEach(line => {
      const [k, ...v] = line.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim();
    });
  } catch (e) {}
}
loadEnv();

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PORT    = parseInt(process.env.PORT || "3131", 10);

if (!API_KEY) {
  console.error("⚠️  Cal definir ANTHROPIC_API_KEY al fitxer .env o com a variable d'entorn.");
  process.exit(1);
}

// ── MIME types ────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
};

// ── Servidor HTTP ─────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS per a desenvolupament local
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Ruta proxy → Anthropic API ─────────────────────────────────────────
  if (req.method === "POST" && parsed.pathname === "/api/claude") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch (e) { res.writeHead(400); res.end("JSON invàlid"); return; }

      const postData = Buffer.from(JSON.stringify(payload));
      const options = {
        hostname: "api.anthropic.com",
        path:     "/v1/messages",
        method:   "POST",
        headers: {
          "Content-Type":      "application/json",
          "Content-Length":    postData.length,
          "x-api-key":         API_KEY,
          "anthropic-version": "2023-06-01",
        }
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = "";
        proxyRes.on("data", chunk => { data += chunk; });
        proxyRes.on("end", () => {
          res.writeHead(proxyRes.statusCode, { "Content-Type": "application/json" });
          res.end(data);
        });
      });

      proxyReq.on("error", err => {
        console.error("Error de proxy:", err.message);
        res.writeHead(502);
        res.end(JSON.stringify({ error: { message: err.message } }));
      });

      proxyReq.write(postData);
      proxyReq.end();
    });
    return;
  }

  // ── Fitxers estàtics ────────────────────────────────────────────────────
  let filePath = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  filePath = path.join(__dirname, "public", filePath);

  // Evita path traversal
  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    res.writeHead(403); res.end("Prohibit"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("No trobat: " + parsed.pathname);
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`✅  Bartlett Quotations disponible a http://localhost:${PORT}`);
  console.log(`    Proxy API actiu a http://localhost:${PORT}/api/claude`);
});
