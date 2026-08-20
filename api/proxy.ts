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
    "Access-Control-Allow-Headers":
      "Range, Content-Type, Accept",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges, Content-Type",
  };

  // ------------------------------------------------------------
  // OPTIONS / CORS
  // ------------------------------------------------------------

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // ------------------------------------------------------------
  // URL DESTINO
  // ------------------------------------------------------------

  const requestUrl = new URL(request.url);

  // URLSearchParams.get() ya decodifica el parámetro.
  // NO usar decodeURIComponent() aquí.
  let targetUrl =  requestUrl.searchParams.get("url");

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

  const targetLower = targetUrl.toLowerCase();

  // ------------------------------------------------------------
  // REFERER INTERNO PARA LIVE
  // ------------------------------------------------------------
  //
  // Cuando el proxy recibe un segmento generado desde una
  // playlist HLS, puede venir:
  //
  // ?url=SEGMENTO&_ref=PLAYLIST
  //
  // Esto permite conservar el Referer de la playlist original.
  //
  // Para VOD/MKV/MP4/imágenes, si no existe _ref, se mantiene
  // el comportamiento anterior.
  // ------------------------------------------------------------

  const internalReferer =
    requestUrl.searchParams.get("_ref");

  // ------------------------------------------------------------
  // HEADERS HACIA UPSTREAM
  // ------------------------------------------------------------

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

    Accept: "*/*",

    "Accept-Encoding": "identity",

    // LIVE:
    // usa el Referer de la playlist.
    //
    // VOD / imágenes / otros:
    // conserva el comportamiento original.
    Referer:
      internalReferer ||
      `${parsedTarget.origin}/`,
  };

  // ------------------------------------------------------------
  // RANGE
  // ------------------------------------------------------------

  const rangeHeader =
    request.headers.get("range");

  if (rangeHeader) {
    upstreamHeaders["Range"] =
      rangeHeader;
  }

  // ------------------------------------------------------------
  // FETCH UPSTREAM
  // ------------------------------------------------------------

  try {
    const requestedType =
      targetLower.includes("/get.php")
        ? "PLAYLIST_GET"
        : targetLower.includes(".m3u8")
        ? "PLAYLIST_M3U8"
        : targetLower.includes(".m3u")
        ? "PLAYLIST_M3U"
        : targetLower.includes(".ts")
        ? "TS"
        : targetLower.includes(".mkv")
        ? "MKV"
        : targetLower.includes(".mp4")
        ? "MP4"
        : "RESOURCE";

    console.log(
      "========== PROXY =========="
    );

    console.log(
      "TARGET:",
      targetUrl
    );

    console.log(
      "TYPE:",
      requestedType
    );

    console.log(
      "REFERER:",
      upstreamHeaders["Referer"]
    );

    if (internalReferer) {
      console.log(
        "INTERNAL PLAYLIST REF:",
        internalReferer
      );
    }

    if (rangeHeader) {
      console.log(
        "RANGE:",
        rangeHeader
      );
    }

    console.log(
      "============================"
    );

    let response: Response | null = null;
let lastError: unknown = null;

const maxAttempts = 3;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    console.log(
      `PROXY FETCH ATTEMPT ${attempt}/${maxAttempts}:`,
      targetUrl
    );

    response = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    console.log(
      `UPSTREAM STATUS ATTEMPT ${attempt}:`,
      response.status
    );

    // Si funcionó, salimos inmediatamente.
    if (response.ok) {
      break;
    }

    // Para errores recuperables, intentamos nuevamente.
    if (
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      lastError = new Error(
        `Upstream HTTP ${response.status}`
      );

      // Consumir el body antes de volver a intentar.
      try {
        await response.arrayBuffer();
      } catch {}

      response = null;

      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * attempt)
        );
        continue;
      }
    }

    // Otros códigos HTTP no necesitan reintentos.
    break;
  } catch (error) {
    lastError = error;

    console.error(
      `FETCH ERROR ATTEMPT ${attempt}:`,
      error
    );

    response = null;

    if (attempt < maxAttempts) {
      await new Promise((resolve) =>
        setTimeout(resolve, 300 * attempt)
      );
    }
  }
}

if (!response) {
  console.error(
    "UPSTREAM FETCH FAILED:",
    lastError
  );

  return new Response(
    JSON.stringify({
      error: "No se pudo conectar con el servidor IPTV",
      target: targetUrl,
      detail:
        lastError instanceof Error
          ? lastError.message
          : String(lastError),
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
}

    // ------------------------------------------------------------
    // URL FINAL DESPUÉS DE REDIRECT
    // ------------------------------------------------------------

    const finalUrl =
      response.url ||
      targetUrl;

    const finalLower =
      finalUrl.toLowerCase();

    // ------------------------------------------------------------
    // CONTENT TYPE
    // ------------------------------------------------------------

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    const contentTypeLower =
      contentType.toLowerCase();

    // ------------------------------------------------------------
    // ERRORES UPSTREAM
    // ------------------------------------------------------------

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "========== UPSTREAM ERROR =========="
      );

      console.error(
        "STATUS:",
        response.status
      );

      console.error(
        "TARGET:",
        targetUrl
      );

      console.error(
        "FINAL:",
        finalUrl
      );

      console.error(
        "CONTENT-TYPE:",
        contentType
      );

      console.error(
        "REFERER:",
        upstreamHeaders["Referer"]
      );

      console.error(
        "BODY:",
        errorText.substring(
          0,
          1000
        )
      );

      console.error(
        "===================================="
      );

      return new Response(
        errorText ||
          `Upstream HTTP ${response.status}`,
        {
          status:
            response.status,

          headers: {
            "Content-Type":
              contentType ||
              "text/plain; charset=utf-8",

            ...corsHeaders,
          },
        }
      );
    }

    // ------------------------------------------------------------
    // DETECTAR PLAYLIST
    // ------------------------------------------------------------
    //
    // Soporta:
    //
    // /get.php
    // /live/.../*.m3u
    // /live/.../*.m3u8
    //
    // No tocar esta lógica porque también sirve para VOD
    // y listas IPTV.
    // ------------------------------------------------------------

    const isPlaylist =
      contentTypeLower.includes(
        "mpegurl"
      ) ||

      contentTypeLower.includes(
        "m3u"
      ) ||

      targetLower.includes(
        "/get.php"
      ) ||

      targetLower.endsWith(
        ".m3u"
      ) ||

      targetLower.includes(
        ".m3u?"
      ) ||

      targetLower.includes(
        ".m3u&"
      ) ||

      targetLower.endsWith(
        ".m3u8"
      ) ||

      targetLower.includes(
        ".m3u8?"
      ) ||

      targetLower.includes(
        ".m3u8&"
      ) ||

      finalLower.endsWith(
        ".m3u"
      ) ||

      finalLower.includes(
        ".m3u?"
      ) ||

      finalLower.includes(
        ".m3u8"
      ) ||

      finalLower.includes(
        ".m3u8?"
      );

    console.log(
      "IS PLAYLIST:",
      isPlaylist
    );

    // ------------------------------------------------------------
    // PLAYLIST M3U / M3U8
    // ------------------------------------------------------------

    if (isPlaylist) {
      const text =
        await response.text();

      console.log(
        "=========== PLAYLIST ==========="
      );

      console.log(
        text.substring(
          0,
          5000
        )
      );

      console.log(
        "================================"
      );

      // ----------------------------------------------------------
      // VALIDAR PLAYLIST
      // ----------------------------------------------------------

      if (
        !text.includes(
          "#EXTM3U"
        ) &&
        !text.includes(
          "#EXT-X-"
        )
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
              text.substring(
                0,
                1000
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

      // ----------------------------------------------------------
      // BASE REAL
      // ----------------------------------------------------------

      const baseUrl =
        new URL(finalUrl);

      const proxyOrigin =
        requestUrl.origin;

      // ----------------------------------------------------------
      // REFERER DE LA PLAYLIST
      // ----------------------------------------------------------
      //
      // Esta es la parte nueva para LIVE.
      //
      // Si flowzy redirige la playlist hacia:
      //
      // http://54.39.97.117:8080/...
      //
      // usamos la URL FINAL de la playlist como referencia.
      //
      // Así los segmentos reciben:
      //
      // Referer: URL-DE-LA-PLAYLIST
      //
      // en lugar de:
      //
      // Referer: http://54.39.97.117:8080/
      //
      // ----------------------------------------------------------

      const playlistReferer =
        finalUrl;

      console.log(
        "PLAYLIST REFERER:",
        playlistReferer
      );

      // ----------------------------------------------------------
      // CONVERTIR URL A PROXY
      // ----------------------------------------------------------

      const toProxyUrl = (
        value: string,
        referer?: string
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

          /*
           * URLSearchParams hace la codificación
           * correctamente.
           *
           * NO usar encodeURIComponent() aquí.
           */

          proxyUrl.searchParams.set(
            "url",
            absoluteUrl
          );

          // ----------------------------------------------------
          // LIVE:
          // conservar el Referer de la playlist.
          //
          // Esto solamente se añade cuando existe.
          // VOD/imágenes/etc. siguen funcionando igual.
          // ----------------------------------------------------

          if (referer) {
            proxyUrl.searchParams.set(
              "_ref",
              referer
            );
          }

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

      // ----------------------------------------------------------
      // REESCRIBIR PLAYLIST
      // ----------------------------------------------------------

      const rewritten =
        text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed =
              line.trim();

            if (!trimmed) {
              return line;
            }

            try {
              // ------------------------------------------------
              // URL DIRECTA
              // ------------------------------------------------
              //
              // Segmentos HLS:
              //
              // segmento.ts
              // segmento.ts?token=...
              // https://servidor/segmento.ts?...
              //
              // ------------------------------------------------

              if (
                !trimmed.startsWith(
                  "#"
                )
              ) {
                return toProxyUrl(
                  trimmed,
                  playlistReferer
                );
              }

              // ------------------------------------------------
              // URI="..."
              //
              // EXT-X-KEY
              // EXT-X-MAP
              // EXT-X-MEDIA
              // etc.
              // ------------------------------------------------

              return line.replace(
                /URI="([^"]+)"/g,
                (
                  _match,
                  uri: string
                ) => {
                  return `URI="${toProxyUrl(
                    uri,
                    playlistReferer
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

      // ------------------------------------------------------------
// PLAYLIST M3U / M3U8
// ------------------------------------------------------------

if (isPlaylist) {
  const text = await response.text();

  console.log(
    "=========== PLAYLIST ==========="
  );

  console.log(
    text.substring(0, 5000)
  );

  console.log(
    "================================"
  );

  // ----------------------------------------------------------
  // VALIDAR PLAYLIST
  // ----------------------------------------------------------

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
          text.substring(0, 1000),
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

  // ----------------------------------------------------------
  // 🔧 CAMBIO LIVE
  //
  // MUY IMPORTANTE:
  //
  // La playlist inicial puede venir de:
  //
  // flowzy.work
  //
  // pero después de seguir el 302 la playlist real puede estar
  // en:
  //
  // 54.39.97.117
  //
  // Por eso SIEMPRE usamos finalUrl como base.
  // ----------------------------------------------------------

  const baseUrl =
    new URL(finalUrl);

  const proxyOrigin =
    requestUrl.origin;

  // ----------------------------------------------------------
  // 🔧 CAMBIO LIVE
  //
  // Referer utilizado por los segmentos.
  //
  // Para la playlist redirigida utilizamos el origen real.
  // ----------------------------------------------------------

  const playlistReferer =
    finalUrl;

  const playlistOrigin =
    baseUrl.origin;

  console.log(
    "LIVE PLAYLIST FINAL URL:",
    finalUrl
  );

  console.log(
    "LIVE PLAYLIST ORIGIN:",
    playlistOrigin
  );

  console.log(
    "LIVE PLAYLIST REFERER:",
    playlistReferer
  );

  // ----------------------------------------------------------
  // 🔧 CAMBIO LIVE
  //
  // Convierte cualquier URI de la playlist en una URL proxy.
  //
  // IMPORTANTE:
  //
  // - conserva query string
  // - conserva token
  // - conserva lvtoken
  // - conserva r
  // - conserva rt
  // - conserva cualquier otro parámetro
  // - soporta URLs absolutas
  // - soporta URLs relativas
  // ----------------------------------------------------------

  const toProxyUrl = (
    value: string,
    referer?: string
  ): string => {
    try {
      const cleanValue =
        value.trim();

      if (!cleanValue) {
        return value;
      }

      // ------------------------------------------------------
      // Resolver URL contra la playlist REAL.
      // ------------------------------------------------------

      const absoluteUrl =
        new URL(
          cleanValue,
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

      // ------------------------------------------------------
      // 🔧 CAMBIO LIVE
      //
      // Guardamos el referer para que el siguiente request
      // del proxy pueda enviarlo al servidor upstream.
      // ------------------------------------------------------

      if (referer) {
        proxyUrl.searchParams.set(
          "_ref",
          referer
        );
      }

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

  // ----------------------------------------------------------
  // 🔧 CAMBIO LIVE
  //
  // REESCRIBIR PLAYLIST
  //
  // Esto es lo fundamental.
  //
  // Los .ts generados por el servidor NO se deben inventar.
  //
  // Ejemplo:
  //
  // playlist:
  //
  // http://54.39.97.117:8080/play/hls/.../segmento.ts?token=...
  //
  // pasa a:
  //
  // https://iptv-lg-samsumg.vercel.app/api/proxy?url=...
  //
  // conservando TODOS los parámetros.
  // ----------------------------------------------------------

  const rewritten =
    text
      .split(/\r?\n/)
      .map((line) => {

        const trimmed =
          line.trim();

        if (!trimmed) {
          return line;
        }

        try {

          // --------------------------------------------------
          // URL / URI DIRECTA
          // --------------------------------------------------

          if (
            !trimmed.startsWith("#")
          ) {

            return toProxyUrl(
              trimmed,
              playlistReferer
            );
          }

          // --------------------------------------------------
          // URI="..."
          //
          // EXT-X-KEY
          // EXT-X-MAP
          // EXT-X-MEDIA
          // etc.
          // --------------------------------------------------

          return line.replace(
            /URI="([^"]+)"/g,
            (
              _match,
              uri: string
            ) => {

              return `URI="${toProxyUrl(
                uri,
                playlistReferer
              )}"`;
            }
          );

        } catch (error) {

          console.error(
            "ERROR REESCRIBIENDO PLAYLIST:",
            line,
            error
          );

          return line;
        }
      })
      .join("\n");

  console.log(
    "=========== PLAYLIST REWRITTEN ==========="
  );

  console.log(
    rewritten.substring(0, 5000)
  );

  console.log(
    "==========================================="
  );

  // ----------------------------------------------------------
  // RESPUESTA PLAYLIST
  // ----------------------------------------------------------

  return new Response(
    rewritten,
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/vnd.apple.mpegurl; charset=utf-8",

        "Cache-Control":
          "no-cache, no-store, must-revalidate",

        Pragma:
          "no-cache",

        ...corsHeaders,
      },
    }
  );
}