const http = require("http");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const port = process.env.PORT || 3000;
const rootDir = __dirname;

function loadEnvFile() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  const fileKeys = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
      fileKeys.add(key);
      continue;
    }

    if (fileKeys.has(key)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const logPath = path.join(rootDir, "server.log");
const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS) || 15000;
const bailianBaseUrl =
  process.env.BAILIAN_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const bailianApiKey =
  process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY;
const bailianAgentId =
  process.env.BAILIAN_ID || process.env.BAILIAN_APP_ID || null;
const bailianModel = process.env.BAILIAN_MODEL || "qwen-plus";
const bailianTimeoutMs = Number(process.env.BAILIAN_TIMEOUT_MS) || 15000;
const bailianUseProxy =
  String(process.env.BAILIAN_USE_PROXY || "").toLowerCase() === "true";
const supabaseUrl = process.env.SUPABASE_URL || process.env.URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.ANON_KEY ||
  process.env.API;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseRestUrl = supabaseUrl
  ? new URL("/rest/v1/", supabaseUrl).toString()
  : null;

let supabaseClient = null;
let supabaseConfigLogged = false;

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, line);
  } catch (error) {
    console.error("Failed to write log:", error.message);
  }
}

function resolveSupabaseConfig() {
  const urlSource = process.env.SUPABASE_URL
    ? "SUPABASE_URL"
    : process.env.URL
      ? "URL"
      : "missing";
  const keySource = process.env.SUPABASE_ANON_KEY
    ? "SUPABASE_ANON_KEY"
    : process.env.SUPABASE_KEY
      ? "SUPABASE_KEY"
      : process.env.ANON_KEY
        ? "ANON_KEY"
        : process.env.API
          ? "API"
          : "missing";

  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    urlSource,
    keySource,
  };
}

function getSupabaseClient() {
  const { url, anonKey, urlSource, keySource } = resolveSupabaseConfig();
  if (!url || !anonKey) {
    if (!supabaseConfigLogged) {
      logLine(
        "Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.",
      );
      supabaseConfigLogged = true;
    }
    return null;
  }

  if (!supabaseConfigLogged) {
    logLine(`Supabase config: url=${urlSource} key=${keySource}`);
    if (urlSource !== "SUPABASE_URL" || keySource !== "SUPABASE_ANON_KEY") {
      logLine(
        "Supabase env fallback in use; prefer SUPABASE_URL/SUPABASE_ANON_KEY.",
      );
    }
    if (supabaseServiceKey) {
      logLine("Supabase service role key detected.");
    }
    supabaseConfigLogged = true;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(
      url,
      supabaseServiceKey || anonKey,
      {
        auth: { persistSession: false },
        global: { headers: { "X-Client-Info": "local-node-server" } },
      },
    );
  }

  return supabaseClient;
}

function sanitizeProxyUrl(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    if (url.username || url.password) {
      url.username = "****";
      url.password = "****";
    }
    return url.toString();
  } catch {
    return "[invalid proxy url]";
  }
}

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
let proxyAgent = null;
if (proxyUrl) {
  try {
    const { ProxyAgent } = require("undici");
    proxyAgent = new ProxyAgent(proxyUrl);
    logLine(`Proxy configured: ${sanitizeProxyUrl(proxyUrl)}`);
  } catch (error) {
    logLine(`Proxy setup skipped: ${error.message}`);
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(text);
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendText(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleSupabaseStatus(req, res) {
  if (req.method !== "GET") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  const { url, anonKey } = resolveSupabaseConfig();
  if (!url || !anonKey || !supabaseRestUrl) {
    sendJson(res, 500, {
      error: "Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    });
    return;
  }

  let response;
  try {
    response = await fetch(supabaseRestUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
  } catch (error) {
    logLine(`Supabase health check failed: ${error.message}`);
    sendJson(res, 502, { error: "Failed to reach Supabase." });
    return;
  }

  if (!response.ok) {
    logLine(`Supabase health status=${response.status}`);
    sendJson(res, 502, { error: `Supabase returned ${response.status}.` });
    return;
  }

  sendJson(res, 200, { status: "ok" });
}

async function handleAgent(req, res) {
  logLine("Agent request received.");
  if (req.method !== "POST") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  if (!bailianApiKey) {
    logLine("Missing BAILIAN_API_KEY or DASHSCOPE_API_KEY.");
    sendJson(res, 500, { error: "Missing BAILIAN_API_KEY." });
    return;
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    logLine(`Invalid JSON payload: ${error.message}`);
    sendJson(res, 400, { error: "Invalid JSON payload." });
    return;
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    logLine("Empty text received.");
    sendJson(res, 400, { error: "Text is required." });
    return;
  }

  const body = {
    model: bailianModel,
    messages: [{ role: "user", content: text }],
  };

  if (bailianAgentId) {
    body.app_id = bailianAgentId;
  }

  const baseRequest = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bailianApiKey}`,
    },
    body: JSON.stringify(body),
  };

  async function attemptFetch(dispatcher, label) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), bailianTimeoutMs);
    try {
      const response = await fetch(bailianBaseUrl, {
        ...baseRequest,
        dispatcher,
        signal: controller.signal,
      });
      if (label) {
        logLine(`Bailian request via ${label}.`);
      }
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let agentResponse;
  try {
    if (bailianUseProxy && proxyAgent) {
      agentResponse = await attemptFetch(proxyAgent, "proxy");
    } else {
      try {
        agentResponse = await attemptFetch(undefined, "direct");
      } catch (error) {
        if (proxyAgent) {
          logLine(`Bailian direct failed: ${error.message}`);
          agentResponse = await attemptFetch(proxyAgent, "proxy");
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    const reason =
      error && error.name === "AbortError"
        ? "Agent request timed out."
        : "Failed to reach Bailian.";
    logLine(`Bailian request failed: ${error.message}`);
    sendJson(res, 502, { error: reason });
    return;
  }

  const agentPayload = await agentResponse.json().catch(() => ({}));
  if (!agentResponse.ok) {
    const message =
      agentPayload.error?.message || "Bailian request failed.";
    logLine(
      `Bailian error status=${agentResponse.status} message=${message}`,
    );
    sendJson(res, 502, { error: message });
    return;
  }

  const suggestion =
    agentPayload.choices?.[0]?.message?.content?.trim() || "";
  logLine(`Bailian success. Suggestion length=${suggestion.length}.`);
  sendJson(res, 200, { suggestion });
}

async function handleSuggest(req, res) {
  logLine("Suggest request received.");
  if (req.method !== "POST") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logLine("Missing OPENAI_API_KEY.");
    sendJson(res, 500, { error: "Missing OPENAI_API_KEY." });
    return;
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    logLine(`Invalid JSON payload: ${error.message}`);
    sendJson(res, 400, { error: "Invalid JSON payload." });
    return;
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    logLine("Empty text received.");
    sendJson(res, 400, { error: "Text is required." });
    return;
  }
  logLine(`Suggest payload length=${text.length}.`);

  const systemPrompt =
    "You are a reading companion. Given the user's input, provide three short reading suggestions.";

  let openaiResponse;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), openaiTimeoutMs);
  try {
    const requestUrl = new URL("/v1/chat/completions", openaiBaseUrl).toString();
    openaiResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      dispatcher: proxyAgent || undefined,
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });
  } catch (error) {
    const reason =
      error && error.name === "AbortError"
        ? "OpenAI request timed out."
        : "Failed to reach OpenAI.";
    logLine(`OpenAI request failed: ${error.message}`);
    sendJson(res, 502, { error: reason });
    return;
  } finally {
    clearTimeout(timeoutId);
  }

  const openaiPayload = await openaiResponse.json().catch(() => ({}));
  if (!openaiResponse.ok) {
    const message =
      openaiPayload.error?.message || "OpenAI request failed.";
    logLine(`OpenAI error status=${openaiResponse.status} message=${message}`);
    sendJson(res, 502, { error: message });
    return;
  }

  const suggestion =
    openaiPayload.choices?.[0]?.message?.content?.trim() || "";
  logLine(`OpenAI success. Suggestion length=${suggestion.length}.`);
  sendJson(res, 200, { suggestion });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }
  if (url.pathname === "/api/supabase/status") {
    await handleSupabaseStatus(req, res);
    return;
  }
  if (url.pathname === "/api/agent") {
    await handleAgent(req, res);
    return;
  }
  if (url.pathname === "/api/suggest") {
    await handleSuggest(req, res);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  logLine(`Server running at http://localhost:${port}`);
  logLine(`OpenAI base URL: ${openaiBaseUrl}`);
  logLine(`OpenAI timeout: ${openaiTimeoutMs}ms`);
  logLine(`Bailian base URL: ${bailianBaseUrl}`);
  logLine(`Bailian model: ${bailianModel}`);
  if (proxyAgent && proxyUrl) {
    logLine(`Proxy dispatcher ready: ${sanitizeProxyUrl(proxyUrl)}`);
  }
  logLine(`Bailian proxy enabled: ${bailianUseProxy}`);
  if (bailianAgentId) {
    logLine("Bailian app_id is set.");
  }
});
