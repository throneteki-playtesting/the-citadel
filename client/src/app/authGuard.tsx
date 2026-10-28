import { Navigate, Outlet, useHref, useLocation, useNavigate } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { isSafeRelativePath } from "common/utils";
import { useAuth } from "../hooks/useAuth";
import NavigationBar from "../components/navigation";
import PageTitleSkeleton from "../components/pageTitleSkeleton";

export default function AuthGuard() {
    const { isAuthenticated, isLoading } = useAuth();
    const { pathname, search } = useLocation();
    const navigate = useNavigate();

    // Who is asking isn't known yet, so the app itself can't start - its live connection would race the session
    // check for a token. The shell is drawn regardless, with the title skeleton every page loads behind (see Page), so a
    // page opened from scratch arrives the same way as one followed from a link, rather than out of a spinner.
    if (isLoading) {
        return (
            <HeroUIProvider navigate={navigate} useHref={useHref}>
                <NavigationBar />
                <div className="overflow-x-clip">
                    {/* At least a screen tall beneath the navbar, so the footer stays out of sight while a page is still
                        only its title skeleton */}
                    <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl min-h-[calc(100dvh-4rem)]">
                        <PageTitleSkeleton />
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
