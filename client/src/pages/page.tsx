import Permission from "common/models/permissions";
import { ReactNode, Suspense } from "react";
import { Skeleton } from "@heroui/react";
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

    return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

// While a page's own code is still arriving - a title and a body, the outline nearly every page shares
function PageSkeleton() {
    return (
        <div className="flex flex-col gap-4 px-4 md:px-0">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-64 max-w-full rounded-md" />
                <Skeleton className="h-5 w-48 rounded-md" />
            </div>
            <Skeleton className="h-98 w-full rounded-md" />
        </div>
    );
}
type PageProps = {
    children: ReactNode;
    required?: SingleOrArray<Permission>;
};
