import { useState } from "react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { IRefinementCheck, IRefinementInquiry, isCheckStale } from "common/models/refinement";
import { SemanticVersion } from "common/utils";
import UserAvatar from "../../../components/userAvatar";
import { TouchTooltip } from "../../../components/touchTooltip";
import TooltipDetail from "../../../components/tooltipDetail";
import { useAuth } from "../../../hooks/useAuth";

/**
 * Somebody asserting they have read this card, stamped with the version they read so a later version puts
 * the assertion back where it started. Sits on the title's own row, as artwork's assignee does.
 */
export default function RefinementCheckControl({
    checks,
    inquiries,
    version,
    canSubmit,
    isSaving,
    className,
    onCheck,
    onWithdraw
}: RefinementCheckControlProps) {
    const { user } = useAuth();
    const [isHovering, setIsHovering] = useState(false);

    const mine = checks.find((check) => check.createdBy === user?.discordId);
    const isMineStale = !!mine && isCheckStale(mine, version);
    const isChecked = !!mine && !isMineStale;
    const current = checks.filter((check) => !isCheckStale(check, version));
    // Raising an inquiry records a check on your behalf, so withdrawing one while your own questions are
    // still on the card would leave it claiming nobody has read it. Closed ones count too
    const canWithdraw = !inquiries.some((entry) => entry.createdBy === user?.discordId);

    return (
        <div className={classNames("flex items-center gap-2", className)}>
            {current.length > 0 && (
                <TouchTooltip
                    content={
                        <TooltipDetail heading="Refinement check">
                            {`Checked by ${current.length} ${current.length === 1 ? "person" : "people"} against ${version ?? "this card"}.`}
                            {isMineStale && " Yours was against an earlier version."}
                        </TooltipDetail>
                    }
                >
                    <div className="flex shrink-0 cursor-help items-center gap-1">
                        {current.map((check) => (
                            <UserAvatar
                                key={check.createdBy}
                                discordId={check.createdBy}
                                title=""
                                className="!size-6 text-[0.6rem]"
                            />
                        ))}
                    </div>
                </TouchTooltip>
            )}

            {canSubmit &&
                (isChecked ? (
                    <TouchTooltip
                        content="Your own inquiries stand on this card, and raising one records a check"
                        isDisabled={canWithdraw}
                    >
                        <Button
                            size="sm"
                            color={isHovering && canWithdraw ? "warning" : "success"}
                            variant={isHovering && canWithdraw ? "flat" : "solid"}
                            className="shrink-0 w-32 transition-colors"
                            isDisabled={isSaving || !canWithdraw}
                            isLoading={isSaving}
                            endContent={
                                !isSaving && (
                                    <FontAwesomeIcon icon={isHovering && canWithdraw ? faRotateLeft : faCheck} />
                                )
                            }
                            onMouseEnter={() => setIsHovering(true)}
                            onMouseLeave={() => setIsHovering(false)}
                            onPress={onWithdraw}
                        >
                            {isHovering && canWithdraw ? "Withdraw" : "Checked"}
                        </Button>
                    </TouchTooltip>
                ) : (
                    <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        className="shrink-0"
                        isDisabled={isSaving || !version}
                        isLoading={isSaving}
                        startContent={!isSaving && <FontAwesomeIcon icon={faCheck} />}
                        onPress={onCheck}
                    >
                        I have checked this
                    </Button>
                ))}
        </div>
    );
}

type RefinementCheckControlProps = {
    checks: IRefinementCheck[];
    /** Every inquiry on the card, open or closed - what decides whether a check may be taken back */
    inquiries: IRefinementInquiry[];
    version?: SemanticVersion;
    canSubmit: boolean;
    isSaving: boolean;
    className?: string;
    onCheck: () => void;
    onWithdraw: () => void;
};
