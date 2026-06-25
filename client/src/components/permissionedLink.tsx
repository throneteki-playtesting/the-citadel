import { Link, type LinkProps } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { validate, asArray, ValidationStep } from "common/utils";
import { SingleOrArray } from "common/types";
import { User } from "common/models/auth";

type PermissionedLinkProps = LinkProps & {
    requires?: SingleOrArray<ValidationStep<User>>;
    children: ReactNode;
};

export default function PermissionedLink({ requires, children, ...props }: PermissionedLinkProps) {
    const { user } = useAuth();
    if (requires && !validate(user, ...asArray(requires))) return <>{children}</>;
    return <Link {...props}>{children}</Link>;
}
