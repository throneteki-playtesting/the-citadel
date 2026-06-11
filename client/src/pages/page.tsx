import Permission from "common/models/permissions";
import { ReactNode } from "react";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import { useSelector } from "react-redux";
import { RootState } from "../api/store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";

const Page = ({ children, required }: PageProps) => {
    const { user, isAuthenticating } = useSelector((state: RootState) => state.auth);

    if (isAuthenticating) {
        return null;
    }
    const permissions = asArray(required ?? []);
    if (!hasPermission(user, ...permissions)) {
        return <div className="w-full h-full flex justify-center items-center">
            <div className="flex flex-col items-center gap-2 text-center p-4">
                <FontAwesomeIcon icon={faLock} size="4x" className="text-foreground/30" />
                <div className="font-cinzel text-xl">You are not permitted to enter...</div>
                <div className="font-crimson italic text-foreground/60">You do not have the authority to access this. If you believe this is an error, seek counsel from an administrator.</div>
            </div>
        </div>;
    }

    return <>{children}</>;
};
type PageProps = { children: ReactNode, required?: SingleOrArray<Permission> }

export default Page;