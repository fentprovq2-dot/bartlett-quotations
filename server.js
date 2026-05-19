const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

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

const HTML = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
const imgCache = {};

// Wikimedia Special:Redirect és l'endpoint oficial per a imatges externes
// Format: https://en.wikipedia.org/wiki/Special:Redirect/file/NOM_FITXER?width=250
function proxyImage(filename, width, depth) {
  depth = depth || 0;
  if (depth > 5) return Promise.reject(new Error("massa redireccions"));
  const key = filename + "@" + width;
  if (imgCache[key]) return Promise.resolve(imgCache[key]);

  return new Promise((resolve, reject) => {
    const w = width || 250;
    const urlPath = "/wiki/Special:Redirect/file/" + encodeURIComponent(filename) + "?width=" + w;
    const opts = {
      hostname: "en.wikipedia.org",
      path: urlPath,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      }
    };

    const req = https.get(opts, res => {
      // Special:Redirect retorna una redirecció cap a la imatge real
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        // Segueix la redirecció cap a upload.wikimedia.org
        const loc = res.headers.location;
        const finalUrl = loc.startsWith("http") ? new URL(loc) : new URL("https://en.wikipedia.org" + loc);
        const finalOpts = {
          hostname: finalUrl.hostname,
          path: finalUrl.pathname + finalUrl.search,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://en.wikipedia.org/",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          }
        };
        https.get(finalOpts, imgRes => {
          if (imgRes.statusCode !== 200) {
            imgRes.resume();
            return reject(new Error("HTTP " + imgRes.statusCode + " en " + finalUrl.href));
          }
          const chunks = [];
          imgRes.on("data", c => chunks.push(c));
          imgRes.on("end", () => {
            const buf = Buffer.concat(chunks);
            const ct  = imgRes.headers["content-type"] || "image/jpeg";
            imgCache[key] = { buf, ct };
            resolve(imgCache[key]);
          });
        }).on("error", reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const ct  = res.headers["content-type"] || "image/jpeg";
        imgCache[key] = { buf, ct };
        resolve(imgCache[key]);
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

const server = http.createServer((req, res) => {
  const qmark    = req.url.indexOf("?");
  const pathname = qmark >= 0 ? req.url.slice(0, qmark) : req.url;
  const qs       = qmark >= 0 ? new URLSearchParams(req.url.slice(qmark + 1)) : new URLSearchParams();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Proxy imatges: /img?f=NomFitxer&w=250
  if (req.method === "GET" && pathname === "/img") {
    const filename = qs.get("f");
    const width    = parseInt(qs.get("w") || "250", 10);
    if (!filename) { res.writeHead(400); res.end("Falta el paràmetre f"); return; }
    proxyImage(filename, width)
      .then(({ buf, ct }) => {
        res.writeHead(200, { "Content-Type": ct, "Cache-Control": "public, max-age=604800" });
        res.end(buf);
      })
      .catch(err => {
        console.error("Img error:", filename, err.message);
        res.writeHead(404); res.end("Imatge no trobada: " + err.message);
      });
    return;
  }

  // Proxy Anthropic
  if (req.method === "POST" && pathname === "/api/claude") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch(e) { res.writeHead(400); res.end("JSON invàlid"); return; }
      const postData = Buffer.from(JSON.stringify(payload));
      const pr = https.request({
        hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
        headers: {
          "Content-Type": "application/json", "Content-Length": postData.length,
          "x-api-key": API_KEY, "anthropic-version": "2023-06-01",
        }
      }, pres => {
        let data = "";
        pres.on("data", c => { data += c; });
        pres.on("end", () => { res.writeHead(pres.statusCode, { "Content-Type": "application/json" }); res.end(data); });
      });
      pr.on("error", err => { res.writeHead(502); res.end(JSON.stringify({ error: { message: err.message } })); });
      pr.write(postData); pr.end();
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(PORT, () => console.log(`✅  Bartlett disponible a http://localhost:${PORT}`));
