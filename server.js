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

const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

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
          "x-api-key":
