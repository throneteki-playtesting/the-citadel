import { HeroUIProvider, ToastProvider } from "@heroui/react";
import NavigationBar from "../components/navigation";
import { Outlet, useHref, useNavigate } from "react-router-dom";

function App() {
    const navigate = useNavigate();

    return (
        <HeroUIProvider navigate={navigate} useHref={useHref} className="h-full bg-background">
            <NavigationBar />
            <ToastProvider placement="top-right"/>
            <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl bg-content1">
                <Outlet />
            </div>
        </HeroUIProvider>
    );
}

export default App;
