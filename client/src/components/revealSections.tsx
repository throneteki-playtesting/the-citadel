import { Children, isValidElement, ReactNode } from "react";
import Reveal from "./reveal";

/**
 * A page's top-level blocks, each fading in once as the page draws, top first - for a page whose sections are simply
 * the children of one wrapper. A section still waiting on its own data arrives as its own skeleton, inside its fade.
 * Children which render nothing (a closed modal, a section left out) still take a place in the stagger, but no room.
 */
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
