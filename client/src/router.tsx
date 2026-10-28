import { createBrowserRouter, RouteObject } from "react-router-dom";
import App from "./app/app";
import AuthGuard from "./app/authGuard";
import RouteError from "./components/routeError";
import Page from "./pages/page";
import { isPageItem, NavItem, navItems } from "./pages";
import LoginPage from "./pages/login";
import Render from "./pages/render";
import ProjectScope from "./components/projectScope";

const router = createBrowserRouter([
    {
        path: "/render",
        element: <Render />
    },
    {
        path: "/login",
        element: <LoginPage />
    },
    {
        element: <AuthGuard />,
        children: [
            {
                element: <App />,
                errorElement: <RouteError />,
                children: pageItemRoutes()
            }
        ]
    }
]);

function pageItemRoutes() {
    const routes: RouteObject[] = [];
    const addRoute = (item: NavItem) => {
        if (isPageItem(item)) {
            routes.push({
                path: item.path,
                // A page failing shows its error in place of the page, inside the app's shell - not in place of the app
                errorElement: <RouteError />,
                // Nothing is waited on - it only starts what the page will ask for, so the requests overlap
                loader: ({ params }) => {
                    item.preload?.(params);
                    return null;
                },
                // Keyed by its path, as React Router renders every route's element without one. Every route has
                // this same shape, so unkeyed React would keep one Page - and the Suspense boundary inside it - from
                // route to route, and a navigation (always a transition) suspending on a page's code would hold the
                // page being left on screen until it arrived, rather than showing the new route's skeleton
                element: item.element ? (
                    <ProjectScope key={item.path}>
                        <Page required={item.permission}>{item.element}</Page>
                    </ProjectScope>
                ) : null
            });
        } else {
            item.subPages.forEach(addRoute);
        }
    };

    navItems.forEach(addRoute);
    return routes;
}

export default router;
