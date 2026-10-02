import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import { IRefinementRequirement } from "common/models/refinement";
import StatusNotice from "../../../components/statusNotice";
import { ChecklistItems } from "../../../components/checklist";

/** What refinement still needs before a card's design can be called complete */
export default function RefinementChecklist({ requirements }: RefinementChecklistProps) {
    const isDone = requirements.every((requirement) => requirement.done);

    return (
        <StatusNotice
            icon={isDone ? faCircleCheck : faListCheck}
            color={isDone ? "success" : "neutral"}
            label="Refinement checklist"
            detail={<RefinementChecklistItems requirements={requirements} />}
        />
    );
}

/** The checklist without its notice, shared with the project list so both read the same */
export function RefinementChecklistItems({ requirements }: RefinementChecklistProps) {
    return <ChecklistItems items={requirements} />;
}

type RefinementChecklistProps = {
    requirements: IRefinementRequirement[];
};
