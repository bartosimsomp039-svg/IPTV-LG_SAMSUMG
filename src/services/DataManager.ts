import type { Category } from "../models/Category";
import type { Channel } from "../models/Channel";
import type { Movie } from "../models/Movie";
import type { Series } from "../models/Series";
import { XtreamService } from "./XtreamService";

export class DataManager {

    private static xtream = new XtreamService();

    public static liveCategories: Category[] = [];
    public static movieCategories: Category[] = [];
    public static seriesCategories: Category[] = [];

    public static liveChannels: Channel[] = [];
    public static movies: Movie[] = [];
    public static series: Series[] = [];

    // =====================================================
    // ACCESO AL SERVICIO XTREAM
    // =====================================================

    public static getXtream(): XtreamService {

        return this.xtream;

    }

    public static async login(
        host: string,
        username: string,
        password: string
    ): Promise<boolean> {

        const ok = await this.xtream.login(
            host,
            username,
            password
        );

        if (!ok) {
            return false;
        }

        await this.load();

        return true;

    }

    public static async load(): Promise<void> {

        this.liveCategories =
            await this.xtream.getLiveCategories();

        this.movieCategories =
            await this.xtream.getMovieCategories();

        this.seriesCategories =
            await this.xtream.getSeriesCategories();

        this.liveChannels =
            await this.xtream.getLiveStreams();

        this.movies =
            await this.xtream.getVodStreams();

        this.series =
            await this.xtream.getSeries();

    }

    public static clear(): void {

        this.liveCategories = [];
        this.movieCategories = [];
        this.seriesCategories = [];

        this.liveChannels = [];
        this.movies = [];
        this.series = [];

    }

}