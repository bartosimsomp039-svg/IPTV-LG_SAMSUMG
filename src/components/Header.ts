export class Header {

    public render(): string {

        return `

<header class="header">

    <div class="logo">

        <h1>🐺 WOLF IPTV</h1>

        <span>Premium</span>

    </div>

    <nav class="menu">

        <button class="active">LIVE</button>

        <button>MOVIES</button>

        <button>SERIES</button>

        <button>FAVORITOS</button>

        <button>AJUSTES</button>

    </nav>

</header>

`;

    }

}