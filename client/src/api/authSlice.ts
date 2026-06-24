import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
    isProcessing: boolean;
}

const initialState: AuthState = {
    isProcessing: false
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        setIsProcessing(state, action: PayloadAction<boolean>) {
            state.isProcessing = action.payload;
        }
    }
});

export const { setIsProcessing } = authSlice.actions;
export default authSlice.reducer;
