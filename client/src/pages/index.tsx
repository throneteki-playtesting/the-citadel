import Permission from "common/models/permissions";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import Home from "./home";
import { lazy, ReactElement } from "react";
import { Params } from "react-router-dom";
import api from "../api";
import { store } from "../api/store";
import { parseParamNumber } from "../utils";
import AuthRedirect from "./authRedirect";
import { User } from "common/models/auth";
import ProjectPageSkeleton from "./project/projectPageSkeleton";
import CardDetailSkeleton from "./card/cardDetailSkeleton";

// Every page but the landing ones loads as its own chunk, when first visited - so opening the Citadel doesn't parse
// the admin pages, the review form and every editor before anything can respond. `Page` holds a skeleton meanwhile.
const Suggestions = lazy(() => import("./suggestions"));
const SuggestionDetail = lazy(() => import("./suggestions/suggestionDetail"));
const Users = lazy(() => import("./admin/users"));
const Roles = lazy(() => import("./admin/roles"));
const Integrations = lazy(() => import("./admin/integrations"));
const Logs = lazy(() => import("./admin/logs"));
const loadProject = () => import("./project");
const loadCard = () => import("./card");
const Project = lazy(loadProject);
const Card = lazy(loadCard);
const SubmitReview = lazy(() => import("./review"));
const PlaytestingUpdate = lazy(() => import("./playtestingUpdate"));
const Privacy = lazy(() => import("./privacy"));

export type NavItem = PageItem | MenuItem;
export type PageItem = BaseNav & {
    path: string;
    element?: ReactElement;
    endContent?: ReactElement;
    /** Shown while the page can't draw yet - its code arriving, or the user and project it checks against - which
     *  is best the page's own loading skeleton, so it arrives into the same shape rather than swapping one for it */
    fallback?: ReactElement;
    /** Started as soon as the route is matched - before the user is known, and before anything is drawn - for what
     *  the page will ask for first and depends on nothing but the url: its own code, and the records it is about */
    preload?: (params: Params) => void;
};

// A project route's own record, asked for alongside the sign-in check rather than after it
function prefetchProject(params: Params) {
    const number = parseParamNumber(params.project);
    if (number !== undefined) {
        store.dispatch(api.util.prefetch("getProject", { number }, {}));
    }
    return number;
}
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
        element: <Project />,
        fallback: <ProjectPageSkeleton />,
        preload: (params) => {
            loadProject();
            const project = prefetchProject(params);
            // Its cards, by the very arguments ProjectContent asks with, so the two are one request
            if (project !== undefined) {
                store.dispatch(api.util.prefetch("getCards", { filter: { project, latest: true } }, {}));
            }
        }
    },
    {
        path: "/project/:project/update/:version",
        permission: Permission.READ_PLAYTESTING_UPDATES,
        element: <PlaytestingUpdate />
    },
    {
        path: "/project/:project/:number",
        permission: Permission.READ_CARDS,
        element: <Card />,
        fallback: <CardDetailSkeleton />,
        preload: (params) => {
            loadCard();
            const project = prefetchProject(params);
            const number = parseParamNumber(params.number);
            if (project !== undefined && number !== undefined) {
                store.dispatch(api.util.prefetch("getCard", { project, number, version: "visible" }, {}));
            }
        }
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
