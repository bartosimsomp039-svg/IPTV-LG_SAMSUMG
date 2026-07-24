export interface CategoryCardData {

    id: string;

    title: string;

    onClick?: () => void;

}

export class CategoryCard {

    private data;

    constructor(data: CategoryCardData) {

        this.data = data;

    }

    public render(): string {

        return `

<div
    class="category-card"
    tabindex="0"
    data-id="${this.data.id}">

    <div class="category-icon">

        📺

    </div>

    <div class="category-title">

        ${this.data.title}

    </div>

</div>

`;

    }

    public bind(): void {

        const card = document.querySelector(

            `.category-card[data-id="${this.data.id}"]`

        );

        if (card && this.data.onClick) {

            card.addEventListener("click", () => {

                this.data.onClick!();

            });

        }

    }

}