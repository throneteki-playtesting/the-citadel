import {
    Button,
    ButtonGroup,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faCaretDown, faCheck, faGlobe } from "@fortawesome/free-solid-svg-icons";
import { ReactNode, useState } from "react";
import {
    DiscordTarget,
    openDiscordLink,
    setDiscordTarget,
    useDiscordChoice,
    useDiscordHref
} from "../hooks/useDiscordLink";
import { UIColor } from "../types";

/**
 * A link into Discord, opening wherever this browser was last told to open them. The caret both switches
 * and opens, and is dropped where the address has no client form, since nothing is then being chosen.
 */
export default function DiscordLinkButton({
    url,
    children,
    size = "sm",
    variant = "flat",
    color,
    className
}: DiscordLinkButtonProps) {
    const { href, isApp, clientUrl } = useDiscordHref(url);
    const choice = useDiscordChoice();
    const [isAsking, setIsAsking] = useState(false);

    const open = (target: DiscordTarget) => {
        setDiscordTarget(target);
        setIsAsking(false);
        openDiscordLink(url, target);
    };

    // Asked on the first press rather than answered for them: the website is a safe fallback, but
    // choosing it for somebody who has the app is the very thing they would have said no to
    const shouldAsk = !choice && !!clientUrl;

    const button = shouldAsk ? (
        <Button
            size={size}
            variant={variant}
            color={color}
            className={className}
            startContent={<FontAwesomeIcon icon={faDiscord} className="text-base" />}
            onPress={() => setIsAsking(true)}
        >
            {children}
        </Button>
    ) : (
        <Button
            as="a"
            size={size}
            variant={variant}
            color={color}
            className={className}
            href={href}
            // A custom scheme has nowhere to go in a new tab; the website behaves as any link does
            target={isApp ? undefined : "_blank"}
            rel="noreferrer"
            startContent={<FontAwesomeIcon icon={faDiscord} className="text-base" />}
        >
            {children}
        </Button>
    );

    if (!clientUrl) {
        return button;
    }

    const ask = (
        <Modal isOpen={isAsking} size="sm" placement="center" onClose={() => setIsAsking(false)}>
            <ModalContent>
                <ModalHeader className="items-center gap-2">
                    <FontAwesomeIcon icon={faDiscord} /> Where should this open?
                </ModalHeader>
                <ModalBody className="text-sm text-foreground/70">
                    You can change this any time from the arrow beside the button.
                </ModalBody>
                <ModalFooter className="flex-col gap-2 sm:flex-row">
                    <Button
                        variant="flat"
                        className="w-full sm:w-auto"
                        startContent={<FontAwesomeIcon icon={faGlobe} />}
                        onPress={() => open("browser")}
                    >
                        Browser
                    </Button>
                    <Button
                        color="primary"
                        className="w-full sm:w-auto"
                        startContent={<FontAwesomeIcon icon={faDiscord} />}
                        onPress={() => open("app")}
                    >
                        Discord app
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );

    return (
        <>
            {ask}
            <ButtonGroup className={className} size={size} variant={variant} color={color}>
                {button}
                <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                        <Button isIconOnly aria-label="Choose where Discord links open" className="px-0">
                            <FontAwesomeIcon icon={faCaretDown} />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Where Discord links open" onAction={(key) => open(key as DiscordTarget)}>
                        <DropdownItem
                            key="app"
                            description="Remembered for this browser"
                            endContent={
                                choice === "app" ? (
                                    <FontAwesomeIcon icon={faCheck} className="text-success" />
                                ) : undefined
                            }
                        >
                            Open in the Discord app
                        </DropdownItem>
                        <DropdownItem
                            key="browser"
                            description="Works everywhere, app or not"
                            endContent={
                                choice === "browser" ? (
                                    <FontAwesomeIcon icon={faCheck} className="text-success" />
                                ) : undefined
                            }
                        >
                            Open in the browser
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            </ButtonGroup>
        </>
    );
}

type DiscordLinkButtonProps = {
    /** The discord.com address of the thing being linked to */
    url: string;
    children: ReactNode;
    size?: "sm" | "md" | "lg";
    variant?: "flat" | "solid" | "light" | "bordered";
    color?: UIColor;
    className?: string;
};
