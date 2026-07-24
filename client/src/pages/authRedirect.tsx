import { addToast, Spinner } from "@heroui/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../api/store";
import type { AuthStatus } from "server/types";
import type { OnboardingType } from "common/models/onboarding";
import type { OnboardingLocationState } from "../hooks/useOnboardingRedirectHint";

export default function AuthRedirect() {
    const dispatch = useDispatch<AppDispatch>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const status = searchParams.get("status") as AuthStatus;
    const onboarding = searchParams.get("onboarding") as OnboardingType | null;

    useEffect(() => {
        const process = async function() {
            if (status === "error") {
                addToast({ title: "Failed to login", description: "An error has occurred during login process. Please contact an administrator", color: "danger" });
            } else if (status === "success") {
                addToast({ title: "Welcome back, Maester", description: "You have successfully signed in.", color: "success" });
            }
            const state: OnboardingLocationState | undefined = onboarding ? { onboarding } : undefined;
            navigate("/", { replace: true, state });
        };
        process();
    }, [dispatch, navigate, onboarding, status]);
    return <Spinner size="lg" className="h-full"/>;
};