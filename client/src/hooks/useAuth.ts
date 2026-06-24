import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../api/store";
import { setIsProcessing } from "../api/authSlice";
import api, { useLogoutMutation } from "../api";
import { addToast } from "@heroui/react";
import { useNavigate } from "react-router-dom";

export function useAuth() {
    const { data: user, isLoading, isFetching } = api.useGetMeQuery();
    const isProcessing = useSelector((state: RootState) => state.auth.isProcessing);
    const dispatch = useDispatch();
    const [logoutMutation] = useLogoutMutation();
    const navigate = useNavigate();

    const isAuthenticated = !!user && user.id !== "anonymous";

    const login = () => {
        dispatch(setIsProcessing(true));
        window.location.href = "/auth/discord";
    };

    const logout = async () => {
        if (!isAuthenticated) return;
        dispatch(setIsProcessing(true));
        try {
            await logoutMutation().unwrap();
            await navigate("/");
        } catch {
            addToast({ title: "Error", color: "danger", description: "Failed to log out" });
        } finally {
            dispatch(setIsProcessing(false));
        }
    };

    return {
        user,
        isAuthenticated,
        isLoading,
        isFetching,
        isProcessing,
        login,
        logout
    };
}
