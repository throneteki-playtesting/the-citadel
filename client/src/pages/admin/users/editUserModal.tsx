import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { useUpdateUserMutation } from "../../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { User } from "common/models/auth";
import { cloneDeep } from "lodash-es";
import PermissionCheckboxes from "../../../components/permissionCheckboxes";
import { isImpersonationReadOnlyError } from "../../../api/errors";

export default function EditUserModal({ user, guestUser, onOpenChange, onSave: onUserSave }: EditUserModalProps) {
    const [updateUser, { isLoading }] = useUpdateUserMutation();
    const [permissions, setPermissions] = useState(new Set<string>([]));

    const onSave = useCallback(async () => {
        if (user) {
            const model = cloneDeep(user);
            const validPermissions = new Set<string>(Object.values(Permission));
            model.permissions = [...permissions].filter((p) => validPermissions.has(p)).map((p) => p as Permission);

            const response = await updateUser(model);
            if (response.error) {
                // The global error toast middleware already surfaces a clearer message for this case
                if (!isImpersonationReadOnlyError(response.error)) {
                    addToast({ title: "Error", color: "danger", description: "Failed to save user" });
                }
            } else {
                addToast({ title: "User saved", color: "success", description: `${model.displayname} was updated successfully.` });
                if (onUserSave) {
                    onUserSave(model);
                }
                onOpenChange();
            }
        }
    }, [onOpenChange, onUserSave, permissions, updateUser, user]);

    const roleGrantedPermissions = useMemo(() => {
        const perms = new Set<string>();
        for (const role of user?.roles ?? []) {
            for (const p of role.permissions) {
                perms.add(p.toString());
            }
        }
        return perms;
    }, [user]);

    const guestProfilePermissions = useMemo(() => {
        if (!guestUser || user?.discordId === "anonymous") return undefined;
        const perms = new Set<string>();
        for (const p of guestUser.permissions) perms.add(p.toString());
        for (const role of guestUser.roles) {
            for (const p of role.permissions) perms.add(p.toString());
        }
        return perms;
    }, [guestUser, user?.discordId]);

    const isGuestProfile = user?.discordId === "anonymous";

    useEffect(() => {
        setPermissions(new Set(user?.permissions.map((p) => p.toString()) ?? []));
    }, [user]);

    return (
        <Modal isOpen={!!user} size="2xl" scrollBehavior="inside" placement="top-center" onOpenChange={onOpenChange}>
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            {isGuestProfile ? "Edit Guest Profile" : `Edit ${user?.displayname}`}
                        </ModalHeader>
                        <ModalBody>
                            {isGuestProfile && (
                                <p className="text-sm text-default-500">
                                    These permissions are granted as a default to all authenticated users, on top of their individual and role-based permissions.
                                </p>
                            )}
                            <PermissionCheckboxes
                                selectedPermissions={permissions}
                                roleGrantedPermissions={roleGrantedPermissions}
                                guestProfilePermissions={guestProfilePermissions}
                                onChange={setPermissions}
                            />
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

type EditUserModalProps = Omit<BaseElementProps, "children"> & {
    user?: User;
    guestUser?: User;
    onOpenChange: (isOpen?: boolean) => void;
    onSave?: (user: User) => void;
};
