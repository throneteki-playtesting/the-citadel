import * as Ver from "semver";
import { GithubDetails, IPlaytestCard, NoteDetails, ReleaseDetails } from "common/models/cards";
import { parseCardCode, renderPlaytestingCard, SemanticVersion } from "common/utils";
import BaseCard from "./baseCard";
import RenderedCard from "./renderedCard";

class PlaytestingCard extends BaseCard implements IPlaytestCard {
    // Playtesting specific properties
    public project: number;
    public number: number;
    public version: SemanticVersion;
    public latest: boolean;
    public draft: boolean;
    public note?: NoteDetails;
    public playtesting?: SemanticVersion;
    public github?: GithubDetails;
    public release?: ReleaseDetails;
    public suggestionId?: string;

    constructor(data: IPlaytestCard) {
        super(data);
        this.version = data.version;
        this.project = data.project;
        this.number = data.number;
        this.latest = data.latest;
        this.draft = data.draft;
        this.note = data.note;
        this.playtesting = data.playtesting;
        this.github = data.github;
        this.release = data.release;
        this.suggestionId = data.suggestionId;
    }

    toString() {
        if (this.isPreview) {
            return `${this.name} (Preview)`;
        }
        return `${this.name} (${this.version})`;
    }

    /**
     * Converts card into format appropriate for json-data or API responses
     */
    override toJSON() {
        const base = super.toJSON();
        base.code = parseCardCode(this.isReleasable, this.project, this.release?.number || this.number);
        const obj = {
            ...base,
            version: this.version,
            project: this.project,
            number: this.number,
            ...(this.note !== undefined && { note: this.note }),
            playtesting: this.playtesting,
            ...(this.github !== undefined && { github: this.github }),
            ...(this.release !== undefined && { release: this.release }),
            ...(this.suggestionId !== undefined && { suggestionId: this.suggestionId })
        } as IPlaytestCard;
        return obj;
    }

    override toPackData() {
        const base = super.toPackData();
        return {
            ...base,
            version: this.version
        } as IPlaytestCard;
    }

    override clone() {
        const base = super.clone().toJSON();
        const data: IPlaytestCard = {
            ...base,
            project: this.project,
            number: this.number,
            version: this.version,
            latest: this.latest,
            draft: this.draft,
            note: this.note ? {
                type: this.note.type,
                text: this.note.text
            } : undefined,
            playtesting: this.playtesting,
            github: this.github ? {
                status: this.github.status,
                issueUrl: this.github.issueUrl
            } : undefined,
            release: this.release ? {
                short: this.release.short,
                number: this.release.number
            } : undefined,
            suggestionId: this.suggestionId
        };

        return new PlaytestingCard(data);
    }

    toRenderedCard() {
        const data = renderPlaytestingCard(this);
        return new RenderedCard(data);
    }

    private generateDevImageUrl(project: number, number: number, version: string) {
        return encodeURI(`${process.env.SERVER_HOST}/img/${project}/${number}@${version}.png`);
    }

    override get imageUrl() {
        if (this.isConcept) {
            return null;
        }

        if (!this.isReleasable) {
            return this.generateDevImageUrl(this.project, this.number, this.version);
        }
        const pack = this.release.short;
        const number = this.release.number;
        const name = this.name.replace(/[<>:"/\\|?*']/g, "").replace(/\s/g, "_");
        return encodeURI(`https://throneteki.ams3.cdn.digitaloceanspaces.com/packs/${pack}/${number}_${name}.png`);
    }

    get previousImageUrl() {
        if (!this.playtesting) {
            return null;
        }
        return this.generateDevImageUrl(
            this.project,
            this.number,
            this.playtesting
        );
    }

    /**
     * @returns True if this card is a concept (ie. not part of a project)
     */
    get isConcept() {
        return !this.project;
    }
    /**
     * @returns True if this card is the preview "pre-1.0.0" version
     */
    get isPreview() {
        return Ver.lt(this.version, "1.0.0") && !this.playtesting;
    }
    /**
     * @returns True if this card is the initial "1.0.0" version, and has not been playtested yet
     */
    get isPreTesting() {
        return this.isInitial && !this.playtesting;
    }
    /**
     * @returns True if this card is the inital "1.0.0" version
     */
    get isInitial() {
        return Ver.eq(this.version, "1.0.0");
    }
    /**
     * @returns True if the card is in a draft state (eg. it is currently being edited)
     */
    get isDraft() {
        return this.isPreview || this.isPreTesting || (!!this.note && this.note.type !== "implemented");
    }
    /**
     * @returns True if this card is currently the version being playtested
     */
    get isPlaytesting() {
        return !!this.playtesting && Ver.eq(this.version, this.playtesting);
    }

    /**
     * @returns The current implementation status of the card, based on its github status
     */
    get implementStatus() {
        // If issue is missing or "open"
        if ((this.github?.status || "open") === "open") {
            return "not implemented";
        }
        // If issue has been "closed"
        if (this.github.status === "closed") {
            return "recently implemented";
        }
        // Otherwise is "complete"
        return "implemented";
    }
    /**
     *  @returns True if this card has been changed (eg. not in its initial or currently playtested state)
     */
    get isChanged() {
        return !this.isPlaytesting && !!this.note && this.note.type !== "implemented";
    }

    /***
     * @returns True if this card has all data ready to be released
     */
    get isReleasable() {
        return !!this.release;
    }
}

export default PlaytestingCard;