import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@heroui/react";
import GuideBubble from "./guideBubble";
import SectionTitle from "./sectionTitle";

/** The description+button and title+icon-button rows shared by a tab's loaded view and its skeleton */
export default function TabGuideHeader({ description, title, guideLabel, onOpenGuide, isActive }: TabGuideHeaderProps) {
    return (
        <>
            <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-foreground/50">{description}</div>
                <Button
                    color="primary"
                    variant="flat"
                    size="sm"
                    startContent={<FontAwesomeIcon icon={faCircleQuestion} />}
                    onPress={onOpenGuide}
                    className="hidden sm:flex font-cinzel shrink-0 font-semibold"
                >
                    {guideLabel}
                </Button>
            </div>
            <div className="flex items-center gap-2">
                <SectionTitle size="lg" className="flex-1">
                    {title}
                </SectionTitle>
                <GuideBubble label={guideLabel} onOpen={onOpenGuide} isActive={isActive} />
            </div>
        </>
    );
}

type TabGuideHeaderProps = {
    description: string;
    title: string;
    guideLabel: string;
    onOpenGuide: () => void;
    /** False while the tab is not the one on show, so its bubble is not either */
    isActive: boolean;
};
