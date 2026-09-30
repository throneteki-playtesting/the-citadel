import { useState } from "react";

// The card number a list tab's `?editing=` names, so a link can open straight into its editor
function editingFromParams(params: URLSearchParams) {
    const raw = Number(params.get("editing"));
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

// The card kept apart from whether its editor is on show, so leaving doesn't empty the page mid-slide
export function useEditingCard(searchParams: URLSearchParams) {
    const [editingNumber, setEditingNumber] = useState(() => editingFromParams(searchParams));
    const [isEditing, setIsEditing] = useState(() => editingNumber !== undefined);

    // A history entry's url names its own card, which needn't be the one last opened here
    const onPageChange = (page: number) => {
        const fromUrl = editingFromParams(new URLSearchParams(window.location.search));
        if (fromUrl !== undefined) {
            setEditingNumber(fromUrl);
        }
        setIsEditing(page === 2);
    };

    return { editingNumber, setEditingNumber, isEditing, setIsEditing, onPageChange };
}
