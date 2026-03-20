import type { Air3ClientConfig } from '@/lib/air3-client'

import { Air3Client } from '@/lib/air3-client'

import { appConfig } from '@/config/app'

export function createAir3Client(config: Omit<Air3ClientConfig, 'runtimeBaseUrl' | 'serviceApiBaseUrl'> = {}) {
  return new Air3Client({
    runtimeBaseUrl: appConfig.runtimeBaseUrl,
    serviceApiBaseUrl: appConfig.serviceApiBaseUrl,
    ...config,
  })
}
