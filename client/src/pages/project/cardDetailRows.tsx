import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Divider } from "@heroui/react";
import classNames from "classnames";
import { challengeIcons, Faction, IPlaytestCard, plotStats } from "common/models/cards";
import { IProject } from "common/models/projects";
import { ISlot } from "common/models/slots";
import { IArtist, creditedArtistId } from "common/models/artwork";
import { getFinalCardNumber, parseCardCode, typeNames } from "common/utils";
import { factionAccentClasses } from "../../constants";
import ThronesIcon from "../../components/thronesIcon";
import { TouchTooltip } from "../../components/touchTooltip";
import RichText from "../../components/richText";

/** One card's raw data for the detail view - only the fields not already on `card`, resolved from its slot */
interface ICardDetailRow {
    card: IPlaytestCard;
    illustrator?: string;
    portfolio?: string;
    releaseNumber?: number;
    packCode?: string;
}

const ABSENT = <span className="text-foreground/30">?</span>;

const plotStatLabels: Record<(typeof plotStats)[number], string> = {
    income: "Income",
    initiative: "Initiative",
    claim: "Claim",
    reserve: "Reserve"
};

function buildRowData(
    cards: IPlaytestCard[],
    slots: ISlot[],
    project: Pick<IProject, "releases">,
    artists: IArtist[]
): ICardDetailRow[] {
    const slotsByNumber = new Map(slots.map((slot) => [slot.number, slot]));

    return cards.map((card) => {
        const slot = slotsByNumber.get(card.number);
        // card.illustrator is authoritative once set (see the publish-time backfill in releases.ts)
        const creditedArtist = slot && artists.find((artist) => artist.id === creditedArtistId(slot.statuses.artwork));

        return {
            card,
            illustrator: card.illustrator || creditedArtist?.name,
            portfolio: creditedArtist?.portfolio,
            releaseNumber: slot && getFinalCardNumber(project, slot),
            packCode: slot?.release?.code
        };
    });
}

/** For the Projects page's detail view: raw card data, given the cards, their slots, the project and artists */
export function buildDetailRows(
    cards: IPlaytestCard[],
    slots: ISlot[],
    project: Pick<IProject, "releases">,
    artists: IArtist[]
): ReactNode[] {
    return buildRowData(cards, slots, project, artists).map((entry) => renderCardDetailRow(entry));
}

// Raw card data, styled after the Artworks row (accent stripe). Desktop splits stats left / text right;
// mobile folds to one vertical stack, stats above text. Lower-case (not a JSX component) so this file's
// one component-shaped export, buildDetailRows, is the only thing fast refresh has to reason about.
function renderCardDetailRow(entry: ICardDetailRow): ReactNode {
    const { card } = entry;
    const showsCost = card.type !== "plot" && card.type !== "agenda";
    const showsStrengthAndIcons = card.type === "character";
    const showsPlotStats = card.type === "plot";
    const showsLoyalty = card.faction !== "neutral";
    const showsPlacement = entry.releaseNumber !== undefined || entry.packCode;

    return (
        <div
            key={parseCardCode(false, card.project, card.number)}
            className="flex items-stretch gap-2 sm:gap-3 rounded-md border border-content3 bg-content1 overflow-hidden"
        >
            <div className={classNames("w-1.5 shrink-0", factionAccentClasses[card.faction as Faction])} />
            <div className="flex-1 min-w-0 py-2 pr-2 sm:pr-3 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <TouchTooltip content={typeNames[card.type]}>
                        <ThronesIcon name={card.type} className="shrink-0 text-foreground/50 cursor-help" />
                    </TouchTooltip>
                    {card.unique && <ThronesIcon name="unique" className="shrink-0 text-foreground/50" />}
                    <Link
                        to={`/project/${card.project}/${card.number}`}
                        className="text-sm font-cinzel hover:text-primary hover:underline"
                    >
                        {card.name}
                    </Link>
                    <span className="text-xs text-foreground/40">
                        {parseCardCode(false, card.project, card.number)}
                    </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="sm:w-56 shrink-0 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                        {showsCost && renderField("Cost", card.cost ?? ABSENT)}
                        {showsStrengthAndIcons && renderField("Strength", card.strength ?? ABSENT)}
                        {showsStrengthAndIcons &&
                            renderField(
                                "Icons",
                                <span className="flex items-center gap-1">
                                    {challengeIcons.map((icon) => (
                                        <ThronesIcon
                                            key={icon}
                                            name={icon}
                                            className={card.icons?.[icon] ? "text-primary" : "text-foreground/20"}
                                        />
                                    ))}
                                </span>
                            )}
                        {showsPlotStats &&
                            plotStats.map((stat) =>
                                renderField(plotStatLabels[stat], card.plotStats?.[stat] ?? ABSENT, stat)
                            )}
                        {showsLoyalty &&
                            renderField(
                                "Loyalty",
                                card.loyal === undefined ? ABSENT : card.loyal ? "Loyal" : "Non-Loyal"
                            )}
                        {renderField(
                            "Traits",
                            card.traits.length > 0 ? (
                                <span className="italic font-bold">
                                    {card.traits.map((trait) => `${trait}.`).join(" ")}
                                </span>
                            ) : (
                                "-"
                            )
                        )}
                        {renderField(
                            "Illustrator",
                            <div className="flex flex-col gap-0.5">
                                <span>{entry.illustrator || ABSENT}</span>
                                {entry.portfolio && (
                                    <a
                                        href={entry.portfolio}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary hover:underline break-all"
                                    >
                                        {entry.portfolio}
                                    </a>
                                )}
                            </div>,
                            "illustrator",
                            "basis-full"
                        )}
                        {showsPlacement && (
                            <div className="flex gap-4">
                                {entry.releaseNumber !== undefined && renderField("Release #", entry.releaseNumber)}
                                {entry.packCode && renderField("Pack Code", entry.packCode)}
                            </div>
                        )}
                    </div>
                    <Divider orientation="vertical" className="hidden sm:block h-auto self-stretch" />
                    <div className="flex-1 min-w-0 text-xs">
                        {renderField(
                            "Text Area",
                            <div className="flex flex-col gap-2">
                                <div className="leading-relaxed break-words">
                                    {card.text ? <RichText html={card.text} /> : ABSENT}
                                </div>
                                {card.designer && (
                                    <div className="font-bold text-foreground/60 break-words">{card.designer}</div>
                                )}
                                {card.flavor && (
                                    <div className="italic leading-relaxed break-words text-foreground/60">
                                        <RichText html={card.flavor} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function renderField(label: string, children: ReactNode, key?: string, className?: string): ReactNode {
    return (
        <div key={key ?? label} className={classNames("flex flex-col gap-0.5 min-w-0", className)}>
            <span className="text-[0.6rem] uppercase tracking-widest text-foreground/40">{label}</span>
            <span className="select-text">{children}</span>
        </div>
    );
}
