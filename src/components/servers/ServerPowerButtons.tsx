import { useState } from 'react'
import { getSpacewebClient } from '../../hosting/runtime'
import type { SpacewebPowerAction } from '../../hosting/spaceweb'
import type { Server } from '../../vault/types'
import { ConfirmDialog } from '../ConfirmDialog'
import { useToast } from '../ToastProvider'
import { failureMessage } from './serverUi'

const COPY: Record<SpacewebPowerAction, { title: string; message: string; confirm: string }> = {
  reboot: {
    title: 'Перезагрузить VPS?',
    message: 'Команда уйдёт в Spaceweb и перезагрузит этот VPS.',
    confirm: 'Перезагрузить',
  },
  off: {
    title: 'Выключить VPS?',
    message: 'Команда уйдёт в Spaceweb и выключит этот VPS.',
    confirm: 'Выключить',
  },
  on: {
    title: 'Включить VPS?',
    message: 'Команда уйдёт в Spaceweb и включит этот VPS.',
    confirm: 'Включить',
  },
}

interface ServerPowerButtonsProps {
  server: Server
  onRefresh: () => void
}

export function ServerPowerButtons({ server, onRefresh }: ServerPowerButtonsProps) {
  const { notify } = useToast()
  const [pending, setPending] = useState<SpacewebPowerAction | null>(null)
  const [inflight, setInflight] = useState(false)

  if (server.provider?.kind !== 'spaceweb') return null

  const billingId = server.provider.billingId
  const running = server.hostSnapshot?.isRunning
  const currentAction = server.hostSnapshot?.currentAction?.trim() ?? ''
  const blocked = inflight || currentAction.length > 0
  const copy = pending ? COPY[pending] : null
  const blockedTitle = inflight ? 'Команда отправляется' : currentAction ? 'Сейчас выполняется операция' : undefined

  async function confirm() {
    if (!pending || inflight) return
    const action = pending
    setInflight(true)
    try {
      const client = await getSpacewebClient()
      if (!client) throw new Error('Кабинет Spaceweb не подключён')
      const ok = await client.power(billingId, action)
      if (!ok) throw new Error('Spaceweb не подтвердил команду')
      notify({ message: 'Команда отправлена', tone: 'success' })
      onRefresh()
      setPending(null)
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
      setPending(null)
    } finally {
      setInflight(false)
    }
  }

  return (
    <div className="servers-power">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={blocked}
        title={blockedTitle}
        onClick={() => setPending('reboot')}
      >
        Перезагрузить
      </button>
      {running === false ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={blocked}
          title={blockedTitle}
          onClick={() => setPending('on')}
        >
          Включить
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={blocked}
          title={blockedTitle}
          onClick={() => setPending('off')}
        >
          Выключить
        </button>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={copy?.title ?? ''}
        message={copy?.message ?? ''}
        confirmLabel={copy?.confirm ?? 'Подтвердить'}
        danger={pending === 'off'}
        busy={inflight}
        onCancel={() => {
          if (inflight) return
          setPending(null)
        }}
        onConfirm={() => void confirm()}
      />
    </div>
  )
}
