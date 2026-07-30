import { ReactNode } from "react";
import { SingleOrArray } from "common/types";
import { asArray, validate, ValidationStep } from "common/utils";
import { User } from "common/models/auth";
import { useAuth } from "../hooks/useAuth";

export default function PermissionGate({ children, requires }: PermissionGateProps) {
    const { user } = useAuth();
    if (!requires) {
        return children;
    }
    if (validate(user, ...asArray(requires))) {
        return children;
    }
    return null;
}

type PermissionGateProps = {
    children?: SingleOrArray<ReactNode>;
    requires?: SingleOrArray<ValidationStep<User>>;
};
