import { HeroUIProvider, ToastProvider } from "@heroui/react";
import NavigationBar from "../components/navigation";
import Footer from "../components/footer";
import { Outlet, useHref, useLocation, useNavigate } from "react-router-dom";
import { SSEProvider } from "./sseProvider";
import { useEffect, useState } from "react";
import preloadPages from "../pages/preloadPages";

function App() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [navbarHeight, setNavbarHeight] = useState(64);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    // Once, after the first page has drawn - see preloadPages
    useEffect(() => preloadPages(), []);

    // Tracks the navbar's live rendered height so toasts sit just below it even if it changes
    useEffect(() => {
        const nav = document.querySelector("nav");
        if (!nav) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => setNavbarHeight(entry.contentRect.height));
        observer.observe(nav);
        return () => observer.disconnect();
    }, []);

    return (
        <SSEProvider>
            <HeroUIProvider navigate={navigate} useHref={useHref}>
                <NavigationBar />
                <ToastProvider placement="top-right" toastOffset={navbarHeight} />
                <div className="overflow-x-clip">
                    {/* At least a screen tall beneath the navbar, so the footer stays out of sight while a page is still
                        only its title skeleton */}
                    <div className="mx-auto p-1 sm:p-2 md:p-3 w-full max-w-5xl min-h-[calc(100dvh-4rem)]">
                        <Outlet />
                    </div>
                </div>
                <Footer />
            </HeroUIProvider>
        </SSEProvider>
    );
}

export default App;
