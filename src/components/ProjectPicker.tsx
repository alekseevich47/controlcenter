import { useMemo } from 'react'
import { isArchived } from '../vault/projectStatus'
import { useCollection } from '../vault/useCollection'
import { CustomSelect } from './CustomSelect'

interface ProjectPickerProps {
  id: string
  value: string
  onChange: (projectId: string) => void
  embedded?: boolean
}

/** Выбор проекта для привязки сущности. Пустое значение — без проекта. */
export function ProjectPicker({ id, value, onChange, embedded = true }: ProjectPickerProps) {
  const { items, loading } = useCollection('projects')
  const options = useMemo(
    () => [
      { value: '', label: 'Без проекта' },
      ...[...items]
        .filter((project) => !isArchived(project) || project.id === value)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((project) => ({ value: project.id, label: project.name })),
    ],
    [items, value],
  )

  return (
    <CustomSelect
      id={id}
      value={value}
      options={options}
      disabled={loading}
      embedded={embedded}
      placeholder="Проект"
      emptyLabel="Нет проектов"
      onChange={onChange}
    />
  )
}
