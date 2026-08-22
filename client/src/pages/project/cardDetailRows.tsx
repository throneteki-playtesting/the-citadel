import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Divider } from "@heroui/react";
import { motion } from "framer-motion";
import classNames from "classnames";
import { challengeIcons, Faction, IPlaytestCard, plotStats } from "common/models/cards";
import { IProject } from "common/models/projects";
import { ISlot } from "common/models/slots";
import { IArtist, commissionPaymentLabel, creditedArtistId } from "common/models/artwork";
import { getFinalCardNumber, parseCardCode, thronesColors, titleCase, typeNames } from "common/utils";
import { stripUrlProtocol } from "../../utils";
import { factionAccentClasses, reorderTransition } from "../../constants";
import ThronesIcon from "../../components/thronesIcon";
import { TouchTooltip } from "../../components/touchTooltip";
import RichText from "../../components/richText";
import { formatPlotModifier, PlotModifiers, splitPlotModifiers } from "../../components/cardEditor/components/plotModifiers";
import { DraftActions } from "../card/cardDetail";

/** One card's raw data for the detail view - only the fields not already on `card`, resolved from its slot */
interface ICardDetailRow {
    card: IPlaytestCard;
    illustrator?: string;
    portfolio?: string;
    /** "Free Commission", or who paid for a commissioned piece - undefined for any other artwork type */
    commissionNote?: string;
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
        const artwork = slot?.statuses.artwork;
        const creditedArtist = artwork && artists.find((artist) => artist.id === creditedArtistId(artwork));
        const commissioned = artwork?.type === "commissioned" ? artwork.commissioned : undefined;

        return {
            card,
            illustrator: card.illustrator || creditedArtist?.name,
            portfolio: creditedArtist?.portfolio,
            commissionNote: commissionPaymentLabel(commissioned),
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
    const { body: textBody, modifiers: plotModifiers } = splitPlotModifiers(card.text);

    return (
        <motion.div
            key={parseCardCode(false, card.project, card.number)}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reorderTransition}
            className="w-full flex items-stretch gap-2 sm:gap-3 rounded-md border border-content3 bg-content1 overflow-hidden"
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
                    <DraftActions project={card.project} number={card.number} showDivider={false} className="ml-auto" />
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="w-full sm:w-56 md:w-64 lg:w-72 shrink-0 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                        {showsCost && renderField("Cost", card.cost ?? ABSENT)}
                        {showsStrengthAndIcons && renderField("STR", card.strength ?? ABSENT)}
                        {showsStrengthAndIcons &&
                            renderField(
                                "Icons",
                                <span className="flex items-center gap-1">
                                    {challengeIcons.map((icon) => (
                                        <ThronesIcon
                                            key={icon}
                                            name={icon}
                                            className={classNames({ "text-foreground/20": !card.icons?.[icon] })}
                                        />
                                    ))}
                                </span>
                            )}
                        {showsPlotStats &&
                            plotStats.map((stat) =>
                                renderField(plotStatLabels[stat], card.plotStats?.[stat] ?? ABSENT)
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
                        {showsPlacement &&
                            entry.releaseNumber !== undefined &&
                            renderField("Release #", entry.releaseNumber)}
                        {showsPlacement && entry.packCode && renderField("Pack Code", entry.packCode)}
                        {renderField(
                            "Illustrator",
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                                <span>{entry.illustrator || ABSENT}</span>
                                {entry.portfolio && (
                                    <>
                                        <span className="text-foreground/30 select-none">&middot;</span>
                                        <a
                                            href={entry.portfolio}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hover:underline break-all"
                                        >
                                            {stripUrlProtocol(entry.portfolio)}
                                        </a>
                                    </>
                                )}
                                {entry.commissionNote && (
                                    <>
                                        <span className="text-foreground/30 select-none">&middot;</span>
                                        <span className="text-foreground/60">{entry.commissionNote}</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <Divider className="sm:hidden" />
                    <Divider orientation="vertical" className="hidden sm:block h-auto self-stretch" />
                    <div className="flex-1 min-w-0 text-xs">
                        {renderField(
                            "Text Area",
                            <div className="flex flex-col gap-2">
                                {renderCardText(textBody)}
                                {renderPlotModifierChips(plotModifiers)}
                                {card.designer && (
                                    <div className="font-bold text-foreground/60 break-words">{card.designer}</div>
                                )}
                                {card.flavor && (
                                    <div className="italic leading-relaxed whitespace-pre-wrap break-words text-foreground/60">
                                        <RichText html={card.flavor} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/** Read-only render of a card's plot modifiers as chips */
function renderPlotModifierChips(modifiers: PlotModifiers): ReactNode {
    const active = plotStats.filter((stat) => modifiers[stat] !== undefined);
    if (active.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-1">
            {active.map((stat) => (
                <span
                    key={stat}
                    className="flex items-center gap-1 rounded-full border py-0.5 px-2"
                    style={{ borderColor: thronesColors[stat] }}
                >
                    <span className="text-[0.625rem] leading-none font-semibold uppercase tracking-wider opacity-70">
                        {titleCase(stat)}
                    </span>
                    <span className="text-medium leading-none font-bold tabular-nums">
                        {formatPlotModifier(modifiers[stat]!)}
                    </span>
                </span>
            ))}
        </div>
    );
}

/** Renders card text, treating each blank-separated line as its own paragraph */
function renderCardText(text?: string): ReactNode {
    if (!text) {
        return ABSENT;
    }
    return (
        <div className="flex flex-col gap-1">
            {text.split("\n").map((line, index) => (
                <div key={index} className="leading-snug break-words">
                    {line ? <RichText html={line} /> : " "}
                </div>
            ))}
        </div>
    );
}

function renderField(label: string, children: ReactNode): ReactNode {
    return (
        <div key={label} className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[0.6rem] uppercase tracking-widest text-foreground/40">{label}</span>
            <span className="select-text">{children}</span>
        </div>
    );
}
