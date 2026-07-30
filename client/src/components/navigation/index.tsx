import {
    Accordion,
    AccordionItem,
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Link,
    Navbar,
    NavbarContent,
    NavbarItem,
    NavbarMenu,
    NavbarMenuItem,
    NavbarMenuToggle
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProfileSection from "./profileSection";
import {
    isMenuItem,
    isPageItem,
    isVisibleFor,
    MenuItem as MenuItemType,
    NavItem,
    navItems,
    PageItem as PageItemType,
    profileItems
} from "../../pages";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faEye, faFeather } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useGetProjectsQuery } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import Permission from "common/models/permissions";
import { hasPermission } from "common/utils";
import { useLocation } from "react-router-dom";

const NavigationBar = () => {
    const { user, impersonation, isImpersonating, stopImpersonating, isImpersonationActionPending } = useAuth();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const itemsRowRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const canReadArchived = hasPermission(user, Permission.READ_ARCHIVED_PROJECTS);
    const { data: projectData } = useGetProjectsQuery({ filter: { active: true } });
    const { data: archivedProjectData } = useGetProjectsQuery(
        { filter: { active: false } },
        { skip: !canReadArchived }
    );

    useEffect(() => {
        if (location) {
            setIsMenuOpen(false);
        }
    }, [location]);

    const createItem = useCallback((navItem: NavItem) => {
        if (isPageItem(navItem)) {
            return <PageItem item={navItem} />;
        }
        if (isMenuItem(navItem)) {
            return <MenuItem item={navItem} />;
        }
    }, []);

    const projectsItem = useMemo(() => {
        const projectsNavItem = navItems.find((item) => item.label === "Projects");
        if (!projectData || !projectsNavItem || !isMenuItem(projectsNavItem)) {
            return projectsNavItem;
        }

        const draftProjects = (archivedProjectData?.items ?? []).filter((project) => project.draft);

        const mainProjectItems = projectData.items
            .concat(draftProjects)
            .sort((a, b) => b.number - a.number)
            .map((project) => ({
                path: `/project/${project.number}`,
                label: `${project.number}. ${project.name}`,
                permission: project.draft ? Permission.READ_ARCHIVED_PROJECTS : Permission.READ_PROJECTS,
                endContent: project.draft ? (
                    <FontAwesomeIcon className="animate-pulse" size="sm" icon={faFeather} />
                ) : undefined
            }));

        const archivedProjectItems = (archivedProjectData?.items ?? [])
            .filter((project) => !project.draft)
            .sort((a, b) => b.number - a.number)
            .map((project) => ({
                path: `/project/${project.number}`,
                label: `${project.number}. ${project.name}`,
                permission: Permission.READ_ARCHIVED_PROJECTS
            }));

        const archivedMenuItem: MenuItemType | undefined =
            archivedProjectItems.length > 0
                ? { label: "Archived", permission: Permission.READ_ARCHIVED_PROJECTS, subPages: archivedProjectItems }
                : undefined;

        return {
            label: projectsNavItem.label,
            permission: projectsNavItem.permission,
            subPages: [
                ...mainProjectItems,
                ...projectsNavItem.subPages,
                ...(archivedMenuItem ? [archivedMenuItem] : [])
            ]
        } as MenuItemType;
    }, [projectData, archivedProjectData]);

    const visibleItems = useMemo(() => {
        const newNavItems = navItems.map((item) => {
            if (item.label === "Projects" && projectsItem) {
                return projectsItem;
            }
            return item;
        });
        return newNavItems.filter((item) => isVisibleFor(item, user) && item.label);
    }, [projectsItem, user]);

    const items = useMemo(() => visibleItems.map(createItem), [createItem, visibleItems]);

    useEffect(() => {
        const container = itemsRowRef.current;
        const measurer = measureRef.current;
        if (!container || !measurer) {
            return;
        }

        const checkOverflow = () => {
            setCollapsed(measurer.scrollWidth > container.clientWidth);
        };

        const observer = new ResizeObserver(checkOverflow);
        observer.observe(container);
        checkOverflow();

        return () => observer.disconnect();
    }, [items]);

    return (
        <>
            {isImpersonating && impersonation && (
                <div className="flex items-center justify-center gap-2 bg-warning-100 text-warning-800 text-sm py-1 px-4">
                    <FontAwesomeIcon icon={faEye} />
                    <span>
                        Viewing as {impersonation.type} <strong>{impersonation.target.name}</strong>
                    </span>
                    <Button
                        size="sm"
                        variant="light"
                        color="warning"
                        isDisabled={isImpersonationActionPending}
                        onPress={stopImpersonating}
                    >
                        Exit
                    </Button>
                </div>
            )}
            <Navbar isMenuOpen={isMenuOpen} onMenuOpenChange={setIsMenuOpen}>
                {collapsed && (
                    <NavbarContent justify="center" className="flex-none basis-auto">
                        <NavbarMenuToggle aria-label={isMenuOpen ? "Close menu" : "Open menu"} />
                    </NavbarContent>
                )}
                <NavbarContent className="flex-1 min-w-0" justify="start">
                    <div ref={itemsRowRef} className="relative flex w-full min-w-0 overflow-hidden">
                        {!collapsed && (
                            <div className="flex gap-4 font-cinzel">
                                {items.map((navItem, index) => (
                                    <NavbarItem key={index}>{navItem}</NavbarItem>
                                ))}
                            </div>
                        )}
                        <div
                            ref={measureRef}
                            className="invisible absolute left-0 top-0 flex gap-4 whitespace-nowrap font-cinzel"
                            aria-hidden="true"
                        >
                            {items.map((navItem, index) => (
                                <span key={index}>{navItem}</span>
                            ))}
                        </div>
                    </div>
                </NavbarContent>
                <Link href="/" className="font-cinzel text-primary font-semibold text-2xl hover:text-primary-3 00">
                    The Citadel
                </Link>
                <ProfileSection>{profileItems}</ProfileSection>
                <NavbarMenu className="font-cinzel">
                    {visibleItems.map((navItem, index) => (
                        <NavbarMenuItem key={index}>
                            <SubMenuItem item={navItem} />
                        </NavbarMenuItem>
                    ))}
                </NavbarMenu>
            </Navbar>
        </>
    );
};

const isNavItemActive = (navItem: NavItem, pathname: string): boolean => {
    if (isPageItem(navItem)) {
        return navItem.path === "/" ? pathname === "/" : pathname.startsWith(navItem.path);
    }
    if (isMenuItem(navItem)) {
        return navItem.subPages.some((subPage) => isNavItemActive(subPage, pathname));
    }
    return false;
};

const PageItem = ({ item }: PageItemProps) => {
    const location = useLocation();
    const isActive = isNavItemActive(item, location.pathname);

    return (
        <Link
            href={item.path}
            className={classNames("text-lg flex gap-2 items-center", { "text-primary-600 font-semibold": isActive })}
        >
            <span>{item.label}</span>
            {item.endContent}
        </Link>
    );
};

type PageItemProps = { item: PageItemType };

const accordionItemClasses = {
    base: "px-0",
    trigger: "py-0 gap-2",
    titleWrapper: "flex-grow-0",
    title: "text-lg text-primary",
    indicator: "text-primary",
    content: "flex flex-col gap-2 py-2"
};

const SubMenuItem = ({ item, depth = 0, onNavigate }: SubMenuItemProps) => {
    const { user } = useAuth();
    const location = useLocation();
    const indentStyle = depth > 0 ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined;
    const isActive = isNavItemActive(item, location.pathname);

    if (isPageItem(item)) {
        return (
            <Link
                href={item.path}
                onPress={onNavigate}
                className={classNames("text-lg flex gap-2 items-center", {
                    "text-primary-600 font-semibold": isActive
                })}
                style={indentStyle}
            >
                <span>{item.label}</span>
                {item.endContent}
            </Link>
        );
    }

    if (isMenuItem(item)) {
        const visibleSubPages = item.subPages.filter((subPage) => isVisibleFor(subPage, user) && subPage.label);
        return (
            <Accordion className="px-0" itemClasses={accordionItemClasses} showDivider={false}>
                <AccordionItem
                    key={item.label}
                    aria-label={item.label}
                    title={
                        <span className={classNames({ "text-primary-600 font-semibold": isActive })}>{item.label}</span>
                    }
                    style={indentStyle}
                >
                    {visibleSubPages.map((subPage) => (
                        <SubMenuItem
                            key={subPage.label ?? (isPageItem(subPage) ? subPage.path : undefined)}
                            item={subPage}
                            depth={depth + 1}
                            onNavigate={onNavigate}
                        />
                    ))}
                </AccordionItem>
            </Accordion>
        );
    }

    return null;
};

type SubMenuItemProps = { item: NavItem; depth?: number; onNavigate?: () => void };

const MenuItem = ({ item }: MenuItemProps) => {
    const { user } = useAuth();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const isActive = isNavItemActive(item, location.pathname);

    const visibleSubPages = item.subPages.filter((subPage) => isVisibleFor(subPage, user) && subPage.label);

    return (
        <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} className="font-cinzel px-4 py-2">
            <DropdownTrigger className="cursor-pointer">
                <Link className={classNames("flex gap-1 text-lg", { "text-primary-600 font-semibold": isActive })}>
                    <span>{item.label}</span>
                    <FontAwesomeIcon
                        size="xs"
                        className={classNames("duration-300", { "scale-y-[-1]": isOpen })}
                        icon={faChevronUp}
                    />
                </Link>
            </DropdownTrigger>
            <DropdownMenu>
                <DropdownItem key="content" isReadOnly className="cursor-default p-0 data-[hover=true]:bg-transparent">
                    <div className="flex flex-col gap-1">
                        {visibleSubPages.map((subPage) => (
                            <SubMenuItem
                                key={subPage.label ?? (isPageItem(subPage) ? subPage.path : undefined)}
                                item={subPage}
                                onNavigate={() => setIsOpen(false)}
                            />
                        ))}
                    </div>
                </DropdownItem>
            </DropdownMenu>
        </Dropdown>
    );
};

type MenuItemProps = { item: MenuItemType };

export default NavigationBar;
