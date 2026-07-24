import type { Poster } from "../models/Poster";

export class PosterCard {

    private _poster;

    constructor(poster: Poster) {

        this._poster = poster;

    }

    public render(): string {

        const image = this._poster.image
            ? `<img src="${this._poster.image}" alt="${this._poster.title}">`
            : `<div class="poster-placeholder">🐺</div>`;

        return `

<div
    class="poster"
    tabindex="0"
    data-type="${this._poster.type}"
    data-category="${this._poster.categoryId}">

    ${image}

    <span>${this._poster.title}</span>

</div>

`;

    }

}