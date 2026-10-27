import { Navigate, Outlet, useHref, useLocation, useMatches, useNavigate } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { isSafeRelativePath } from "common/utils";
import { useAuth } from "../hooks/useAuth";
import NavigationBar from "../components/navigation";
import { RouteHandle } from "./routeHandle";

export default function AuthGuard() {
    const { isAuthenticated, isLoading } = useAuth();
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const matches = useMatches();

    // Who is asking isn't known yet, so the app itself can't start - its live connection would race the session
    // check for a token. The shell is drawn regardless, with the page's own skeleton in it, so a page opened from
    // scratch arrives into its own shape rather than into a spinner which then swaps for it.
    if (isLoading) {
        const fallback = (matches.at(-1)?.handle as RouteHandle | undefined)?.fallback;
        return (
            <HeroUIProvider navigate={navigate} useHref={useHref}>
                <NavigationBar />
                <div className="overflow-x-clip">
                    <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl">{fallback}</div>
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
