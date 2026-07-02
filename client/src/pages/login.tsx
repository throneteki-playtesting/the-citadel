import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, HeroUIProvider, Spinner, ToastProvider } from "@heroui/react";
import { Navigate, useHref, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading, isProcessing, login } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return (
        <HeroUIProvider navigate={navigate} useHref={useHref}>
            <ToastProvider placement="top-right" />
            <div
                className="min-h-screen flex flex-col items-center justify-center p-2"
                style={{ background: "radial-gradient(ellipse at center, #1C1C24 0%, #0A0A0C 70%)" }}
            >
                <div className="flex flex-col items-center border border-divider rounded-2xl bg-content1/30 px-10 py-12 sm:px-16 sm:py-14 w-full max-w-md">
                    <div className="flex flex-col items-center text-center select-none mb-10">
                        <h1 className="font-cinzel text-4xl sm:text-5xl font-semibold text-primary tracking-widest uppercase">
                            The Citadel
                        </h1>

                        <p className="text-sm text-foreground/50 text-center mt-4">
                            A Design & Playtesting management platform for the AGoT LCG community.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 w-full mb-8">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-primary/30" />
                        <span className="text-primary/40 text-xs" aria-hidden="true">✦</span>
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-primary/30" />
                    </div>

                    <p className="font-cinzel text-xs tracking-[0.15em] uppercase text-foreground/30 mb-6">
                        Sign in to continue
                    </p>

                    <Button
                        size="lg"
                        color="primary"
                        variant="bordered"
                        startContent={
                            isProcessing
                                ? <Spinner size="sm" color="primary" />
                                : <FontAwesomeIcon icon={faDiscord} size="lg" />
                        }
                        isDisabled={isProcessing}
                        onPress={login}
                        className="font-cinzel tracking-widest uppercase px-10 border-primary/40 hover:border-primary whitespace-normal sm:whitespace-nowrap h-auto sm:h-12 py-4 sm:py-0 text-center"
                    >
                        Log in with Discord
                    </Button>
                </div>
            </div>
        </HeroUIProvider>
    );
}
