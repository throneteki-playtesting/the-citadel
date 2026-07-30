import { useState } from "react";
import { isEligibleForOnboarding } from "common/utils";
import type { OnboardingType } from "common/models/onboarding";
import { useAuth } from "./useAuth";
import { useOnboardingRedirectHint } from "./useOnboardingRedirectHint";

/**
 * Manages a single onboarding modal (eg. "playtest"). There's no persisted "seen" state — it's opened
 * either by a one-shot hint carried in router state from the post-login redirect, or on demand (eg. a
 * "just gained the role" action, or a header button).
 */
export function useOnboardingModal(type: OnboardingType) {
    const { user } = useAuth();
    const redirectHint = useOnboardingRedirectHint();
    const [isOpen, setIsOpen] = useState(() => redirectHint === type);

    return {
        isEligible: isEligibleForOnboarding(user, type),
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false)
    };
}
