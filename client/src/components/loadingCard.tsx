import { Skeleton } from "@heroui/react";
import classNames from "classnames";

const LoadingCard = ({ className, ...props }: LoadingCardProps) => {
    return (
        <div
            className={classNames("block relative aspect-[240/333] h-auto max-w-full max-h-full", className)}
            {...props}
        >
            <Skeleton className="w-full h-full rounded-xl" />
        </div>
    );
};

type LoadingCardProps = React.ComponentProps<"div">;

export default LoadingCard;
