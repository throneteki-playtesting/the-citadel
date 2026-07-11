import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Navbar, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CollectionElement } from "@react-types/shared";
import ProfileSection from "./profileSection";
import { isMenuItem, isPageItem, isVisibleFor, MenuItem as MenuItemType, NavItem, navItems, PageItem as PageItemType, profileItems } from "../../pages";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faFeather } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useGetProjectsQuery } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import Permission from "common/models/permissions";
import { hasPermission } from "common/utils";
import { useLocation } from "react-router-dom";

const NavigationBar = () => {
    const { user } = useAuth();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
            return <PageItem item={navItem}/>;
        }
        if (isMenuItem(navItem)) {
            return <MenuItem item={navItem}/>;
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
                endContent: project.draft ? <FontAwesomeIcon className="animate-pulse" size="sm" icon={faFeather}/> : undefined
            }));

        const archivedProjectItems = (archivedProjectData?.items ?? [])
            .filter((project) => !project.draft)
            .sort((a, b) => b.number - a.number)
            .map((project) => ({
                path: `/project/${project.number}`,
                label: `${project.number}. ${project.name}`,
                permission: Permission.READ_ARCHIVED_PROJECTS
            }));

        const archivedMenuItem: MenuItemType | undefined = archivedProjectItems.length > 0
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

    const items = useMemo(() => {
        const newNavItems = navItems.map((item) => {
            if (item.label === "Projects" && projectsItem) {
                return projectsItem;
            }
            return item;
        });
        const visibleItems = newNavItems.filter((item) => isVisibleFor(item, user) && item.label);
        return visibleItems.map(createItem);
    }, [createItem, projectsItem, user]);

    return (
        <Navbar isMenuOpen={isMenuOpen} onMenuOpenChange={setIsMenuOpen}>
            <NavbarContent className="md:hidden">
                <NavbarMenuToggle
                    aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                />
            </NavbarContent>
            <NavbarContent className="hidden md:flex font-cinzel">
                {items.map((navItem, index) => <NavbarItem key={index}>{navItem}</NavbarItem>)}
            </NavbarContent>
            <Link href="/" className="font-cinzel text-primary font-semibold lg:text-xl xl:text-2xl">The Citadel</Link>
            <ProfileSection>
                {profileItems}
            </ProfileSection>
            <NavbarMenu className="font-cinzel" >
                {items.map((navItem, index) => <NavbarMenuItem key={index}>{navItem}</NavbarMenuItem>)}
            </NavbarMenu>
        </Navbar>);
};

const PageItem = ({ item }: PageItemProps) => {
    return (
        <Link href={item.path} className="text-large flex gap-2 items-center">
            <span>{item.label}</span>
            {item.endContent}
        </Link>
    );
};

type PageItemProps = { item: PageItemType }

const MenuItem = ({ item }: MenuItemProps) => {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const onOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
            setExpanded({});
        }
    };

    const buildItems = (subPages: NavItem[], depth: number): CollectionElement<object>[] => {
        return subPages.filter((subPage) => isVisibleFor(subPage, user) && subPage.label).flatMap((subPage) => {
            const indentStyle = depth > 0 ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined;
            if (isMenuItem(subPage)) {
                const isExpanded = !!expanded[subPage.label!];
                const header = (
                    <DropdownItem
                        key={subPage.label!}
                        closeOnSelect={false}
                        style={indentStyle}
                        endContent={<FontAwesomeIcon size="xs" className={classNames("duration-300", { "scale-y-[-1]": isExpanded })} icon={faChevronUp}/>}
                        onPress={() => setExpanded((prev) => ({ ...prev, [subPage.label!]: !prev[subPage.label!] }))}
                    >
                        {subPage.label}
                    </DropdownItem>
                );
                return isExpanded ? [header, ...buildItems(subPage.subPages, depth + 1)] : [header];
            }
            if (isPageItem(subPage)) {
                return [(
                    <DropdownItem
                        key={subPage.path}
                        as={Link}
                        href={subPage.path}
                        style={indentStyle}
                        endContent={subPage.endContent}
                    >
                        {subPage.label}
                    </DropdownItem>
                )];
            }
            return [];
        });
    };

    return (
        <Dropdown isOpen={isOpen} onOpenChange={onOpenChange} className="font-cinzel">
            <DropdownTrigger className="cursor-pointer">
                <Link className="flex gap-1 text-large">
                    <span>{item.label}</span>
                    <FontAwesomeIcon size="xs" className={classNames("duration-300", { "scale-y-[-1]": isOpen })} icon={faChevronUp}/>
                </Link>
            </DropdownTrigger>
            <DropdownMenu>
                {buildItems(item.subPages, 0)}
            </DropdownMenu>
        </Dropdown>
    );
};

type MenuItemProps = { item: MenuItemType }

export default NavigationBar;