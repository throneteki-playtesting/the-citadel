import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "common/models/auth";

interface AuthState {
    user?: User,
    isAuthenticating: boolean
}

const initialState: AuthState = {
    user: undefined,
    isAuthenticating: false
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        setUser(state, action: PayloadAction<AuthState>) {
            state.user = action.payload.user;
            state.isAuthenticating = action.payload.isAuthenticating;
        },
        clearUser(state) {
            state.user = undefined;
            state.isAuthenticating = false;
        }
    }
});

export const {
    setUser,
    clearUser
} = authSlice.actions;

export default authSlice.reducer;