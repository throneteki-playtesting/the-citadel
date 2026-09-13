import { ReactNode } from "react";
import classNames from "classnames";

/** One line under a `SectionTitle`, describing what the section/question is asking for - shared by
 *  the suggestion editor and the read-only detail page, since both describe the same questions. */
export default function SectionBlurb({ children, className }: { children: ReactNode; className?: string }) {
    return <p className={classNames("text-xs text-foreground/50 -mt-1", className)}>{children}</p>;
}
