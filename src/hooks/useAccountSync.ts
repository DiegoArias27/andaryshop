import { useContext } from 'react'
import { AccountSyncContext } from '../context/account-sync-context'

export function useAccountSync() {
  return useContext(AccountSyncContext)
}
