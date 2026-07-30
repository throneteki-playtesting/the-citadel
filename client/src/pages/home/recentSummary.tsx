import React, { ReactNode } from "react";
import classNames from "classnames";
import { useAuth } from "../../hooks/useAuth";
import { validate, asArray, ValidationStep } from "common/utils";
import { SingleOrArray } from "common/types";
import { User } from "common/models/auth";
import PermissionGate from "../../components/permissionGate";

const gridClasses = [
    "",
    "grid-cols-1",
    "grid-cols-1 sm:grid-cols-2",
    "grid-cols-1 sm:grid-cols-3",
    "grid-cols-1 sm:grid-cols-2"
] as const;

type RecentSummaryProps = {
    children: ReactNode;
};

export default function RecentSummary({ children }: RecentSummaryProps) {
    const { user } = useAuth();

    const visibleCount = React.Children.toArray(children).filter((child) => {
        if (!React.isValidElement(child) || child.type !== PermissionGate) return true;
        const { requires } = child.props as { requires?: SingleOrArray<ValidationStep<User>> };
        if (!requires) return true;
        return validate(user, ...asArray(requires));
    }).length;

    if (visibleCount === 0) return null;

    return <div className={classNames("grid gap-2", gridClasses[visibleCount])}>{children}</div>;
}
