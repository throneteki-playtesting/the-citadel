import { store } from "./store";
import api from ".";
import { SyncCompleteEvent, SyncEvent, SyncType } from "server/types";

type SyncHandlers = {
    [K in SyncType]?: (event: SyncCompleteEvent<K>) => void;
};

const syncCompleteHandlers: SyncHandlers = {
    card: (event) => {
        const [project, number, version] = event.id.split("|");
        const cardId = { project: Number(project), number: Number(number), version };

        const state = store.getState();
        const cachedArgs = api.util.selectCachedArgsForQuery(state, "getCards");

        cachedArgs.forEach((args) => {
            store.dispatch(
                api.util.updateQueryData("getCards", args, (draft) => {
                    const index = draft.items.findIndex(c =>
                        c.project === cardId.project &&
                        c.number === cardId.number &&
                        c.version === cardId.version
                    );
                    if (index !== -1) {
                        draft.items[index] = event.data;
                    }
                })
            );
        });
    }//,
    // playtestingUpdate: (event) => {
    //     // future handler
    // }
};
export function initSSEListener() {
    const es = new EventSource("/api/v1/broadcast", { withCredentials: true });

    es.addEventListener("message", (e) => {
        const event = JSON.parse(e.data) as SyncEvent;

        if (event.status === "complete") {
            handleComplete(event);
        }
    });

    es.onerror = () => {
        es.close();
    };
}
function handleComplete<K extends SyncType>(event: SyncCompleteEvent<K>) {
    const handler = syncCompleteHandlers[event.type] as ((event: SyncCompleteEvent<K>) => void) | undefined;
    handler?.(event);
}