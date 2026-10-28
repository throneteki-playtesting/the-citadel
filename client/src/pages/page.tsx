import Permission from "common/models/permissions";
import { ReactNode, Suspense } from "react";
import PageTitleSkeleton from "../components/pageTitleSkeleton";
import { SingleOrArray } from "common/types";
import { asArray, hasPermission } from "common/utils";
import { useScopedUser } from "../hooks/useScopedUser";
import AccessDenied from "../components/accessDenied";

export default function Page({ children, required }: PageProps) {
    const { user, isLoading } = useScopedUser();

    if (isLoading) {
        return <PageTitleSkeleton />;
    }
    const permissions = asArray(required ?? []);
    if (!hasPermission(user, ...permissions)) {
        return <AccessDenied />;
    }

    return <Suspense fallback={<PageTitleSkeleton />}>{children}</Suspense>;
}

type PageProps = {
    children: ReactNode;
    required?: SingleOrArray<Permission>;
};
