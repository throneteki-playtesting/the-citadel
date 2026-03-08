import { faCloudArrowUp, faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { addToast, Alert, Button, Link, Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useSyncCardImagesMutation } from "../../api";
import { generateReleaseImageUrl } from "common/utils";
import { useEffect, useState } from "react";

const ImageStatus = ({ card }: ImageStatusProps) => {
    const [syncCardImage, { isLoading: isSyncing }] = useSyncCardImagesMutation();
    const [urlReachable, setUrlReachable] = useState<boolean>();
    const [isLoading, setIsLoading] = useState(true);

    const title = "Image URL";
    const imageUrl = !card || !card.release ? card?.imageUrl : generateReleaseImageUrl(card.release.short, card.release.number, card.name);

    useEffect(() => {
        // TODO: Move this to more generic function
        const checkIfImageExists = (url: string) => {
            return new Promise(() => {
                const img = new Image();
                img.onload = () => {
                    setUrlReachable(true);
                    setIsLoading(false);
                };
                img.onerror = () => {
                    setUrlReachable(false);
                    setIsLoading(false);
                };
                img.src = url;
            });
        };

        if (imageUrl) {
            checkIfImageExists(imageUrl);
        }
    }, [imageUrl]);

    if (!card) {
        return null;
    }

    if (!imageUrl) {
        const SyncButton = () => {
            const onPress = async () => {
                try {
                    await syncCardImage({ project: card.project, number: card.number, version: card.version }).unwrap();
                    addToast({ title: "Success", color: "success", description: "Successfully synced card image url" });
                } catch (err) {
                    addToast({ title: "Error", color: "danger", description: "Failed to sync card image url" });
                }
            };
            return (
                <Button variant="light" isIconOnly isLoading={isSyncing} onPress={onPress}>
                    <FontAwesomeIcon icon={faCloudArrowUp} className="text-xl"/>
                </Button>
            );
        };

        return (
            <Alert color="warning" title={title} endContent={<SyncButton />}>
                Not Synced
            </Alert>
        );
    }

    if (isLoading) {
        return (
            <Alert color="default" title={title} endContent={<Spinner />}>
                <div className="flex"><span>Checking...</span></div>
            </Alert>
        );
    }
    if (!urlReachable) {
        return (
            <Alert color="danger" title={title}>
                Not Found
            </Alert>
        );
    }

    const endContent = <Link href={imageUrl} target="_blank" className="text-xl"><FontAwesomeIcon icon={faExternalLink}/></Link>;
    return (
        <Alert color="success" title={title} endContent={endContent}>
            Synced
        </Alert>
    );
};

type ImageStatusProps = { card?: IPlaytestCard }

export default ImageStatus;