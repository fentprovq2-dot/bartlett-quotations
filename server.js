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

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: headers || {}
    };
    const req = https.get(opts, res => {
      resolve(res);
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function proxyImage(filename, width) {
  const key = filename + "@" + width;
  if (imgCache[key]) return imgCache[key];

  const hdrs = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
  };

  // Pas 1: demanar Special:Redirect per obtenir la URL real
  const redirectUrl = "https://en.wikipedia.org/wiki/Special:Redirect/file/" +
    encodeURIComponent(filename) + "?width=" + (width || 250);

  let res = await httpsGet(redirectUrl, hdrs);

  // Seguir redireccions (pot haver-n'hi diverses)
  let hops = 0;
  while ((res.statusCode === 301 || res.statusCode === 302 ||
          res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308)
         && res.headers.location && hops < 5) {
    res.resume(); // descartar body
    let loc = res.headers.location;
    // Correcció: si la redirecció és protocol-relative (//upload...) o relativa
    if (loc.startsWith("//")) {
      loc = "https:" + loc;
    } else if (loc.startsWith("/")) {
      loc = "https://en.wikipedia.org" + loc;
    }
    res = await httpsGet(loc, { ...hdrs, "Referer": "https://en.wikipedia.org/" });
    hops++;
  }

  if (res.statusCode !== 200) {
    res.resume();
    throw new Error("HTTP " + res.statusCode);
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    res.on("data", c => chunks.push(c));
    res.on("end", resolve);
    res.on("error", reject);
  });

  const buf = Buffer.concat(chunks);
  const ct  = res.headers["content-type"] || "image/jpeg";
  imgCache[key] = { buf, ct };
  return imgCache[key];
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

      // Assegurar model vàlid
      payload.model = "claude-sonnet-4-5";

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
        pres.on("end", () => {
          res.writeHead(pres.statusCode, { "Content-Type": "application/json" });
          res.end(data);
        });
      });
      pr.on("error", err => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: { message: err.message } }));
      });
      pr.write(postData); pr.end();
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(PORT, () => console.log(`✅  Bartlett disponible a http://localhost:${PORT}`));
