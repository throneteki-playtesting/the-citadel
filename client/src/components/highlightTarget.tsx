import classNames from "classnames";
import useHighlightOnMount from "../hooks/useHighlightOnMount";

export function HighlightTarget({ targetId, children, className, ...rest }: HighlightTargetProps) {
    const { ref, isHighlighted } = useHighlightOnMount<HTMLDivElement>(targetId);

    return (
        <div ref={ref} className={classNames("relative", className)} {...rest}>
            <div className={classNames(
                "absolute inset-0 pointer-events-none ring-2 ring-inset ring-primary transition-opacity duration-700",
                isHighlighted ? "opacity-100" : "opacity-0"
            )}/>
            {children}
        </div>
    );
}

type HighlightTargetProps = React.HTMLAttributes<HTMLDivElement> & {
  targetId: string;
  children: React.ReactNode;
}
