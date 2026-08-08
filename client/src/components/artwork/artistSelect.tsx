import { useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Button, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { IArtist } from "common/models/artwork";
import Permission from "common/models/permissions";
import { fuzzyMatch } from "common/utils";
import { useGetArtistsQuery } from "../../api";
import { usePermission } from "../../hooks/usePermission";
import { TouchTooltip } from "../touchTooltip";
import EditArtistModal from "./editArtistModal";

// A labelled HeroUI field is taller than a button of the same size name, so the square is sized to the
// field rather than to the button scale - anything else leaves it floating short of the input's foot
const FIELD_HEIGHT_CLASSES: Record<NonNullable<ArtistSelectProps["size"]>, string> = {
    sm: "h-12 w-12",
    md: "h-14 w-14",
    lg: "h-16 w-16"
};

/**
 * Picks from the shared artist list, with add & edit alongside so a missing artist never sends anyone
 * off to another page mid-form. The affordance hides without permission to change the list.
 */
export default function ArtistSelect({
    label = "Artist",
    size = "md",
    selectedId,
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
        <div className="flex items-end gap-1">
            <Autocomplete
                label={label}
                size={size}
                className="flex-1 min-w-0"
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
            {canEdit && !isDisabled && (
                <TouchTooltip content={selected ? `Edit ${selected.name}` : "New artist"}>
                    <Button
                        isIconOnly
                        variant="flat"
                        className={classNames("shrink-0 min-w-0", FIELD_HEIGHT_CLASSES[size])}
                        aria-label={selected ? "Edit artist" : "New artist"}
                        onPress={() => setEditing(selected ?? "new")}
                    >
                        <FontAwesomeIcon icon={selected ? faPencil : faPlus} />
                    </Button>
                </TouchTooltip>
            )}
            <EditArtistModal
                isOpen={!!editing}
                artist={editing === "new" ? undefined : editing}
                onClose={() => setEditing(undefined)}
                onSaved={(artist) => onChange(artist.id)}
                onDeleted={() => onChange(undefined)}
            />
        </div>
    );
}

type EditingState = IArtist | "new";

type ArtistSelectProps = {
    label?: string;
    /** Matches the inputs it sits beside; "sm" for the packed sourced option rows */
    size?: "sm" | "md" | "lg";
    selectedId?: string;
    isDisabled?: boolean;
    onChange: (id?: string) => void;
};
