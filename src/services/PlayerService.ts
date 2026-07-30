import Hls from "hls.js";
import mpegts from "mpegts.js";

import type { Channel } from "../models/Channel";
import type { Movie } from "../models/Movie";
import { XtreamService } from "./XtreamService";

// ─────────────────────────────────────────────────────────────
//  Detección de plataforma
//  LG webOS y Samsung Tizen no tienen CORS y soportan H.265
//  nativamente — conviene saltarse hls.js/mpegts.js en esos casos.
// ─────────────────────────────────────────────────────────────
const Platform = {
  // FIX 1: Cambiado /web0s/i → /web[o0]s/i
  // Algunos LG tienen "WebOS" (letra O) y otros "Web0S" (cero).
  // El regex anterior solo detectaba el cero, dejando fuera la letra O.
  isWebOS: (): boolean =>
    /web[o0]s/i.test(navigator.userAgent) ||
    /netcast/i.test(navigator.userAgent),

  isTizen: (): boolean => /tizen/i.test(navigator.userAgent),

  isTV: (): boolean => Platform.isWebOS() || Platform.isTizen(),

  // Safari desktop/iOS soporta HLS nativo
  isSafari: (): boolean =>
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
};

export class PlayerService {
  private readonly video: HTMLVideoElement;
  private readonly xtream: XtreamService;
  private currentChannel: Channel | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: number | null = null;
  private reconnecting = false;
  private currentUrl = "";
  private hls: Hls | null = null;
  private mpegtsPlayer: mpegts.Player | null = null;
  private isVod = false;
  private fragParseErrors = 0;
  private readonly maxFragParseErrors = 3;
  private triedTsUrl = false;

  // FIX 3: Timer para el intento nativo de live en PC.
  // Si video.src no dispara "canplay" ni "error" en 2.5 s,
  // cancelamos y pasamos a hls.js para no dejar al usuario esperando.
  private nativeLiveTimer: number | null = null;

  constructor(video: HTMLVideoElement, xtream: XtreamService) {
    this.video = video;
    this.xtream = xtream;
    this.registerEvents();
  }

  private registerEvents(): void {
    this.video.addEventListener("playing", () => {
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.fragParseErrors = 0;
    });
    this.video.addEventListener("error", () => {
      const err = this.video.error;
      console.warn("Video Error", err?.code, err?.message);
      if (!this.isVod) this.reconnect();
    });
    this.video.addEventListener("ended", () => {
      if (!this.isVod) this.reconnect();
    });
    this.video.addEventListener("stalled", () => {
      if (!this.isVod) this.reconnect();
    });
  }

  // ── LIVE ──────────────────────────────────────────

  public play(channel: Channel): void {
    if (this.currentChannel?.stream_id === channel.stream_id) return;
    this.isVod = false;
    this.currentChannel = channel;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.fragParseErrors = 0;
    this.triedTsUrl = false;
    this.playM3U8();
  }

  public changeChannel(channel: Channel): void {
    this.stop();
    this.isVod = false;
    this.currentChannel = channel;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.fragParseErrors = 0;
    this.triedTsUrl = false;
    this.playM3U8();
  }

  private playM3U8(): void {
    if (!this.currentChannel) return;
    const url = this.xtream.getLiveStreamUrl(this.currentChannel.stream_id);
    this.playUrl(url);
  }

  // ── VOD ───────────────────────────────────────────

  public playMovie(movie: Movie): void {
    this.isVod = true;
    this.currentChannel = null;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    const ext = movie.container_extension ?? "mp4";
    const url = this.xtream.getMovieStreamUrl(movie.stream_id, ext);
    this.playUrl(url);
  }

  // ── SERIES ────────────────────────────────────────

  public playSeriesEpisode(streamId: number, extension: string): void {
    this.isVod = true;
    this.currentChannel = null;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    const url = this.xtream.getSeriesStreamUrl(streamId, extension);
    this.playUrl(url);
  }

  // ── CORE ──────────────────────────────────────────

  private destroyHls(): void {
    if (this.hls === null) return;
    try {
      this.hls.stopLoad();
      this.hls.detachMedia();
      this.hls.destroy();
    } catch {}
    this.hls = null;
  }

  private destroyMpegts(): void {
    if (this.mpegtsPlayer === null) return;
    try {
      this.mpegtsPlayer.pause();
      this.mpegtsPlayer.unload();
      this.mpegtsPlayer.detachMediaElement();
      this.mpegtsPlayer.destroy();
    } catch {}
    this.mpegtsPlayer = null;
  }

  // FIX 3: Cancelar el timer de intento nativo si se interrumpe la reproducción
  private cancelNativeLiveTimer(): void {
    if (this.nativeLiveTimer !== null) {
      clearTimeout(this.nativeLiveTimer);
      this.nativeLiveTimer = null;
    }
  }

  private switchToTsDirect(): void {
    if (this.triedTsUrl || !this.currentChannel) return;
    console.warn("Cambiando a stream .ts directo (fallback)...");
    this.triedTsUrl = true;
    this.fragParseErrors = 0;
    this.destroyHls();
    this.currentUrl = "";
    const tsUrl = this.xtream.getLiveTsUrl(this.currentChannel.stream_id);
    window.setTimeout(() => {
      this.playUrl(tsUrl);
    }, 500);
  }

  // ─────────────────────────────────────────────────────────────
  //  FIX 3 — Intento nativo para live en PC antes de hls.js
  //
  //  Los elementos <video> NO usan XHR/fetch → no hay CORS.
  //  Si el servidor IPTV permite el stream directo (muchos sí),
  //  esto evita el ciclo hls.js → CORS/401 → fallback.
  //
  //  Flujo:
  //    1. Asignar video.src directamente
  //    2. Si "canplay" dispara en < 2.5 s → reproducción nativa OK
  //    3. Si "error" dispara       → pasar a hls.js inmediatamente
  //    4. Si ninguno en 2.5 s     → pasar a hls.js (timeout)
  //
  //  Nota: Chrome no soporta HLS nativo, así que el intento fallará
  //  rápido vía error o timeout. En Firefox y Edge tampoco. El
  //  beneficio es para casos donde el servidor envía el stream en
  //  un formato que el navegador SÍ soporta sin decodificación HLS.
  // ─────────────────────────────────────────────────────────────
  private tryNativeThenHls(url: string): void {
    console.log("[PC Live] Intentando video.src nativo primero →", url);

    let resolved = false;

    const cleanup = (): void => {
      this.cancelNativeLiveTimer();
      this.video.removeEventListener("canplay", onCanPlay);
      this.video.removeEventListener("error", onError);
    };

    const onCanPlay = (): void => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.log("[PC Live] Reproducción nativa OK →", url);
      this.video.play()?.catch(() => {
        console.warn("[PC Live] Autoplay bloqueado (nativo)");
        // No llamar reconnect(): el usuario puede pulsar play manualmente
      });
    };

    const onError = (): void => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.warn(
        "[PC Live] video.src nativo falló → pasando a hls.js",
      );
      // Limpiar antes de pasar a hls.js
      this.video.removeAttribute("src");
      this.video.load();
      this.currentUrl = "";
      this.tryHlsJs(url);
    };

    this.video.addEventListener("canplay", onCanPlay, { once: true });
    this.video.addEventListener("error", onError, { once: true });

    this.video.src = url;
    this.video.load();

    // Timeout: si Chrome/Firefox no soportan HLS nativo, no disparan
    // "error" de inmediato — el browser simplemente no sabe qué hacer.
    // Pasamos a hls.js después de 2.5 s para no bloquear al usuario.
    this.nativeLiveTimer = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.warn(
        "[PC Live] Timeout en intento nativo → pasando a hls.js",
      );
      this.video.removeAttribute("src");
      this.video.load();
      this.currentUrl = "";
      this.tryHlsJs(url);
    }, 2500);
  }

  // ─────────────────────────────────────────────────────────────
  //  hls.js extraído como método propio para poder llamarlo
  //  tanto desde tryNativeThenHls() como desde playUrl().
  // ─────────────────────────────────────────────────────────────
  private tryHlsJs(url: string): void {
    if (!Hls.isSupported()) {
      // hls.js no disponible → fallback final a video.src
      console.warn("[PC] hls.js no soportado → video.src directo");
      this.currentUrl = url;
      this.video.src = url;
      this.video.load();
      this.video.play()?.catch(() => {
        console.warn("Error en reproducción directa");
        this.currentUrl = "";
        if (!this.isVod) this.reconnect();
      });
      return;
    }

    // Marcar la URL activa para que playUrl() no repita la llamada
    this.currentUrl = url;

    console.log("[PC] hls.js →", url);
    this.hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      liveDurationInfinity: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      maxMaxBufferLength: 60,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 3,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 2,
      // Sin credenciales: reduce headers que el servidor podría rechazar
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      },
    });
    this.hls.loadSource(url);
    this.hls.attachMedia(this.video);
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.video.play()?.catch(() => console.warn("Autoplay bloqueado"));
    });
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      console.warn(
        "HLS ERROR",
        data.type,
        data.details,
        data.fatal,
        data.response?.code,
      );

      // CORS / 403 en segmentos live → probar .ts directo
      if (!this.isVod) {
        if (
          data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
          (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR &&
            data.response?.code === 0) // code 0 = CORS bloqueado
        ) {
          this.switchToTsDirect();
          return;
        }
        if (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
          this.fragParseErrors++;
          if (this.fragParseErrors >= this.maxFragParseErrors) {
            this.switchToTsDirect();
            return;
          }
        }
      }

      if (!data.fatal) return;

      // Error fatal → último recurso: video.src directo
      // Funciona si el servidor permite media requests sin CORS
      console.warn(
        "[PC] hls.js falló fatalmente → intentando video.src directo",
      );
      this.destroyHls();
      this.currentUrl = "";
      window.setTimeout(() => {
        this.video.src = url;
        this.video.load();
        this.video.play().catch(() => {
          console.error("No se pudo reproducir ni con video.src");
          if (!this.isVod) this.reconnect();
        });
      }, 300);
    });
  }

  private playUrl(url: string): void {
    if (this.currentUrl === url) return;
    this.currentUrl = url;
    this.cancelNativeLiveTimer();
    this.destroyHls();
    this.destroyMpegts();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();

    // ─────────────────────────────────────────────────────────
    //  RAMA 1 — TV (LG webOS / Samsung Tizen)
    //
    //  El browser nativo de webOS y Tizen:
    //    ✅ Soporta HLS sin CORS (media elements no usan XHR)
    //    ✅ Decodifica H.265/HEVC por hardware
    //    ✅ Maneja MPEG-TS directo
    //    ❌ hls.js solo decodifica H.264 → movies/series fallan
    //    ❌ mpegts.js puede causar buffering extra innecesario
    //
    //  Solución: asignar video.src directamente, sin librerías JS.
    // ─────────────────────────────────────────────────────────
    if (Platform.isTV()) {
      console.log(
        `[TV ${Platform.isWebOS() ? "webOS" : "Tizen"}] Reproducción nativa →`,
        url,
      );
      this.video.src = url;
      this.video.load();
      this.video.play()?.catch(() => {
        console.warn("Autoplay bloqueado en TV");
        // En TV el autoplay a veces requiere interacción previa
        // El usuario puede presionar OK/Enter para reanudar
      });
      return;
    }

    // ─────────────────────────────────────────────────────────
    //  RAMA 2 — PC / navegador de escritorio
    //
    //  Estrategia (en orden de intento):
    //    a) Live .m3u8 → video.src nativo (2.5 s) → hls.js → .ts/mpegts
    //    b) Live .ts   → mpegts.js → si falla → video.src
    //    c) VOD MP4/MKV → video.src directo (sin librerías)
    //    d) Safari → HLS nativo siempre (no necesita hls.js)
    // ─────────────────────────────────────────────────────────

    const urlLower = url.toLowerCase();
    const isTsStream = urlLower.endsWith(".ts");
    const isM3U8 = urlLower.includes(".m3u8") || (!isTsStream && !this.isVod);
    const isDirectVideo = this.isVod && !isM3U8;

    // ── (d) Safari: HLS nativo ──────────────────────────────
    if (Platform.isSafari()) {
      const canNative =
        this.video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
        this.video.canPlayType("application/x-mpegURL") !== "";
      if (canNative) {
        console.log("[Safari] HLS nativo →", url);
        this.video.src = url;
        this.video.load();
        this.video.play()?.catch(() => {
          console.warn("Autoplay bloqueado (Safari)");
          this.currentUrl = "";
          if (!this.isVod) this.reconnect();
        });
        return;
      }
    }

    // ── (c) VOD directo (MP4, MKV, AVI…) ──────────────────
    if (isDirectVideo) {
      console.log("[PC] VOD directo →", url);
      this.video.src = url;
      this.video.load();
      this.video.play()?.catch(() => {
        console.warn("No se pudo reproducir VOD directamente");
      });
      return;
    }

    // ── (b) MPEG-TS directo → mpegts.js ────────────────────
    if (isTsStream && mpegts.isSupported()) {
      console.log("[PC] mpegts.js →", url);
      this.mpegtsPlayer = mpegts.createPlayer(
        { type: "mpegts", isLive: true, url },
        {
          enableWorker: false,
          lazyLoadMaxDuration: 3 * 60,
          seekType: "range",
        },
      );
      this.mpegtsPlayer.attachMediaElement(this.video);
      this.mpegtsPlayer.load();
      this.mpegtsPlayer.on(mpegts.Events.ERROR, (errType, errDetail) => {
        console.warn("mpegts ERROR", errType, errDetail);
        // Fallback: intentar video.src directo
        this.destroyMpegts();
        this.currentUrl = "";
        if (!this.isVod) {
          console.log("[PC] mpegts falló → intentando video.src directo");
          this.video.src = url;
          this.video.load();
          void this.video.play().catch(() => this.reconnect());
        }
      });
      this.video
        .play()
        ?.catch(() => console.warn("Autoplay bloqueado (mpegts)"));
      return;
    }

    // ── (a) Live M3U8: nativo primero → hls.js → .ts ───────
    //
    // FIX 3: Antes se iba directo a hls.js, que usa XHR y falla
    // por CORS o por tokens IP-vinculados del servidor IPTV.
    // Ahora intentamos video.src primero (sin XHR → sin CORS).
    // Si el browser no soporta HLS nativo (Chrome/Firefox),
    // el intento falla en 2.5 s y pasamos a hls.js como antes.
    if (isM3U8) {
      // Desmarcar currentUrl para que tryNativeThenHls/tryHlsJs
      // puedan asignarla correctamente sin el bloqueo del guard de inicio.
      this.currentUrl = "";
      this.tryNativeThenHls(url);
      return;
    }

    // ── Fallback final: video.src directo ──────────────────
    console.log("[PC] Reproducción directa →", url);
    this.video.src = url;
    this.video.load();
    this.video.play()?.catch(() => {
      console.warn("Error en reproducción directa");
      this.currentUrl = "";
      if (!this.isVod) this.reconnect();
    });
  }

  private reconnect(): void {
    if (!this.currentChannel || this.reconnecting) return;
    this.reconnecting = true;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        "No fue posible reconectar después de",
        this.maxReconnectAttempts,
        "intentos.",
      );
      this.reconnecting = false;
      return;
    }
    this.reconnectAttempts++;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const delay = Math.min(2000 * this.reconnectAttempts, 8000);
    console.log(
      `Reconectando en ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );
    this.reconnectTimer = window.setTimeout(() => {
      this.currentUrl = "";
      this.reconnecting = false;
      this.fragParseErrors = 0;
      this.triedTsUrl = false;
      this.playM3U8();
    }, delay);
  }

  public stop(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cancelNativeLiveTimer();
    this.destroyHls();
    this.destroyMpegts();
    this.reconnecting = false;
    this.currentUrl = "";
    this.reconnectAttempts = 0;
    this.isVod = false;
    this.fragParseErrors = 0;
    this.triedTsUrl = false;
    // FIX 2: Limpiar currentChannel en stop().
    // Sin esto, play(mismoCanal) después de stop() retorna inmediatamente
    // porque stream_id coincide con el canal "actual" que nunca se limpió.
    this.currentChannel = null;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }

  public destroy(): void {
    this.stop();
    this.currentChannel = null;
    this.destroyHls();
    this.destroyMpegts();
  }
}
