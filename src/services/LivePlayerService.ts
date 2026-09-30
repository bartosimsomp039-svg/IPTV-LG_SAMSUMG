import Hls from "hls.js";
import mpegts from "mpegts.js";

import type { Channel } from "../models/Channel";
import { XtreamService } from "./XtreamService";

const Platform = {
  isWebOS: (): boolean =>
    /web[o0]s/i.test(navigator.userAgent) ||
    /netcast/i.test(navigator.userAgent) ||
    /LG\s*Browser/i.test(navigator.userAgent),

  isTizen: (): boolean =>
    /tizen/i.test(navigator.userAgent) ||
    /SmartTV/i.test(navigator.userAgent) ||
    /SMART-TV/i.test(navigator.userAgent),

  isTV: (): boolean => Platform.isWebOS() || Platform.isTizen(),

  isSafari: (): boolean =>
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
};

/**
 * Reproductor EXCLUSIVO para LIVE.
 *
 * No conoce películas ni series y no comparte el estado de VOD.
 *
 * Flujo:
 *   Smart TV/Safari -> HLS nativo
 *   PC             -> hls.js para .m3u8
 *   PC .ts         -> mpegts.js como fallback explícito
 *
 * Los streams LIVE pasan por /api/proxy en navegadores de escritorio.
 * En webOS/Tizen se intenta la URL original mediante el elemento <video>,
 * evitando XHR/CORS de hls.js.
 */
export class LivePlayerService {
  private readonly video: HTMLVideoElement;
  private readonly xtream: XtreamService;

  private currentChannel: Channel | null = null;
  private hls: Hls | null = null;
  private mpegtsPlayer: mpegts.Player | null = null;

  private reconnectTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private currentUrl = "";
  private lastVideoTime = 0;
  private freezeCounter = 0;
  private readonly maxFreezeChecks = 12;

  private destroyed = false;

  constructor(video: HTMLVideoElement, xtream: XtreamService) {
    this.video = video;
    this.xtream = xtream;
    this.registerEvents();
  }

  public play(channel: Channel): void {
    this.stopInternal(false);

    this.destroyed = false;
    this.currentChannel = channel;
    this.reconnectAttempts = 0;
    this.playLive();
  }

  public changeChannel(channel: Channel): void {
    this.stopInternal(false);
    this.currentChannel = channel;
    this.reconnectAttempts = 0;
    this.playLive();
  }

  private registerEvents(): void {
    this.video.addEventListener("playing", () => {
      if (this.destroyed) return;
      this.reconnectAttempts = 0;
      this.startWatchdog();
    });

    this.video.addEventListener("error", () => {
      if (this.destroyed || !this.currentChannel) return;
      console.warn("[LIVE] Video error", this.video.error?.code, this.video.error?.message);
      this.scheduleReconnect("video-error");
    });

    this.video.addEventListener("ended", () => {
      if (!this.destroyed) this.scheduleReconnect("ended");
    });

    this.video.addEventListener("stalled", () => {
      if (!this.destroyed) console.warn("[LIVE] Stream stalled; watchdog/reconnect active");
    });
  }

  private playLive(): void {
    if (!this.currentChannel || this.destroyed) return;

    const sourceUrl = this.xtream.getLiveStreamUrl(this.currentChannel.stream_id);
    const playbackUrl = this.getPlaybackUrl(sourceUrl);

    console.log("[LIVE] Source:", sourceUrl);
    console.log("[LIVE] Playback:", playbackUrl);

    this.playUrl(playbackUrl);
  }

  private getPlaybackUrl(sourceUrl: string): string {
  if (Platform.isTV() || Platform.isSafari()) {
    return sourceUrl;
  }

  return `/api/proxy?url=${encodeURIComponent(sourceUrl)}`;
}

  private playUrl(url: string): void {
    if (this.destroyed || this.currentUrl === url) return;

    this.currentUrl = url;
    this.destroyHls();
    this.destroyMpegts();
    this.stopWatchdog();

    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();

    const pathname = this.getPathname(url);
    const isTs = pathname.endsWith(".ts");
    const isM3u8 = pathname.endsWith(".m3u8") || !isTs;

    // Smart TV: dejar que el reproductor nativo haga todo el HLS.
    if (Platform.isTV()) {
      console.log(`[LIVE] ${Platform.isWebOS() ? "webOS" : "Tizen"} native HLS ->`, url);
      this.video.src = url;
      this.video.load();
      this.playWhenReady();
      return;
    }

    // Safari tiene soporte HLS nativo.
    if (Platform.isSafari() && isM3u8) {
      const canNative =
        this.video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
        this.video.canPlayType("application/x-mpegURL") !== "";

      if (canNative) {
        console.log("[LIVE] Safari native HLS ->", url);
        this.video.src = url;
        this.video.load();
        this.playWhenReady();
        return;
      }
    }

    if (isTs) {
      this.playTs(url);
      return;
    }

    this.playHls(url);
  }

  private playHls(url: string): void {
    if (this.destroyed) return;

    if (!Hls.isSupported()) {
      console.warn("[LIVE] hls.js no está soportado; probando video.src");
      this.video.src = url;
      this.video.load();
      this.playWhenReady();
      return;
    }

    this.destroyHls();

    const hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      liveDurationInfinity: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      maxMaxBufferLength: 60,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 1,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 1,
      fragLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 1,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      },
    });

    this.hls = hls;

    console.log("[LIVE] hls.js ->", url);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (this.destroyed || this.hls !== hls) return;
      hls.loadSource(url);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (this.destroyed || this.hls !== hls) return;
      console.log("[LIVE] Manifest OK");
      this.reconnectAttempts = 0;
      this.playWhenReady();
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (this.destroyed || this.hls !== hls) return;

      console.warn(
        "[LIVE] HLS ERROR",
        data.type,
        data.details,
        "fatal=",
        data.fatal,
        "status=",
        data.response?.code,
      );

      // No saltamos inmediatamente a .ts. Un 403 de un segmento HLS
      // también puede afectar al .ts y solo provoca otro ciclo de fallos.
      // Primero dejamos que hls.js intente recuperar el stream.
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        console.warn("[LIVE] Recuperando error de media HLS...");
        try {
          hls.recoverMediaError();
          return;
        } catch {}
      }

      this.destroyHls();
      this.scheduleReconnect(`hls-${data.details}`);
    });

    hls.attachMedia(this.video);
  }

  private playTs(url: string): void {
    if (!mpegts.isSupported()) {
      console.warn("[LIVE] mpegts.js no soportado; probando video.src ->", url);
      this.video.src = url;
      this.video.load();
      this.playWhenReady();
      return;
    }

    this.destroyMpegts();

    console.log("[LIVE] mpegts.js ->", url);

    const player = mpegts.createPlayer(
      { type: "mpegts", isLive: true, url },
      {
        enableWorker: false,
        lazyLoadMaxDuration: 3 * 60,
        seekType: "range",
      },
    );

    this.mpegtsPlayer = player;
    player.attachMediaElement(this.video);
    player.load();

    player.on(mpegts.Events.ERROR, (type, detail) => {
      if (this.destroyed || this.mpegtsPlayer !== player) return;
      console.warn("[LIVE] MPEG-TS ERROR", type, detail);
      this.destroyMpegts();
      this.scheduleReconnect("mpegts-error");
    });

    void this.video.play().catch(() => {
      console.warn("[LIVE] Autoplay bloqueado en MPEG-TS");
    });
  }

  private playWhenReady(): void {
    const start = (): void => {
      if (this.destroyed) return;
      void this.video.play().catch(() => {
        console.warn("[LIVE] Autoplay bloqueado; el usuario puede pulsar Play");
      });
    };

    if (this.video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      start();
      return;
    }

    this.video.addEventListener("canplay", start, { once: true });
    this.video.addEventListener("loadedmetadata", start, { once: true });
  }

  private scheduleReconnect(reason: string): void {
    if (this.destroyed || !this.currentChannel || this.reconnectTimer !== null) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[LIVE] Se alcanzó el máximo de reconexiones:", reason);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1500 * this.reconnectAttempts, 7000);

    console.warn(
      `[LIVE] Reconectando en ${delay}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts}) -> ${reason}`,
    );

    this.stopWatchdog();
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed || !this.currentChannel) return;

      // Generar nuevamente la URL es importante para streams con token,
      // redirects o sesiones que cambian entre reconexiones.
      this.currentUrl = "";
      this.playLive();
    }, delay);
  }

  private startWatchdog(): void {
    this.stopWatchdog();

    this.lastVideoTime = this.video.currentTime;
    this.freezeCounter = 0;

    this.watchdogTimer = window.setInterval(() => {
      if (this.destroyed || this.video.paused || this.video.seeking) return;
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      if (this.video.currentTime === this.lastVideoTime) {
        this.freezeCounter++;
        if (this.freezeCounter >= this.maxFreezeChecks) {
          console.warn("[LIVE] Watchdog: stream congelado -> reconectando");
          this.scheduleReconnect("watchdog-freeze");
          this.freezeCounter = 0;
        }
      } else {
        this.lastVideoTime = this.video.currentTime;
        this.freezeCounter = 0;
      }
    }, 1000);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private getPathname(url: string): string {
    try {
      return new URL(url, window.location.href).pathname.toLowerCase();
    } catch {
      return url.toLowerCase().split("?")[0];
    }
  }

  private destroyHls(): void {
    if (!this.hls) return;
    try {
      this.hls.stopLoad();
      this.hls.detachMedia();
      this.hls.destroy();
    } catch {}
    this.hls = null;
  }

  private destroyMpegts(): void {
    if (!this.mpegtsPlayer) return;
    try {
      this.mpegtsPlayer.pause();
      this.mpegtsPlayer.unload();
      this.mpegtsPlayer.detachMediaElement();
      this.mpegtsPlayer.destroy();
    } catch {}
    this.mpegtsPlayer = null;
  }

  private stopInternal(clearChannel: boolean): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopWatchdog();
    this.destroyHls();
    this.destroyMpegts();

    this.currentUrl = "";
    this.reconnectAttempts = 0;

    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();

    if (clearChannel) this.currentChannel = null;
  }

  public stop(): void {
    this.stopInternal(true);
  }

  public destroy(): void {
    this.destroyed = true;
    this.stopInternal(true);
  }
}
