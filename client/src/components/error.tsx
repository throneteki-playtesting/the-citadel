import { faCrow } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode } from "react";

export default function Error({ label = "The ravens have gone silent...", content }: ErrorProps) {
    return (
        <div className="w-full h-full flex justify-center items-center">
            <div className="flex flex-col items-center gap-2 text-center p-4">
                <FontAwesomeIcon icon={faCrow} size="4x" className="text-foreground/30" />
                {label && <div className="font-cinzel text-xl">{label}</div>}
                {content && <div className="font-crimson italic text-foreground/60">{content}</div>}
            </div>
        </div>
    );
}
type ErrorProps = {
    label?: string;
    content?: ReactNode | ReactNode[];
};
