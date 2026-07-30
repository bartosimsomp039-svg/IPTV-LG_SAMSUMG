import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

// ── helpers ──────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ── /api/xtream ───────────────────────────────────────────────────────────────

async function handleXtream(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  let targetUrl: string | null = null;

  if (req.method === "POST") {
    const raw = await readBody(req);
    try {
      targetUrl = JSON.parse(raw)?.url ?? null;
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
      return;
    }
  } else {
    const qs = new URL(req.url ?? "", "http://localhost").searchParams;
    const p = qs.get("url");
    targetUrl = p ? decodeURIComponent(p) : null;
  }

  if (!targetUrl) { json(res, 400, { error: "Missing url" }); return; }
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    json(res, 400, { error: "Invalid URL" });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (SMART-TV; Linux armv7l) AppleWebKit/538.1 (KHTML, like Gecko) Version/8.0 Safari/538.1",
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(12000),
    });

    const text = (await upstream.text()).trim();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text.replace(/^\uFEFF/, "")) : null;
    } catch {
      const lower = text.toLowerCase();
      const isAuth =
        lower.includes("invalid auth") ||
        lower.includes("invalid credential") ||
        lower.includes("unauthorized");
      json(res, isAuth ? 401 : 502, {
        error: text || `Xtream server returned HTTP ${upstream.status}`,
      });
      return;
    }

    res.writeHead(upstream.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      ...CORS,
    });
    res.end(JSON.stringify(parsed));
  } catch (err) {
    json(res, 502, {
      error: "Proxy error: " + (err instanceof Error ? err.message : err),
    });
  }
}

// ── /api/proxy ────────────────────────────────────────────────────────────────

async function handleProxy(req: IncomingMessage, res: ServerResponse) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, *",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const qs = new URL(req.url ?? "", "http://localhost").searchParams;
  const targetParam = qs.get("url");
  if (!targetParam) {
    res.writeHead(400, corsHeaders);
    res.end("Missing url");
    return;
  }

  const targetUrl = decodeURIComponent(targetParam);
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    res.writeHead(400, corsHeaders);
    res.end("Invalid URL");
    return;
  }

  const parsedTarget = new URL(targetUrl);
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (SMART-TV) AppleWebKit/538.1",
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Referer: parsedTarget.origin + "/",
    Origin: parsedTarget.origin,
  };
  const range = req.headers["range"];
  if (range) upstreamHeaders["Range"] = range;

  try {
    const upstream = await fetch(targetUrl, { headers: upstreamHeaders });
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const isM3U8 =
      contentType.includes("mpegurl") ||
      targetUrl.toLowerCase().includes(".m3u8");

    if (isM3U8) {
      const text = await upstream.text();
      if (!text.includes("#EXTM3U") && !text.includes("#EXT-X-")) {
        res.writeHead(502, corsHeaders);
        res.end("Invalid M3U8: " + text.substring(0, 200));
        return;
      }

      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
      const parsedBase = new URL(targetUrl);

      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("#") || trimmed === "") return line;
          let abs: string;
          if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            abs = trimmed;
          } else if (trimmed.startsWith("/")) {
            abs = parsedBase.protocol + "//" + parsedBase.host + trimmed;
          } else {
            abs = baseUrl + trimmed;
          }
          return "/api/proxy?url=" + encodeURIComponent(abs);
        })
        .join("\n");

      res.writeHead(200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache, no-store",
        ...corsHeaders,
      });
      res.end(rewritten);
      return;
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType.includes("image") ? contentType : "video/mp2t",
      "Cache-Control": "no-cache",
      ...corsHeaders,
    };
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    if (cl) responseHeaders["Content-Length"] = cl;
    if (cr) responseHeaders["Content-Range"] = cr;
    responseHeaders["Accept-Ranges"] = "bytes";

    res.writeHead(upstream.status, responseHeaders);
    // stream the body
    const reader = upstream.body?.getReader();
    if (!reader) { res.end(); return; }
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      pump();
    };
    pump();
  } catch (err) {
    res.writeHead(502, corsHeaders);
    res.end("Proxy error: " + err);
  }
}

// ── Vite config ───────────────────────────────────────────────────────────────

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  plugins: [
    {
      name: "local-api",
      configureServer(server) {
        server.middlewares.use("/api/xtream", (req, res) =>
          handleXtream(req, res)
        );
        server.middlewares.use("/api/proxy", (req, res) =>
          handleProxy(req, res)
        );
      },
    },
  ],
});