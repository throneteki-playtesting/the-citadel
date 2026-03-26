import Permission from "common/models/permissions";
import { ReactNode } from "react";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import { useSelector } from "react-redux";
import { RootState } from "../api/store";
import { Skeleton } from "@heroui/react";

// TODO: Better unauthorized page
const Page = ({ children, required }: PageProps) => {
    const { user, isAuthenticating } = useSelector((state: RootState) => state.auth);

    if (isAuthenticating) {
        // TODO: Move this to a more generic component for "page loading"
        return <Skeleton className="w-full, h-60"/>;
    }
    const permissions = asArray(required ?? []);
    if (!hasPermission(user, ...permissions)) {
        return <div>Unauthorized</div>;
    }

    return <>{children}</>;
};
type PageProps = { children: ReactNode, required?: SingleOrArray<Permission> }

export default Page;