import { Divider } from "@heroui/react";
import { CardLaneBreakdown } from "common/progress/calc";

// Tooltip body for anything showing a card's overall progress - the lanes behind that one number
export default function CardProgressBreakdown({ progress }: { progress: CardLaneBreakdown }) {
    return (
        <div className="flex flex-col gap-0.5 py-1 text-sm font-sans">
            <div>Design: {Math.round(progress.design)}%</div>
            <div>Artwork: {Math.round(progress.artwork)}%</div>
            <div>Production: {Math.round(progress.production)}%</div>
            <Divider className="my-1" />
            <div className="font-semibold">Overall: {Math.round(progress.overall)}%</div>
        </div>
    );
}
