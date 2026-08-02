import { faHandBackFist, faThumbsDown, faThumbsUp, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { StatementAnswer } from "common/models/reviews";

// Shared so an answer reads identically wherever it appears - as icons, as a label, or as a hue on its own
export const statementAnswerDetails: Record<
    StatementAnswer,
    { label: string; icon: IconDefinition; repeat: number; color: string }
> = {
    "strongly disagree": { label: "Strongly Disagree", icon: faThumbsDown, repeat: 2, color: "text-statement-1" },
    "somewhat disagree": { label: "Somewhat Disagree", icon: faThumbsDown, repeat: 1, color: "text-statement-2" },
    "neither agree nor disagree": {
        label: "Neither Agree/Disagree",
        icon: faHandBackFist,
        repeat: 1,
        color: "text-statement-3"
    },
    "somewhat agree": { label: "Somewhat Agree", icon: faThumbsUp, repeat: 1, color: "text-statement-4" },
    "strongly agree": { label: "Strongly Agree", icon: faThumbsUp, repeat: 2, color: "text-statement-5" }
};
