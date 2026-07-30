import Permission from "common/models/permissions";
import { ReactNode } from "react";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import { useAuth } from "../hooks/useAuth";
import AccessDenied from "../components/accessDenied";

export default function Page({ children, required }: PageProps) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return null;
    }
    const permissions = asArray(required ?? []);
    if (!hasPermission(user, ...permissions)) {
        return <AccessDenied />;
    }

    return <>{children}</>;
}
type PageProps = {
    children: ReactNode;
    required?: SingleOrArray<Permission>;
};
