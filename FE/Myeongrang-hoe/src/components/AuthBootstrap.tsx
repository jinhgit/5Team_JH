import { useEffect, useState, type ReactNode } from 'react'
import { getAccessToken, setAccessToken } from '../lib/api'
import { isLoggedIn } from '../lib/auth'
import { getCurrentUser, syncFundingsFromServer, syncMeFromServer } from '../store/actions'
import { getReferenceLocation } from '../lib/userLocation'
import LoadingScreen from './LoadingScreen'

/**
 * 앱 기동 시 accessToken 이 있으면 서버에서 세션을 복구한다.
 * 실패하면 토큰을 지우고 로그인 화면으로 보낼 수 있게 한다.
 */
export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => !getAccessToken() || isLoggedIn())

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const token = getAccessToken()
      if (!token) {
        if (!cancelled) setReady(true)
        return
      }

      // 이미 로컬에 로그인 상태가 있으면 백그라운드로만 갱신
      if (isLoggedIn() && getCurrentUser()) {
        void syncMeFromServer()
        const ref = getReferenceLocation(getCurrentUser())
        void syncFundingsFromServer({
          lat: ref.lat,
          lng: ref.lng,
          radiusKm: 100,
        })
        if (!cancelled) setReady(true)
        return
      }

      const ok = await syncMeFromServer()
      if (!ok) {
        setAccessToken(null)
      } else {
        const ref = getReferenceLocation(getCurrentUser())
        void syncFundingsFromServer({
          lat: ref.lat,
          lng: ref.lng,
          radiusKm: 100,
        })
      }
      if (!cancelled) setReady(true)
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return <LoadingScreen message="로그인 상태를 확인하는 중..." />
  }

  return children
}
