﻿// Edge Runtime — NO cambiar a Node.js.

export const config = {
  runtime: "edge",
};

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

  /*
   * ------------------------------------------------------------
   * OPTIONS / CORS
   * ------------------------------------------------------------
   */

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  /*
   * ------------------------------------------------------------
   * URL DESTINO
   * ------------------------------------------------------------
   */

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
   * ------------------------------------------------------------
   * HEADERS HACIA EL SERVIDOR IPTV
   * ------------------------------------------------------------
   *
   * NO añadimos Origin.
   *
   * El Referer se genera usando el servidor REAL del recurso.
   *
   * Esto es importante para:
   *
   * flowzy.work
   * 54.39.97.117
   * otros CDNs que aparezcan en la playlist.
   */

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

    Accept: "*/*",

    "Accept-Encoding": "identity",

    Referer: `${parsedTarget.origin}/`,
  };

  /*
   * ------------------------------------------------------------
   * RANGE
   * ------------------------------------------------------------
   *
   * Necesario para:
   *
   * - VOD
   * - MKV
   * - MP4
   * - seeking
   * - reproducción parcial
   */

  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  /*
   * ------------------------------------------------------------
   * FETCH UPSTREAM
   * ------------------------------------------------------------
   */

  try {
    const targetLower = targetUrl.toLowerCase();

    const requestedType =
      targetLower.includes("/get.php")
        ? "PLAYLIST"
        : targetLower.includes(".m3u8")
        ? "M3U8"
        : targetLower.includes(".ts")
        ? "TS"
        : targetLower.includes(".mkv")
        ? "MKV"
        : targetLower.includes(".mp4")
        ? "MP4"
        : "RESOURCE";

    console.log("========== PROXY ==========");
    console.log("TARGET:", targetUrl);
    console.log("TYPE:", requestedType);
    console.log("REFERER:", upstreamHeaders["Referer"]);

    if (rangeHeader) {
      console.log("RANGE:", rangeHeader);
    }

    console.log("============================");

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    /*
     * ------------------------------------------------------------
     * URL FINAL DESPUÉS DE REDIRECT
     * ------------------------------------------------------------
     */

    const finalUrl = response.url || targetUrl;

    /*
     * ------------------------------------------------------------
     * CONTENT TYPE
     * ------------------------------------------------------------
     */

    const contentType =
      response.headers.get("content-type") || "";

    const contentTypeLower = contentType.toLowerCase();

    /*
     * ------------------------------------------------------------
     * ERRORES UPSTREAM
     * ------------------------------------------------------------
     */

    if (!response.ok) {
      const errorText = await response.text();

      console.error("========== UPSTREAM ERROR ==========");
      console.error("STATUS:", response.status);
      console.error("TARGET:", targetUrl);
      console.error("FINAL:", finalUrl);
      console.error("CONTENT-TYPE:", contentType);
      console.error(
        "BODY:",
        errorText.substring(0, 1000)
      );
      console.error("====================================");

      return new Response(
        errorText ||
          `Upstream HTTP ${response.status}`,
        {
          status: response.status,
          headers: {
            "Content-Type":
              contentType ||
              "text/plain; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    /*
     * ------------------------------------------------------------
     * DETECTAR PLAYLIST
     * ------------------------------------------------------------
     *
     * get.php NO termina en .m3u8.
     *
     * Por eso también se considera playlist cuando:
     *
     * targetUrl contiene /get.php
     */

    const isPlaylist =
      contentTypeLower.includes("mpegurl") ||
      contentTypeLower.includes("m3u") ||
      finalUrl.toLowerCase().includes(".m3u8") ||
      targetLower.includes(".m3u8") ||
      targetLower.includes("/get.php");

    /*
     * ------------------------------------------------------------
     * M3U / M3U8
     * ------------------------------------------------------------
     */

    if (isPlaylist) {
      const text = await response.text();

      console.log("=========== PLAYLIST ===========");
      console.log(
        text.substring(0, 5000)
      );
      console.log("================================");

      /*
       * Comprobamos que realmente sea una playlist.
       */

      if (
        !text.includes("#EXTM3U") &&
        !text.includes("#EXT-X-")
      ) {
        return new Response(
          JSON.stringify({
            error:
              "El servidor IPTV no devolvió una playlist válida",

            upstream_status:
              response.status,

            upstream_url:
              finalUrl,

            upstream_content_type:
              contentType,

            upstream_preview:
              text.substring(0, 500),
          }),
          {
            status: 502,
            headers: {
              "Content-Type":
                "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      /*
       * --------------------------------------------------------
       * BASE REAL DE LA PLAYLIST
       * --------------------------------------------------------
       *
       * Si flowzy redirige:
       *
       * flowzy.work
       *       ↓
       * 54.39.97.117
       *
       * usamos la URL FINAL.
       */

      const baseUrl = new URL(finalUrl);

      const proxyOrigin =
        requestUrl.origin;

      /*
       * --------------------------------------------------------
       * CONSTRUIR URL DEL PROXY
       * --------------------------------------------------------
       *
       * IMPORTANTE:
       *
       * NO usar:
       *
       * encodeURIComponent(...)
       *
       * aquí.
       *
       * URLSearchParams se encarga de codificar
       * correctamente el parámetro completo.
       */

      const toProxyUrl = (
        value: string
      ): string => {
        try {
          const absoluteUrl =
            new URL(
              value,
              baseUrl
            ).toString();

          const proxyUrl =
            new URL(
              `${proxyOrigin}/api/proxy`
            );

          proxyUrl.searchParams.set(
            "url",
            absoluteUrl
          );

          return proxyUrl.toString();
        } catch (error) {
          console.error(
            "ERROR CONSTRUYENDO PROXY URL:",
            value,
            error
          );

          return value;
        }
      };

      /*
       * --------------------------------------------------------
       * REESCRIBIR PLAYLIST
       * --------------------------------------------------------
       */

      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed =
            line.trim();

          if (!trimmed) {
            return line;
          }

          try {
            /*
             * --------------------------------------------------
             * SEGMENTOS / URLs
             * --------------------------------------------------
             *
             * Ejemplo:
             *
             * https://54.39.97.117/...ts?token=...
             *
             * queda:
             *
             * https://iptv-lg-samsumg.vercel.app/api/proxy?url=...
             */

            if (
              !trimmed.startsWith("#")
            ) {
              return toProxyUrl(
                trimmed
              );
            }

            /*
             * --------------------------------------------------
             * URI="..."
             * --------------------------------------------------
             *
             * Para:
             *
             * #EXT-X-KEY
             * #EXT-X-MAP
             * #EXT-X-MEDIA
             * etc.
             */

            return line.replace(
              /URI="([^"]+)"/g,
              (
                _match,
                uri: string
              ) => {
                return `URI="${toProxyUrl(
                  uri
                )}"`;
              }
            );
          } catch (error) {
            console.error(
              "ERROR REESCRIBIENDO:",
              line,
              error
            );

            return line;
          }
        })
        .join("\n");

      /*
       * --------------------------------------------------------
       * RESPUESTA PLAYLIST
       * --------------------------------------------------------
       */

      return new Response(
        rewritten,
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/vnd.apple.mpegurl; charset=utf-8",

            "Cache-Control":
              "no-cache, no-store, must-revalidate",

            Pragma: "no-cache",

            ...corsHeaders,
          },
        }
      );
    }

    /*
     * ------------------------------------------------------------
     * RECURSOS DE VIDEO / SEGMENTOS / IMÁGENES
     * ------------------------------------------------------------
     */

    const targetPath =
      parsedTarget.pathname.toLowerCase();

    const extension =
      targetPath.match(
        /\.([a-z0-9]+)$/
      )?.[1] || "";

    const mimeByExtension: Record<
      string,
      string
    > = {
      mp4: "video/mp4",

      m4v: "video/mp4",

      mkv: "video/x-matroska",

      avi: "video/x-msvideo",

      mov: "video/quicktime",

      ts: "video/mp2t",

      m3u8:
        "application/vnd.apple.mpegurl",

      jpg: "image/jpeg",

      jpeg: "image/jpeg",

      png: "image/png",

      webp: "image/webp",

      gif: "image/gif",
    };

    let finalContentType =
      contentType
        .split(";")[0]
        .trim()
        .toLowerCase();

    /*
     * Si conocemos la extensión,
     * damos prioridad al MIME correcto.
     */

    if (
      mimeByExtension[extension]
    ) {
      finalContentType =
        mimeByExtension[
          extension
        ];
    }

    /*
     * Algunos servidores IPTV devuelven
     * application/octet-stream para TS.
     */

    if (
      finalContentType ===
        "application/octet-stream" &&
      (
        targetLower.includes(
          "/live/"
        ) ||
        targetLower.includes(
          "/play/hls"
        )
      )
    ) {
      finalContentType =
        "video/mp2t";
    }

    /*
     * ------------------------------------------------------------
     * HEADERS DE RESPUESTA
     * ------------------------------------------------------------
     */

    const responseHeaders: Record<
      string,
      string
    > = {
      "Content-Type":
        finalContentType,

      "Content-Disposition":
        "inline",

      "Cache-Control":
        "no-cache, no-store",

      "Accept-Ranges":
        "bytes",

      ...corsHeaders,
    };

    /*
     * ------------------------------------------------------------
     * CONTENT-LENGTH
     * ------------------------------------------------------------
     */

    const contentLength =
      response.headers.get(
        "content-length"
      );

    if (contentLength) {
      responseHeaders[
        "Content-Length"
      ] = contentLength;
    }

    /*
     * ------------------------------------------------------------
     * CONTENT-RANGE
     * ------------------------------------------------------------
     */

    const contentRange =
      response.headers.get(
        "content-range"
      );

    if (contentRange) {
      responseHeaders[
        "Content-Range"
      ] = contentRange;
    }

    /*
     * ------------------------------------------------------------
     * DEVOLVER STREAM
     * ------------------------------------------------------------
     *
     * Esto mantiene funcionando:
     *
     * - MKV
     * - MP4
     * - TS
     * - Range
     * - seeking
     * - streaming
     */

    console.log(
      "UPSTREAM OK:",
      response.status,
      finalContentType
    );

    return new Response(
      response.body,
      {
        status: response.status,
        headers:
          responseHeaders,
      }
    );
  } catch (error) {
    /*
     * ------------------------------------------------------------
     * ERROR DEL PROXY
     * ------------------------------------------------------------
     */

    console.error(
      "========== PROXY ERROR =========="
    );

    console.error(
      error
    );

    console.error(
      "================================="
    );

    return new Response(
      JSON.stringify({
        error:
          "Proxy error: " +
          (
            error instanceof Error
              ? error.message
              : String(error)
          ),
      }),
      {
        status: 502,

        headers: {
          "Content-Type":
            "application/json",

          ...corsHeaders,
        },
      }
    );
  }
}