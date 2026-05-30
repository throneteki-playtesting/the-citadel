import { addToast, Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { availablePermissions } from "../../../constants";
import { useUpdateUserMutation } from "../../../api";
import { useCallback, useEffect, useState } from "react";
import { User } from "common/models/auth";
import { cloneDeep } from "lodash-es";

const EditUserModal = ({ user, onOpenChange, onSave: onUserSave }: EditUserModalProps) => {
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
                if (onUserSave) {
                    onUserSave(model);
                }
                onOpenChange();
            }
        }
    }, [onOpenChange, onUserSave, permissions, updateUser, user]);

    // Update editable fields when user is being edited
    useEffect(() => {
        setPermissions(new Set(user?.permissions.map((p) => p.toString()) ?? []));
    }, [user]);

    return <Modal isOpen={!!user} placement="top-center" onOpenChange={onOpenChange}>
        <ModalContent>
            {(onClose) => (
                <>
                    <ModalHeader>Edit {user?.displayname}</ModalHeader>
                    <ModalBody>
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
type EditUserModalProps = Omit<BaseElementProps, "children"> & { user?: User, onOpenChange: ((isOpen?: boolean) => void), onSave?: (user: User) => void }

export default EditUserModal;