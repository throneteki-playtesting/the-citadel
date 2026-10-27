import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";

export type Point = { icon: IconDefinition; text: string };

/** A short run of facts, each beside an icon - what something means, or what is about to happen */
export default function PointList({ points }: { points: Point[] }) {
    return (
        <ul className="flex flex-col gap-1.5">
            {points.map(({ icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-sm text-foreground/70">
                    <FontAwesomeIcon icon={icon} className="shrink-0 mt-0.5 w-4 text-foreground/40" />
                    <span>{text}</span>
                </li>
            ))}
        </ul>
    );
}
