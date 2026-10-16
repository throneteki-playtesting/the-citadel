import { User } from "common/models/auth";
import { ValidationStep, validate } from "common/utils";
import { useScopedUser } from "./useScopedUser";

export function usePermission(...requires: ValidationStep<User>[]) {
    const { user } = useScopedUser();
    return validate(user, ...requires);
}
