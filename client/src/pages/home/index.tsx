import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@heroui/react";
import Permission from "common/models/permissions";
import PermissionGate from "../../components/permissionGate";
import { ProjectsSummary } from "./projectsSummary";
import RecentCardChanges from "./recentCardChanges";
import RecentPlaytestingUpdates from "./recentPlaytestingUpdates";
import RecentSubmissions from "./recentSubmissions";
import RecentSummary from "./recentSummary";
import StatCards from "./statCards";
import { hasPermission } from "common/utils";
import SectionTitle from "../../components/sectionTitle";
import usePageTitle from "../../hooks/usePageTitle";
import WelcomeBanner from "./welcomeBanner";
import Reveal from "../../components/reveal";
import PlaytestOnboardingModal from "./playtestOnboardingModal";
import { useOnboardingModal } from "../../hooks/useOnboardingModal";

export default function Home() {
    usePageTitle("Home");
    const { isOpen, isEligible, open, close } = useOnboardingModal("playtest");
    // Each section fades in on its own, top first, filling in from its own skeleton - a section which turns out to
    // have nothing to show leaves an empty wrapper, which `empty:hidden` takes out of the column's gaps
    let sectionIndex = 0;

    return (
        <div className="flex flex-col gap-5">
            <Reveal index={sectionIndex++} className="px-4 md:px-0 flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex-1">
                    <div className="text-5xl font-cinzel font-semibold tracking-widest text-primary">The Citadel</div>
                    <div className="text-lg font-crimson italic text-secondary">— The archive of card design</div>
                </div>
                {isEligible && (
                    <Button
                        color="primary"
                        variant="flat"
                        startContent={<FontAwesomeIcon icon={faCircleQuestion} />}
                        onPress={open}
                        className="font-cinzel shrink-0 font-semibold"
                    >
                        How do I playtest?
                    </Button>
                )}
            </Reveal>
            <PlaytestOnboardingModal isOpen={isOpen} onClose={close} />
            <Reveal index={sectionIndex++} className="empty:hidden">
                <WelcomeBanner onBecamePlaytester={open} />
            </Reveal>
            <Reveal index={sectionIndex++} className="empty:hidden">
                <StatCards />
            </Reveal>
            <PermissionGate requires={Permission.READ_PROJECTS}>
                <Reveal index={sectionIndex++} className="space-y-2">
                    <SectionTitle>Active Projects</SectionTitle>
                    <ProjectsSummary />
                </Reveal>
            </PermissionGate>
            <Reveal index={sectionIndex++} className="empty:hidden">
                <RecentSummary>
                    <PermissionGate requires={Permission.READ_CARDS}>
                        <RecentCardChanges />
                    </PermissionGate>
                    <PermissionGate
                        requires={(user) =>
                            hasPermission(user, Permission.READ_REVIEWS) ||
                            hasPermission(user, Permission.READ_SUGGESTIONS)
                        }
                    >
                        <RecentSubmissions />
                    </PermissionGate>
                    <PermissionGate requires={Permission.READ_PLAYTESTING_UPDATES}>
                        <RecentPlaytestingUpdates />
                    </PermissionGate>
                </RecentSummary>
            </Reveal>
        </div>
    );
}
