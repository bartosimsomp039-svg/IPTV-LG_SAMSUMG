import type { Category } from "../models/Category";
import { CategoryCard } from "./CategoryCard";

export class CategoryRow {

    private title;
    private categories;

    constructor(
        title: string,
        categories: Category[]
    ) {

        this.title = title;
        this.categories = categories;

    }

    public render(): string {

        let html = "";

        this.categories.forEach(category => {

            html += new CategoryCard({

                id: category.category_id,

                title: category.category_name

            }).render();

        });

        return `

<section class="row">

<h2>${this.title}</h2>

<div class="cards">

${html}

</div>

</section>

`;

    }

}