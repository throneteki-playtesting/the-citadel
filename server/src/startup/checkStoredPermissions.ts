import { dataService, logger } from "@/services";
import Permission, { permissionMeta } from "common/models/permissions";
import { Role, User } from "common/models/auth";

const known = new Set<string>(Object.values(Permission));
const outdatedIn = (permissions: Permission[]) => permissions.filter((permission) => !known.has(permission));

// Drops what the holder has that the code no longer defines, returning what was dropped
function stripOutdated(holder: { permissions: Permission[] }) {
    const outdated = outdatedIn(holder.permissions);
    holder.permissions = holder.permissions.filter((permission) => known.has(permission));
    return outdated;
}

// A permission taken out of the code stays on whoever held it, and they fail validation on their next save until it goes
async function removeOutdatedPermissions(roles: Role[], users: User[]) {
    const staleRoles = roles.filter((role) => {
        const outdated = stripOutdated(role);
        if (outdated.length > 0) {
            logger.warn(
                `Outdated permission check: removing ${outdated.join(", ")} from role "${role.name}" (${role.discordId})`
            );
        }
        return outdated.length > 0;
    });
    // A user carries a copy of each role they hold, which goes stale along with the role itself
    const staleUsers = users.filter((user) => {
        const outdated = stripOutdated(user);
        const copied = user.roles.flatMap(stripOutdated);
        if (outdated.length > 0) {
            logger.warn(
                `Outdated permission check: removing ${outdated.join(", ")} from user "${user.displayname}" (${user.discordId})`
            );
        }
        return outdated.length + copied.length > 0;
    });

    if (staleRoles.length > 0) {
        await dataService.roles.update(staleRoles, false, false);
    }
    if (staleUsers.length > 0) {
        await dataService.users.update(staleUsers, false, false, false);
    }
}

function missingDependencies(permissions: Permission[]): { permission: Permission; dependency: Permission }[] {
    const held = new Set(permissions);
    const missing: { permission: Permission; dependency: Permission }[] = [];
    for (const permission of held) {
        const dependencies = permissionMeta[permission]?.dependencies;
        if (!dependencies) {
            continue;
        }
        const required = Array.isArray(dependencies) ? dependencies : [dependencies];
        for (const dependency of required) {
            if (!held.has(dependency)) {
                missing.push({ permission, dependency });
            }
        }
    }
    return missing;
}

function checkRole(role: Role) {
    for (const { permission, dependency } of missingDependencies(role.permissions)) {
        logger.warn(
            `Permission dependency check: role "${role.name}" (${role.discordId}) has ${permission} without required dependency ${dependency}`
        );
    }
}

// Only checks permissions granted directly to the user (not ones inherited from roles/defaults)
function checkUser(user: User) {
    for (const { permission, dependency } of missingDependencies(user.permissions)) {
        logger.warn(
            `Permission dependency check: user "${user.displayname}" (${user.discordId}) has ${permission} directly without required dependency ${dependency}`
        );
    }
}

// Stored permissions are only checked when a role or user is saved, so they drift whenever the permission
// list or its dependency graph changes - outdated ones are removed on startup, missing dependencies surfaced
export async function checkStoredPermissions(): Promise<void> {
    try {
        const [roles, users] = await Promise.all([dataService.roles.read(), dataService.users.read()]);

        await removeOutdatedPermissions(roles, users);
        roles.forEach(checkRole);
        users.forEach(checkUser);
    } catch (err) {
        logger.error(err);
    }
}
