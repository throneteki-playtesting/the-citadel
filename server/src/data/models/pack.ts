// import { ICard, IPlaytestCard } from "common/models/cards";
// import BaseCard from "./cards/baseCard";
// import PlaytestingCard from "./cards/playtestingCard";

// class Pack {
//     public short: string;
//     public name: string;
//     public cards: ICard[];
//     public releaseDate?: Date;
//     constructor(short: string, name: string, cards: ICard[], releaseDate?: Date) {
//         this.short = short;
//         this.name = name;
//         this.cards = cards;
//         this.releaseDate = releaseDate;
//     }

//     validate() {
//         // TODO: Validation
//         // - Check number of cards is even?
//         // - Check all imageUrl's reach an endpoint
//         return true;
//     }

//     toPackData() {
//         const releaseDate = this.releaseDate ? new Date(this.releaseDate.getTime() - (this.releaseDate.getTimezoneOffset() * 60000)).toISOString().split("T")[0] : null;
//         // TODO: Pull "Pack" into two separate classes; one for development, one for releases!
//         const cards = this.cards.map((card) => releaseDate ? new BaseCard(card) : new PlaytestingCard(card as IPlaytestCard));
//         return {
//             cgdbId: null,
//             Code: this.short,
//             name: !releaseDate ? `${this.name} (Unreleased)` : this.name,
//             releaseDate,
//             ...(!releaseDate && { workInProgress: true }),
//             cards: cards.map((card) => card.toPackData())
//         };
//     }
// }

// export { Pack };
