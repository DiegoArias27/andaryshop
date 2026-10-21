import { createContext } from 'react'

export interface AccountSyncContextValue {
  /** True only while a logged-in customer's cart/favorites/size/quotes are
   * still being fetched from the server for the first time this session —
   * always false for guests. UI that lets the customer set state which that
   * fetch could otherwise overwrite (e.g. the size-preference modal) should
   * wait for this to go false before rendering. */
  syncing: boolean
}

export const AccountSyncContext = createContext<AccountSyncContextValue>({ syncing: false })
