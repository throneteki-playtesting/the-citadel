import { User } from "common/models/auth";
import { ValidationStep, validate } from "common/utils";
import { useAuth } from "./useAuth";

export function usePermission(...requires: ValidationStep<User>[]) {
    const { user } = useAuth();
    return validate(user, ...requires);
}
