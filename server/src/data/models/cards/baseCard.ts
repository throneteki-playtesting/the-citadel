// import { Code, Cost, Faction, ICard, Icons, PlotStats, Strength, Type } from "common/models/cards";

// class BaseCard implements ICard {
//     public code?: Code;
//     public cost?: Cost;
//     public deckLimit: number;
//     public designer?: string;
//     public faction: Faction;
//     public flavor?: string;
//     public icons?: Icons;
//     public illustrator: string;
//     public loyal?: boolean;
//     public name: string;
//     public plotStats?: PlotStats;
//     public strength?: Strength;
//     public traits: string[];
//     public text: string;
//     public type: Type;
//     public unique?: boolean;
//     public quantity: 1 | 2 | 3;
//     private _imageUrl?: string;

//     constructor(data: ICard) {
//         this.code = data.code;
//         this.cost = data.cost;
//         this.deckLimit = data.deckLimit;
//         this.designer = data.designer;
//         this.faction = data.faction;
//         this.flavor = data.flavor;
//         this.icons = data.icons;
//         this.illustrator = data.illustrator;
//         this.loyal = data.loyal;
//         this.name = data.name;
//         this.plotStats = data.plotStats;
//         this.strength = data.strength;
//         this.traits = data.traits;
//         this.text = data.text;
//         this.type = data.type;
//         this.unique = data.unique;
//         this.quantity = data.quantity;
//         this._imageUrl = data.imageUrl;
//     }

//     toString() {
//         return this.name;
//     }

//     /**
//      * Converts card into format appropriate for general JSON
//      */
//     toJSON() {
//         const obj = {
//             code: this.code,
//             type: this.type.toLowerCase(),
//             name: this.name,
//             // octgnId: null,
//             quantity: this.quantity,
//             ...(this.unique !== undefined && { unique: this.unique }),
//             faction: this.faction,
//             ...(this.plotStats !== undefined && { plotStats: this.plotStats }),
//             ...(this.loyal !== undefined && { loyal: this.loyal }),
//             ...(this.cost !== undefined && { cost: this.cost }),
//             ...(this.icons !== undefined && { icons: this.icons }),
//             ...(this.strength !== undefined && { strength: this.strength }),
//             traits: this.traits,
//             text: this.text,
//             ...(this.flavor && { flavor: this.flavor }),
//             deckLimit: this.deckLimit,
//             illustrator: this.illustrator || "?",
//             ...(this.designer && { designer: this.designer }),
//             imageUrl: this.imageUrl
//         } as ICard;
//         return obj;
//     }

//     /**
//      * Converts card into format appropriate for throneteki-json-data repository
//      */
//     toPackData() {
//         return this.toJSON();
//     }

//     /**
//      * @returns Clone of the current card
//      */
//     clone() {
//         const data = {
//             code: this.code,
//             cost: this.cost,
//             deckLimit: this.deckLimit,
//             designer: this.designer,
//             faction: this.faction,
//             flavor: this.flavor,
//             icons: this.icons ? {
//                 military: this.icons.military,
//                 intrigue: this.icons.intrigue,
//                 power: this.icons.power
//             } : undefined,
//             illustrator: this.illustrator,
//             loyal: this.loyal,
//             name: this.name,
//             plotStats: this.plotStats ? {
//                 income: this.plotStats.income,
//                 initiative: this.plotStats.initiative,
//                 claim: this.plotStats.claim,
//                 reserve: this.plotStats.reserve
//             } : undefined,
//             strength: this.strength,
//             traits: [...this.traits],
//             text: this.text,
//             type: this.type,
//             unique: this.unique,
//             quantity: this.quantity
//         } as ICard;

//         return new BaseCard(data);
//     }

//     get imageUrl() {
//         return this._imageUrl;
//     }
// }

// export default BaseCard;
