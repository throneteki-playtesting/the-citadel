import { Children, isValidElement, ReactNode } from "react";
import Reveal from "./reveal";

/** A page's top-level blocks, each fading in once as the page draws, top first. Children which render nothing
 *  still take a place in the stagger, but no room. */
export default function RevealSections({ className, children }: RevealSectionsProps) {
    return (
        <div className={className}>
            {Children.toArray(children).map((child, index) => (
                <Reveal
                    key={isValidElement(child) ? (child.key ?? index) : index}
                    index={index}
                    className="empty:hidden"
                >
                    {child}
                </Reveal>
            ))}
        </div>
    );
}

type RevealSectionsProps = {
    className?: string;
    children: ReactNode;
};
