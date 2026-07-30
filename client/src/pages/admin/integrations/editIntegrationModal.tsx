import {
    addToast,
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch
} from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { useCreateIntegrationMutation, useUpdateIntegrationMutation } from "../../../api";
import { useCallback, useEffect, useState } from "react";
import { SafeIntegration } from "common/models/auth";
import PermissionCheckboxes from "../../../components/permissionCheckboxes";
import UserSelect from "../../../components/data/userSelect";

export default function EditIntegrationModal({ isOpen, integration, onOpenChange, onCreated }: IntegrationModalProps) {
    const [createIntegration, { isLoading: isCreating }] = useCreateIntegrationMutation();
    const [updateIntegration, { isLoading: isUpdating }] = useUpdateIntegrationMutation();
    const [name, setName] = useState("");
    const [enabled, setEnabled] = useState(true);
    const [ownerIds, setOwnerIds] = useState<string[]>([]);
    const [permissions, setPermissions] = useState(new Set<string>([]));

    useEffect(() => {
        if (isOpen) {
            setName(integration?.name ?? "");
            setEnabled(integration?.enabled ?? true);
            setOwnerIds(integration?.ownerIds ?? []);
            setPermissions(new Set(integration?.permissions.map((p) => p.toString()) ?? []));
        }
    }, [integration, isOpen]);

    const onSave = useCallback(async () => {
        const validPermissions = new Set<string>(Object.values(Permission));
        const model = {
            name: name.trim(),
            enabled,
            ownerIds,
            permissions: [...permissions].filter((p) => validPermissions.has(p)).map((p) => p as Permission)
        };

        if (integration) {
            const response = await updateIntegration({ id: integration.id, ...model });
            if (response.error) {
                addToast({ title: "Error", color: "danger", description: "Failed to save integration" });
            } else {
                addToast({
                    title: "Integration saved",
                    color: "success",
                    description: `${model.name} was updated successfully.`
                });
                onOpenChange();
            }
        } else {
            const response = await createIntegration(model);
            if (response.error) {
                addToast({ title: "Error", color: "danger", description: "Failed to create integration" });
            } else {
                addToast({
                    title: "Integration created",
                    color: "success",
                    description: `${model.name} was created successfully.`
                });
                onOpenChange();
                onCreated(response.data.token, response.data.integration);
            }
        }
    }, [
        createIntegration,
        enabled,
        integration,
        name,
        onCreated,
        onOpenChange,
        ownerIds,
        permissions,
        updateIntegration
    ]);

    return (
        <Modal isOpen={isOpen} size="2xl" scrollBehavior="inside" placement="top-center" onOpenChange={onOpenChange}>
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>{integration ? `Edit ${integration.name}` : "Create Integration"}</ModalHeader>
                        <ModalBody>
                            <div className="flex gap-3 items-end">
                                <Input label="Name" isRequired value={name} onValueChange={setName} />
                                <Switch isSelected={enabled} onValueChange={setEnabled} className="pb-2">
                                    Enabled
                                </Switch>
                            </div>
                            <UserSelect label="Owners" selectedIds={ownerIds} onChange={setOwnerIds} />
                            <PermissionCheckboxes selectedPermissions={permissions} onChange={setPermissions} />
                        </ModalBody>
                        <ModalFooter>
                            <Button onPress={onClose}>Cancel</Button>
                            <Button
                                color="primary"
                                isDisabled={!name.trim()}
                                isLoading={isCreating || isUpdating}
                                onPress={onSave}
                            >
                                {integration ? "Save" : "Create"}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

type IntegrationModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    integration?: SafeIntegration;
    onOpenChange: (isOpen?: boolean) => void;
    onCreated: (token: string, integration: SafeIntegration) => void;
};
