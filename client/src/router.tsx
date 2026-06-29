import { createBrowserRouter, RouteObject } from "react-router-dom";
import App from "./app/app";
import AuthGuard from "./app/authGuard";
import Error from "./components/error";
import Page from "./pages/page";
import { isPageItem, NavItem, navItems } from "./pages";
import LoginPage from "./pages/login";
import Render from "./pages/render";

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
                errorElement: <Error content="An unknown error has occurred. Please contact administrator." />,
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
                element: item.element ? <Page required={item.permission}>{item.element}</Page> : null
            });
        } else {
            item.subPages.forEach(addRoute);
        }
    };

    navItems.forEach(addRoute);
    return routes;
}

export default router;