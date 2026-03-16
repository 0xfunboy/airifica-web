import type { Ref } from 'vue'

import type { ImportedModelMeta, WorkbenchSettings } from '../types'

import { del, get, set } from 'idb-keyval'
import { computed, onBeforeUnmount, ref } from 'vue'

const MODEL_BLOB_KEY = 'airifica:web:model-file'
const MODEL_META_KEY = 'airifica:web:model-meta'

export function useModelRegistry(settings: Ref<WorkbenchSettings>) {
  const importedModel = ref<ImportedModelMeta | null>(null)
  const importedModelUrl = ref<string | null>(null)
  let currentObjectUrl: string | null = null

  function revokeObjectUrl() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl)
      currentObjectUrl = null
    }
  }

  function mountFile(file: File) {
    revokeObjectUrl()
    currentObjectUrl = URL.createObjectURL(file)
    importedModelUrl.value = currentObjectUrl
  }

  async function restoreImportedModel() {
    const [file, meta] = await Promise.all([
      get<File>(MODEL_BLOB_KEY),
      get<ImportedModelMeta>(MODEL_META_KEY),
    ])

    importedModel.value = meta || null

    if (file instanceof File)
      mountFile(file)
    else
      importedModelUrl.value = null
  }

  async function importModelFile(file: File) {
    await Promise.all([
      set(MODEL_BLOB_KEY, file),
      set(MODEL_META_KEY, {
        name: file.name,
        size: file.size,
        updatedAt: Date.now(),
      } satisfies ImportedModelMeta),
    ])

    importedModel.value = {
      name: file.name,
      size: file.size,
      updatedAt: Date.now(),
    }
    mountFile(file)
    settings.value.modelSource = 'file'
  }

  async function clearImportedModel() {
    revokeObjectUrl()
    importedModel.value = null
    importedModelUrl.value = null
    await Promise.all([
      del(MODEL_BLOB_KEY),
      del(MODEL_META_KEY),
    ])

    if (settings.value.modelSource === 'file')
      settings.value.modelSource = 'remote'
  }

  function useRemoteModel() {
    settings.value.modelSource = 'remote'
  }

  const activeModelUrl = computed(() => {
    if (settings.value.modelSource === 'file')
      return importedModelUrl.value

    return settings.value.remoteModelUrl.trim() || null
  })

  const activeModelLabel = computed(() => {
    if (settings.value.modelSource === 'file')
      return importedModel.value?.name || 'Imported VRM'

    return settings.value.remoteModelUrl.trim() || 'No remote model selected'
  })

  onBeforeUnmount(() => revokeObjectUrl())

  return {
    importedModel,
    importedModelUrl,
    activeModelUrl,
    activeModelLabel,
    restoreImportedModel,
    importModelFile,
    clearImportedModel,
    useRemoteModel,
  }
}

