import { dataService } from "@/services";
import {
    cardLaneBreakdown,
    cardOverallPct,
    releaseProgressBreakdown,
    projectOverallPct,
    ICardProgress
} from "common/progress/calc";
import { IProject, IProjectProgress, IProjectRelease, IReleaseProgress } from "common/models/projects";
import {
    checksClosedBy,
    IReleaseCheckCard,
    IReleaseCheckParticipation,
    ISlot,
    isCheckStale
} from "common/models/slots";
import { mean, sortBy } from "lodash-es";
import { ApiErrorResponse } from "@/errors";
import { StatusCodes } from "http-status-codes";
import Permission from "common/models/permissions";

export async function computeCardProgress(project: number, number: number): Promise<ICardProgress> {
    const [slot] = await dataService.slots.read({ project, number });
    if (!slot) {
        throw new ApiErrorResponse(
            StatusCodes.NOT_FOUND,
            "Invalid Data",
            `Slot #${number} does not exist for project #${project}`
        );
    }
    // Statuses ride along with the percentages, sparing the card page a second (more permissive) slot read
    return {
        ...cardLaneBreakdown(slot.statuses),
        statuses: {
            design: slot.statuses.design.status,
            artwork: slot.statuses.artwork.status,
            production: slot.statuses.production
        }
    };
}

function releaseProgress(release: IProjectRelease, allSlots: ISlot[]): IReleaseProgress {
    const releaseSlots = allSlots.filter((slot) => slot.release?.code === release.code);
    const cardsPct = releaseSlots.length === 0 ? 0 : mean(releaseSlots.map((slot) => cardOverallPct(slot.statuses)));

    return {
        code: release.code,
        ...releaseProgressBreakdown(cardsPct, release.status),
        cardCount: releaseSlots.length
    };
}

// Every release in one pass - a project page renders all of them, so this avoids a scan per release
export async function computeReleasesProgress(project: IProject): Promise<IReleaseProgress[]> {
    const allSlots = await dataService.slots.read({ project: project.number });
    return project.releases.map((release) => releaseProgress(release, allSlots));
}

// Release check state for every card in a release still taking checks, for the Discord announcement. Checks
// are counted against each card's latest confirmed version, so a card whose checks all went stale reads as
// unchecked. Cards whose design is locked in drop out entirely - nobody can answer for them any more
export async function computeReleaseCheckCards(project: number, code: string): Promise<IReleaseCheckCard[]> {
    const allSlots = await dataService.slots.read({ project });
    const slots = sortBy(
        allSlots.filter((slot) => slot.release?.code === code && !checksClosedBy(slot.statuses.design.status)),
        "number"
    );

    return await Promise.all(
        slots.map(async (slot) => {
            const [latest] = await dataService.cards.read({ project, number: slot.number, latest: true });
            const checks = slot.statuses.design.checks;

            return {
                number: slot.number,
                name: latest?.name ?? `#${slot.number}`,
                checkedBy: checks
                    .filter((entry) => !isCheckStale(entry, latest?.version))
                    .map((entry) => entry.createdBy)
            };
        })
    );
}

// Turnout by person, not by card - one member sweeping every card leaves everyone else's checks outstanding
export async function computeReleaseCheckParticipation(
    cards: IReleaseCheckCard[]
): Promise<IReleaseCheckParticipation> {
    const eligibleIds = await dataService.users.findIdsByPermission(Permission.SUBMIT_RELEASE_CHECK);
    // Checks outlive the permission which allowed them, so anyone who has since lost it drops out of both counts
    const submitters = [...new Set(cards.flatMap((card) => card.checkedBy))].filter((id) => eligibleIds.has(id));
    const completed = submitters.filter((id) => cards.every((card) => card.checkedBy.includes(id)));

    return { eligible: eligibleIds.size, started: submitters.length, completed };
}

export async function computeProjectProgress(project: IProject): Promise<IProjectProgress> {
    const allSlots = await dataService.slots.read({ project: project.number });
    const cardPcts = allSlots.map((slot) => cardOverallPct(slot.statuses));

    return {
        overall: projectOverallPct(cardPcts),
        cardCount: allSlots.length
    };
}
