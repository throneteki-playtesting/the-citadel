import { User } from "common/models/auth";
import { ValidationStep, validate } from "common/utils";
import { useSelector } from "react-redux";
import { RootState } from "../api/store";

export function usePermission(...requires: ValidationStep<User>[]) {
    const user = useSelector((state: RootState) => state.auth.user);
    return validate(user, ...requires);
}