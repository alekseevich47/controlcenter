import type {
  Campaign,
  Client,
  Doc,
  Domain,
  FinanceEntry,
  Project,
  SecretRef,
  Server,
  VaultEvent,
} from './types'

function stamp(id: string) {
  const now = new Date().toISOString()
  return { id, createdAt: now, updatedAt: now }
}

export function seedProjects(): Project[] {
  return [
    {
      ...stamp('tennis42'),
      name: 'Tennis 42',
      status: 'Продакшн',
      statusKind: 'green',
      stack: 'React · PocketBase · Nginx',
      client: 'Миленьких',
      clientId: 'milenkih',
      domain: 'app.milenkih-team.ru',
      note: 'Прод MAX Mini App, watchdog + алерты',
      pinned: true,
    },
    {
      ...stamp('loomixx-site'),
      name: 'Loomixx.ru',
      status: 'Разработка',
      statusKind: 'blue',
      stack: 'Vite · React',
      client: 'Внутренний · Loomixx',
      clientId: 'internal',
      domain: 'loomixx.ru',
      note: 'Сайт студии и витрина услуг',
    },
    {
      ...stamp('tennis-demo'),
      name: 'Tennis Demo',
      status: 'Тестирование',
      statusKind: 'purple',
      stack: 'React · PocketBase',
      client: 'Миленьких',
      clientId: 'milenkih',
      domain: 'demo…',
      note: 'Стенд для показов и тестов',
    },
    {
      ...stamp('beauty'),
      name: 'Beauty+',
      status: 'Планирование',
      statusKind: 'amber',
      stack: 'Nest · Postgres',
      client: '—',
      clientId: null,
      domain: 'beauty.loomixx.ru',
      note: 'Черновик архитектуры и VM-схема',
    },
    {
      ...stamp('lcc'),
      name: 'LCC',
      status: 'Разработка',
      statusKind: 'blue',
      stack: 'React · local-first · Tauri',
      client: 'Внутренний · Loomixx',
      clientId: 'internal',
      domain: 'local',
      note: 'Этот control center',
      pinned: true,
    },
  ]
}

export function seedClients(): Client[] {
  return [
    {
      ...stamp('milenkih'),
      name: 'Миленьких',
      contacts: {
        phone: [{ id: 'cc-m-phone', value: '+7-900-111-2233', label: 'Рабочий' }],
        telegram: [
          {
            id: 'cc-m-tg',
            value: '@milenkih_team',
            phone: '+7-900-111-2233',
            label: 'Рабочий',
          },
        ],
        max: [{ id: 'cc-m-max', value: '+7-900-111-2233', label: 'Рабочий' }],
        vk: [],
        whatsapp: [{ id: 'cc-m-wa', value: '+7-900-111-2233', label: 'Личный' }],
        email: [{ id: 'cc-m-mail', value: 'team@milenkih.ru', label: 'Рабочий' }],
      },
      projectIds: ['tennis42', 'tennis-demo'],
      projects: 'Tennis 42, Tennis Demo',
      note: 'Прод уже крутится, важны стабильность и бэкапы',
    },
    {
      ...stamp('internal'),
      name: 'Внутренний · Loomixx',
      contacts: {
        phone: [],
        telegram: [{ id: 'cc-i-tg', value: '@loomixx', label: 'Рабочий' }],
        max: [],
        vk: [{ id: 'cc-i-vk', value: 'vk.ru/loomixx', label: 'Рабочий' }],
        whatsapp: [],
        email: [
          { id: 'cc-i-mail1', value: 'hello@loomixx.ru', label: 'Рабочий' },
          { id: 'cc-i-mail2', value: 'nikolay@loomixx.ru', label: 'Личный' },
        ],
      },
      projectIds: ['lcc', 'loomixx-site'],
      projects: 'LCC, Loomixx.ru',
      note: 'Студийные продукты и инфраструктура',
    },
  ]
}

export function seedServers(): Server[] {
  return [
    {
      ...stamp('prod'),
      name: 'Prod Server',
      host: 'VPS · Timeweb',
      specs: '2 vCPU · 4 GB · 40 GB SSD',
      role: 'Tennis 42 prod',
      status: 'Online',
      statusKind: 'green',
      projectId: 'tennis42',
    },
    {
      ...stamp('test'),
      name: 'Test Stand',
      host: 'Proxmox · home',
      specs: '2 vCPU · 4 GB',
      role: 'staging / demo',
      status: 'Online',
      statusKind: 'green',
    },
    {
      ...stamp('backup'),
      name: 'Backup Server',
      host: 'VPS · резерв',
      specs: '1 vCPU · 2 GB',
      role: 'rclone / snapshots',
      status: 'Reserve',
      statusKind: 'amber',
    },
  ]
}

export function seedDomains(): Domain[] {
  return [
    {
      ...stamp('d1'),
      domain: 'app.milenkih-team.ru',
      registrar: 'Reg.ru',
      dns: 'Timeweb NS',
      expires: '12.08.2027',
      ssl: 'Let’s Encrypt · 78 дн.',
      project: 'Tennis 42',
      projectId: 'tennis42',
    },
    {
      ...stamp('d2'),
      domain: 'loomixx.ru',
      registrar: 'Reg.ru',
      dns: 'Cloudflare',
      expires: '03.02.2027',
      ssl: 'Let’s Encrypt · 41 дн.',
      project: 'Loomixx.ru',
      projectId: 'loomixx-site',
    },
    {
      ...stamp('d3'),
      domain: 'beauty.loomixx.ru',
      registrar: '—',
      dns: 'зарезервирован',
      expires: '—',
      ssl: 'нет',
      project: 'Beauty+',
      projectId: 'beauty',
    },
  ]
}

export function seedDocs(): Doc[] {
  return [
    {
      ...stamp('doc1'),
      title: 'Деплой Tennis 42',
      type: 'Инструкция',
      project: 'Tennis 42',
      projectId: 'tennis42',
      body: '# Деплой\n\nСм. scripts/deploy.sh',
    },
    {
      ...stamp('doc2'),
      title: 'Бэкапы и rclone',
      type: 'Ops',
      project: 'Tennis 42',
      projectId: 'tennis42',
    },
    {
      ...stamp('doc3'),
      title: 'Архитектура Beauty+',
      type: 'Архитектура',
      project: 'Beauty+',
      projectId: 'beauty',
    },
  ]
}

export function seedCampaigns(): Campaign[] {
  return [
    {
      ...stamp('c1'),
      name: 'Запись в секцию',
      platform: 'Яндекс Директ',
      project: 'Tennis 42',
      projectId: 'tennis42',
      budget: '15 000 ₽',
      status: 'Активна',
      statusKind: 'green',
    },
    {
      ...stamp('c2'),
      name: 'Бренд Loomixx',
      platform: 'VK Реклама',
      project: 'Loomixx.ru',
      projectId: 'loomixx-site',
      budget: '8 000 ₽',
      status: 'Черновик',
      statusKind: 'amber',
    },
  ]
}

export function seedFinance(): FinanceEntry[] {
  return [
    {
      ...stamp('f1'),
      title: 'VPS Timeweb',
      category: 'Серверы',
      project: 'Tennis 42',
      projectId: 'tennis42',
      amount: 3200,
      date: '01.11',
    },
    {
      ...stamp('f2'),
      title: 'Продление loomixx.ru',
      category: 'Домены',
      project: 'Loomixx.ru',
      projectId: 'loomixx-site',
      amount: 899,
      date: '28.10',
    },
    {
      ...stamp('f3'),
      title: 'Яндекс Директ',
      category: 'Реклама',
      project: 'Tennis 42',
      projectId: 'tennis42',
      amount: 15000,
      date: '05.11',
    },
  ]
}

export function seedSecrets(): SecretRef[] {
  return [
    {
      ...stamp('s1'),
      name: 'MAX_BOT_TOKEN',
      place: 'GitHub Actions / env.prod',
      project: 'Tennis 42',
      projectId: 'tennis42',
    },
    {
      ...stamp('s2'),
      name: 'SSH prod root',
      place: 'локальный vault',
      project: 'Tennis 42',
      projectId: 'tennis42',
    },
    {
      ...stamp('s3'),
      name: 'Reg.ru API',
      place: 'ссылка на запись vault',
      project: 'Студия',
    },
  ]
}

export function seedEvents(): VaultEvent[] {
  const actor = 'Nikolay'
  return [
    {
      ...stamp('e1'),
      title: 'Деплой Tennis 42 завершён',
      when: 'сегодня · 09:14',
      action: 'note',
      actor,
      actorRole: 'owner',
      entityLabel: 'Tennis 42',
      collection: 'projects',
      entityId: 'tennis42',
    },
    {
      ...stamp('e2'),
      title: 'Изменён «app.milenkih-team.ru» (Домены): dns, ssl',
      when: 'вчера · 18:40',
      action: 'update',
      actor,
      actorRole: 'owner',
      collection: 'domains',
      entityId: 'd1',
      entityLabel: 'app.milenkih-team.ru',
      changedKeys: ['dns', 'ssl'],
      before: {
        id: 'd1',
        domain: 'app.milenkih-team.ru',
        dns: 'Reg.ru NS',
        ssl: 'Let’s Encrypt · 10 дн.',
      },
      after: {
        id: 'd1',
        domain: 'app.milenkih-team.ru',
        dns: 'Timeweb NS',
        ssl: 'Let’s Encrypt · 78 дн.',
      },
    },
    {
      ...stamp('e3'),
      title: 'Создан объект «Миленьких» в «Клиенты»',
      when: '2 дня назад',
      action: 'create',
      actor,
      actorRole: 'owner',
      collection: 'clients',
      entityId: 'milenkih',
      entityLabel: 'Миленьких',
      before: null,
      after: {
        id: 'milenkih',
        name: 'Миленьких',
        contacts: {
          phone: [{ id: 'cc-m-phone', value: '+7 900 111-22-33', label: 'Куратор' }],
          telegram: [{ id: 'cc-m-tg', value: '@milenkih_team' }],
          max: [{ id: 'cc-m-max', value: 'milenkih.max' }],
        },
      },
      changedKeys: ['id', 'name', 'contacts'],
    },
    {
      ...stamp('e4'),
      title: 'SSL продлён на 90 дней',
      when: '3 дня назад',
      action: 'note',
      actor,
      actorRole: 'owner',
      entityLabel: 'loomixx.ru',
      collection: 'domains',
      entityId: 'd2',
    },
  ]
}
