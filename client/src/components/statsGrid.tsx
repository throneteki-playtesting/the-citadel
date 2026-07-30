import React, { ReactNode } from "react";
import classNames from "classnames";
import { useAuth } from "../hooks/useAuth";
import { validate, asArray, ValidationStep } from "common/utils";
import { SingleOrArray } from "common/types";
import { User } from "common/models/auth";
import PermissionGate from "./permissionGate";

const gridCols = [
    "",
    "grid-cols-1",
    "grid-cols-2",
    "grid-cols-2 sm:grid-cols-3",
    "grid-cols-2 sm:grid-cols-4"
] as const;

type StatsGridProps = {
    children: ReactNode;
    className?: string;
};

export default function StatsGrid({ children, className }: StatsGridProps) {
    const { user } = useAuth();

    const visibleCount = React.Children.toArray(children).filter((child) => {
        if (!React.isValidElement(child) || child.type !== PermissionGate) return true;
        const { requires } = child.props as { requires?: SingleOrArray<ValidationStep<User>> };
        if (!requires) return true;
        return validate(user, ...asArray(requires));
    }).length;

    if (visibleCount === 0) return null;

    return (
        <div
            className={classNames(
                "grid max-sm:divide-y divide-x divide-content3",
                "max-sm:[&>*:nth-child(even)]:border-e-0! max-sm:[&>*:nth-last-child(-n+2)]:border-b-0!",
                gridCols[visibleCount],
                className
            )}
        >
            {children}
        </div>
    );
}
