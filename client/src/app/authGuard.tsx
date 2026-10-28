import { Navigate, Outlet, useHref, useLocation, useNavigate } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { isSafeRelativePath } from "common/utils";
import { useAuth } from "../hooks/useAuth";
import NavigationBar from "../components/navigation";
import PageLoader from "../components/pageLoader";

export default function AuthGuard() {
    const { isAuthenticated, isLoading } = useAuth();
    const { pathname, search } = useLocation();
    const navigate = useNavigate();

    // The app can't start until who is asking is known, but the shell is drawn behind the loader every page waits
    // behind (see Page), so a page opened from scratch waits as one followed from a link does.
    if (isLoading) {
        return (
            <HeroUIProvider navigate={navigate} useHref={useHref}>
                <NavigationBar />
                <div className="overflow-x-clip">
                    <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl min-h-[calc(100dvh-4rem)]">
                        <PageLoader />
                    </div>
                </div>
            </HeroUIProvider>
        );
    }

    // Let /authRedirect through so it can display OAuth error toasts before redirecting
    if (!isAuthenticated && pathname !== "/authRedirect") {
        const returnUrl = pathname + search;
        const loginUrl =
            returnUrl !== "/" && isSafeRelativePath(returnUrl)
                ? `/login?returnUrl=${encodeURIComponent(returnUrl)}`
                : "/login";
        return <Navigate to={loginUrl} replace />;
    }

    return <Outlet />;
}
