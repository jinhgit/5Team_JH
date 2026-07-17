import type { LatLng } from './geo'
import { CAMPUS_CENTER } from '../store/schema'

export type LocationSource = 'gps' | 'saved' | 'campus'

export type UserLocationHint = {
  lastLat?: number | null
  lastLng?: number | null
} | null | undefined

/** 프로필에 저장된 마지막 위치가 있으면 반환 */
export function resolveSavedLocation(user?: UserLocationHint): LatLng | null {
  const lat = user?.lastLat
  const lng = user?.lastLng
  if (lat == null || lng == null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/**
 * 동기 기준점: 저장 위치 우선, 없으면 인문캠(최후 폴백).
 * 목록·알림 등 GPS를 기다릴 수 없는 곳에서 사용.
 */
export function getReferenceLocation(user?: UserLocationHint): LatLng {
  return resolveSavedLocation(user) ?? CAMPUS_CENTER
}

function getCurrentPosition(
  options?: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

/**
 * 내 위치 우선 확보.
 * 1) GPS 성공 → 현재 좌표
 * 2) GPS 실패/미지원 → 저장된 lastLat/lng
 * 3) 그것도 없으면 → 명지대 인문캠 (최후 폴백)
 */
export async function acquireUserLocation(options?: {
  saved?: LatLng | null
  user?: UserLocationHint
  timeoutMs?: number
  maximumAgeMs?: number
  enableHighAccuracy?: boolean
}): Promise<{ loc: LatLng; source: LocationSource }> {
  const saved = options?.saved ?? resolveSavedLocation(options?.user)

  try {
    const pos = await getCurrentPosition({
      timeout: options?.timeoutMs ?? 8000,
      maximumAge: options?.maximumAgeMs ?? 60_000,
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
    })
    return {
      loc: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      source: 'gps',
    }
  } catch {
    if (saved) return { loc: saved, source: 'saved' }
    return { loc: CAMPUS_CENTER, source: 'campus' }
  }
}

export function locationSourceLabel(source: LocationSource): string | null {
  if (source === 'gps') return null
  if (source === 'saved') return '기준 위치: 최근 저장 위치'
  return '기준 위치: 명지대 인문캠퍼스'
}
