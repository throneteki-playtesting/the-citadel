import { PLAYTESTING_TEAM_ROLE_NAME } from "./auth";

export type OnboardingType = "playtest";

interface OnboardingRoleConfig {
    /** Discord role name that makes a user eligible for this onboarding flow */
    roleName: string;
}

export const onboardingRoleConfig: Record<OnboardingType, OnboardingRoleConfig> = {
    playtest: { roleName: PLAYTESTING_TEAM_ROLE_NAME }
};

/**
 * Order in which onboarding flows are offered when a user qualifies for more than one at once
 * (eg. gains two onboarding-worthy roles in the same sync). Earlier entries win.
 */
export const onboardingPriority: OnboardingType[] = ["playtest"];
