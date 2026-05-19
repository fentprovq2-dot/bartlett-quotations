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

function proxyImage(imgUrl, depth) {
  if (depth > 4) return Promise.reject(new Error("massa redireccions"));
  return new Promise((resolve, reject) => {
    if (imgCache[imgUrl]) return resolve(imgCache[imgUrl]);
    const parsed = new URL(imgUrl);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ""),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer":    "https://en.wikipedia.org/wiki/Main_Page",
        "Accept":     "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      }
    };
    const req = https.get(opts, res => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const loc = res.headers.location;
        const next = loc.startsWith("http") ? loc : `https://${parsed.hostname}${loc}`;
        res.resume();
        return proxyImage(next, (depth||0) + 1).then(resolve).catch(reject);
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
        imgCache[imgUrl] = { buf, ct };
        resolve(imgCache[imgUrl]);
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

  // Proxy imatges
  if (req.method === "GET" && pathname === "/img") {
    const imgUrl = qs.get("u");
    if (!imgUrl || !imgUrl.startsWith("https://upload.wikimedia.org/")) {
      res.writeHead(400); res.end("URL invàlida"); return;
    }
    proxyImage(imgUrl, 0)
      .then(({ buf, ct }) => {
        res.writeHead(200, { "Content-Type": ct, "Cache-Control": "public, max-age=604800" });
        res.end(buf);
      })
      .catch(err => {
        console.error("Img error:", err.message, imgUrl);
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
