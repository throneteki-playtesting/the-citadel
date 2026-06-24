import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Avatar, Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Skeleton, Spinner } from "@heroui/react";
import { useState } from "react";
import { PageItem } from "../../pages";
import { useAuth } from "../../hooks/useAuth";

const ProfileSection = ({ children: items = [] }: ProfileSectionProps) => {
    const { user, isAuthenticated, isLoading, isProcessing, login, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    if (!isAuthenticated && !isLoading) {
        const startContent = isProcessing ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faDiscord} />;
        return (
            <Button startContent={startContent} isDisabled={isProcessing} onPress={login} variant="flat" className="font-cinzel">
                <span className="max-sm:hidden">Log in with Discord</span>
                <span className="sm:hidden">Log in</span>
            </Button>
        );
    }

    return (
        <Skeleton isLoaded={isAuthenticated && !isLoading} className="rounded-full">
            <Dropdown>
                <DropdownTrigger>
                    <div className="relative">
                        <Avatar isDisabled={isLoading} src={user?.avatarUrl} onClick={() => setIsMenuOpen(!isMenuOpen)} className="cursor-pointer" />
                        {isLoading && <Spinner className="absolute inset-0" size="sm" />}
                    </div>
                </DropdownTrigger>
                <DropdownMenu>
                    {items.filter((item) => item.label).map((item) => (
                        <DropdownItem key={item.label!} as={Link} href={item.path}>
                            {item.label}
                        </DropdownItem>
                    )).concat(
                        <DropdownItem key="logout" onPress={logout} color="danger">
                            Log out
                        </DropdownItem>
                    )}
                </DropdownMenu>
            </Dropdown>
        </Skeleton>
    );
};

type ProfileSectionProps = { children?: PageItem[] }

export default ProfileSection;
