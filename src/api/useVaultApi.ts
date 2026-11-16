import { useMemo } from 'react'
import { useVault } from '../vault/VaultContext'
import { createVaultApi } from './vaultApi'

export function useVaultApi() {
  const { list, get, put, remove } = useVault()
  return useMemo(
    () => createVaultApi({ list, get, put, remove }),
    [list, get, put, remove],
  )
}
