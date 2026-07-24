export interface Poster {

    id: number;

    title: string;

    image?: string;

    subtitle?: string;

    type: "live" | "movie" | "series";

    categoryId: number;

}