import { Checkbox, DatePicker, Input, Textarea } from "@heroui/react";
import { CalendarDate, parseDate } from "@internationalized/date";
import { ICommissionedArtwork } from "common/models/artwork";
import { ISlotRef } from "common/models/slots";
import ArtworkReveal from "../../../components/artwork/artworkReveal";
import ExternalLinkButton from "../../../components/artwork/externalLinkButton";
import ArtistSelect from "../../../components/artwork/artistSelect";
import CostInput from "../../../components/artwork/costInput";

const EMPTY: ICommissionedArtwork = {};

export default function CommissionedPanel({
    commissioned = EMPTY,
    slot,
    isDisabled,
    onChange
}: CommissionedPanelProps) {
    const set = <K extends keyof ICommissionedArtwork>(key: K, value: ICommissionedArtwork[K]) =>
        onChange({ ...commissioned, [key]: value });

    return (
        <ArtworkReveal url={commissioned.url} alt="Commissioned artwork">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ArtistSelect
                    selectedId={commissioned.artist}
                    slot={slot}
                    isDisabled={isDisabled}
                    onChange={(id) => set("artist", id)}
                />
                <DatePicker
                    label="Estimated completion"
                    showMonthAndYearPickers
                    isDisabled={isDisabled}
                    value={toCalendarDate(commissioned.estimatedCompletion)}
                    onChange={(value) => set("estimatedCompletion", value ? value.toDate("UTC") : undefined)}
                />
                <div className="md:col-span-2 flex flex-col sm:flex-row gap-3">
                    <Input
                        label="Paid by"
                        placeholder="GOT funded"
                        className="flex-1 min-w-0"
                        isDisabled={isDisabled}
                        value={commissioned.paidBy ?? ""}
                        onValueChange={(value) => set("paidBy", value)}
                    />
                    <CostInput
                        value={commissioned.cost}
                        className="w-full sm:flex-1 sm:w-auto sm:min-w-44 sm:max-w-64"
                        isDisabled={isDisabled}
                        onChange={(cost) => set("cost", cost)}
                    />
                    <Checkbox
                        className="shrink-0 self-start sm:self-center"
                        isSelected={!!commissioned.paid}
                        isDisabled={isDisabled}
                        onValueChange={(value) => set("paid", value)}
                    >
                        <span className="text-sm whitespace-nowrap">Paid</span>
                    </Checkbox>
                </div>
                <Input
                    label="Artwork link"
                    className="md:col-span-2"
                    placeholder="The finished piece, once it has been delivered"
                    name="commissioned.url"
                    isDisabled={isDisabled}
                    value={commissioned.url ?? ""}
                    onValueChange={(value) => set("url", value || undefined)}
                    endContent={<ExternalLinkButton url={commissioned.url} label="Open artwork in a new tab" />}
                />
                <Textarea
                    label="Notes"
                    className="md:col-span-2"
                    minRows={2}
                    isDisabled={isDisabled}
                    value={commissioned.notes ?? ""}
                    onValueChange={(value) => set("notes", value)}
                />
            </div>
        </ArtworkReveal>
    );
}

// Dates arrive from the API as strings, and the picker wants a calendar date rather than an instant
function toCalendarDate(value?: Date | string): CalendarDate | null {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
        return null;
    }
    return parseDate(date.toISOString().slice(0, 10));
}

type CommissionedPanelProps = {
    commissioned?: ICommissionedArtwork;
    /** The card being edited, forwarded to ArtistSelect */
    slot?: ISlotRef;
    isDisabled?: boolean;
    onChange: (commissioned: ICommissionedArtwork) => void;
};
