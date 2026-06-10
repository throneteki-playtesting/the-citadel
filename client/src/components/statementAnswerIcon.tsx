import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHandBackFist, faThumbsDown, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { StatementAnswer } from "common/models/reviews";
import { TouchTooltip } from "./touchTooltip";

const iconContent: Record<StatementAnswer, { label: string; icon: React.ReactNode }> = {
    "strongly disagree": { label: "Strongly Disagree", icon: <span><FontAwesomeIcon icon={faThumbsDown} className="text-statement-1"/><FontAwesomeIcon icon={faThumbsDown} className="text-statement-1"/></span> },
    "somewhat disagree": { label: "Somewhat Disagree", icon: <span><FontAwesomeIcon icon={faThumbsDown} className="text-statement-2"/></span> },
    "neither agree nor disagree": { label: "Neither Agree/Disagree", icon: <span><FontAwesomeIcon icon={faHandBackFist} className="text-statement-3"/></span> },
    "somewhat agree": { label: "Somewhat Agree", icon: <span><FontAwesomeIcon icon={faThumbsUp} className="text-statement-4"/></span> },
    "strongly agree": { label: "Strongly Agree", icon: <span><FontAwesomeIcon icon={faThumbsUp} className="text-statement-5"/><FontAwesomeIcon icon={faThumbsUp} className="text-statement-5"/></span> }
};

export default function StatementAnswerIcon({ answer, tooltip = true }: StatementAnswerIconProps) {
    const { label, icon } = iconContent[answer];
    if (!tooltip) return icon;
    return <TouchTooltip content={label}>{icon}</TouchTooltip>;
}

type StatementAnswerIconProps = {
    answer: StatementAnswer;
    tooltip?: boolean;
}
