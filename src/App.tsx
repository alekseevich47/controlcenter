import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/ToastProvider'
import { UnlockScreen } from './components/UnlockScreen'
import { useSuppressNativeContextMenu } from './hooks/useAppChrome'
import { AppSearchProvider } from './hooks/useAppSearch'
import { AppLayout } from './layout/AppLayout'
import { ClientsPage } from './pages/ClientsPage'
import { DocsPage } from './pages/DocsPage'
import { DomainsPage } from './pages/DomainsPage'
import { FinancePage } from './pages/FinancePage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SecretsPage } from './pages/SecretsPage'
import { SeoPage } from './pages/SeoPage'
import { ServersPage } from './pages/ServersPage'
import { SettingsPage } from './pages/SettingsPage'
import { UpdatesPage } from './pages/UpdatesPage'
import { LocalApiHost } from './api/LocalApiHost'
import { VaultProvider, useVault } from './vault/VaultContext'
import { isTauri } from './vault/runtime'

function Router({ children }: { children: React.ReactNode }) {
  // HashRouter avoids path issues inside Tauri asset protocol
  const R = isTauri() ? HashRouter : BrowserRouter
  return <R>{children}</R>
}

function Gate() {
  const { status } = useVault()
  useSuppressNativeContextMenu()

  if (status !== 'unlocked') return <UnlockScreen />

  return (
    <>
    <LocalApiHost />
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="servers" element={<ServersPage />} />
        <Route path="domains" element={<DomainsPage />} />
        <Route path="seo" element={<SeoPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="secrets" element={<SecretsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="updates" element={<UpdatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <VaultProvider>
      <ToastProvider>
        <AppSearchProvider>
          <Router>
            <Gate />
          </Router>
        </AppSearchProvider>
      </ToastProvider>
    </VaultProvider>
  )
}
