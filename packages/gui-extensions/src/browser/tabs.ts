import type { Browser } from "@opencode/plugin-browser/rpc"

/**
 * The tab that already shows `url`, so an open focuses it instead of adding a duplicate. A tab whose load failed is
 * not a match: a retry has to navigate again rather than focus the failure that is still reporting that address.
 */
export const openTab = (tabs: ReadonlyArray<Browser.Tab>, url: string) =>
  tabs.find((tab) => tab.url === url && !tab.loadError)
