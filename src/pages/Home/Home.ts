import "./Home.css";

import { Header } from "../../components/Header";
import { Banner } from "../../components/Banner";
import { Row } from "../../components/Row";
import { DataManager } from "../../services/DataManager";

export class Home {

    private liveRow!: Row;
    private movieRow!: Row;
    private seriesRow!: Row;

    public render(): string {

        const header = new Header();
        const banner = new Banner();

        this.liveRow = new Row(
            "📺 LIVE",
            DataManager.liveCategories.map(category => ({
                id: Number(category.category_id),
                title: category.category_name,
                image: "",
                type: "live",
                categoryId: Number(category.category_id)
            }))
        );

        this.movieRow = new Row(
            "🎬 PELÍCULAS",
            DataManager.movieCategories.map(category => ({
                id: Number(category.category_id),
                title: category.category_name,
                image: "",
                type: "movie",
                categoryId: Number(category.category_id)
            }))
        );

        this.seriesRow = new Row(
            "📺 SERIES",
            DataManager.seriesCategories.map(category => ({
                id: Number(category.category_id),
                title: category.category_name,
                image: "",
                type: "series",
                categoryId: Number(category.category_id)
            }))
        );

        return `

<div class="home">

    ${header.render()}

    ${banner.render()}

    ${this.liveRow.render()}

    ${this.movieRow.render()}

    ${this.seriesRow.render()}

</div>

`;

    }

    public init(): void {

        this.liveRow.init();
        this.movieRow.init();
        this.seriesRow.init();

    }

}