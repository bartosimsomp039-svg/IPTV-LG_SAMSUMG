import "./Player.css";

import { Router } from "../../app/Router";
import { DataManager } from "../../services/DataManager";
import { Navigation } from "../../services/Navigation";
import { PlayerService } from "../../services/PlayerService";

export class Player {

    private player: PlayerService | null = null;

    private controlsVisible = true;

    private hideTimer: number | null = null;

    private clockTimer: number | null = null;

    private focusedIndex = 1;

    private buttons: HTMLElement[] = [];

    private readonly actions = [
        "prev",
        "play",
        "pause",
        "next",
        "list",
        "epg",
        "favorites",
        "settings"
    ];

    public render(): string {

        return `

<div class="player-screen">

    <video
        id="player-video"
        autoplay
        playsinline
    ></video>

    <div
        id="player-ui"
        class="player-ui visible"
    >

        <div class="player-top">

            <div class="player-info">

                <button class="player-back-btn" id="playerBackBtn">&#8592; Volver</button>

                <div
                    id="player-title"
                    class="player-title"
                ></div>

                <div
                    id="player-program"
                    class="player-program"
                >
                    Sin información EPG
                </div>

            </div>

            <div
                id="player-clock"
                class="player-clock"
            >
                00:00
            </div>

        </div>

        <div class="player-bottom">

            <div class="player-progress">

                <div
                    id="player-progress-fill"
                    class="player-progress-fill"
                ></div>

            </div>

            <div class="player-controls">

                <div class="player-btn">⏮</div>

                <div class="player-btn focused">▶</div>

                <div class="player-btn">⏸</div>

                <div class="player-btn">⏭</div>

                <div class="player-btn">Lista</div>

                <div class="player-btn">EPG</div>

                <div class="player-btn">Favoritos</div>

                <div class="player-btn">Configuración</div>

            </div>

        </div>

    </div>

</div>

`;

    }

    public init(): void {

        const element =
            document.getElementById("player-video");

        if (!(element instanceof HTMLVideoElement)) {
            return;
        }

        const video = element;

        const title =
            document.getElementById("player-title");

        if (!title) {
            return;
        }

        // Botón volver
        const backBtn =
            document.getElementById("playerBackBtn");

        if (backBtn) {

            backBtn.addEventListener("click", () => {

                this.exitPlayer();

            });

        }

        // Cargar según el tipo
        const type = Navigation.type;

        if (type === "movie" && Navigation.selectedMovie) {

            title.textContent = Navigation.selectedMovie.name;

            this.player = new PlayerService(video, DataManager.getXtream());

            this.player.play(Navigation.selectedMovie as any);

        } else if (type === "series") {

    title.textContent = Navigation.selectedSeries?.name ?? "Serie";

    this.player = new PlayerService(video, DataManager.getXtream());

    this.player.playSeriesEpisode(
        Navigation.episodeStreamId,
        Navigation.episodeExtension
    );

        } else if (Navigation.selectedChannel) {

            title.textContent = Navigation.selectedChannel.name;

            this.player = new PlayerService(video, DataManager.getXtream());

            this.player.play(Navigation.selectedChannel);

        } else {

            // Si no hay nada seleccionado, volver atrás
            this.exitPlayer();

            return;

        }

        this.buttons = Array.from(
            document.querySelectorAll(".player-btn")
        ) as HTMLElement[];

        this.updateFocus();

        this.startClock();

        this.showControls();

        window.addEventListener("keydown", this.onKeyDown);

    }

    private startClock(): void {

        this.updateClock();

        this.clockTimer =
            window.setInterval(() => {

                this.updateClock();

            }, 1000);

    }

    private updateClock(): void {

        const element =
            document.getElementById("player-clock");

        if (!element) {
            return;
        }

        const now = new Date();

        element.textContent =
            now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

    }

    private showControls(): void {

        const ui =
            document.getElementById("player-ui");

        if (!ui) {
            return;
        }

        ui.classList.add("visible");

        this.controlsVisible = true;

        if (this.hideTimer !== null) {

            clearTimeout(this.hideTimer);

        }

        this.hideTimer =
            window.setTimeout(() => {

                ui.classList.remove("visible");

                this.controlsVisible = false;

            }, 5000);

    }

    private onKeyDown = (event: KeyboardEvent): void => {

        this.showControls();

        switch (event.key) {

            case "ArrowUp":
                this.executeChannelPrevious();
                break;

            case "ArrowDown":
                this.executeChannelNext();
                break;

            case "ArrowLeft":
                this.moveLeft();
                break;

            case "ArrowRight":
                this.moveRight();
                break;

            case "Enter":
                this.executeAction();
                break;

            case "Escape":
            case "Backspace":

                if (this.controlsVisible) {

                    document
                        .getElementById("player-ui")
                        ?.classList.remove("visible");

                    this.controlsVisible = false;

                    return;

                }

                this.exitPlayer();

                break;

        }

    };

    private updateFocus(): void {

        this.buttons.forEach((button, index) => {

            button.classList.toggle(
                "focused",
                index === this.focusedIndex
            );

        });

    }

    private moveLeft(): void {

        if (this.focusedIndex > 0) {

            this.focusedIndex--;

            this.updateFocus();

        }

    }

    private moveRight(): void {

        if (this.focusedIndex < this.buttons.length - 1) {

            this.focusedIndex++;

            this.updateFocus();

        }

    }

    private executeAction(): void {

        const action = this.actions[this.focusedIndex];

        const video =
            document.getElementById("player-video");

        if (!(video instanceof HTMLVideoElement)) {
            return;
        }

        switch (action) {

            case "play":
                void video.play();
                break;

            case "pause":

                if (video.paused) {
                    void video.play();
                } else {
                    video.pause();
                }

                break;

            case "prev":
                this.executeChannelPrevious();
                break;

            case "next":
                this.executeChannelNext();
                break;

            case "list":
                console.log("Abrir lista");
                break;

            case "epg":
                console.log("Abrir EPG");
                break;

            case "favorites":
                console.log("Favoritos");
                break;

            case "settings":
                console.log("Configuración");
                break;

        }

    }

    private executeChannelPrevious(): void {

        console.log("Canal anterior");

    }

    private executeChannelNext(): void {

        console.log("Canal siguiente");

    }

    private exitPlayer(): void {

        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
        }

        if (this.clockTimer !== null) {
            clearInterval(this.clockTimer);
        }

        window.removeEventListener("keydown", this.onKeyDown);

        this.player?.destroy();

        // Volver a la página correcta según el tipo
        const type = Navigation.type;

        if (type === "movie") {

            Router.getInstance().navigate("movies");

        } else if (type === "series") {

            Router.getInstance().navigate("series-detail");

        } else {

            Router.getInstance().navigate("live");

        }

    }

}