import Permission from "common/models/permissions";
import PermissionGate from "../../components/permissionGate";
import { ProjectsSummary } from "./projectsSummary";
import RecentCardChanges from "./recentCardChanges";
import RecentPlaytestingUpdates from "./recentPlaytestingUpdates";
import RecentSubmissions from "./recentSubmissions";
import StatCards from "./statCards";
import { hasPermission } from "common/utils";
import { usePageTitle } from "../../api/hooks";
import SectionTitle from "../../components/sectionTitle";

export default function Home() {
    usePageTitle("Home");
    return (
        <div className="flex flex-col gap-5">
            <div>
                <div className="text-5xl font-cinzel font-semibold tracking-widest text-primary">The Citadel</div>
                <div className="text-lg font-crimson italic text-secondary">— The archive of card design</div>
            </div>
            <StatCards />
            <PermissionGate requires={Permission.READ_PROJECTS}>
                <div className="space-y-2">
                    <SectionTitle>
                        Active Projects
                    </SectionTitle>
                    <ProjectsSummary />
                </div>
            </PermissionGate>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <PermissionGate requires={Permission.READ_CARDS}>
                    <RecentCardChanges />
                </PermissionGate>
                <PermissionGate requires={(user) => hasPermission(user, Permission.READ_REVIEWS) || hasPermission(user, Permission.READ_SUGGESTIONS)}>
                    <RecentSubmissions />
                </PermissionGate>
                <PermissionGate requires={Permission.READ_PLAYTESTING_UPDATES}>
                    <RecentPlaytestingUpdates />
                </PermissionGate>
            </div>
        </div>
    );
};
