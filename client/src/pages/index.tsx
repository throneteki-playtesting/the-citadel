import Permission from "common/models/permissions";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import Home from "./home";
import { lazy, ReactElement } from "react";
import AuthRedirect from "./authRedirect";
import { User } from "common/models/auth";

// Every page but the landing ones loads as its own chunk, when first visited - so opening the Citadel doesn't parse
// the admin pages, the review form and every editor before anything can respond. `Page` holds a skeleton meanwhile.
const Suggestions = lazy(() => import("./suggestions"));
const SuggestionDetail = lazy(() => import("./suggestions/suggestionDetail"));
const Users = lazy(() => import("./admin/users"));
const Roles = lazy(() => import("./admin/roles"));
const Integrations = lazy(() => import("./admin/integrations"));
const Logs = lazy(() => import("./admin/logs"));
const Project = lazy(() => import("./project"));
const Card = lazy(() => import("./card"));
const SubmitReview = lazy(() => import("./review"));
const PlaytestingUpdate = lazy(() => import("./playtestingUpdate"));
const Privacy = lazy(() => import("./privacy"));

export type NavItem = PageItem | MenuItem;
export type PageItem = BaseNav & { path: string; element?: ReactElement; endContent?: ReactElement };
export type MenuItem = BaseNav & { subPages: NavItem[] };
type BaseNav = { label?: string; permission?: SingleOrArray<Permission> };

export const navItems: NavItem[] = [
    {
        path: "/",
        label: "Home",
        element: <Home />
    },
    {
        path: "/authRedirect",
        element: <AuthRedirect />
    },
    {
        path: "/privacy",
        element: <Privacy />
    },
    {
        path: "/project/:project",
        permission: Permission.READ_PROJECTS,
        element: <Project />
    },
    {
        path: "/project/:project/update/:version",
        permission: Permission.READ_PLAYTESTING_UPDATES,
        element: <PlaytestingUpdate />
    },
    {
        path: "/project/:project/:number",
        permission: Permission.READ_CARDS,
        element: <Card />
    },
    {
        label: "Projects",
        subPages: [
            {
                path: "/project/create",
                label: "+ New Project",
                permission: Permission.CREATE_PROJECTS,
                element: <Project isCreating={true} />
            }
        ]
    },
    {
        path: "/suggestions",
        label: "Suggestions",
        permission: Permission.READ_SUGGESTIONS,
        element: <Suggestions />
    },
    {
        path: "/suggestions/:id",
        permission: Permission.READ_SUGGESTIONS,
        element: <SuggestionDetail />
    },
    {
        path: "/review/submit",
        element: <SubmitReview />,
        label: "Submit Review",
        permission: Permission.MAKE_REVIEWS
    },
    {
        label: "Admin",
        subPages: [
            {
                path: "/users",
                label: "Users",
                permission: Permission.READ_USERS,
                element: <Users />
            },
            {
                path: "/roles",
                label: "Roles",
                permission: Permission.READ_ROLES,
                element: <Roles />
            },
            {
                path: "/integrations",
                label: "Integrations",
                permission: Permission.READ_INTEGRATIONS,
                element: <Integrations />
            },
            {
                path: "/logs",
                label: "Logs",
                permission: Permission.READ_LOGS,
                element: <Logs />
            }
        ]
    }
] as const;

export const profileItems: PageItem[] = [] as const;

export const isVisibleFor = (page: NavItem, user?: User): boolean => {
    const pagePermissions = asArray(page.permission ?? []);

    let isVisible = false;
    if (isMenuItem(page) && page.subPages.length > 0) {
        isVisible = page.subPages.some((subPage) => isVisibleFor(subPage, user));

        if (!isVisible && pagePermissions.length > 0) {
            isVisible = hasPermission(user, ...pagePermissions);
        }
    } else {
        isVisible = hasPermission(user, ...pagePermissions);
    }
    return isVisible;
};

export function isPageItem(navItem: NavItem): navItem is PageItem {
    return "path" in navItem;
}
export function isMenuItem(navItem: NavItem): navItem is MenuItem {
    return "subPages" in navItem;
}
