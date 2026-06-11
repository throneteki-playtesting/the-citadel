import classNames from "classnames";
import useHighlightOnMount from "../hooks/useHighlightOnMount";

export function HighlightTarget({ targetId, children, className, ...rest }: HighlightTargetProps) {
    const { ref, isHighlighted } = useHighlightOnMount<HTMLDivElement>(targetId);

    return (
        <div
            ref={ref}
            className={classNames(
                "transition-all duration-700 ring-2 ring-inset ring-offset-0",
                isHighlighted ? "ring-primary" : "ring-transparent",
                className
            )}
            {...rest}
        >
            {children}
        </div>
    );
}

type HighlightTargetProps = React.HTMLAttributes<HTMLDivElement> & {
  targetId: string;
  children: React.ReactNode;
}
