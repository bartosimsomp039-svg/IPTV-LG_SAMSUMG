import type { Channel } from "../models/Channel";
import type { Movie } from "../models/Movie";
import type { Series } from "../models/Series";

export class Navigation {

    public static type: "live" | "movie" | "series" | null = null;

    public static categoryId = 0;

    public static categoryName = "";

    // =====================================================
    // ELEMENTO SELECCIONADO
    // =====================================================

    public static selectedChannel: Channel | null = null;

    public static selectedMovie: Movie | null = null;

    public static selectedSeries: Series | null = null;
    public static episodeStreamId: number = 0;
    public static episodeExtension: string = "mp4";

}