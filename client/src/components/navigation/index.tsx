import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Navbar, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProfileSection from "./profileSection";
import { isMenuItem, isPageItem, isVisibleFor, MenuItem as MenuItemType, NavItem, navItems, PageItem as PageItemType, profileItems } from "../../pages";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { useSelector } from "react-redux";
import { RootState } from "../../api/store";
import { useGetProjectsQuery } from "../../api";
import { Permission } from "common/models/user";
import dismoji from "../../emojis";
import { useLocation } from "react-router-dom";
import { hasPermission } from "common/utils";

const NavigationBar = () => {
    const user = useSelector((state: RootState) => state.auth.user);
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: projectData } = useGetProjectsQuery(!hasPermission(user, Permission.READ_ALL_PROJECTS) ? { filter: { active: true } } : {});

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
        const projectsPageItems = projectData.items
            .slice()
            .sort((a, b) => b.number - a.number)
            .map((project) => {
                const label = project.emoji ? `${dismoji[project.emoji.replaceAll(":", "")]} ${project.name}` : project.name;
                return {
                    path: `/project/${project.number}`,
                    label,
                    permission: [
                        ...(!project.active ? [Permission.READ_ALL_PROJECTS] : []),
                        Permission.READ_PROJECTS
                    ]
                };
            });
        return {
            label: projectsNavItem.label,
            permission: projectsNavItem.permission,
            subPages: [
                ...projectsPageItems,
                ...projectsNavItem.subPages
            ]
        } as MenuItemType;
    }, [projectData]);

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
        <Navbar isMenuOpen={isMenuOpen} onMenuOpenChange={setIsMenuOpen} >
            <NavbarContent className="sm:hidden">
                <NavbarMenuToggle
                    aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                />
            </NavbarContent>
            <NavbarContent className="hidden sm:flex">
                {items.map((navItem, index) => <NavbarItem key={index}>{navItem}</NavbarItem>)}
            </NavbarContent>
            <span>{"The Red Keep"}</span>
            <ProfileSection>
                {profileItems}
            </ProfileSection>
            <NavbarMenu>
                {items.map((navItem, index) => <NavbarMenuItem key={index}>{navItem}</NavbarMenuItem>)}
            </NavbarMenu>
        </Navbar>);
};

const PageItem = ({ item }: PageItemProps) => {
    return <Link href={item.path} className="text-large">{item.label}</Link>;
};

type PageItemProps = { item: PageItemType }

const MenuItem = ({ item, parents = [] }: MenuItemProps) => {
    const user = useSelector((state: RootState) => state.auth.user);
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Dropdown onOpenChange={setIsOpen}>
            <DropdownTrigger className="cursor-pointer">
                <Link className="text-large flex gap-1">
                    <span>{item.label}</span>
                    <FontAwesomeIcon size="xs" className={classNames("transition-transform", { "rotate-180": isOpen })} icon={faChevronUp}/>
                </Link>
            </DropdownTrigger>
            <DropdownMenu>
                {
                    item.subPages.filter((subPage) => isVisibleFor(subPage, user) && subPage.label).map((subPage) => {
                        if (isMenuItem(subPage)) {
                            return (
                                <DropdownItem key={subPage.label!} >
                                    <MenuItem item={subPage} parents={parents.concat(item)}></MenuItem>
                                </DropdownItem>
                            );
                        }
                        if (isPageItem(subPage)) {
                            return (
                                <DropdownItem key={subPage.label!} as={Link} href={subPage.path}>
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

type MenuItemProps = { item: MenuItemType, parents?: MenuItemType[] }

export default NavigationBar;