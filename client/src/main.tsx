import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import * as Sentry from "@sentry/react";
import { store } from "./api/store";

import "./main.css";
import { RouterProvider } from "react-router-dom";
import router from "./router";

if (import.meta.env.PROD) {
    Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        sendDefaultPii: false
    });
}

const container = document.getElementById("root");
const root = createRoot(container as HTMLElement);

root.render(
    <StrictMode>
        <Provider store={store}>
            <RouterProvider router={router} />
        </Provider>
    </StrictMode>
);
