﻿// Edge Runtime — NO cambiar a Node.js.
export const config = { runtime: "edge" };

export default async function handler(
  request: Request
): Promise<Response> {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const requestUrl = new URL(request.url);

  // URLSearchParams.get() ya decodifica el parámetro.
  // NO usar decodeURIComponent() aquí.
  const targetUrl = requestUrl.searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing url", {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    return new Response("Invalid URL", {
      status: 400,
      headers: corsHeaders,
    });
  }

  let parsedTarget: URL;

  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response("Invalid target URL", {
      status: 400,
      headers: corsHeaders,
    });
  }

  /*
   * IMPORTANTE:
   *
   * No usamos ?ref=.
   * No forzamos Origin.
   *
   * El servidor recibe la URL del segmento exactamente como
   * fue generada por la playlist.
   */
  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Referer: `${parsedTarget.origin}/`,
  };

  // Range para VOD/seeking
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  try {
    console.log("========== PROXY ==========");
    console.log("TARGET:", targetUrl);
    console.log("TYPE:", targetUrl.toLowerCase().includes(".m3u8") ? "M3U8" : "SEGMENT");
    console.log("REFERER:", upstreamHeaders["Referer"]);
    console.log("============================");

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    /*
     * ------------------------------------------------------------
     * ERRORES UPSTREAM
     * ------------------------------------------------------------
     */

    if (!response.ok) {
      const errorText = await response.text();

      console.error("UPSTREAM ERROR:", response.status);
      console.error(errorText.substring(0, 500));

      return new Response(errorText || `Upstream HTTP ${response.status}`, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ||
            "text/plain; charset=utf-8",
          ...corsHeaders,
        },
      });
    }

    const contentType =
  response.headers.get("content-type") || "";

const finalUrl = response.url || targetUrl;

const isM3U8 =
  contentType.toLowerCase().includes("mpegurl") ||
  contentType.toLowerCase().includes("m3u") ||
  finalUrl.toLowerCase().includes(".m3u8") ||
  targetUrl.toLowerCase().includes(".m3u8") ||
  targetUrl.toLowerCase().includes("/get.php");

    /*
     * ------------------------------------------------------------
     * M3U8
     * ------------------------------------------------------------
     */

    if (isM3U8) {
      const text = await response.text();

      console.log("=========== PLAYLIST ===========");
      console.log(text.substring(0, 5000));
      console.log("================================");

      if (
        !text.includes("#EXTM3U") &&
        !text.includes("#EXT-X-")
      ) {
        return new Response(
          JSON.stringify({
            error: "El servidor IPTV no devolvió un M3U8 válido",
            upstream_status: response.status,
            upstream_url: finalUrl,
            upstream_preview: text.substring(0, 500),
          }),
          {
            status: 502,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      /*
       * URL base REAL de la playlist.
       *
       * Esto es importante porque una playlist puede redirigir
       * desde flowzy.work hacia otro servidor/CDN.
       */
      const baseUrl = new URL(finalUrl);

      /*
       * Origin de nuestro proxy.
       *
       * Ejemplo:
       * https://iptv-lg-samsumg.vercel.app
       */
      const proxyOrigin = requestUrl.origin;

      /*
       * Convierte cualquier URL de la playlist en una URL
       * absoluta hacia nuestro proxy.
       *
       * IMPORTANTE:
       * Solo hacemos encodeURIComponent UNA VEZ.
       */
      const toProxyUrl = (value: string): string => {
        const absoluteUrl = new URL(value, baseUrl).toString();

        return (
          `${proxyOrigin}/api/proxy?url=` +
          encodeURIComponent(absoluteUrl)
        );
      };

      /*
       * Reescribir playlist.
       */
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();

          if (!trimmed) {
            return line;
          }

          try {
            /*
             * Segmentos:
             *
             * segmento.ts
             * segmento.ts?token=...
             * /ruta/segmento.ts?...
             * https://servidor/segmento.ts?...
             */
            if (!trimmed.startsWith("#")) {
              return toProxyUrl(trimmed);
            }

            /*
             * Recursos HLS dentro de:
             *
             * #EXT-X-KEY:URI="..."
             * #EXT-X-MAP:URI="..."
             * #EXT-X-MEDIA:URI="..."
             *
             * etc.
             */
            return line.replace(
              /URI="([^"]+)"/g,
              (_match, uri: string) => {
                return `URI="${toProxyUrl(uri)}"`;
              }
            );
          } catch (err) {
            console.error(
              "Error reescribiendo línea M3U8:",
              line,
              err
            );

            return line;
          }
        })
        .join("\n");

      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.apple.mpegurl; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          ...corsHeaders,
        },
      });
    }

    /*
     * ------------------------------------------------------------
     * SEGMENTOS / VOD / IMÁGENES
     * ------------------------------------------------------------
     */

    const targetPath = parsedTarget.pathname.toLowerCase();

    const extension =
      targetPath.match(/\.([a-z0-9]+)$/)?.[1] || "";

    const mimeByExtension: Record<string, string> = {
      mp4: "video/mp4",
      m4v: "video/mp4",
      mkv: "video/x-matroska",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      ts: "video/mp2t",
      m3u8: "application/vnd.apple.mpegurl",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
    };

    let finalContentType =
      contentType.split(";")[0].trim().toLowerCase();

    if (mimeByExtension[extension]) {
      finalContentType = mimeByExtension[extension];
    }

    if (
      finalContentType === "application/octet-stream" &&
      (
        targetUrl.includes("/live/") ||
        targetUrl.includes("/play/hls")
      )
    ) {
      finalContentType = "video/mp2t";
    }

    /*
     * Copiar headers importantes del servidor IPTV.
     */
    const responseHeaders: Record<string, string> = {
      "Content-Type": finalContentType,
      "Content-Disposition": "inline",
      "Cache-Control": "no-cache, no-store",
      "Accept-Ranges": "bytes",
      ...corsHeaders,
    };

    const contentLength =
      response.headers.get("content-length");

    const contentRange =
      response.headers.get("content-range");

    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    /*
     * Devolvemos directamente el stream.
     */
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("PROXY ERROR:", error);

    return new Response(
      JSON.stringify({
        error:
          "Proxy error: " +
          (error instanceof Error
            ? error.message
            : String(error)),
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
}