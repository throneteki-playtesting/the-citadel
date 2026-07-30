import {
    addToast,
    Alert,
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Snippet
} from "@heroui/react";
import { BaseElementProps } from "../../../types";
import Permission from "common/models/permissions";
import { useRecycleIntegrationTokenMutation } from "../../../api";
import { useEffect, useState } from "react";
import { SafeIntegration } from "common/models/auth";
import { usePermission } from "../../../hooks/usePermission";
import { useAuth } from "../../../hooks/useAuth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";

const SERVER_HOST = import.meta.env.VITE_SERVER_HOST || window.location.origin;

export default function TokenModal({ integration, initialToken, onClose }: TokenModalProps) {
    const [recycleIntegrationToken, { isLoading }] = useRecycleIntegrationTokenMutation();
    const [token, setToken] = useState(initialToken);
    const { user } = useAuth();
    const canRefreshAll = usePermission(Permission.REFRESH_INTEGRATION_TOKENS);
    const canRefresh = canRefreshAll || (!!user && (integration?.ownerIds?.includes(user.id) ?? false));

    useEffect(() => {
        setToken(initialToken);
    }, [initialToken, integration]);

    const onRefresh = async () => {
        if (integration) {
            const response = await recycleIntegrationToken({ id: integration.id });
            if (response.error) {
                addToast({ title: "Error", color: "danger", description: "Failed to refresh integration token" });
            } else {
                setToken(response.data.token);
            }
        }
    };

    return (
        <Modal
            isOpen={!!integration}
            size="xl"
            placement="top-center"
            isDismissable={!token}
            isKeyboardDismissDisabled={!!token}
            hideCloseButton={!!token}
            onOpenChange={(isOpen) => !isOpen && onClose()}
        >
            <ModalContent>
                <ModalHeader>API token for {integration?.name}</ModalHeader>
                <ModalBody>
                    {token ? (
                        <Alert color="warning" title="Copy this token now" description="It will not be shown again." />
                    ) : (
                        <Alert
                            title="This token is hidden"
                            description="Refresh it to get a new one; the current token will stop working immediately."
                        />
                    )}
                    <Snippet
                        symbol=""
                        radius="sm"
                        hideCopyButton={!token}
                        classNames={{ base: "max-w-full", pre: "whitespace-pre-wrap break-all font-bold" }}
                    >
                        {token ?? `${integration?.id}.${"•".repeat(32)}`}
                    </Snippet>
                    <div className="space-y-2 text-sm text-default-500">
                        <div className="font-semibold text-default-600">How to use it</div>
                        <ol className="list-decimal list-inside space-y-2">
                            <li>Store the token somewhere safe.</li>
                            <li>
                                Add it to the <code>Authorization</code> header of every request:
                                <Snippet
                                    size="sm"
                                    symbol=""
                                    radius="sm"
                                    hideCopyButton
                                    className="mt-1 w-full"
                                    classNames={{ pre: "whitespace-pre-wrap break-all" }}
                                >
                                    {"Authorization: Bearer <token>"}
                                </Snippet>
                            </li>
                            <li>
                                Send requests to <code>{`${SERVER_HOST}/api/v1/...`}</code> — access is limited to the
                                permissions assigned to this integration.
                            </li>
                        </ol>
                    </div>
                </ModalBody>
                <ModalFooter>
                    {canRefresh && (
                        <Button
                            color="danger"
                            variant="flat"
                            isLoading={isLoading}
                            startContent={!isLoading && <FontAwesomeIcon icon={faArrowsRotate} />}
                            onPress={onRefresh}
                        >
                            Refresh Token
                        </Button>
                    )}
                    <Button onPress={onClose}>Close</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

type TokenModalProps = Omit<BaseElementProps, "children"> & {
    integration?: SafeIntegration;
    initialToken?: string;
    onClose: () => void;
};
