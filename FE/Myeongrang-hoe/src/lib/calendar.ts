/** 외부 캘린더(Google / Apple·iOS 캘린더) 연동 */

export type CalendarEvent = {
  title: string
  description?: string
  location?: string
  /** ISO 또는 Date */
  start: string | Date
  /** 없으면 start + 2시간 */
  end?: string | Date
  /** iOS 서버 .ics 용 (선택) */
  fundingId?: number
  uid?: string
}

function toUtcStamp(d: Date): string {
  // YYYYMMDDTHHmmssZ (UTC)
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

function parseDate(value: string | Date): Date | null {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return null
  return d
}

function resolveRange(event: CalendarEvent): { start: Date; end: Date } | null {
  const start = parseDate(event.start)
  if (!start) return null
  const end =
    event.end != null
      ? parseDate(event.end)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000)
  if (!end || Number.isNaN(end.getTime())) return null
  return { start, end }
}

export function buildGoogleCalendarUrl(event: CalendarEvent): string | null {
  const range = resolveRange(event)
  if (!range) return null

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcStamp(range.start)}/${toUtcStamp(range.end)}`,
  })
  if (event.description) params.set('details', event.description)
  if (event.location) params.set('location', event.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** iPhone / iPad / iOS WebView 감지 */
export function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ (MacIntel + touch)
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** RFC5545 .ics 본문 (Apple 캘린더 호환) */
export function buildIcsContent(event: CalendarEvent): string | null {
  const range = resolveRange(event)
  if (!range) return null

  const uid =
    event.uid ||
    (event.fundingId != null
      ? `funding-${event.fundingId}@myeongrang.hoe`
      : `mh-${range.start.getTime()}@myeongrang.hoe`)
  const now = toUtcStamp(new Date())
  const stampStart = toUtcStamp(range.start)
  const stampEnd = toUtcStamp(range.end)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Myeongranghoe//Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${stampStart}`,
    `DTEND:${stampEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ]
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`)
  }
  lines.push('STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

/**
 * 기기 캘린더에 추가.
 * - iPhone Safari: text/calendar 로 열면 "캘린더에 추가" 시트 표시
 * - 그 외: .ics 파일 다운로드
 */
export function addToDeviceCalendar(
  event: CalendarEvent,
  options?: {
    filename?: string
    /** 서버 .ics URL (있으면 iOS에서 우선 사용 — 가장 안정적) */
    serverIcsUrl?: string | null
  },
): boolean {
  const filename = options?.filename ?? 'myeongrang.ics'
  const ics = buildIcsContent(event)
  if (!ics) return false

  const appleMobile = isAppleMobileDevice()

  // 1) 서버가 text/calendar + inline 로 내려주면 iOS가 네이티브 추가 UI를 띄움
  if (appleMobile && options?.serverIcsUrl) {
    window.location.href = options.serverIcsUrl
    return true
  }

  // 2) iOS: download 속성 없이 열기 (캘린더 앱으로 연결)
  if (appleMobile) {
    try {
      const dataUrl =
        'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)
      // data URL 길이 한도 대비 blob 폴백
      if (dataUrl.length < 80_000) {
        window.location.href = dataUrl
        return true
      }
    } catch {
      // fall through
    }
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  }

  // 3) 데스크톱 등: 파일 저장
  downloadIcs(event, filename)
  return true
}

/** .ics 파일 다운로드 (데스크톱·Android 파일 저장용) */
export function downloadIcs(event: CalendarEvent, filename = 'myeongrang.ics') {
  const ics = buildIcsContent(event)
  if (!ics) return

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
