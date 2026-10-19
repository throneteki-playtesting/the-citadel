import { Fragment, useState } from "react";
import {
    Button,
    ModalBody,
    ModalContent,
    ModalHeader,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Spinner
} from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { IProject } from "common/models/projects";
import { useAddToPoolMutation, useGetPoolQuery, useGetUserQuery, useRemoveFromPoolMutation } from "../../api";
import { showApiErrorToast } from "../../api/errors";
import FeatherCheckIcon from "../../components/featherCheckIcon";
import FeatherPlusIcon from "../../components/featherPlusIcon";
import { poolLabel, useIsPooledByMe } from "./usePoolableProjects";
import Modal from "../../components/modal";
import { useAuth } from "../../hooks/useAuth";
import { TouchTooltip } from "../../components/touchTooltip";
import { NOTICE_TRANSITION } from "../../constants";

// Sets a suggestion aside in the pool of any draft project the viewer can draft in - a checked project already has it
export default function PoolMenu({ suggestion, isApproved, projects }: PoolMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const isPooled = useIsPooledByMe(suggestion, projects);
    return (
        <TouchTooltip content={poolLabel(isPooled)}>
            <span className="inline-flex">
                <Popover isOpen={isOpen} onOpenChange={setIsOpen} placement="bottom-end" offset={8}>
                    <PopoverTrigger>
                        <Button
                            isIconOnly
                            color={isPooled ? "success" : "primary"}
                            variant="flat"
                            aria-label={poolLabel(isPooled)}
                        >
                            {isPooled ? <FeatherCheckIcon /> : <FeatherPlusIcon />}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[22rem] gap-1 p-1.5">
                        <PoolOptions suggestion={suggestion} isApproved={isApproved} projects={projects} />
                    </PopoverContent>
                </Popover>
            </span>
        </TouchTooltip>
    );
}

// The same choices in a dialog, for a phone - where the page's own button gives way to the bubble menu's entry
export function PoolModal({ isOpen, onClose, suggestion, isApproved, projects }: PoolMenuProps & PoolModalProps) {
    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="sm">
            <ModalContent>
                <ModalHeader>Add to Pool</ModalHeader>
                <ModalBody className="gap-1 pb-4">
                    <PoolOptions suggestion={suggestion} isApproved={isApproved} projects={projects} />
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}

type PoolModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

function PoolOptions({ suggestion, isApproved, projects }: PoolMenuProps) {
    return projects.map((project) => (
        <PoolOption key={project.number} project={project} suggestion={suggestion} isApproved={isApproved} />
    ));
}

type PoolMenuProps = {
    suggestion: string;
    /** One which isn't approved is only pooled once that has been asked about */
    isApproved: boolean;
    projects: IProject[];
};

function PoolOption({ project, suggestion, isApproved }: PoolOptionProps) {
    const { data: pool } = useGetPoolQuery({ project: project.number });
    const [addToPool, { isLoading: isAdding }] = useAddToPoolMutation();
    const [removeFromPool, { isLoading: isRemoving }] = useRemoveFromPoolMutation();
    const [isAsking, setIsAsking] = useState(false);
    const me = useAuth().user?.discordId;
    const marks = pool?.find((candidate) => candidate.suggestion === suggestion)?.adds;
    const isPooled = !!marks?.some((mark) => mark.user === me);
    const others = (marks ?? []).filter((mark) => mark.user !== me).map((mark) => mark.user);
    const isBusy = isAdding || isRemoving;

    const add = async (isUnapprovedConfirmed = false) => {
        try {
            await addToPool({ project: project.number, suggestion, isUnapprovedConfirmed }).unwrap();
        } catch (error) {
            showApiErrorToast(error, { title: "Failed to add to pool" });
        }
    };
    const remove = async () => {
        try {
            await removeFromPool({ project: project.number, suggestion }).unwrap();
        } catch (error) {
            showApiErrorToast(error, { title: "Failed to remove from pool" });
        }
    };
    const press = () => {
        if (isPooled) {
            void remove();
        } else if (isApproved) {
            void add();
        } else {
            setIsAsking(true);
        }
    };
    const answer = (isYes: boolean) => {
        setIsAsking(false);
        if (isYes) {
            void add(true);
        }
    };

    return (
        <div className="relative w-full">
            <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isPooled}
                disabled={pool === undefined || isBusy}
                onClick={press}
                className={classNames(
                    "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-content2",
                    { "bg-primary/10": isPooled }
                )}
            >
                <Checkmark isChecked={isPooled} isLoading={pool === undefined || isBusy} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate">{project.name}</span>
                    {(isPooled || others.length > 0) && (
                        <span className="truncate text-xs text-foreground/60">
                            <MarkSummary isMine={isPooled} others={others} />
                        </span>
                    )}
                </span>
            </button>
            <AnimatePresence>
                {isAsking && (
                    <motion.div
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                        transition={NOTICE_TRANSITION}
                        className="absolute inset-0 flex items-center gap-2 rounded-lg border border-warning/40 bg-content2 px-3"
                    >
                        <FontAwesomeIcon icon={faTriangleExclamation} className="text-warning" />
                        <div className="min-w-0 flex-1 leading-tight">
                            <div className="whitespace-nowrap text-sm font-semibold">Suggestion is not approved</div>
                            <div className="text-xs text-foreground/60">Add anyway?</div>
                        </div>
                        <Button
                            isIconOnly
                            size="sm"
                            color="success"
                            variant="flat"
                            aria-label="Add anyway"
                            onPress={() => answer(true)}
                        >
                            <FontAwesomeIcon icon={faCheck} />
                        </Button>
                        <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="flat"
                            aria-label="Don't add"
                            onPress={() => answer(false)}
                        >
                            <FontAwesomeIcon icon={faXmark} />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const SUMMARY_NAMES_SHOWN = 2;

// Who has this in the pool, in a line: "Only you", "You and Sam", "You, Sam and 2 others", "Marked by Sam"
function MarkSummary({ isMine, others }: { isMine: boolean; others: string[] }) {
    if (isMine && others.length === 0) {
        return <>Only you</>;
    }
    const named = others.slice(0, isMine ? SUMMARY_NAMES_SHOWN - 1 : SUMMARY_NAMES_SHOWN);
    const rest = others.length - named.length;
    const people = [
        ...(isMine ? ["You"] : []),
        ...named.map((discordId) => <PersonName key={discordId} discordId={discordId} />),
        ...(rest > 0 ? [`${rest} other${rest === 1 ? "" : "s"}`] : [])
    ];
    return (
        <>
            {!isMine && "Marked by "}
            {people.map((person, index) => (
                <Fragment key={index}>
                    {index > 0 && (index === people.length - 1 ? " and " : ", ")}
                    {person}
                </Fragment>
            ))}
        </>
    );
}

function PersonName({ discordId }: { discordId: string }) {
    const { data: user } = useGetUserQuery({ discordId });
    return <>{user?.displayname ?? "…"}</>;
}

type PoolOptionProps = {
    project: IProject;
    suggestion: string;
    isApproved: boolean;
};

function Checkmark({ isChecked, isLoading }: { isChecked: boolean; isLoading: boolean }) {
    return (
        <span
            className={classNames(
                "grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors duration-200",
                isChecked ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"
            )}
        >
            {isLoading ? (
                <Spinner size="sm" classNames={{ wrapper: "size-3" }} />
            ) : (
                <AnimatePresence initial={false}>
                    {isChecked && (
                        <motion.span
                            initial={{ scale: 0, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 45 }}
                            transition={NOTICE_TRANSITION}
                            className="text-xs"
                        >
                            <FontAwesomeIcon icon={faCheck} />
                        </motion.span>
                    )}
                </AnimatePresence>
            )}
        </span>
    );
}
