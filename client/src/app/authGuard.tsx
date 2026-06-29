import { Navigate, Outlet, useLocation } from "react-router-dom";
import api from "../api";

export default function AuthGuard() {
    const { data: user, isLoading } = api.useGetMeQuery();
    const { pathname } = useLocation();
    const isAuthenticated = !!user && user.id !== "anonymous";

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Let /authRedirect through so it can display OAuth error toasts before redirecting
    if (!isAuthenticated && pathname !== "/authRedirect") {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
