﻿// Edge Runtime — NO cambiar a Node.js.
// Edge Runtime de Vercel SÍ puede conectarse a puertos no estándar
// como 8080 y 8880 que usan los servidores IPTV.
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
  // URLSearchParams.get() ya devuelve el valor decodificado. No aplicar
  // decodeURIComponent otra vez: puede romper tokens que contienen "%".
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response("Missing url", { status: 400, headers: corsHeaders });
  }

  if (
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    return new Response("Invalid URL", { status: 400, headers: corsHeaders });
  }

  const upstreamHeaders: Record<string, string> = {
    // Algunos proveedores bloquean el User-Agent de Smart TV cuando la
    // petición realmente llega desde un proxy de escritorio.
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    // No pedir compresión — evita cuerpos corruptos en segmentos de video
    "Accept-Encoding": "identity",
  };

  // Reenviar Range para soporte de seeking en películas/series
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

  try {
    const response = await fetch(targetUrl, {
    headers: upstreamHeaders,
    redirect: "follow",
    cache: "no-store",});

    if (!response.ok) {
    return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
    });
}

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const isM3U8 =
      contentType.includes("mpegurl") ||
      targetUrl.toLowerCase().includes(".m3u8");

    // ── Manifiesto M3U8: reescribir URLs de segmentos ─────────
    if (isM3U8) {
      const text = await response.text();

      console.log("=========== PLAYLIST ===========");
      console.log(text);
      console.log("================================");

      if (!text.includes("#EXTM3U") && !text.includes("#EXT-X-")) {
        // El servidor devolvió algo que no es un M3U8 válido.
        // Mostrar el contenido real para poder diagnosticarlo.
        return new Response(
          JSON.stringify({
            error: "El servidor IPTV no devolvió un M3U8 válido",
            upstream_status: response.status,
            upstream_preview: text.substring(0, 500),
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // FIX Samsung TV (file://): usar URLs absolutas en los segmentos.
      // Con URLs relativas (/api/proxy?url=...) el browser de TV las resuelve
      // contra file:// y quedan como file:///api/proxy?url=... → no cargan.
      // Con la URL absoluta (https://iptv-lg-samsumg.vercel.app/api/proxy?url=...)
      // funcionan desde cualquier origen (file://, https://, etc.).
      const proxyOrigin = new URL(request.url).origin;
      // Usar la URL final permite resolver correctamente playlists que fueron
      // redirigidas por el servidor IPTV.
      const baseUrl = new URL(response.url || targetUrl);
      const toProxyUrl = (value: string): string => {
        const absoluteUrl = new URL(value, baseUrl).toString();
        return `${proxyOrigin}/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      };

      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed === "") return line;

          try {
            // Segmentos y playlists hijas aparecen como líneas normales.
            if (!trimmed.startsWith("#")) {
              return toProxyUrl(trimmed);
            }

            // También hay recursos HLS dentro de atributos URI="...":
            // claves AES, mapas fMP4 y pistas de audio alternativas.
            return line.replace(
              /URI="([^"]+)"/g,
              (_match, uri: string) => `URI="${toProxyUrl(uri)}"`,
            );
          } catch {
            return line;
          }
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

    // ── Segmentos, imágenes y archivos VOD ────────────────────
    //
    // FIX: Usar el Content-Type real del servidor upstream.
    // La versión original forzaba "video/mp2t" para TODO el contenido
    // no-imagen, lo que rompía MP4/MKV en TV (el browser no sabía
    // que era un MP4 y no lo reproducía correctamente).
    let finalContentType = contentType;

    // Solo corregir si el servidor devuelve un tipo genérico
    // pero la URL nos dice cuál es el formato real.
    if (
      finalContentType === "application/octet-stream" ||
      finalContentType === ""
    ) {
      const urlLower = targetUrl.toLowerCase();
      if (urlLower.includes(".ts") || urlLower.includes("/live/")) {
        finalContentType = "video/mp2t";
      } else if (
        urlLower.includes(".mp4") ||
        urlLower.includes("/movie/")
      ) {
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

    const responseHeaders: Record<string, string> = {
      "Content-Type": finalContentType,
      "Cache-Control": "no-cache",
      "Accept-Ranges": "bytes",
      ...corsHeaders,
    };

    const cl = response.headers.get("content-length");
    const cr = response.headers.get("content-range");
    if (cl) responseHeaders["Content-Length"] = cl;
    if (cr) responseHeaders["Content-Range"] = cr;

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Proxy error: " + String(error) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}
