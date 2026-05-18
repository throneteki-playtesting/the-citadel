import { createContext, useContext } from "react";

export const SSEContext = createContext<void>(undefined);
export const useSSE = () => useContext(SSEContext);