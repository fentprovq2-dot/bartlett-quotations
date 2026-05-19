const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

// Carrega .env si existeix (desenvolupament local)
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8")
    .split("\n").forEach(line => {
      const [k, ...v] = line.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim();
    });
} catch(e) {}

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PORT    = parseInt(process.env.PORT || "3131", 10);

if (!API_KEY) {
  console.error("⚠️  Cal definir ANTHROPIC_API_KEY");
  process.exit(1);
}

// HTML incrustat directament — no cal carpeta public/
const HTML = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Proxy → Anthropic
  if (req.method === "POST" && pathname === "/api/claude") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch(e) { res.writeHead(400); res.end("JSON invàlid"); return; }

      const postData = Buffer.from(JSON.stringify(payload));
      const opts = {
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
      const pr = https.request(opts, pres => {
        let data = "";
        pres.on("data", c => { data += c; });
        pres.on("end", () => {
          res.writeHead(pres.statusCode, { "Content-Type": "application/json" });
          res.end(data);
        });
      });
      pr.on("error", err => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: { message: err.message } }));
      });
      pr.write(postData);
      pr.end();
    });
    return;
  }

  // Serveix index.html per a qualsevol altra ruta GET
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`✅  Bartlett disponible a http://localhost:${PORT}`);
});
