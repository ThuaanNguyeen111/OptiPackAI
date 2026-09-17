import { useCallback, useState } from 'react'
import type { PackagingTemplate } from '../types/admin'
import { packagingTemplatesMock } from '../data/admin-mock'

type TemplateInput = Omit<PackagingTemplate, 'id' | 'createdAt' | 'createdBy'>

export function usePackagingTemplates() {
  const [templates, setTemplates] = useState<PackagingTemplate[]>(
    () => packagingTemplatesMock,
  )

  const createTemplate = useCallback(async (input: TemplateInput) => {
    await new Promise((r) => setTimeout(r, 250))
    const created: PackagingTemplate = {
      ...input,
      id: `tpl-${Date.now()}`,
      createdBy: 'Alice Nguyễn',
      createdAt: new Date().toISOString(),
    }
    setTemplates((prev) => [created, ...prev])
  }, [])

  const updateTemplate = useCallback(
    async (id: string, patch: Partial<TemplateInput>) => {
      await new Promise((r) => setTimeout(r, 250))
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
    },
    [],
  )

  const removeTemplate = useCallback(async (id: string) => {
    await new Promise((r) => setTimeout(r, 200))
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { templates, createTemplate, updateTemplate, removeTemplate }
}
