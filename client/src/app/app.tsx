import { HeroUIProvider, ToastProvider } from "@heroui/react";
import NavigationBar from "../components/navigation";
import { Outlet, useHref, useNavigate } from "react-router-dom";
import { SSEProvider } from "./sseProvider";

function App() {
    const navigate = useNavigate();

    return (
        <SSEProvider>
            <HeroUIProvider navigate={navigate} useHref={useHref}>
                <NavigationBar />
                <ToastProvider placement="top-right"/>
                <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl">
                    <Outlet />
                </div>
            </HeroUIProvider>
        </SSEProvider>
    );
}

export default App;
