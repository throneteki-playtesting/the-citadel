import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import {
    addToast,
    Avatar,
    AvatarGroup,
    Button,
    ButtonGroup,
    Chip,
    Divider,
    Form,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Skeleton,
    Textarea
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faClockRotateLeft, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { isEqual } from "lodash-es";
import { IReleaseCheck, isCheckStale, ReleaseCheckCategory, releaseCheckCategories } from "common/models/slots";
import { Slot } from "common/models/schemas";
import Permission from "common/models/permissions";
import { parseCardCode, SemanticVersion } from "common/utils";
import { useGetCardQuery, useGetSlotQuery, useGetUserQuery, useSubmitReleaseCheckMutation } from "../api";
import { useAuth } from "../hooks/useAuth";
import { usePermission } from "../hooks/usePermission";
import { useContainerWidth } from "../hooks/useContainerWidth";
import { useFormValidation } from "../hooks/useFormValidation";
import { showApiErrorToast } from "../api/errors";
import { avatarBubbleClasses, avatarRingClasses, highlightTarget } from "../constants";
import Timestamp from "./timestamp";
import FormValidationSummary from "./formValidationSummary";
import FeedbackAvatar, { FeedbackAvatarView } from "./feedbackAvatar";
import ReleaseCheckTally from "./releaseCheckTally";
import { releaseCheckVerdict } from "./releaseCheckVerdict";

// Row width budget, in the units the row is laid out in: a size-10 avatar plus the row's gap-2.5
const AVATAR_PX = 40;
const ROW_GAP_PX = 10;
const AVATAR_SLOT_PX = AVATAR_PX + ROW_GAP_PX;
const DIVIDER_PX = 15;
// Each avatar past the first in the ready stack only adds its unoverlapped sliver
const STACKED_AVATAR_PX = 24;
const MAX_STACK = 3;

export default function ReleaseChecksModal({
    isOpen,
    onClose,
    project,
    number,
    viewTarget = "release"
}: ReleaseChecksModalProps) {
    const { data: slot, isLoading } = useGetSlotQuery({ project, number });
    const { data: card } = useGetCardQuery({ project, number, version: "latest" });
    const { user } = useAuth();
    const navigate = useNavigate();

    const canSubmitCheck = usePermission(Permission.SUBMIT_RELEASE_CHECK);
    const canReadReleases = usePermission(Permission.READ_RELEASES);
    const canReadCards = usePermission(Permission.READ_CARDS);

    const releaseCode = slot?.release?.code;
    const canView = viewTarget === "card" ? canReadCards : canReadReleases && !!releaseCode;
    const goToTarget = () => {
        if (viewTarget === "card") {
            onClose();
            navigate(`/project/${project}/${number}`);
            return;
        }
        if (!releaseCode) {
            return;
        }
        onClose();
        navigate(`/project/${project}?tab=releases`, {
            state: { highlight: highlightTarget.release(project, releaseCode) }
        });
    };

    const [selectedId, setSelectedId] = useState<string | null>(null);
    useEffect(() => {
        if (!isOpen) {
            setSelectedId(null);
        }
    }, [isOpen]);

    const { ref: rowRef, width: rowWidth } = useContainerWidth<HTMLDivElement>();

    const latestVersion = card?.version;
    const checks = slot?.statuses.design.checks ?? [];
    const mine = user && checks.find((entry) => entry.createdBy === user.discordId);
    const hasYouSlot = !!mine || (canSubmitCheck && !!user);

    const others = checks.filter((entry) => entry.createdBy !== user?.discordId);
    const ready = others.filter((entry) => entry.ready);
    // Current checks sort ahead of stale ones, so a live objection always wins a visible slot
    const notReady = [...others.filter((entry) => !entry.ready)].sort((a, b) => {
        const staleness = Number(isCheckStale(a, latestVersion)) - Number(isCheckStale(b, latestVersion));
        return staleness !== 0 ? staleness : new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    // Approximate widths of the fixed row parts, leaving the rest for individual "not ready" avatars
    const stackDisplayed = Math.min(ready.length, MAX_STACK) + (ready.length > MAX_STACK ? 1 : 0);
    const stackWidth = ready.length === 0 ? 0 : AVATAR_PX + (stackDisplayed - 1) * STACKED_AVATAR_PX + ROW_GAP_PX;
    const youWidth = hasYouSlot ? AVATAR_SLOT_PX : 0;
    const dividerWidth = hasYouSlot && (ready.length > 0 || notReady.length > 0) ? DIVIDER_PX : 0;
    const remaining = Math.max(0, rowWidth - youWidth - dividerWidth - stackWidth);

    const slots = Math.max(1, Math.floor(remaining / AVATAR_SLOT_PX));
    const needsOverflow = notReady.length > slots;
    const visibleNotReady = needsOverflow ? notReady.slice(0, Math.max(1, slots - 1)) : notReady;
    const overflowNotReady = notReady.slice(visibleNotReady.length);

    const isYouSelected = !!user && selectedId === user.discordId;
    const selectedEntry = notReady.find((entry) => entry.createdBy === selectedId);
    const toggleSelect = (discordId: string) => setSelectedId((prev) => (prev === discordId ? null : discordId));

    return (
        <Modal
            isOpen={isOpen}
            size="lg"
            placement="center"
            scrollBehavior="inside"
            onOpenChange={(open) => !open && onClose()}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <span>Release Checks</span>
                    <span className="text-xs sm:text-sm font-normal text-foreground/50">
                        {card ? (
                            <>
                                {card.name} · #{parseCardCode(false, project, number)} · v{card.version}
                            </>
                        ) : (
                            <Skeleton className="h-4 w-40 rounded-md" />
                        )}
                    </span>
                </ModalHeader>
                <ModalBody className="pb-2">
                    {isLoading || !slot ? (
                        <Skeleton className="h-24 w-full rounded-md" />
                    ) : (
                        <div>
                            <div className="text-xs sm:text-sm text-foreground/60 pb-2">
                                Share a quick verdict on whether this card is ready for release. When flagging a card as
                                not ready, keep the reasoning clear and concise, and use categories to guide what to
                                focus on.
                            </div>
                            <ReleaseCheckTally project={project} number={number} className="py-2" />
                            <div ref={rowRef} className="flex items-center gap-2.5 py-2">
                                {hasYouSlot && (
                                    <FeedbackAvatarView
                                        user={user ?? undefined}
                                        entry={mine ?? undefined}
                                        latestVersion={latestVersion}
                                        isYou
                                        isSelected={isYouSelected}
                                        onSelect={() => user && toggleSelect(user.discordId)}
                                    />
                                )}
                                {dividerWidth > 0 && <Divider orientation="vertical" className="h-8 mr-2" />}
                                <ReadyStack entries={ready} latestVersion={latestVersion} />
                                {visibleNotReady.map((entry) => (
                                    <FeedbackAvatar
                                        key={entry.createdBy}
                                        discordId={entry.createdBy}
                                        entry={entry}
                                        latestVersion={latestVersion}
                                        isSelected={selectedId === entry.createdBy}
                                        onSelect={() => toggleSelect(entry.createdBy)}
                                    />
                                ))}
                                {overflowNotReady.length > 0 && (
                                    <OverflowBubble
                                        entries={overflowNotReady}
                                        latestVersion={latestVersion}
                                        selectedId={selectedId}
                                        onSelect={toggleSelect}
                                    />
                                )}
                            </div>

                            <AnimatePresence>
                                {(isYouSelected || selectedEntry) && (
                                    <motion.div
                                        key="feedback-card"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.18 }}
                                        className="overflow-hidden"
                                    >
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.div
                                                key={selectedId}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.12 }}
                                                className="pt-2"
                                            >
                                                {isYouSelected ? (
                                                    <YourReleaseCheckForm
                                                        project={project}
                                                        number={number}
                                                        entry={mine ?? undefined}
                                                        latestVersion={latestVersion}
                                                        canSubmit={canSubmitCheck}
                                                        onDone={() => setSelectedId(null)}
                                                    />
                                                ) : (
                                                    <ReadOnlyReleaseCheck
                                                        entry={selectedEntry}
                                                        latestVersion={latestVersion}
                                                    />
                                                )}
                                            </motion.div>
                                        </AnimatePresence>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </ModalBody>
                <ModalFooter>
                    {canView && (
                        <Button color="primary" variant="ghost" onPress={goToTarget}>
                            {viewTarget === "card" ? "View Card" : "View Release"}
                        </Button>
                    )}
                    <Button onPress={onClose}>Close</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function ReadyStack({ entries, latestVersion }: { entries: IReleaseCheck[]; latestVersion?: SemanticVersion }) {
    const [isOpen, setIsOpen] = useState(false);
    if (entries.length === 0) {
        return null;
    }

    // Current checks lead the stack, so the avatars surviving the +N cutoff are the ones that count
    const current = entries.filter((entry) => !isCheckStale(entry, latestVersion));
    const stale = entries.filter((entry) => isCheckStale(entry, latestVersion));

    return (
        <Popover placement="bottom" isOpen={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger>
                <button
                    type="button"
                    className="shrink-0 flex cursor-pointer transition-transform hover:scale-105"
                    title="Ready to release"
                >
                    <AvatarGroup
                        max={MAX_STACK}
                        className="-space-x-2"
                        renderCount={(count) => <Avatar name={`+${count}`} className={STACK_AVATAR_CLASSES} />}
                    >
                        {[...current, ...stale].map((entry) => (
                            <StackedUserAvatar key={entry.createdBy} entry={entry} latestVersion={latestVersion} />
                        ))}
                    </AvatarGroup>
                </button>
            </PopoverTrigger>
            <PopoverContent>
                <div className="flex flex-col gap-2 px-2 py-3 max-w-72">
                    {current.length > 0 && (
                        <>
                            <div className="text-xs text-success flex items-center gap-1.5">
                                <FontAwesomeIcon icon={faCheck} /> Ready to release
                            </div>
                            {current.map((entry) => (
                                <UserNameRow key={entry.createdBy} entry={entry} />
                            ))}
                        </>
                    )}
                    {stale.length > 0 && (
                        <>
                            {current.length > 0 && <Divider />}
                            <div className="text-xs text-foreground/50 flex items-center gap-1.5">
                                <FontAwesomeIcon icon={faClockRotateLeft} /> Marked ready on an older version
                            </div>
                            {stale.map((entry) => (
                                <UserNameRow key={entry.createdBy} entry={entry} showVersion />
                            ))}
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// Overrides the shift the Avatar theme's inGroup variant applies, which uses data-[hover]/data-[focus-visible]
const STACK_AVATAR_CLASSES = classNames(
    "transition-none",
    "data-[hover=true]:translate-x-0 rtl:data-[hover=true]:translate-x-0",
    "data-[focus-visible=true]:translate-x-0 rtl:data-[focus-visible=true]:translate-x-0"
);

function StackedUserAvatar({ entry, latestVersion }: { entry: IReleaseCheck; latestVersion?: SemanticVersion }) {
    const { data: user, isLoading } = useGetUserQuery({ discordId: entry.createdBy });
    const verdict = releaseCheckVerdict(entry, latestVersion);
    return (
        <Avatar
            src={user?.avatarUrl}
            name={user?.displayname?.charAt(0) ?? "?"}
            isDisabled={isLoading}
            title={verdict?.stale ? `${user?.displayname} marked this ready on v${entry.version}` : user?.displayname}
            className={classNames(avatarRingClasses, verdict?.ring, STACK_AVATAR_CLASSES)}
        />
    );
}

function UserNameRow({ entry, showVersion = false }: { entry: IReleaseCheck; showVersion?: boolean }) {
    const { data: user, isLoading } = useGetUserQuery({ discordId: entry.createdBy });
    return (
        <div className="flex items-center gap-2">
            <Avatar size="sm" src={user?.avatarUrl} name={user?.displayname?.charAt(0) ?? "?"} isDisabled={isLoading} />
            <span className="text-sm">{user?.displayname ?? "…"}</span>
            {showVersion && <span className="ml-auto text-xs text-foreground/40">v{entry.version}</span>}
        </div>
    );
}

function OverflowBubble({
    entries,
    latestVersion,
    selectedId,
    onSelect
}: {
    entries: IReleaseCheck[];
    latestVersion?: SemanticVersion;
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const hasSelected = entries.some((entry) => entry.createdBy === selectedId);
    return (
        <Popover placement="bottom" isOpen={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger>
                <button
                    type="button"
                    className={classNames(
                        avatarBubbleClasses,
                        "text-sm",
                        hasSelected && classNames(avatarRingClasses, "ring-primary")
                    )}
                >
                    +{entries.length}
                </button>
            </PopoverTrigger>
            <PopoverContent>
                <div className="grid grid-cols-4 gap-4 px-2 py-4 max-w-72">
                    {entries.map((entry) => (
                        <FeedbackAvatar
                            key={entry.createdBy}
                            discordId={entry.createdBy}
                            entry={entry}
                            latestVersion={latestVersion}
                            isSelected={entry.createdBy === selectedId}
                            onSelect={() => {
                                onSelect(entry.createdBy);
                                setIsOpen(false);
                            }}
                        />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function YourReleaseCheckForm({ project, number, entry, latestVersion, canSubmit, onDone }: YourReleaseCheckFormProps) {
    const [submitFeedback, { isLoading }] = useSubmitReleaseCheckMutation();
    const { errors, validate, isValidationError, clearError, clearErrors } = useFormValidation(Slot.ReleaseCheck);
    const [ready, setReady] = useState(entry?.ready ?? true);
    const [categories, setCategories] = useState<ReleaseCheckCategory[]>(entry?.categories ?? []);
    const [note, setNote] = useState(entry?.note ?? "");

    useEffect(() => {
        setReady(entry?.ready ?? true);
        setCategories(entry?.categories ?? []);
        setNote(entry?.note ?? "");
        clearErrors();
    }, [entry, clearErrors]);

    const isStale = !!entry && isCheckStale(entry, latestVersion);
    // Reaffirming resubmits the prior verdict verbatim, so it's only offered while the form still holds it
    const isUntouched =
        !!entry && ready === entry.ready && isEqual(categories, entry.categories ?? []) && note === (entry.note ?? "");

    const toggleCategory = (category: ReleaseCheckCategory) => {
        setCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
        clearError("categories");
    };

    const onSubmit = async () => {
        const payload = ready ? { ready } : { ready, categories, note: note.trim() };
        if (!validate(payload)) {
            return;
        }
        try {
            await submitFeedback({ project, number, ...payload }).unwrap();
            addToast({
                title: entry ? "Release check updated" : "Release check submitted",
                color: "success",
                description: ready
                    ? "You've marked this card as ready to release"
                    : "You've marked this card as not ready to release"
            });
            onDone();
        } catch (err) {
            if (!isValidationError(err)) {
                showApiErrorToast(err, { title: "Failed to submit release check" });
            }
        }
    };

    return (
        <Form
            className="bg-content1 border border-content3 rounded-md p-3 flex flex-col items-stretch gap-2"
            validationErrors={errors}
            onSubmit={(e) => {
                e.preventDefault();
                void onSubmit();
            }}
        >
            {isStale && (
                <div className="flex items-start gap-2 rounded-md border border-default-300 bg-default-100 px-3 py-2 text-xs text-foreground/70">
                    <FontAwesomeIcon icon={faClockRotateLeft} className="mt-0.5" />
                    <span>
                        You answered against <span className="font-medium">v{entry.version}</span>, and this card has
                        changed since. Your check no longer counts until you confirm it.
                    </span>
                </div>
            )}
            <div className="flex flex-col gap-1">
                <div className="text-sm">Do you believe this card is ready for release?</div>
                <div className="text-xs text-foreground/60">Focus on mechanics & thematics, not wording.</div>
                <ButtonGroup size="sm" className="self-start" isDisabled={!canSubmit}>
                    {[true, false].map((value) => (
                        <Button
                            key={String(value)}
                            color={ready === value ? "primary" : "default"}
                            variant="bordered"
                            onPress={() => {
                                setReady(value);
                                clearErrors();
                            }}
                        >
                            {value ? "Yes" : "No"}
                        </Button>
                    ))}
                </ButtonGroup>
            </div>
            <AnimatePresence initial={false}>
                {!ready && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden flex flex-col gap-2"
                    >
                        <div className="text-xs text-foreground/60">
                            Highlight relevant categories & provide your reasoning.
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {releaseCheckCategories.map((category) => (
                                <button
                                    key={category}
                                    type="button"
                                    disabled={!canSubmit}
                                    className="cursor-pointer"
                                    onClick={() => toggleCategory(category)}
                                >
                                    <Chip
                                        size="sm"
                                        variant={categories.includes(category) ? "solid" : "flat"}
                                        color={categories.includes(category) ? "primary" : "default"}
                                        className="capitalize cursor-pointer"
                                    >
                                        {category}
                                    </Chip>
                                </button>
                            ))}
                        </div>
                        {errors.categories && <div className="text-tiny text-danger">{errors.categories}</div>}
                        <Textarea
                            name="note"
                            size="sm"
                            minRows={2}
                            maxLength={140}
                            placeholder="Why shouldn't this card be released yet?"
                            value={note}
                            isDisabled={!canSubmit}
                            onValueChange={(value) => {
                                setNote(value);
                                clearError("note");
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            <FormValidationSummary errors={errors} mappedPaths={ready ? [] : ["note", "categories"]} />
            {canSubmit && (
                <Button type="submit" size="sm" color="primary" className="self-end" isDisabled={isLoading}>
                    {isStale
                        ? isUntouched
                            ? "Confirm This Still Stands"
                            : "Re-check"
                        : entry
                          ? "Update Response"
                          : "Submit Response"}
                </Button>
            )}
        </Form>
    );
}

function ReadOnlyReleaseCheck({ entry, latestVersion }: { entry?: IReleaseCheck; latestVersion?: SemanticVersion }) {
    const { data: user } = useGetUserQuery({ discordId: entry?.createdBy ?? "" }, { skip: !entry });
    if (!entry) {
        return null;
    }
    const isStale = isCheckStale(entry, latestVersion);
    return (
        <div className="bg-content1 border border-content3 rounded-md p-3 flex flex-col gap-2 opacity-90">
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground/70">{user?.displayname}</span>
                {isStale && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-foreground/40">
                        <FontAwesomeIcon icon={faClockRotateLeft} /> Answered on v{entry.version}
                    </span>
                )}
            </div>
            <div
                className={classNames(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
                    entry.ready
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-default-400/40 bg-default-100 text-foreground/70",
                    isStale && "opacity-50"
                )}
            >
                <FontAwesomeIcon icon={entry.ready ? faCheck : faXmark} />
                {entry.ready ? "Ready to release" : "Not ready to release"}
                <Timestamp
                    className="ml-auto text-xs italic font-normal text-foreground/40"
                    date={new Date(entry.updated)}
                />
            </div>
            {entry.categories && entry.categories.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                    {entry.categories.map((category) => (
                        <Chip key={category} size="sm" variant="flat" className="capitalize">
                            {category}
                        </Chip>
                    ))}
                </div>
            )}
            {entry.note && <div className="text-sm font-serif italic">{entry.note}</div>}
        </div>
    );
}

type YourReleaseCheckFormProps = {
    project: number;
    number: number;
    entry?: IReleaseCheck;
    latestVersion?: SemanticVersion;
    canSubmit: boolean;
    onDone: () => void;
};

type ReleaseChecksModalProps = {
    isOpen: boolean;
    onClose: () => void;
    project: number;
    number: number;
    /** Where the footer's navigation button goes - link to whichever page the modal wasn't opened from */
    viewTarget?: "release" | "card";
};
