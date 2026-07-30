// import { FactionCardCount, IProject, Type } from "common/models/projects";
// import { cloneDeep } from "lodash-es";

// class Project implements IProject {
//     // octgnId?: string;
//     public number: number;
//     public name: string;
//     public code: string;
//     public active: boolean;
//     public draft: boolean;
//     public description?: string;
//     public type: Type;
//     public script?: string;
//     public cardCount: FactionCardCount;
//     public version: number;
//     public milestone?: number;
//     public mandateUrl?: string;
//     public formUrl?: string;
//     public emoji?: string;
//     public created: Date;
//     public updated: Date;

//     constructor(data: IProject) {
//         this.number = data.number;
//         this.name = data.name;
//         this.code = data.code;
//         this.active = data.active;
//         this.draft = data.draft;
//         this.description = data.description;
//         this.type = data.type;
//         this.script = data.script;
//         this.cardCount = cloneDeep(data.cardCount);
//         this.version = data.version;
//         this.milestone = data.milestone;
//         this.mandateUrl = data.mandateUrl;
//         this.formUrl = data.formUrl;
//         this.emoji = data.emoji;
//         this.created = data.created;
//         this.updated = data.updated;
//     }

//     clone() {
//         const cloned = cloneDeep(this) as IProject;
//         return new Project(cloned);
//     }

//     /**
//      * Converts card into format appropriate for general JSON
//      */
//     toJSON() {
//         const obj = {
//             number: this.number,
//             name: this.name,
//             code: this.code,
//             active: this.active,
//             draft: this.draft,
//             description: this.description,
//             type: this.type,
//             script: this.script,
//             cardCount: this.cardCount,
//             version: this.version,
//             milestone: this.milestone,
//             mandateUrl: this.mandateUrl,
//             formUrl: this.formUrl,
//             emoji: this.emoji,
//             created: this.created,
//             updated: this.updated
//         } as IProject;
//         return obj;
//     }

//     toString() {
//         return this.name;
//     }
// }

// export default Project;
