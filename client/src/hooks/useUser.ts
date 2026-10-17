import { useGetUserQuery } from "../api";

// The user behind an id a record stores (createdBy, updatedBy, reviewer, approvedBy, ...) - an absent id
// skips the lookup rather than asking for "", so optional ids need no guarding at the call site
export default function useUser(discordId?: string) {
    const { data: user, isLoading } = useGetUserQuery({ discordId: discordId ?? "" }, { skip: !discordId });
    return { user, isLoading };
}
