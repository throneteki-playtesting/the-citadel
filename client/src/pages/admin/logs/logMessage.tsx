import { Fragment } from "react";
import { ILogEntry, LOG_PLACEHOLDER_REGEX } from "common/models/logs";
import {
    AnonymousChip,
    CardChip,
    GenericEntityChip,
    IntegrationChip,
    ProjectChip,
    RoleChip,
    SuggestionChip,
    SystemChip,
    UserChip
} from "./chips";

// Substitutes each `<type:{{key}}>` placeholder in `message` with its rendered entity chip.
export default function LogMessage({ entry }: { entry: ILogEntry }) {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    LOG_PLACEHOLDER_REGEX.lastIndex = 0;
    while ((match = LOG_PLACEHOLDER_REGEX.exec(entry.message)) !== null) {
        const [full, type, key] = match;
        const value = entry.context[key];

        if (match.index > lastIndex) {
            parts.push(<Fragment key={`text-${lastIndex}`}>{entry.message.slice(lastIndex, match.index)}</Fragment>);
        }

        if (value === undefined) {
            parts.push(<Fragment key={`missing-${match.index}`}>{full}</Fragment>);
        } else {
            parts.push(<EntityChip key={`${type}-${key}-${match.index}`} type={type} value={value} />);
        }

        lastIndex = match.index + full.length;
    }

    if (lastIndex < entry.message.length) {
        parts.push(<Fragment key={`text-${lastIndex}`}>{entry.message.slice(lastIndex)}</Fragment>);
    }

    return <span className="leading-6">{parts}</span>;
}

function EntityChip({ type, value }: { type: string; value: unknown }) {
    switch (type) {
        case "user":
            return <UserChip value={value} />;
        case "role":
            return <RoleChip value={value} />;
        case "card":
            return <CardChip value={value} />;
        case "project":
            return <ProjectChip value={value} />;
        case "suggestion":
            return <SuggestionChip value={value} />;
        case "integration":
            return <IntegrationChip value={value} />;
        case "anonymous":
            return <AnonymousChip />;
        case "system":
            return <SystemChip />;
        default:
            return <GenericEntityChip type={type} value={value} />;
    }
}
