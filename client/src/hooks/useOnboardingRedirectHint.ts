import { useState } from "react";
import { useLocation } from "react-router-dom";
import type { OnboardingType } from "common/models/onboarding";

export type OnboardingLocationState = { onboarding?: OnboardingType };

/** One-shot onboarding hint carried in router state from the post-login redirect (see authRedirect.tsx) */
export function useOnboardingRedirectHint() {
    const location = useLocation();
    const [hint] = useState(() => (location.state as OnboardingLocationState | null)?.onboarding);
    return hint;
}
