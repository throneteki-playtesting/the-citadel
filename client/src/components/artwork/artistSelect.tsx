import { useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Button, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { IArtist } from "common/models/artwork";
import { ISlotRef } from "common/models/slots";
import Permission from "common/models/permissions";
import { fuzzyMatch } from "common/utils";
import { useGetArtistsQuery } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { TouchTooltip } from "../touchTooltip";
import EditArtistModal from "./editArtistModal";

/**
 * Picks from the shared artist list, with add & edit alongside so a missing artist never sends anyone
 * off to another page mid-form. The affordance hides without permission to change the list.
 */
export default function ArtistSelect({
    label = "Artist",
    size = "md",
    name,
    selectedId,
    slot,
    isRequired,
    isDisabled,
    onChange
}: ArtistSelectProps) {
    const canRead = usePermission(Permission.READ_ARTISTS);
    const canEdit = usePermission(Permission.EDIT_ARTISTS);
    const { data, isLoading } = useGetArtistsQuery(undefined, { skip: !canRead });
    const [input, setInput] = useState("");
    const [editing, setEditing] = useState<EditingState>();

    const artists = useMemo(() => data?.items ?? [], [data?.items]);
    const selected = useMemo(() => artists.find((artist) => artist.id === selectedId), [artists, selectedId]);

    const items = useMemo(() => {
        if (input.length === 0) {
            return artists;
        }
        return artists.filter((artist) => fuzzyMatch(input, artist.name, artist.contact ?? ""));
    }, [artists, input]);

    return (
        <>
            <Autocomplete
                label={label}
                size={size}
                name={name}
                isRequired={isRequired}
                description={canRead ? undefined : "You don't have permission to view the artist list"}
                isLoading={isLoading}
                isDisabled={isDisabled || !canRead}
                items={items}
                inputValue={selected && input.length === 0 ? selected.name : input}
                onInputChange={setInput}
                selectedKey={selectedId ?? null}
                onSelectionChange={(key) => {
                    setInput("");
                    onChange(key ? String(key) : undefined);
                }}
                // order-last puts it after Autocomplete's own trailing chevron, and keeps it pinned to the
                // field itself rather than the row bottom once a validation error grows below it
                endContent={
                    canEdit &&
                    !isDisabled && (
                        <span className="order-last">
                            <TouchTooltip content={selected ? `Edit ${selected.name}` : "New artist"}>
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="h-8 w-8 min-w-8"
                                    aria-label={selected ? "Edit artist" : "New artist"}
                                    onPress={() => setEditing(selected ?? "new")}
                                >
                                    <FontAwesomeIcon icon={selected ? faPencil : faPlus} />
                                </Button>
                            </TouchTooltip>
                        </span>
                    )
                }
            >
                {(artist) => (
                    <AutocompleteItem key={artist.id} textValue={artist.name}>
                        <div className="flex items-center justify-between gap-2">
                            <span>{artist.name}</span>
                            {artist.blanketPermission && (
                                <Chip size="sm" color="success" variant="flat">
                                    Blanket
                                </Chip>
                            )}
                        </div>
                    </AutocompleteItem>
                )}
            </Autocomplete>
            <EditArtistModal
                isOpen={!!editing}
                artist={editing === "new" ? undefined : editing}
                slot={slot}
                onClose={() => setEditing(undefined)}
                onSaved={(artist) => onChange(artist.id)}
                onDeleted={() => onChange(undefined)}
            />
        </>
    );
}

type EditingState = IArtist | "new";

type ArtistSelectProps = {
    label?: string;
    /** Matches the inputs it sits beside; "sm" for the packed sourced option rows */
    size?: "sm" | "md" | "lg";
    /** Its path in the artwork schema, so the form can attach its error to this field */
    name?: string;
    selectedId?: string;
    /** The card being edited, so removing an artist isn't blocked by the credit this field is about to drop */
    slot?: ISlotRef;
    /** Mirrors the schema, so the field answers for itself on blur rather than only on save */
    isRequired?: boolean;
    isDisabled?: boolean;
    onChange: (id?: string) => void;
};
