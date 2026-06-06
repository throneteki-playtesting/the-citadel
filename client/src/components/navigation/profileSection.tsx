import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { addToast, Avatar, Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Skeleton, Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { useLogoutMutation } from "../../api";
import { useDispatch, useSelector } from "react-redux";
import { setUser } from "../../api/authSlice";
import { PageItem } from "../../pages";
import { RootState } from "../../api/store";

const ProfileSection = ({ children: items = [] }: ProfileSectionProps) => {
    const dispatch = useDispatch();
    const [logout] = useLogoutMutation();
    const navigate = useNavigate();
    const { data: authUser, isLoading: isAuthLoading } = api.useGetMeQuery();
    const { user, isAuthenticating } = useSelector((state: RootState) => state.auth);

    const [isLoggingIn, setIsProcessing] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        dispatch(setUser({ user: authUser, isAuthenticating: isAuthLoading }));
    }, [dispatch, isAuthLoading, authUser]);

    const onLogin = async () => {
        setIsProcessing(true);
        window.location.href = "/auth/discord";
    };

    const onLogout = async () => {
        if (!user) {
            return;
        }
        try {
            setIsProcessing(true);
            await logout().unwrap();
            await navigate("/");
        } catch {
            if (user) {
                addToast({ title: "Error", color: "danger", description: "Failed to log out" });
            }
        } finally {
            setIsProcessing(false);
        }
    };

    if (!user && !isAuthenticating) {
        const startContent = isLoggingIn ? <Spinner size="sm"/> : <FontAwesomeIcon icon={faDiscord} />;
        return <Button startContent={startContent} isDisabled={isLoggingIn} onPress={onLogin} variant="flat">
            <span className="max-sm:hidden">Log in with Discord</span>
            <span className="sm:hidden">Log in</span>
        </Button>;
    }

    return (
        <Skeleton isLoaded={!!user} className="rounded-full">
            <Dropdown>
                <DropdownTrigger>
                    <div className="relative">
                        <Avatar isDisabled={isAuthenticating} src={user?.avatarUrl} onClick={() => setIsMenuOpen(!isMenuOpen)} className="cursor-pointer"/>
                        {isAuthenticating && <Spinner className="absolute inset-0" size="sm"/>}
                    </div>
                </DropdownTrigger>
                <DropdownMenu>
                    {items.filter((item) => item.label).map((item) => (
                        <DropdownItem
                            key={item.label!}
                            as={Link}
                            href={item.path}
                        >
                            {item.label}
                        </DropdownItem>
                    )).concat(
                        <DropdownItem key="logout" onPress={async () => await onLogout()} color="danger">
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
