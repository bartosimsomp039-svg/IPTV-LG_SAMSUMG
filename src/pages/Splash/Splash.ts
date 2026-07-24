import "./Splash.css";

export class Splash {

    public render(): string {

        setTimeout(() => {

            window.dispatchEvent(
                new CustomEvent("splash-finished")
            );

        }, 3000);

        return `
            <div class="splash">

                <div class="logo">🐺</div>

                <h1>WOLF IPTV</h1>

                <p>Premium Smart TV</p>

            </div>
        `;

    }

}