import classNames from "classnames";
import useHighlightOnMount from "../hooks/useHighlightOnMount";

export function HighlightTarget({ targetId, children, className, ...rest }: HighlightTargetProps) {
    const { ref, isHighlighted } = useHighlightOnMount<HTMLDivElement>(targetId);

    return (
        <div ref={ref} className={classNames("relative isolate", className)} {...rest}>
            <div
                className={classNames(
                    "absolute inset-0 z-10 pointer-events-none rounded-[inherit] ring-2 ring-inset ring-primary transition-opacity duration-700",
                    isHighlighted ? "opacity-100" : "opacity-0"
                )}
            />
            {children}
        </div>
    );
}

type HighlightTargetProps = React.HTMLAttributes<HTMLDivElement> & {
    targetId: string;
    children: React.ReactNode;
};
