import classNames from "classnames";
import useHighlightOnMount from "../hooks/useHighlightOnMount";

export function HighlightTarget({ targetId, isRequested, children, className, ...rest }: HighlightTargetProps) {
    const { ref, isHighlighted } = useHighlightOnMount<HTMLDivElement>(targetId, isRequested);

    return (
        <div ref={ref} className={classNames("relative isolate scroll-mt-20", className)} {...rest}>
            <div
                className={classNames(
                    "absolute inset-0 z-10 pointer-events-none rounded-[inherit] ring-2 ring-inset ring-primary bg-primary/10",
                    isHighlighted ? "opacity-100 duration-150" : "opacity-0 duration-1000",
                    "transition-opacity"
                )}
            />
            {children}
        </div>
    );
}

type HighlightTargetProps = React.HTMLAttributes<HTMLDivElement> & {
    targetId: string;
    /** Highlight without routing the request through history - for a pointer already on this page */
    isRequested?: boolean;
    children: React.ReactNode;
};
