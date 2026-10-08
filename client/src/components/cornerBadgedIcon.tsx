import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";

// An icon with a smaller one over its corner, which sets a different meaning on the first
export default function CornerBadgedIcon({ icon, badge, badgeClassName, className }: CornerBadgedIconProps) {
    return (
        <span className={classNames("relative inline-flex size-4 items-center justify-center", className)}>
            <FontAwesomeIcon icon={icon} />
            <FontAwesomeIcon icon={badge} className={classNames("absolute text-[0.6rem]", badgeClassName)} />
        </span>
    );
}

type CornerBadgedIconProps = {
    icon: IconDefinition;
    badge: IconDefinition;
    /** Where over the icon the badge sits */
    badgeClassName: string;
    className?: string;
};
