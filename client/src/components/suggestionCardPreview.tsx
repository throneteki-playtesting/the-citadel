import { ComponentProps, useMemo } from "react";
import { CardPreview } from "@agot/card-preview";
import { ICardSuggestion } from "common/models/cards";
import { renderCardSuggestion } from "common/utils";
import useUser from "../hooks/useUser";

export default function SuggestionCardPreview({ suggestion, ...rest }: SuggestionCardPreviewProps) {
    const submitterName = useUser(suggestion.createdBy).user?.displayname;
    const card = useMemo(() => renderCardSuggestion(suggestion, submitterName), [suggestion, submitterName]);
    return <CardPreview card={card} {...rest} />;
}

type SuggestionCardPreviewProps = Omit<ComponentProps<typeof CardPreview>, "card"> & {
    suggestion: ICardSuggestion;
};
