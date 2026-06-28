import Permission from "common/models/permissions";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import Home from "./home";
import { ReactElement } from "react";
import Suggestions from "./suggestions";
import CardEditorPage from "./cardEditor";
import Users from "./admin/users";
import Roles from "./admin/roles";
import AuthRedirect from "./authRedirect";
import Project from "./project";
import Card from "./card";
import SubmitReview from "./review";
import { User } from "common/models/auth";
import PlaytestingUpdate from "./playtestingUpdate";
import Privacy from "./privacy";

export type NavItem = PageItem | MenuItem;
export type PageItem = BaseNav & { path: string, element?: ReactElement };
export type MenuItem = BaseNav & { subPages: NavItem[] }
type BaseNav = { label?: string, permission?: SingleOrArray<Permission> }

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
        path: "/project/:number",
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
                element: <Project isCreating={true}/>
            }
        ]
    },
    {
        path: "/card-editor",
        label: "Card Editor",
        permission: Permission.USE_CARD_EDITOR,
        element: <CardEditorPage />
    },
    {
        path: "/suggestions",
        label: "Suggestions",
        permission: [
            Permission.READ_SUGGESTIONS,
            Permission.MAKE_SUGGESTIONS,
            Permission.EDIT_SUGGESTIONS,
            Permission.DELETE_SUGGESTIONS
        ],
        element: <Suggestions />
    },
    {
        path: "review/submit",
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
            }
        ]
    }
] as const;

export const profileItems: PageItem[] = [
] as const;

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