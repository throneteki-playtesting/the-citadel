import classNames from "classnames";
import { BaseElementProps } from "../types";

export default function TooltipDetail({ className, style, heading, children }: TooltipDetailProps) {
    return (
        <div className={classNames("max-w-60 px-1 py-1 space-y-1", className)} style={style}>
            <div className="font-cinzel uppercase tracking-wide text-xs">{heading}</div>
            {children && (
                <div className="font-sans normal-case text-xs text-foreground/70 leading-snug">{children}</div>
            )}
        </div>
    );
}

type TooltipDetailProps = BaseElementProps & {
    heading: React.ReactNode;
};
