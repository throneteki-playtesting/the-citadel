import { dataService, logger } from "@/services";
import Permission, { permissionMeta } from "common/models/permissions";
import { Role, User } from "common/models/auth";

function missingDependencies(permissions: Permission[]): { permission: Permission, dependency: Permission }[] {
    const held = new Set(permissions);
    const missing: { permission: Permission, dependency: Permission }[] = [];
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

function permissionSources(user: User, permission: Permission): string[] {
    const sources: string[] = [];
    if (user.permissions.includes(permission)) {
        sources.push("direct grant");
    }
    if (user.defaultPermissions?.includes(permission)) {
        sources.push("default permissions");
    }
    for (const role of user.roles) {
        if (role.permissions.includes(permission)) {
            sources.push(`role "${role.name}"`);
        }
    }
    return sources;
}

function checkRole(role: Role) {
    for (const { permission, dependency } of missingDependencies(role.permissions)) {
        logger.warn(`Permission dependency check: role "${role.name}" (${role.discordId}) has ${permission} without required dependency ${dependency}`);
    }
}

function checkUser(user: User) {
    const effectivePermissions = [
        ...user.permissions,
        ...(user.defaultPermissions ?? []),
        ...user.roles.flatMap((role) => role.permissions)
    ];
    for (const { permission, dependency } of missingDependencies(effectivePermissions)) {
        const sources = permissionSources(user, permission).join(", ");
        logger.warn(`Permission dependency check: user "${user.displayname}" (${user.discordId}) effectively has ${permission} [${sources}] without required dependency ${dependency}`);
    }
}

// Dependencies are only enforced when permissions/roles are saved (see validatePermissionDependencies),
// so existing data can drift out of sync whenever permissionMeta's dependency graph changes - this surfaces that drift on startup.
export async function checkPermissionDependencies(): Promise<void> {
    try {
        const [roles, users] = await Promise.all([
            dataService.roles.read(),
            dataService.users.read()
        ]);

        roles.forEach(checkRole);
        users.forEach(checkUser);
    } catch (err) {
        logger.error(err);
    }
}
