import express from "express";
import asyncHandler from "express-async-handler";
import { dataService } from "@/services";
import { validateRequest } from "@/middleware/permissions";
import Permission from "common/models/permissions";
import { StatusCodes } from "http-status-codes";
import { GlobalStats } from "common/models/stats";
import { NoteType, noteTypes } from "common/models/cards";

const router = express.Router();

const CARD_CHANGE_DAY_RANGE = 7;
const ACTIVE_USER_DAY_RANGE = 14;

function daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

// Read sitewide stats
router.get("/",
    validateRequest(Permission.READ_STATS_GLOBAL),
    asyncHandler(async (_req, res) => {
        const activeProjects = await dataService.projects.read({ active: true });
        const projectNumbers = activeProjects.map((project) => project.number);

        const [changedCards, testingCards, reviews, activeUsersTotal] = await Promise.all([
            projectNumbers.length > 0
                ? dataService.cards.read(projectNumbers.map((project) => ({ project, latest: true, updated: { $gte: daysAgo(CARD_CHANGE_DAY_RANGE) }, note: { $exists: true } })))
                : [],
            projectNumbers.length > 0
                ? dataService.cards.read(projectNumbers.map((project) => ({ project, latest: true, released: { $exists: false } })))
                : [],
            projectNumbers.length > 0
                ? dataService.reviews.read(projectNumbers.map((project) => ({ project })))
                : [],
            dataService.users.count({ lastLogin: { $gte: daysAgo(ACTIVE_USER_DAY_RANGE) } })
        ]);

        const byNoteType = noteTypes.reduce((map, type) => ({ ...map, [type]: 0 }), {} as Record<NoteType, number>);
        for (const card of changedCards) {
            if (card.note) byNoteType[card.note.type]++;
        }

        const testingProjectCount = new Set(testingCards.map((card) => card.project)).size;
        const playtesterCount = new Set(reviews.map((review) => review.reviewer)).size;

        const stats: GlobalStats = {
            cardChanges: { total: changedCards.length, byNoteType },
            activeUsers: { total: activeUsersTotal },
            cardsInTesting: { total: testingCards.length, projectCount: testingProjectCount },
            reviews: { total: reviews.length, playtesterCount }
        };

        res.status(StatusCodes.OK).json(stats);
    })
);

export default router;
