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

    // =====================================================
    // PROXY: redirige URLs HTTP por /api/proxy para evitar
    // el bloqueo Mixed Content en páginas HTTPS (Vercel)
    // =====================================================

    private proxify(url: string): string {

        // Si la URL ya es HTTPS no necesita proxy
        if (url.startsWith("https://")) {
            return url;
        }

        // Rutas relativas o ya proxificadas — sin cambios
        if (!url.startsWith("http://")) {
            return url;
        }

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

        // ✅ FIX: la llamada a player_api.php también pasa por el proxy
        //         para evitar Mixed Content en la autenticación
        const rawUrl =
            `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        const url = this.proxify(rawUrl);

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

        const rawUrl =
            `${this.host}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&action=${action}`;

        // ✅ FIX: todas las llamadas a la API también pasan por el proxy
        return this.proxify(rawUrl);

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

        return await this.api.get(url);

    }

    public async getVodStreams(
        categoryId?: string
    ): Promise<Movie[]> {

        let url = this.buildUrl("get_vod_streams");

        if (categoryId) {

            url += `&category_id=${categoryId}`;

        }

        return await this.api.get(url);

    }

    public async getSeries(
        categoryId?: string
    ): Promise<Series[]> {

        let url = this.buildUrl("get_series");

        if (categoryId) {

            url += `&category_id=${categoryId}`;

        }

        return await this.api.get(url);

    }

    public async getSeriesInfo(seriesId: number): Promise<any> {

        const url =
            this.buildUrl("get_series_info") +
            `&series_id=${seriesId}`;

        return await this.api.get(url);

    }

    // =====================================================
    // STREAM URLS — todas pasan por el proxy automáticamente
    // =====================================================

    public getLiveStreamUrl(streamId: number): string {

        const raw = `${this.host}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.m3u8`;
        return this.proxify(raw);

    }

    public getLiveTsUrl(streamId: number): string {

        const raw = `${this.host}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.ts`;
        return this.proxify(raw);

    }

    public getMovieStreamUrl(
        streamId: number,
        extension: string
    ): string {

        const raw = `${this.host}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
        return this.proxify(raw);

    }

    public getSeriesStreamUrl(
        streamId: number,
        extension: string
    ): string {

        const raw = `${this.host}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
        return this.proxify(raw);

    }

    // =====================================================
    // SESSION
    // =====================================================

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
