import type { Poster } from "../models/Poster";
import { PosterCard } from "./PosterCard";
import { Router } from "../app/Router";
import { Navigation } from "../services/Navigation";

export class Row {

    private _title;
    private _posters;

    constructor(title: string, posters: Poster[]) {

        this._title = title;
        this._posters = posters;

    }

    public render(): string {

        let html = "";

        this._posters.forEach((poster) => {

            html += new PosterCard(poster).render();

        });

        return `

<section class="row">

    <h2>${this._title}</h2>

    <div class="cards">

        ${html}

    </div>

</section>

`;

    }

    public init(): void {

        const posters = document.querySelectorAll(".poster");

        posters.forEach((element) => {

            element.addEventListener("click", () => {

                const card = element as HTMLElement;

                Navigation.type = card.dataset.type as
                    "live" | "movie" | "series";

                Navigation.categoryId = Number(card.dataset.category);

                Navigation.categoryName =
                    card.querySelector("span")?.textContent ?? "";

                switch (Navigation.type) {

                    case "live":
                        Router.getInstance().navigate("live");
                        break;

                    case "movie":
                        Router.getInstance().navigate("movies");
                        break;

                    case "series":
                        Router.getInstance().navigate("series");
                        break;
                }

            });

        });

    }

}