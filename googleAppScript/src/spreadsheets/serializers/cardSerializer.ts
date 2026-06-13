import { factionNames, maxEnum, parseCardCode } from "common/utils";
import { getProperty, GooglePropertiesType } from "../../settings";
import { DataSerializer } from "./dataSerializer";
import * as Card from "common/models/cards";
import { DeepPartial } from "common/types";

export type CardSheet = "archive" | "latest";
class CardSerializer extends DataSerializer<Card.IPlaytestCard> {
    public richTextColumns = [CardColumn.Textbox, CardColumn.Flavor, CardColumn.NoteText, CardColumn.GithubIssue];
    private deserializeTypedNumber<T>(value: string) {
        try {
            const number = parseInt(value);
            return Number.isNaN(number) ? value as T : number;
        } catch {
            throw Error(`Invalid value '${value}' cannot be cast to Number or special type`);
        }
    }
    public deserialize(values: string[]) {
        const project = parseInt(getProperty(GooglePropertiesType.Script, "number"));
        const faction = Object.entries(factionNames).find(([, name]) => name === values[CardColumn.Faction])[0] as Card.Faction;
        const model = {
            number: parseInt(values[CardColumn.Number]),
            faction,
            name: values[CardColumn.Name],
            type: values[CardColumn.Type].toLowerCase() as Card.Type,
            traits: values[CardColumn.Traits].split(".").map(t => t.trim()).filter(t => t && t != "-"),
            text: values[CardColumn.Textbox],
            flavor: values[CardColumn.Flavor] || undefined,
            illustrator: values[CardColumn.Illustrator] || undefined,
            designer: values[CardColumn.Designer] || undefined,
            deckLimit: values[CardColumn.Limit] ? parseInt(values[CardColumn.Limit]) : Card.DefaultDeckLimit[values[CardColumn.Type].toLowerCase() as Card.Type],
            loyal: faction !== "neutral" ? values[CardColumn.Loyal].toLowerCase() === "loyal" : undefined,
            quantity: 3,
            version: values[CardColumn.Version],
            project,
            note: values[CardColumn.NoteType] ? {
                type: values[CardColumn.NoteType].toLowerCase() as Card.NoteType,
                text: values[CardColumn.NoteText]
            } : undefined,
            // playtesting: values[CardColumn.PlaytestVersion] || undefined,
            _metadata: this.extractLinkText(values[CardColumn.GithubIssue], (link, text) => ({ github: { status: text, issueUrl: link } })) || undefined,
            release: values[CardColumn.PackShort] ? {
                short: values[CardColumn.PackShort],
                number: parseInt(values[CardColumn.ReleaseNumber])
            } : undefined
        } as Card.IPlaytestCard;
        model.code = parseCardCode(!!model.release, project, model.number);

        switch (model.type) {
            case "character":
                model.strength = this.deserializeTypedNumber(values[CardColumn.Strength]);
                const iconsString = values[CardColumn.Icons];
                model.icons = {
                    military: iconsString.includes("M"),
                    intrigue: iconsString.includes("I"),
                    power: iconsString.includes("P")
                };
            case "attachment":
            case "location":
                model.unique = values[CardColumn.Unique] === "Unique";
            case "event":
                model.cost = this.deserializeTypedNumber(values[CardColumn.Cost] !== undefined ? values[CardColumn.Cost] : "-");
                break;
            case "plot":
                model.plotStats = {
                    income: this.deserializeTypedNumber(values[CardColumn.Income]),
                    initiative: this.deserializeTypedNumber(values[CardColumn.Initiative]),
                    claim: this.deserializeTypedNumber(values[CardColumn.Claim]),
                    reserve: this.deserializeTypedNumber(values[CardColumn.Reserve])
                };
            case "agenda":
                // Nothing additional to add
                break;
        }
        return model;
    }

    public serialize(model: Card.IPlaytestCard) {
        // Initialise "empty" values, with dashes for all dashable columns (eg. Loyal, Unique, ...)
        const values: string[] = Array.from({ length: maxEnum(CardColumn) }, (v, i) => [CardColumn.Loyal, CardColumn.Unique, CardColumn.Cost, CardColumn.Strength, CardColumn.Icons, CardColumn.Traits].includes(i) ? "-" : "");
        values[CardColumn.Number] = model.number.toString();
        values[CardColumn.Version] = model.version;
        values[CardColumn.Faction] = factionNames[model.faction];
        values[CardColumn.Name] = model.name;
        values[CardColumn.Type] = model.type;
        values[CardColumn.Loyal] = model.loyal !== undefined ? (model.loyal ? "Loyal" : "Non-Loyal") : "-";
        values[CardColumn.Traits] = model.traits.length > 0 ? model.traits.map(t => t + ".").join(" ") : "-";
        values[CardColumn.Textbox] = model.text;
        values[CardColumn.Flavor] = model.flavor || "";
        values[CardColumn.Limit] = model.deckLimit !== Card.DefaultDeckLimit[model.type] ? model.deckLimit.toString() : "";
        values[CardColumn.Designer] = model.designer || "";
        values[CardColumn.Illustrator] = model.illustrator || "";
        values[CardColumn.NoteType] = model.note ? model.note.type as string : "";
        values[CardColumn.NoteText] = model.note?.text || "";
        // values[CardColumn.PlaytestVersion] = model.playtesting || "";
        values[CardColumn.GithubIssue] = model._metadata?.github ? `<a href="${model._metadata.github.issueUrl}">${model._metadata.github.status}</a>` : "";
        values[CardColumn.PackShort] = model.release?.short || "";
        values[CardColumn.ReleaseNumber] = model.release?.number.toString() || "";

        switch (model.type) {
            case "character":
                values[CardColumn.Strength] = model.strength?.toString() || "-";
                const iconLetters = [
                    ... model.icons?.military ? ["M"] : [],
                    ... model.icons?.intrigue ? ["I"] : [],
                    ... model.icons?.power ? ["P"] : []
                ];
                values[CardColumn.Icons] = iconLetters.join(" / ");
            case "attachment":
            case "location":
                values[CardColumn.Unique] = model.unique ? "Unique" : "Non-Unique";
            case "event":
                values[CardColumn.Cost] = model.cost?.toString() || "-";
                break;
            case "plot":
                values[CardColumn.Income] = model.plotStats?.income.toString();
                values[CardColumn.Initiative] = model.plotStats?.initiative.toString();
                values[CardColumn.Claim] = model.plotStats?.claim.toString();
                values[CardColumn.Reserve] = model.plotStats?.reserve.toString();
            case "agenda":
            // Nothing to set
        }

        return values;
    }

    public matches(values: string[], index: number, filter: DeepPartial<Card.IPlaytestCard>) {
        const compare = (a: number | string | boolean | undefined, b: number | string | boolean) => {
            if (!a) {
                return false;
            }
            return a.toString().toLowerCase() === b.toString().toLowerCase();
        };

        return (
            compare(filter.number, parseInt(values[CardColumn.Number]))
            && compare(filter.version, values[CardColumn.Version])
        );
    }

    public filter(values: string[], index: number, filter?: DeepPartial<Card.IPlaytestCard>) {
        if (!filter || Object.keys(filter).length === 0) {
            return true;
        }

        const compare = (a: number | string | boolean | undefined, b: number | string | boolean) => {
            if (!a) {
                return true;
            }
            if (typeof b === "boolean") {
                return a === b;
            }
            return a.toString().toLowerCase() === b.toString().toLowerCase();
        };
        return (
            compare(filter.number, parseInt(values[CardColumn.Number]))
            && compare(filter.version, values[CardColumn.Version])
            && compare(factionNames[filter.faction], values[CardColumn.Faction])
            && compare(filter.name, values[CardColumn.Name])
            && compare(filter.type, values[CardColumn.Type])
            && compare(filter.loyal, values[CardColumn.Loyal] === "Loyal" ? true : false)
            && compare(filter.unique, values[CardColumn.Unique] === "Unique" ? true : false)
            && compare(filter.cost, values[CardColumn.Cost])
            && compare(filter.strength, values[CardColumn.Strength])
            && compare(filter.plotStats?.income, values[CardColumn.Income])
            && compare(filter.plotStats?.initiative, values[CardColumn.Initiative])
            && compare(filter.plotStats?.claim, values[CardColumn.Claim])
            && compare(filter.plotStats?.reserve, values[CardColumn.Reserve])
            && compare(filter.text, values[CardColumn.Textbox])
            && compare(filter.flavor, values[CardColumn.Flavor])
            && compare(filter.deckLimit, parseInt(values[CardColumn.Limit]))
            && compare(filter.designer, values[CardColumn.Designer])
            && compare(filter.illustrator, values[CardColumn.Illustrator])
            && compare(filter.note?.type, values[CardColumn.NoteType])
            && compare(filter.note?.text, values[CardColumn.NoteText])
            && compare(filter._metadata?.github?.status, values[CardColumn.GithubIssue])
            && compare(filter.release?.short, values[CardColumn.PackShort])
            && compare(filter.release?.number, values[CardColumn.ReleaseNumber])
            // More expensive checks at the end
            && (!filter.icons || filter.icons?.military && values[CardColumn.Icons].includes("M"))
            && (!filter.icons || filter.icons?.intrigue && values[CardColumn.Icons].includes("I"))
            && (!filter.icons || filter.icons?.power && values[CardColumn.Icons].includes("P"))
            && (!filter.traits || values[CardColumn.Traits].split(".").some((trait) => filter.traits.some((ftrait) => ftrait === trait.trim())))
        );
    }
}

export enum CardColumn {
    Number,
    Version,
    Faction,
    Name,
    Type,
    Loyal,
    Unique,
    Income = Unique,
    Cost,
    Initiative = Cost,
    Strength,
    Claim = Strength,
    Icons,
    Reserve = Icons,
    Traits,
    Textbox,
    Flavor,
    Limit,
    Designer,
    Illustrator,
    NoteType,
    NoteText,
    PlaytestVersion,
    GithubIssue,
    PackShort,
    ReleaseNumber
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace CardSerializer {
    export const instance = new CardSerializer();
}

export {
    CardSerializer
};