import { addToast, Button, DatePicker, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, NumberInput, Select, SelectItem } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useEffect, useState } from "react";
import { IProject, IProjectRelease } from "common/models/projects";
import { ReleaseDate } from "common/models/shared";
import { DeepPartial } from "common/types";
import { BaseElementProps } from "../../../types";
import { useCreateReleaseMutation, useUpdateReleaseMutation } from "../../../api";
import { merge } from "lodash-es";
import Form from "../../../components/form";
import { Release } from "common/models/schemas";

const releaseStatuses: { status: IProjectRelease["status"], description: string }[] = [
    { status: "planning", description: "Cards are still being chosen for this release" },
    { status: "confirming", description: "Final card text & details are being polished" },
    { status: "approved", description: "Contents are locked in and ready for release" }
];
const DefaultRelease: DeepPartial<IProjectRelease> = { status: "planning" };

export default function EditReleaseModal({ isOpen, project, release: initial, onClose: onModalClose, onSave }: EditReleaseModalProps) {
    const [createRelease, { isLoading: isCreating }] = useCreateReleaseMutation();
    const [updateRelease, { isLoading: isUpdating }] = useUpdateReleaseMutation();
    const [release, setRelease] = useState<DeepPartial<IProjectRelease>>(DefaultRelease);

    useEffect(() => {
        setRelease(merge(DefaultRelease, {
            code: initial?.code,
            name: initial?.name,
            capacity: initial?.capacity,
            status: initial?.status,
            plannedDate: initial?.plannedDate,
            article: initial?.article
        }));
    }, [initial, project]);

    const isNew = !initial?.code;

    const onSubmit = async (release: IProjectRelease) => {
        try {
            const body = {
                project: project.number,
                ...release
            };
            const result = isNew ? await createRelease(body).unwrap() : await updateRelease(body).unwrap();
            onSave?.(result);
            onModalClose?.(true);
        } catch {
            addToast({ title: "Failed to save", color: "danger", description: "An unknown error has occurred" });
        }
    };

    return (
        <Modal isOpen={isOpen} placement="center" onOpenChange={(isOpen) => !isOpen && onModalClose?.(false)}>
            <ModalContent>
                {(onClose) => (
                    <Form
                        schema={Release.Draft}
                        onSubmit={onSubmit}
                        data={release}
                    >
                        <ModalHeader>{isNew ? "New Release" : "Edit Release"}</ModalHeader>
                        <ModalBody className="flex flex-col gap-3">
                            <Input
                                name="name"
                                label="Name"
                                value={release.name ?? ""}
                                onValueChange={(name) => setRelease((prev) => ({ ...prev, name }))}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    name="code"
                                    label="Code"
                                    description="Short pack code, eg. WoW"
                                    value={release.code ?? ""}
                                    isDisabled={!isNew}
                                    onValueChange={(code) => setRelease((prev) => ({ ...prev, code }))}
                                />
                                <NumberInput
                                    name="capacity"
                                    label="Capacity"
                                    description="Number of cards in this pack"
                                    minValue={1}
                                    value={release.capacity}
                                    onValueChange={(capacity) => setRelease((prev) => ({ ...prev, capacity }))}
                                />
                            </div>
                            <Select
                                name="status"
                                label="Status"
                                selectedKeys={release.status ? [release.status] : []}
                                renderValue={(items) => items.map(({ key }) => <div className="capitalize" key={key}>{key}</div>)}
                                onSelectionChange={(keys) => setRelease((prev) => ({ ...prev, status: [...keys][0] as IProjectRelease["status"] }))}
                            >
                                {releaseStatuses.map(({ status, description }) => (
                                    <SelectItem key={status} classNames={{ title: "capitalize" }} description={description}>{status}</SelectItem>
                                ))}
                            </Select>
                            <DatePicker
                                name="plannedDate"
                                label="Planned Release Date"
                                value={release.plannedDate ? parseDate(release.plannedDate) : null}
                                onChange={(date) => setRelease((prev) => ({ ...prev, plannedDate: date ? date.toString() as ReleaseDate : undefined }))}
                            />
                        </ModalBody>
                        <ModalFooter className="w-full">
                            <Button onPress={onClose}>Cancel</Button>
                            <Button type="submit" color="primary" isLoading={isCreating || isUpdating}>Save</Button>
                        </ModalFooter>
                    </Form>
                )}
            </ModalContent>
        </Modal>
    );
};

type EditReleaseModalProps = Omit<BaseElementProps, "children"> & {
    isOpen: boolean;
    project: IProject;
    release?: DeepPartial<IProjectRelease>;
    onClose?: (isSaving: boolean) => void;
    onSave?: (result: unknown) => void;
}
