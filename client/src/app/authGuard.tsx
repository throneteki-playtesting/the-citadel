import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isSafeRelativePath } from "common/utils";
import { useAuth } from "../hooks/useAuth";

export default function AuthGuard() {
    const { isAuthenticated, isLoading } = useAuth();
    const { pathname, search } = useLocation();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
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
