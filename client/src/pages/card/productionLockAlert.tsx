import { Alert } from "@heroui/react";
import { cardLanes, CardLaneKey } from "../../constants";

// Shown in the design & artwork modals once production has started, since the API refuses to let
// either lane regress out from under an already-composited card file
export default function ProductionLockAlert({ lane }: ProductionLockAlertProps) {
    return (
        <Alert
            color="warning"
            variant="faded"
            title="Locked while production is underway"
            description={`This card's file is already being assembled, so its ${cardLanes[lane].heading.toLowerCase()} can no longer be changed. Revert Production back to Pending if this needs another pass.`}
        />
    );
}

type ProductionLockAlertProps = {
    lane: Exclude<CardLaneKey, "production">;
};
