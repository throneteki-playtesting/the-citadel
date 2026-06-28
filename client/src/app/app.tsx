import { HeroUIProvider, ToastProvider } from "@heroui/react";
import NavigationBar from "../components/navigation";
import Footer from "../components/footer";
import { Outlet, useHref, useLocation, useNavigate } from "react-router-dom";
import { SSEProvider } from "./sseProvider";
import { useEffect } from "react";

function App() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <SSEProvider>
            <HeroUIProvider navigate={navigate} useHref={useHref}>
                <NavigationBar />
                <ToastProvider placement="top-right"/>
                <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl">
                    <Outlet />
                </div>
                <Footer />
            </HeroUIProvider>
        </SSEProvider>
    );
}

export default App;
