import Hls from "hls.js";

import type { Channel } from "../models/Channel";
import type { Movie } from "../models/Movie";
import { XtreamService } from "./XtreamService";

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

    private isVod = false;

    constructor(
        video: HTMLVideoElement,
        xtream: XtreamService
    ) {

        this.video = video;
        this.xtream = xtream;

        this.registerEvents();

    }

    private registerEvents(): void {

        this.video.addEventListener("playing", () => {

            this.reconnecting = false;
            this.reconnectAttempts = 0;

            console.log("Playback iniciado correctamente.");

        });

        this.video.addEventListener("error", () => {

            console.log("Video Error");

            if (!this.isVod) {
                this.reconnect();
            }

        });

        this.video.addEventListener("ended", () => {

            console.log("Stream Finalizado");

            if (!this.isVod) {
                this.reconnect();
            }

        });

        this.video.addEventListener("stalled", () => {

            console.log("Buffer detenido");

            if (!this.isVod) {
                this.reconnect();
            }

        });

        this.video.addEventListener("waiting", () => {

            console.log("Esperando datos...");

        });

    }

    // ── LIVE ──────────────────────────────────────────────

    public play(channel: Channel): void {

        if (
            this.currentChannel &&
            this.currentChannel.stream_id === channel.stream_id
        ) {
            return;
        }

        this.isVod = false;
        this.currentChannel = channel;
        this.reconnectAttempts = 0;
        this.reconnecting = false;

        this.playM3U8();

    }

    public changeChannel(channel: Channel): void {

        this.stop();

        this.isVod = false;
        this.currentChannel = channel;
        this.reconnectAttempts = 0;
        this.reconnecting = false;

        this.playM3U8();

    }

    private playM3U8(): void {

        if (!this.currentChannel) return;

        const url = this.xtream.getLiveStreamUrl(
            this.currentChannel.stream_id
        );

        this.playUrl(url);

    }

    // ── VOD (PELÍCULAS) ───────────────────────────────────

    public playMovie(movie: Movie): void {

        this.isVod = true;
        this.currentChannel = null;
        this.reconnectAttempts = 0;
        this.reconnecting = false;

        const ext = movie.container_extension ?? "mp4";

        const url = this.xtream.getMovieStreamUrl(
            movie.stream_id,
            ext
        );

        this.playUrl(url);

    }

    // ── SERIES ────────────────────────────────────────────

    public playSeriesEpisode(
        streamId: number,
        extension: string
    ): void {

        this.isVod = true;
        this.currentChannel = null;
        this.reconnectAttempts = 0;
        this.reconnecting = false;

        const url = this.xtream.getSeriesStreamUrl(
            streamId,
            extension
        );

        this.playUrl(url);

    }

    // ── CORE ──────────────────────────────────────────────

    private destroyHls(): void {

        if (this.hls === null) return;

        try {

            this.hls.stopLoad();
            this.hls.detachMedia();
            this.hls.destroy();

        } catch {

        }

        this.hls = null;

    }

    private playUrl(url: string): void {

        if (this.currentUrl === url) return;

        this.currentUrl = url;

        this.destroyHls();

        this.video.pause();
        this.video.removeAttribute("src");
        this.video.load();

        const urlLower = url.toLowerCase();

        // ✅ FIX: live siempre usa HLS.js (Xtream sirve HLS sin extensión .m3u8)
        // VOD solo usa HLS.js si la URL es explícitamente .m3u8
        const shouldUseHls = this.isVod
            ? urlLower.includes(".m3u8")
            : true;

        if (Hls.isSupported() && shouldUseHls) {

            console.log("Usando hls.js →", url);

            this.hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                liveDurationInfinity: true,
                backBufferLength: 90,
                maxBufferLength: 30,
                maxMaxBufferLength: 120,
                manifestLoadingTimeOut: 10000,
                manifestLoadingMaxRetry: 5,
                levelLoadingTimeOut: 10000,
                levelLoadingMaxRetry: 5,
                fragLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 6
            });

            this.hls.stopLoad();
            this.hls.loadSource(url);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {

                const promise = this.video.play();

                promise?.catch(() => {

                    console.warn("Autoplay bloqueado por el navegador");

                });

            });

            this.hls.on(Hls.Events.ERROR, (_event, data) => {

                console.warn("HLS ERROR", data.type, data.details, data.fatal);

                if (!data.fatal) return;

                this.destroyHls();
                this.currentUrl = "";

                // ✅ FIX: reconectar en vez de intentar .ts (navegador no soporta TS)
                this.reconnect();

            });

            return;

        }

        // Safari: HLS nativo
        if (this.video.canPlayType("application/vnd.apple.mpegurl")) {

            console.log("Usando HLS nativo (Safari) →", url);

            this.video.src = url;
            this.video.load();

            const promise = this.video.play();

            promise?.catch(() => {

                console.warn("Autoplay bloqueado por Safari");
                this.currentUrl = "";
                this.reconnect();

            });

            return;

        }

        // Reproducción directa (MP4, etc.)
        console.log("Reproducción directa →", url);

        this.video.src = url;
        this.video.load();

        const promise = this.video.play();

        promise?.catch(() => {

            console.warn("Error en reproducción directa");
            this.currentUrl = "";

            if (!this.isVod) {
                this.reconnect();
            }

        });

    }

    private reconnect(): void {

        if (!this.currentChannel) return;
        if (this.reconnecting) return;

        this.reconnecting = true;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {

            console.error("No fue posible reconectar después de", this.maxReconnectAttempts, "intentos.");
            this.reconnecting = false;
            return;

        }

        this.reconnectAttempts++;

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const delay = Math.min(2000 * this.reconnectAttempts, 8000);

        console.log(`Reconectando en ${delay}ms... (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = window.setTimeout(() => {

            this.currentUrl = "";
            this.reconnecting = false;
            this.playM3U8();

        }, delay);

    }

    public stop(): void {

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.destroyHls();

        this.reconnecting = false;
        this.currentUrl = "";
        this.reconnectAttempts = 0;
        this.isVod = false;

        this.video.pause();
        this.video.removeAttribute("src");
        this.video.load();

    }

    public destroy(): void {

        this.stop();

        this.currentChannel = null;

        this.destroyHls();

    }

}