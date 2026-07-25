import "./Live.css";

import { Header } from "../../components/Header";
import { ChannelCard } from "../../components/ChannelCard";
import { DataManager } from "../../services/DataManager";
import { Navigation } from "../../services/Navigation";
import { Router } from "../../app/Router";
import { FocusManager } from "../../tv/FocusManager";
import { Keyboard } from "../../tv/Keyboard";

export class Live {

    public render(): string {

        const header = new Header();

        return `

<div class="live">

    ${header.render()}

    <div class="live-content">

        <button class="back-btn" id="backBtn">&#8592; Volver</button>

        <h1 id="categoryTitle">📺 LIVE TV</h1>

        <div id="liveChannels" class="channel-grid"></div>

    </div>

</div>

`;

    }

    public init(): void {

        const goBack = () => Router.getInstance().navigate("home");

        const backBtn = document.getElementById("backBtn");

        if (backBtn) {
            backBtn.addEventListener("click", goBack);
        }

        const title = document.getElementById("categoryTitle");

        if (title) {
            title.textContent = Navigation.categoryName;
        }

        const container = document.getElementById("liveChannels");

        if (!container) return;

        const channels = Navigation.categoryId === 0
    ? DataManager.liveChannels
    : DataManager.liveChannels.filter(
        channel => Number(channel.category_id) === Navigation.categoryId
    );

        let html = "";

        channels.forEach(channel => {
            html += new ChannelCard(channel).render();
        });

        container.innerHTML = html;

        const cards = container.querySelectorAll<HTMLElement>(".channel-card");

        cards.forEach((card, index) => {

            card.addEventListener("click", () => {
                Navigation.selectedChannel = channels[index];
                Router.getInstance().navigate("player");
            });

        });

        // Navegación con control remoto
        const focus = new FocusManager();

        focus.register(".channel-card");

        new Keyboard(focus, goBack);

    }

}