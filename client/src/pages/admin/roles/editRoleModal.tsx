import { addToast, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { useUpdateRoleMutation } from "../../../api";
import { useCallback, useEffect, useState } from "react";
import { cloneDeep } from "lodash-es";
import { Role } from "common/models/auth";
import PermissionCheckboxes from "../../../components/permissionCheckboxes";

export default function EditRoleModal({ role, onOpenChange, onSave: onRoleSave }: EditRoleModalProps) {
    const [updateRole, { isLoading }] = useUpdateRoleMutation();
    const [permissions, setPermissions] = useState(new Set<string>([]));

    const onSave = useCallback(async () => {
        if (role) {
            const model = cloneDeep(role);
            model.permissions = [...permissions].map((p) => p as Permission);

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
                            <PermissionCheckboxes selectedPermissions={permissions} onChange={setPermissions} />
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

type EditRoleModalProps = Omit<BaseElementProps, "children"> & {
    role?: Role;
    onOpenChange: (isOpen?: boolean) => void;
    onSave?: (role: Role) => void;
};
