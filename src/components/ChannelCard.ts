import type { Channel } from "../models/Channel";

export class ChannelCard {

    private channel: Channel;

    constructor(channel: Channel) {

        this.channel = channel;

    }

    public render(): string {

        const logo = this.channel.stream_icon
            ? `<img
                src="${this.channel.stream_icon}"
                alt="${this.channel.name}"
                width="70"
                height="70"
                style="width:70px;height:70px;max-width:70px;max-height:70px;object-fit:contain;display:block;flex-shrink:0;"
                onerror="this.style.display='none';this.parentElement.querySelector('.channel-placeholder').style.display='flex'"
              ><div class="channel-placeholder" style="display:none">📺</div>`
            : `<div class="channel-placeholder">📺</div>`;

        return `

<div
    class="channel-card"
    tabindex="0"
    data-stream="${this.channel.stream_id}">

    ${logo}

    <span>${this.channel.name}</span>

</div>

`;

    }

}