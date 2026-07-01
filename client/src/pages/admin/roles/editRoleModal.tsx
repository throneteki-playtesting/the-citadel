import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission, { permissionMeta } from "common/models/permissions";
import { useGetUsersQuery, useUpdateRoleMutation } from "../../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloneDeep } from "lodash-es";
import { Role } from "common/models/auth";
import PermissionCheckboxes from "../../../components/permissionCheckboxes";

const permissionFullLabel = new Map<string, string>(
    Object.entries(permissionMeta).map(([value, { label, group }]) => [value, `${group} > ${label}`])
);

export default function EditRoleModal({ role, onOpenChange, onSave: onRoleSave }: EditRoleModalProps) {
    const [updateRole, { isLoading }] = useUpdateRoleMutation();
    const [permissions, setPermissions] = useState(new Set<string>([]));

    const { data: usersData } = useGetUsersQuery(undefined, { skip: !role });

    const affectedUsers = useMemo(
        () => (usersData?.items ?? []).filter((u) => u.roles.some((r) => r.discordId === role?.discordId)),
        [usersData, role]
    );

    const getUserBlockers = useCallback((value: string): string[] => {
        if (!role) return [];
        const blockers: string[] = [];

        for (const user of affectedUsers) {
            // Would the user still have `value` from another source if removed from this role?
            const otherSources = new Set<string>();
            for (const p of user.permissions) otherSources.add(p.toString());
            for (const userRole of user.roles) {
                if (userRole.discordId === role.discordId) continue;
                for (const p of userRole.permissions) otherSources.add(p.toString());
            }
            for (const p of permissions) {
                if (p !== value) otherSources.add(p);
            }
            if (otherSources.has(value)) continue;

            // Check if any of the user's direct permissions depend on `value`
            for (const permission of user.permissions) {
                const deps = permissionMeta[permission]?.dependencies;
                if (!deps) continue;
                const required = Array.isArray(deps) ? deps : [deps];
                if (required.includes(value as Permission)) {
                    blockers.push(`${user.displayname} (requires ${permissionFullLabel.get(permission) ?? permission})`);
                }
            }
        }

        return blockers;
    }, [affectedUsers, permissions, role]);

    const onSave = useCallback(async () => {
        if (role) {
            const model = cloneDeep(role);
            const validPermissions = new Set<string>(Object.values(Permission));
            model.permissions = [...permissions].filter((p) => validPermissions.has(p)).map((p) => p as Permission);

            // TODO: Consider (somehow) updating the users who have this role on open sessions?
            const response = await updateRole(model);
            if (response.error) {
                addToast({ title: "Error", color: "danger", description: "Failed to save role" });
            } else {
                addToast({ title: "Role saved", color: "success", description: `${model.name} was updated successfully.` });
                if (onRoleSave) {
                    onRoleSave(model);
                }
                onOpenChange();
            }
        }
    }, [onOpenChange, onRoleSave, permissions, role, updateRole]);

    useEffect(() => {
        setPermissions(new Set(role?.permissions.map((p) => p.toString()) ?? []));
    }, [role]);

    return (
        <Modal isOpen={!!role} size="2xl" scrollBehavior="inside" placement="top-center" onOpenChange={onOpenChange}>
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>Edit {role?.name}</ModalHeader>
                        <ModalBody>
                            <p className="text-sm text-default-500">Changing permissions will refresh the permissions for each user with this role.</p>
                            <PermissionCheckboxes selectedPermissions={permissions} getUserBlockers={getUserBlockers} onChange={setPermissions} />
                        </ModalBody>
                        <ModalFooter>
                            <Button onPress={onClose}>
                                Cancel
                            </Button>
                            <Button color="primary" isLoading={isLoading} onPress={onSave}>
                                Save
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};

type EditRoleModalProps = Omit<BaseElementProps, "children"> & {
    role?: Role;
    onOpenChange: (isOpen?: boolean) => void;
    onSave?: (role: Role) => void;
};
