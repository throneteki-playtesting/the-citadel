import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Navbar, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProfileSection from "./profileSection";
import { isMenuItem, isPageItem, isVisibleFor, MenuItem as MenuItemType, NavItem, navItems, PageItem as PageItemType, profileItems } from "../../pages";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp } from "@fortawesome/free-solid-svg-icons";
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

        const activeProjectItems = projectData.items
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((project) => ({
                path: `/project/${project.number}`,
                label: `${project.number}. ${project.name}`,
                permission: Permission.READ_PROJECTS
            }));

        const archivedProjectItems = (archivedProjectData?.items ?? [])
            .slice()
            .sort((a, b) => a.number - b.number)
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
                ...activeProjectItems,
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
    return <Link href={item.path} className="text-large">{item.label}</Link>;
};

type PageItemProps = { item: PageItemType }

const MenuItem = ({ item, parents = [], isNested = false, onClose }: MenuItemProps) => {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const closeAll = () => {
        setIsOpen(false);
        onClose?.();
    };

    return (
        <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} className="font-cinzel">
            <DropdownTrigger className="cursor-pointer">
                <Link className={classNames("flex gap-1", { "text-large": !isNested })}>
                    <span>{item.label}</span>
                    <FontAwesomeIcon size="xs" className={classNames("duration-300", { "scale-y-[-1]": isOpen })} icon={faChevronUp}/>
                </Link>
            </DropdownTrigger>
            <DropdownMenu>
                {
                    item.subPages.filter((subPage) => isVisibleFor(subPage, user) && subPage.label).map((subPage) => {
                        if (isMenuItem(subPage)) {
                            return (
                                <DropdownItem key={subPage.label!} closeOnSelect={false}>
                                    <MenuItem item={subPage} parents={parents.concat(item)} isNested={true} onClose={closeAll}></MenuItem>
                                </DropdownItem>
                            );
                        }
                        if (isPageItem(subPage)) {
                            return (
                                <DropdownItem key={subPage.label!} as={Link} href={subPage.path} onPress={onClose}>
                                    {subPage.label}
                                </DropdownItem>
                            );
                        }
                        return null;
                    })
                }
            </DropdownMenu>
        </Dropdown>
    );
};

type MenuItemProps = { item: MenuItemType, parents?: MenuItemType[], isNested?: boolean, onClose?: () => void }

export default NavigationBar;