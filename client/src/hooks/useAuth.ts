import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../api/store";
import { setIsProcessing } from "../api/authSlice";
import api, { useImpersonateRoleMutation, useImpersonateUserMutation, useLogoutMutation, useStopImpersonatingMutation } from "../api";
import { addToast } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { showApiErrorToast } from "../api/errors";

export function useAuth() {
    const { data: user, isLoading, isFetching } = api.useGetMeQuery();
    const isProcessing = useSelector((state: RootState) => state.auth.isProcessing);
    const dispatch = useDispatch();
    const [logoutMutation] = useLogoutMutation();
    const [impersonateRoleMutation, { isLoading: isStartingRoleImpersonation }] = useImpersonateRoleMutation();
    const [impersonateUserMutation, { isLoading: isStartingUserImpersonation }] = useImpersonateUserMutation();
    const [stopImpersonatingMutation, { isLoading: isStoppingImpersonation }] = useStopImpersonatingMutation();
    const navigate = useNavigate();

    const isAuthenticated = !!user && user.id !== "anonymous";
    const impersonation = user?.impersonation;

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

    const impersonateRole = async (roleId: string) => {
        try {
            const result = await impersonateRoleMutation({ roleId }).unwrap();
            addToast({ title: "Viewing as Role", color: "warning", description: `Now viewing as ${result.roles[0]?.name}` });
            await navigate("/");
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Impersonate" });
        }
    };

    const impersonateUser = async (discordId: string) => {
        try {
            const result = await impersonateUserMutation({ discordId }).unwrap();
            addToast({ title: "Viewing as User", color: "warning", description: `Now viewing as ${result.displayname}` });
            await navigate("/");
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Impersonate" });
        }
    };

    const stopImpersonating = async () => {
        try {
            await stopImpersonatingMutation().unwrap();
            addToast({ title: "Impersonation Ended", color: "success", description: "You're back to viewing as yourself" });
        } catch (err) {
            showApiErrorToast(err, { title: "Failed to Exit Impersonation" });
        }
    };

    return {
        user,
        isAuthenticated,
        isLoading,
        isFetching,
        isProcessing,
        login,
        logout,
        impersonation,
        isImpersonating: !!impersonation,
        impersonateRole,
        impersonateUser,
        stopImpersonating,
        isImpersonationActionPending: isStartingRoleImpersonation || isStartingUserImpersonation || isStoppingImpersonation
    };
}
