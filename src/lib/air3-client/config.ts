import type { Air3ClientConfig } from './types'

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizeBaseUrl(value: string | undefined, fallback = '') {
  return stripTrailingSlash((value || fallback).trim())
}

export function resolveRuntimeBaseUrl(config: Air3ClientConfig) {
  const runtimeBaseUrl = normalizeBaseUrl(config.runtimeBaseUrl)
  return runtimeBaseUrl.endsWith('/v1') ? runtimeBaseUrl.slice(0, -3) : runtimeBaseUrl
}

export function resolveServiceApiBaseUrl(config: Air3ClientConfig) {
  const serviceApiBaseUrl = normalizeBaseUrl(config.serviceApiBaseUrl, resolveRuntimeBaseUrl(config))
  if (!serviceApiBaseUrl)
    return '/api'
  return serviceApiBaseUrl.endsWith('/api') ? serviceApiBaseUrl : `${serviceApiBaseUrl}/api`
}
