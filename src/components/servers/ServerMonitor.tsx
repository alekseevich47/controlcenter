import { useEffect, useMemo, useState } from 'react'
import { sshAvailable, sshMetrics, sshServices, type RemoteService, type SshMaterialAuth } from '../../ssh/desktop'
import { sshHost, sshSecretId } from '../../ssh/target'
import type { Server } from '../../vault/types'
import { useVault } from '../../vault/VaultContext'
import { failureMessage } from './serverUi'

export type MetricSample = { t: number; cpu: number; ram: number; disk: number; rx: number; tx: number }

const RANGES = [
  { id: '1h', label: '1ч', ms: 60 * 60 * 1000 },
  { id: '6h', label: '6ч', ms: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '24ч', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7д', ms: 7 * 24 * 60 * 60 * 1000 },
] as const

function line(samples: MetricSample[], pick: (sample: MetricSample) => number): string {
  if (samples.length < 2) return ''
  return samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * 100
      const y = 28 - Math.max(0, Math.min(1, pick(sample))) * 26
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function ServerMonitor({ server }: { server: Server }) {
  const { readSshMaterial, readMetricSamples, writeMetricSamples } = useVault()
  const [samples, setSamples] = useState<MetricSample[]>([])
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1h')
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<RemoteService[]>([])

  useEffect(() => {
    let stop = false
    void readMetricSamples(server.id).then((stored) => {
      if (!stop) setSamples(stored)
    })
    return () => {
      stop = true
    }
  }, [readMetricSamples, server.id])

  useEffect(() => {
    if (!sshAvailable() || !server.ssh?.hostFingerprint || !sshHost(server)) return
    let stop = false
    let timer = 0
    async function auth(): Promise<SshMaterialAuth | null> {
      const profile = server.ssh
      const host = sshHost(server)
      if (!profile?.hostFingerprint || !host) return null
      const secret = await readSshMaterial(profile.secretId || sshSecretId(server.id))
      if (!secret) return null
      return {
        host,
        port: profile.port,
        user: profile.user,
        auth: secret.auth,
        material: secret.material,
        fingerprint: profile.hostFingerprint,
      }
    }
    async function tick() {
      const ready = await auth()
      if (!ready || stop) return
      try {
        const reading = await sshMetrics(ready)
        const sample: MetricSample = {
          t: Date.now(),
          cpu: reading.cpu,
          ram: reading.ram,
          disk: reading.disk,
          rx: reading.rx_bytes,
          tx: reading.tx_bytes,
        }
        setSamples((prev) => {
          const next = [...prev, sample].slice(-20_160)
          void writeMetricSamples(server.id, next)
          return next
        })
        setServices(await sshServices(ready))
        setError(null)
      } catch (reason) {
        if (!stop) setError(failureMessage(reason))
      }
    }
    void tick()
    timer = window.setInterval(() => void tick(), 30_000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [readSshMaterial, server, writeMetricSamples])

  const windowMs = RANGES.find((item) => item.id === range)?.ms ?? RANGES[0].ms
  const visible = useMemo(() => samples.filter((sample) => sample.t >= Date.now() - windowMs), [samples, windowMs])
  const latest = samples[samples.length - 1]

  return (
    <section className="card servers-section">
      <div className="servers-head-actions">
        <h2 className="servers-section-title">Мониторинг</h2>
        <div className="servers-head-actions">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn-ghost${range === item.id ? ' is-on' : ''}`}
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!latest ? (
        <p className="servers-note">Процентов CPU, памяти и диска пока нет. Они появятся после SSH.</p>
      ) : (
        <div className="servers-meters">
          <Meter label="CPU" value={latest.cpu} />
          <Meter label="RAM" value={latest.ram} />
          <Meter label="Диск" value={latest.disk} />
        </div>
      )}
      {visible.length >= 2 ? (
        <svg className="servers-chart" viewBox="0 0 100 32" role="img" aria-label="График нагрузки">
          <polyline points={line(visible, (sample) => sample.cpu)} className="servers-chart-cpu" />
          <polyline points={line(visible, (sample) => sample.ram)} className="servers-chart-ram" />
          <polyline points={line(visible, (sample) => sample.disk)} className="servers-chart-disk" />
        </svg>
      ) : null}
      {error ? <p className="servers-field-error">{error}</p> : null}
      {services.length > 0 ? (
        <ul className="servers-file-list">
          {services.slice(0, 12).map((service) => (
            <li key={service.unit}>
              <span>{service.unit}</span>
              <span className="badge">{service.active}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div>
      <small>{label}</small>
      <strong>{pct}%</strong>
    </div>
  )
}
