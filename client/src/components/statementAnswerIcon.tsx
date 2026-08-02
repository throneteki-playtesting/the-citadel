import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { StatementAnswer } from "common/models/reviews";
import { statementAnswerDetails } from "./statementAnswerDetails";
import { TouchTooltip } from "./touchTooltip";

export default function StatementAnswerIcon({ answer, tooltip = true }: StatementAnswerIconProps) {
    const { label, icon, repeat, color } = statementAnswerDetails[answer];
    const icons = (
        <span>
            {Array.from({ length: repeat }, (_, index) => (
                <FontAwesomeIcon key={index} icon={icon} className={color} />
            ))}
        </span>
    );

    if (!tooltip) {
        return icons;
    }
    return <TouchTooltip content={label}>{icons}</TouchTooltip>;
}

type StatementAnswerIconProps = {
    answer: StatementAnswer;
    tooltip?: boolean;
};
