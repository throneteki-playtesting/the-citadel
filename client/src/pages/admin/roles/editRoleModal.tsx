import { addToast, Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { availablePermissions } from "../../../constants";
import { useUpdateRoleMutation } from "../../../api";
import { useCallback, useEffect, useState } from "react";
import { cloneDeep } from "lodash-es";
import { Role } from "common/models/auth";

const EditRoleModal = ({ role, onOpenChange, onSave: onRoleSave }: EditRoleModalProps) => {
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
                if (onRoleSave) {
                    onRoleSave(model);
                }
                onOpenChange();
            }
        }
    }, [onOpenChange, onRoleSave, permissions, role, updateRole]);

    // Update editable fields when role is being edited
    useEffect(() => {
        setPermissions(new Set(role?.permissions.map((p) => p.toString()) ?? []));
    }, [role]);

    return <Modal isOpen={!!role} placement="top-center" onOpenChange={onOpenChange}>
        <ModalContent>
            {(onClose) => (
                <>
                    <ModalHeader>Edit {role?.name}</ModalHeader>
                    <ModalBody className="spacing-x-2">
                        <p>Changing permissions will refresh the permissions for each user with this role.</p>
                        <Select
                            classNames={{
                                trigger: "min-h-12 py-2"
                            }}
                            label="Permissions"
                            placeholder="Select permission(s)"
                            isMultiline={true}
                            selectionMode="multiple"
                            items={availablePermissions}
                            selectedKeys={permissions}
                            onSelectionChange={(keys) => setPermissions(new Set([...keys] as string[]))}
                            labelPlacement="outside"
                            renderValue={(items) => (
                                <div className="flex flex-wrap gap-1">
                                    {items.map((item) => (
                                        <Chip key={item.data?.key}>{item.data?.value}</Chip>
                                    ))}
                                </div>
                            )}
                        >
                            {(permission) => <SelectItem key={permission.key} className="capitalize">{permission.value}</SelectItem>}
                        </Select>
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
    </Modal>;
};
type EditRoleModalProps = Omit<BaseElementProps, "children"> & { role?: Role, onOpenChange: ((isOpen?: boolean) => void), onSave?: (role: Role) => void }

export default EditRoleModal;