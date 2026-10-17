import Permission from "common/models/permissions";
import { ReactNode } from "react";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import { useScopedUser } from "../hooks/useScopedUser";
import AccessDenied from "../components/accessDenied";

export default function Page({ children, required }: PageProps) {
    const { user, isLoading } = useScopedUser();

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
