import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { useUpdateUserMutation } from "../../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { User } from "common/models/auth";
import { cloneDeep } from "lodash-es";
import PermissionCheckboxes from "../../../components/permissionCheckboxes";

export default function EditUserModal({ user, onOpenChange, onSave: onUserSave }: EditUserModalProps) {
    const [updateUser, { isLoading }] = useUpdateUserMutation();
    const [permissions, setPermissions] = useState(new Set<string>([]));

    const onSave = useCallback(async () => {
        if (user) {
            const model = cloneDeep(user);
            model.permissions = [...permissions].map((p) => p as Permission);

            // TODO: Consider (somehow) updating edited user who have sessions open?
            const response = await updateUser(model);
            if (response.error) {
                addToast({ title: "Error", color: "danger", description: "Failed to save user" });
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

    useEffect(() => {
        setPermissions(new Set(user?.permissions.map((p) => p.toString()) ?? []));
    }, [user]);

    return (
        <Modal isOpen={!!user} size="2xl" scrollBehavior="inside" placement="top-center" onOpenChange={onOpenChange}>
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>Edit {user?.displayname}</ModalHeader>
                        <ModalBody>
                            <PermissionCheckboxes selectedPermissions={permissions} roleGrantedPermissions={roleGrantedPermissions} onChange={setPermissions} />
                        </ModalBody>
                        <ModalFooter>
                            <Button color="danger" variant="flat" onPress={onClose}>
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
    onOpenChange: (isOpen?: boolean) => void;
    onSave?: (user: User) => void;
};
