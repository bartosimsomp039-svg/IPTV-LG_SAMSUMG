import { ApiClient } from "./ApiClient";

import type { Category } from "../models/Category";
import type { Channel } from "../models/Channel";
import type { Movie } from "../models/Movie";
import type { Series } from "../models/Series";

export class XtreamService {

    private readonly api: ApiClient;

    private host = "";

    private username = "";

    private password = "";

    constructor() {

        this.api = new ApiClient();

    }

    // ── Proxifica streams (video HLS) ─────────────────────
    private proxifyStream(url: string): string {

        if (url.startsWith("https://")) return url;
        if (!url.startsWith("http://")) return url;
        return `/api/proxy?url=${encodeURIComponent(url)}`;

    }

    // ── Proxifica imágenes (logos, portadas, iconos) ──────
    // FIX Mixed Content: rutas http:// bloqueadas por el browser
    // porque la página corre en https://. Se redirigen por /api/proxy.
    private proxifyImage(url: string | null | undefined): string {

        if (!url) return "";
        if (url.startsWith("https://")) return url;
        if (!url.startsWith("http://")) return url;
        return `/api/proxy?url=${encodeURIComponent(url)}`;

    }

    public async login(
        host: string,
        username: string,
        password: string
    ): Promise<boolean> {

        host = host.trim();

        if (!host.startsWith("http://") &&
            !host.startsWith("https://")) {

            host = "http://" + host;

        }

        if (host.endsWith("/")) {

            host = host.slice(0, -1);

        }

        const url =
            `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        try {

            const data = await this.api.get(url);

            if (!data || !data.user_info) {

                return false;

            }

            this.host = host;
            this.username = username;
            this.password = password;

            return true;

        } catch (error) {

            console.error("Xtream Login Error:", error);

            return false;

        }

    }

    private buildUrl(action: string): string {

        return `${this.host}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&action=${action}`;

    }

    public async getLiveCategories(): Promise<Category[]> {

        return await this.api.get(
            this.buildUrl("get_live_categories")
        );

    }

    public async getMovieCategories(): Promise<Category[]> {

        return await this.api.get(
            this.buildUrl("get_vod_categories")
        );

    }

    public async getSeriesCategories(): Promise<Category[]> {

        return await this.api.get(
            this.buildUrl("get_series_categories")
        );

    }

    public async getLiveStreams(
        categoryId?: string
    ): Promise<Channel[]> {

        let url = this.buildUrl("get_live_streams");

        if (categoryId) {

            url += `&category_id=${categoryId}`;

        }

        const data: Channel[] = await this.api.get(url);

        // Proxificar logos de canales para evitar Mixed Content
        return data.map(ch => ({
            ...ch,
            stream_icon: this.proxifyImage(ch.stream_icon),
        }));

    }

    public async getVodStreams(
        categoryId?: string
    ): Promise<Movie[]> {

        let url = this.buildUrl("get_vod_streams");

        if (categoryId) {

            url += `&category_id=${categoryId}`;

        }

        const data: Movie[] = await this.api.get(url);

        // Proxificar portadas de películas
        return data.map(m => ({
            ...m,
            stream_icon: this.proxifyImage(m.stream_icon),
        }));

    }

    public async getSeries(
        categoryId?: string
    ): Promise<Series[]> {

        let url = this.buildUrl("get_series");

        if (categoryId) {

            url += `&category_id=${categoryId}`;

        }

        const data: Series[] = await this.api.get(url);

        // Proxificar portadas de series
        return data.map(s => ({
            ...s,
            cover: this.proxifyImage(s.cover),
        }));

    }

    public async getSeriesInfo(seriesId: number): Promise<any> {

        const url =
            this.buildUrl("get_series_info") +
            `&series_id=${seriesId}`;

        const data = await this.api.get(url);

        // Proxificar portada de detalle de serie
        if (data?.info?.cover) {
            data.info.cover = this.proxifyImage(data.info.cover);
        }
        if (data?.info?.backdrop_path) {
            if (Array.isArray(data.info.backdrop_path)) {
                data.info.backdrop_path = data.info.backdrop_path.map(
                    (u: string) => this.proxifyImage(u)
                );
            } else {
                data.info.backdrop_path = this.proxifyImage(data.info.backdrop_path);
            }
        }

        return data;

    }

    // ── Stream URLs ───────────────────────────────────────

    public getLiveStreamUrl(streamId: number): string {

        const raw = `${this.host}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.m3u8`;
        return this.proxifyStream(raw);

    }

    public getLiveTsUrl(streamId: number): string {

        const raw = `${this.host}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.ts`;
        return this.proxifyStream(raw);

    }

    public getMovieStreamUrl(
        streamId: number,
        extension: string
    ): string {

        const raw = `${this.host}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
        return this.proxifyStream(raw);

    }

    public getSeriesStreamUrl(
        streamId: number,
        extension: string
    ): string {

        const raw = `${this.host}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
        return this.proxifyStream(raw);

    }

    // ── Session ───────────────────────────────────────────

    public getCredentials(): {
        host: string;
        username: string;
        password: string;
    } {

        return {
            host: this.host,
            username: this.username,
            password: this.password
        };

    }

    public isLogged(): boolean {

        return (
            this.host.length > 0 &&
            this.username.length > 0 &&
            this.password.length > 0
        );

    }

    public logout(): void {

        this.host = "";
        this.username = "";
        this.password = "";

    }

}