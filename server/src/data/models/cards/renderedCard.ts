// import { Code, IRenderCard, Watermark } from "common/models/cards";
// import BaseCard from "./baseCard";

// class RenderedCard extends BaseCard implements IRenderCard {
//     // Playtesting specific properties
//     public key: string;
//     public watermark: Watermark;

//     constructor(data: IRenderCard) {
//         super({ ...data, code: data.code ?? "00000" });
//         this.key = data.key;
//         this.watermark = data.watermark;
//     }

//     override toJSON() {
//         const base = super.toJSON();
//         const obj = {
//             ...base,
//             ...(this.watermark !== undefined && { watermark: this.watermark })
//         } as IRenderCard & { code: Code };
//         return obj;
//     }

//     override clone() {
//         const base = super.clone().toJSON();
//         const data = {
//             ...base,
//             watermark: this.watermark
//         } as IRenderCard;

//         return new RenderedCard(data);
//     }
// }

// export default RenderedCard;