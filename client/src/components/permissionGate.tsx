import { ReactNode } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../api/store";
import { SingleOrArray } from "common/types";
import { asArray, validate, ValidationStep } from "common/utils";
import { User } from "common/models/auth";

const PermissionGate = ({ children, requires }: PermissionGateProps) => {
    const user = useSelector((state: RootState) => state.auth.user);
    if (!requires) {
        return children;
    }
    if (validate(user, ...asArray(requires))) {
        return children;
    }
    return null;
};

type PermissionGateProps = { children?: SingleOrArray<ReactNode>, requires?: SingleOrArray<ValidationStep<User>> }
export default PermissionGate;