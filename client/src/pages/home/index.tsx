import { ProjectsSummary } from "./projectsSummary";
import RecentCardChanges from "./recentCardChanges";
import RecentPlaytestingUpdates from "./recentPlaytestingUpdates";
import RecentSubmissions from "./recentSubmissions";
import StatCards from "./statCards";

const Home = () => {
    return (
        <div className="flex flex-col gap-4">
            <StatCards />
            <ProjectsSummary />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                <RecentCardChanges />
                <RecentSubmissions />
                <RecentPlaytestingUpdates />
            </div>
        </div>
    );
};

export default Home;