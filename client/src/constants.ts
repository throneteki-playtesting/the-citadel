import Permission from "common/models/permissions";
import { enumToArray } from "./utils";

export const availablePermissions = enumToArray(Permission);