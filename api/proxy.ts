export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, *",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const targetParam = url.searchParams.get("url");
  if (!targetParam) {
    return new Response("Missing url", { status: 400, headers: corsHeaders });
  }

  const targetUrl = decodeURIComponent(targetParam);
  if (
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    return new Response("Invalid URL", { status: 400, headers: corsHeaders });
  }

  const parsedTarget = new URL(targetUrl);

  const upstreamHeaders: Record<string, string> = {
    // Simular Smart TV para evitar bloqueos del servidor IPTV
    "User-Agent":
      "Mozilla/5.0 (SMART-TV; Linux armv7l) AppleWebKit/538.1 (KHTML, like Gecko) Version/8.0 Safari/538.1",
    Accept: "*/*",
    // FIX: No pedir gzip/deflate — algunos servidores IPTV responden
    // con cuerpo corrupto si se negocia compresión en segmentos de video.
    "Accept-Encoding": "identity",
    Referer: parsedTarget.origin + "/",
    Origin: parsedTarget.origin,
  };

  // Reenviar el header Range para soporte de seeking en VOD
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

  try {
    const response = await fetch(targetUrl, { headers: upstreamHeaders });

    // ── Detectar si es un manifiesto M3U8 ──────────────────────
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const isM3U8 =
      contentType.includes("mpegurl") ||
      targetUrl.toLowerCase().includes(".m3u8");

    if (isM3U8) {
      const text = await response.text();

      // FIX: Si el servidor devuelve algo que no es M3U8 válido
      // (p.ej. bloqueo de IP, error del servidor), loguear el contenido
      // real y devolver 502 con el mensaje para poder diagnosticarlo.
      if (!text.includes("#EXTM3U") && !text.includes("#EXT-X-")) {
        const preview = text.substring(0, 500);
        console.error(
          `[proxy] M3U8 inválido desde ${targetUrl} (HTTP ${response.status}): ${preview}`,
        );
        return new Response(
          JSON.stringify({
            error: "El servidor IPTV no devolvió un M3U8 válido",
            upstream_status: response.status,
            upstream_preview: preview,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // Reescribir URLs relativas de segmentos para que pasen por el proxy
      const parsedBase = new URL(targetUrl);
      const baseUrl =
        targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          // Dejar comentarios y líneas vacías tal cual
          if (trimmed.startsWith("#") || trimmed === "") return line;

          let absoluteUrl: string;
          if (
            trimmed.startsWith("http://") ||
            trimmed.startsWith("https://")
          ) {
            absoluteUrl = trimmed;
          } else if (trimmed.startsWith("/")) {
            absoluteUrl =
              parsedBase.protocol + "//" + parsedBase.host + trimmed;
          } else {
            absoluteUrl = baseUrl + trimmed;
          }

          return "/api/proxy?url=" + encodeURIComponent(absoluteUrl);
        })
        .join("\n");

      return new Response(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store",
          ...corsHeaders,
        },
      });
    }

    // ── Segmentos de video, imágenes y archivos VOD ────────────

    // FIX PRINCIPAL: Usar el Content-Type real del servidor upstream.
    // Antes se forzaba "video/mp2t" para todo, lo que rompía MP4/MKV
    // en TV porque el browser no sabía cómo reproducirlos.
    let finalContentType = contentType;

    // Solo corregir si el servidor devuelve un Content-Type genérico
    // pero sabemos por la URL que es un tipo de video concreto.
    if (
      finalContentType === "application/octet-stream" ||
      finalContentType === ""
    ) {
      const urlLower = targetUrl.toLowerCase();
      if (urlLower.includes(".ts") || urlLower.includes("/live/")) {
        finalContentType = "video/mp2t";
      } else if (urlLower.includes(".mp4")) {
        finalContentType = "video/mp4";
      } else if (urlLower.includes(".mkv")) {
        finalContentType = "video/x-matroska";
      } else if (urlLower.includes(".avi")) {
        finalContentType = "video/x-msvideo";
      } else if (urlLower.includes(".m4v")) {
        finalContentType = "video/mp4";
      }
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": finalContentType,
      "Cache-Control": "no-cache",
      ...corsHeaders,
    };

    // Reenviar headers de rango para seeking en películas/series
    const cl = response.headers.get("content-length");
    const cr = response.headers.get("content-range");
    if (cl) responseHeaders["Content-Length"] = cl;
    if (cr) responseHeaders["Content-Range"] = cr;
    responseHeaders["Accept-Ranges"] = "bytes";

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[proxy] Error al contactar servidor upstream:", error);
    return new Response(
      JSON.stringify({ error: "Proxy error: " + String(error) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}
