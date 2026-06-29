import { addToast, Spinner } from "@heroui/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../api/store";
import type { AuthStatus } from "server/types";
export default function AuthRedirect() {
    const dispatch = useDispatch<AppDispatch>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const status = searchParams.get("status") as AuthStatus;

    useEffect(() => {
        const process = async function() {
            if (status === "error") {
                addToast({ title: "Failed to login", description: "An error has occurred during login process. Please contact an administrator", color: "danger" });
            } else if (status === "success") {
                addToast({ title: "Welcome back, Maester", description: "You have successfully signed in.", color: "success" });
            }
            navigate("/", { replace: true });
        };
        process();
    }, [dispatch, navigate, status]);
    return <Spinner size="lg" className="h-full"/>;
};