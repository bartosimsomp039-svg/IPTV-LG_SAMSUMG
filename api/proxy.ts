// ─────────────────────────────────────────────────────────────
//  IMPORTANTE: Este archivo usa Node.js Runtime (NO Edge Runtime).
//
//  Razón: Edge Runtime de Vercel solo permite conexiones salientes
//  a los puertos 80 y 443. Los servidores IPTV suelen usar puertos
//  no estándar (8080, 8880, 25461, etc.) → Edge devuelve 502.
//  Node.js Runtime no tiene esa restricción.
//
//  NO agregar: export const config = { runtime: "edge" }
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export const config = {
  // Sin límite de duración para poder hacer streaming de segmentos de video.
  // Vercel Pro/Enterprise permite hasta 300 s; en el plan Hobby el máximo es 60 s.
  maxDuration: 60,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, *",
  "Access-Control-Expose-Headers":
    "Content-Range, Content-Length, Accept-Ranges",
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ── Validar parámetro url ──────────────────────────────────
  const rawParam = req.query["url"];
  const targetParam = Array.isArray(rawParam) ? rawParam[0] : rawParam ?? "";

  if (!targetParam) {
    res.writeHead(400, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: "Missing url parameter" }));
    return;
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(targetParam);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: "Malformed url parameter" }));
    return;
  }

  if (
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    res.writeHead(400, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: "Only http/https URLs are allowed" }));
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: "Invalid URL" }));
    return;
  }

  // ── Construir headers para el servidor upstream ────────────
  const upstreamHeaders: Record<string, string> = {
    // Simular Smart TV: algunos servidores IPTV bloquean user agents de bots
    "User-Agent":
      "Mozilla/5.0 (SMART-TV; Linux armv7l) AppleWebKit/538.1 (KHTML, like Gecko) Version/8.0 Safari/538.1",
    Accept: "*/*",
    // No pedir compresión: evita cuerpos corruptos en segmentos de video
    "Accept-Encoding": "identity",
    Referer: parsed.origin + "/",
    Origin: parsed.origin,
  };

  // Reenviar Range para soporte de seeking en películas/series
  if (req.headers["range"]) {
    upstreamHeaders["Range"] = req.headers["range"] as string;
  }

  // ── Hacer la petición al servidor upstream (Node.js http/https) ─
  // Usamos http/https nativos de Node.js en lugar de fetch() para
  // poder hacer streaming real sin acumular todo el body en memoria.
  await new Promise<void>((resolve) => {
    const requester = targetUrl.startsWith("https://")
      ? httpsRequest
      : httpRequest;

    const upstreamReq = requester(
      targetUrl,
      { headers: upstreamHeaders, method: "GET" },
      (upstreamRes) => {
        const contentType =
          upstreamRes.headers["content-type"] ?? "application/octet-stream";
        const isM3U8 =
          contentType.includes("mpegurl") ||
          targetUrl.toLowerCase().includes(".m3u8");

        if (isM3U8) {
          // ── Manifiesto M3U8: leer completo y reescribir URLs ──
          const chunks: Buffer[] = [];
          upstreamRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");

            // Si el servidor devuelve algo que no es M3U8 válido,
            // reportar el contenido real para poder diagnosticarlo.
            if (
              !text.includes("#EXTM3U") &&
              !text.includes("#EXT-X-")
            ) {
              const preview = text.substring(0, 500);
              console.error(
                `[proxy] M3U8 inválido desde ${targetUrl}` +
                  ` (HTTP ${upstreamRes.statusCode}): ${preview}`,
              );
              res.writeHead(502, {
                "Content-Type": "application/json",
                ...CORS,
              });
              res.end(
                JSON.stringify({
                  error: "El servidor IPTV no devolvió un M3U8 válido",
                  upstream_status: upstreamRes.statusCode,
                  upstream_preview: preview,
                }),
              );
              resolve();
              return;
            }

            // Reescribir URLs de segmentos para que pasen por este proxy
            const baseUrl =
              targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

            const rewritten = text
              .split("\n")
              .map((line) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("#") || trimmed === "") return line;

                let absoluteUrl: string;
                if (
                  trimmed.startsWith("http://") ||
                  trimmed.startsWith("https://")
                ) {
                  absoluteUrl = trimmed;
                } else if (trimmed.startsWith("/")) {
                  absoluteUrl =
                    parsed.protocol + "//" + parsed.host + trimmed;
                } else {
                  absoluteUrl = baseUrl + trimmed;
                }

                return "/api/proxy?url=" + encodeURIComponent(absoluteUrl);
              })
              .join("\n");

            res.writeHead(200, {
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-cache, no-store",
              ...CORS,
            });
            res.end(rewritten);
            resolve();
          });
          return;
        }

        // ── Segmentos, imágenes y archivos VOD: streaming directo ─
        // FIX: Usar el Content-Type real del servidor.
        // Antes se forzaba "video/mp2t" para todo, rompiendo MP4/MKV en TV.
        let finalContentType = contentType;

        // Solo corregir si el servidor devuelve un tipo genérico
        if (
          finalContentType === "application/octet-stream" ||
          finalContentType === ""
        ) {
          const urlLower = targetUrl.toLowerCase();
          if (urlLower.includes(".ts") || urlLower.includes("/live/")) {
            finalContentType = "video/mp2t";
          } else if (urlLower.includes(".mp4") || urlLower.includes("/movie/")) {
            finalContentType = "video/mp4";
          } else if (urlLower.includes(".mkv")) {
            finalContentType = "video/x-matroska";
          } else if (urlLower.includes(".avi")) {
            finalContentType = "video/x-msvideo";
          } else if (urlLower.includes(".m4v")) {
            finalContentType = "video/mp4";
          } else if (urlLower.includes("/series/")) {
            finalContentType = "video/mp4";
          }
        }

        const responseHeaders: Record<string, string | string[]> = {
          "Content-Type": finalContentType,
          "Cache-Control": "no-cache",
          "Accept-Ranges": "bytes",
          ...CORS,
        };

        // Reenviar headers de rango para seeking en VOD
        if (upstreamRes.headers["content-length"]) {
          responseHeaders["Content-Length"] =
            upstreamRes.headers["content-length"];
        }
        if (upstreamRes.headers["content-range"]) {
          responseHeaders["Content-Range"] =
            upstreamRes.headers["content-range"];
        }

        // Streaming directo: no acumular en memoria
        res.writeHead(upstreamRes.statusCode ?? 200, responseHeaders);
        upstreamRes.pipe(res);
        upstreamRes.on("end", () => resolve());
        upstreamRes.on("error", () => resolve());
      },
    );

    upstreamReq.on("error", (err) => {
      console.error("[proxy] Error conectando a upstream:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json", ...CORS });
        res.end(
          JSON.stringify({
            error: "No se pudo conectar al servidor IPTV",
            detail: err.message,
          }),
        );
      }
      resolve();
    });

    upstreamReq.end();
  });
}
