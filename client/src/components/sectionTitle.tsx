import classNames from "classnames";

const sizeMap: Record<TitleSize, string> = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-xl",
    "2xl": "text-2xl"
};

const indentMap: Record<TitleIndent, string> = {
    none: "w-0",
    xs: "w-2",
    sm: "w-4",
    md: "w-8",
    lg: "w-16",
    xl: "w-24"
};

export default function SectionTitle({
    children,
    size = "md",
    indent = "sm",
    className,
    ...props
}: SectionTitleProps) {
    return (
        <div className={classNames("flex items-center gap-4", className)} {...props}>
            <div className={classNames("h-px shrink-0 bg-primary/30", indentMap[indent])} />
            <span className={classNames("font-cinzel uppercase tracking-widest text-primary", sizeMap[size])}>
                {children}
            </span>
            <div className="h-px flex-1 bg-primary/30" />
        </div>
    );
}

type TitleSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
type TitleIndent = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export type SectionTitleProps = React.ComponentPropsWithoutRef<"div"> & {
  size?: TitleSize;
  indent?: TitleIndent;
};