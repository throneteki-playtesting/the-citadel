// A handful of legacy links were saved from ThronesDB's deck edit page rather than its view page -
// they're the same deck, just the wrong path, and the app only ever expects /deck/view/.
export function normalizeDeckLink(link: string): string {
    return link.replace("/deck/edit/", "/deck/view/");
}
