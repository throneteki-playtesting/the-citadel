import { useMemo } from "react";

export default function useTimezone() {
    const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    const format = (date: Date, options?: Intl.DateTimeFormatOptions) => {
        return new Date(date).toLocaleString(navigator.language, {
            timeZone: timezone,
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            ...options
        });
    };

    return { timezone, format };
};