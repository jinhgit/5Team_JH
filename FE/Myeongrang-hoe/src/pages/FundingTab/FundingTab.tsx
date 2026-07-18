import { useEffect, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Map, MapMarker } from 'react-kakao-maps-sdk'
import HostDetailSheet from '../../components/HostDetailSheet'
import BackButton from '../../components/BackButton'
import ReportModal from '../../components/ReportModal'
import ScheduleConfirmModal from '../../components/ScheduleConfirmModal'
import UserProfileSheet from '../../components/UserProfileSheet'
import { useDB } from '../../store/db'
import {
  addComment,
  closeFunding,
  commentsOf,
  confirmFunding,
  currentCountOf,
  deleteComment,
  deleteFunding,
  getCurrentUser,
  getFunding,
  getUser,
  isClosed,
  isExpired,
  isHost,
  isJoinable,
  isMatched,
  isParticipant,
  isWishlisted,
  joinFunding,
  leaveFunding,
  syncNudgeMessage,
  syncFundingDetail,
  toggleWishlist,
} from '../../store/actions'
import FundingCover from '../../components/FundingCover'
import { useKakao } from '../../lib/kakao'
import { shareFunding } from '../../lib/share'
import {
  addToDeviceCalendar,
  buildGoogleCalendarUrl,
  isAppleMobileDevice,
} from '../../lib/calendar'
import { API_BASE_URL } from '../../lib/api'
import shareBtn from '../../assets/fundingtab/share-btn.svg'
import UserAvatar from '../../components/UserAvatar'
import chatNoteIcon from '../../assets/fundingtab/chat-note-icon.svg'
import infoIcon from '../../assets/fundingtab/info-icon.svg'
import AiBrandMark from '../../components/AiBrandMark'
import { sunlightTier } from '../../lib/sunlight'
import { blockUser, isBlocked } from '../../store/moderation'
import { TEST_ACCOUNTS, type RiskLevel } from '../../store/schema'

/**
 * aiRisk: 노쇼 리스크 수준 (서버 값)
 *  - 낮음 → 신뢰도 높음
 *  - 중간 → 신뢰도 보통
 *  - 높음 → 신뢰도 낮음
 */
const riskCopy: Record<
  string,
  {
    label: string
    body: string
    /** 카드 배경 */
    boxClass: string
    /** 제목 색 */
    titleClass: string
    /** 로고 톤 (기본 남색 로고 → CSS filter로 재색) */
    logoClass: string
    /** 신뢰도 단계 (미리보기 라벨용) */
    trustLabel: '높음' | '보통' | '낮음'
  }
> = {
  낮음: {
    label: 'AI 노쇼 리스크 분석 · 신뢰도 높음',
    body: '글의 구체성, 장소와 시간, 작성자 활동 이력을 함께 본 결과예요. 안심하고 참여해도 좋아요.',
    // 기존 파란 tint 위에 밝은→진한 파랑 그라데이션
    boxClass:
      'bg-gradient-to-br from-[#ebf4ff] via-[#d9ebff] to-[#b9d6ff] shadow-[inset_0_0_0_1px_rgba(17,106,212,0.12)]',
    titleClass: 'text-[var(--blue-deep)]',
    logoClass: '',
    trustLabel: '높음',
  },
  중간: {
    label: 'AI 노쇼 리스크 분석 · 신뢰도 보통',
    body: '분석할 이력이 아직 충분하지 않아요. 참여 전 댓글로 장소와 시간을 한 번 더 확인해보세요.',
    // 기존 파란 반투명 박스 유지
    boxClass: 'bg-[var(--blue-tint)]',
    titleClass: 'text-[var(--blue-deep)]',
    logoClass: '',
    trustLabel: '보통',
  },
  높음: {
    label: 'AI 노쇼 리스크 분석 · 신뢰도 낮음',
    body: '노쇼 또는 취소 이력과 모임 정보 부족 요소가 감지됐어요. 신중하게 참여를 결정해주세요.',
    // 파란 tint와 같은 톤의 빨간 반투명
    boxClass: 'bg-[rgba(255,64,43,0.10)] shadow-[inset_0_0_0_1px_rgba(255,64,43,0.12)]',
    titleClass: 'text-[var(--red)]',
    // 남색 새싹 로고 → 브랜드 레드(#ff402b)에 가깝게
    logoClass:
      '[filter:brightness(0)_saturate(100%)_invert(28%)_sepia(96%)_saturate(2876%)_hue-rotate(349deg)_brightness(101%)_contrast(104%)]',
    trustLabel: '낮음',
  },
}

/** 테스트 계정 미리보기: 신뢰도 높음 → 보통 → 낮음 순 */
const RISK_PREVIEW_ORDER: RiskLevel[] = ['낮음', '중간', '높음']
const TEST_EMAILS = new Set(Object.values(TEST_ACCOUNTS))

export default function FundingTab() {
  const navigate = useNavigate()
  const { id } = useParams()
  useDB()
  const funding = getFunding(id)
  const me = getCurrentUser()
  const host = getUser(funding.hostEmail)
  const [kakaoLoading, kakaoError] = useKakao()

  const [showHostDetail, setShowHostDetail] = useState(false)
  const [profileEmail, setProfileEmail] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<{
    type: 'user' | 'funding'
    id: string
    email?: string
    title?: string
  } | null>(null)
  const [draft, setDraft] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  /** 테스트 계정 전용: AI 신뢰도 UI 미리보기 인덱스 (null이면 서버 aiRisk 사용) */
  const [riskPreviewIndex, setRiskPreviewIndex] = useState<number | null>(null)

  const isTestAccount = !!me && TEST_EMAILS.has(me.email)

  useEffect(() => {
    const numId = Number(id)
    if (Number.isFinite(numId) && numId > 0) {
      void syncFundingDetail(numId)
    }
  }, [id])

  // 펀딩·계정 바뀌면 미리보기 초기화 (서버 값부터 시작)
  useEffect(() => {
    setRiskPreviewIndex(null)
  }, [id, me?.email])

  async function handleAddComment() {
    const content = draft.trim()
    if (!content || !me || commentSending) return
    setCommentSending(true)
    setDraft('')
    try {
      await addComment(funding.id, me.email, content)
    } catch {
      setDraft(content)
    } finally {
      setCommentSending(false)
    }
  }

  function onCommentKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void handleAddComment()
  }

  async function handleDeleteComment(commentId: number, authorEmail: string) {
    if (!me || me.email !== authorEmail || deletingId != null) return
    if (!window.confirm('이 댓글을 삭제할까요?')) return
    setDeletingId(commentId)
    try {
      await deleteComment(funding.id, commentId, authorEmail)
    } finally {
      setDeletingId(null)
    }
  }

  function handleJoin() {
    if (!me || !isJoinable(funding)) return
    joinFunding(funding.id, me.email)
  }

  async function handleDeleteFunding() {
    setShowMenu(false)
    if (!window.confirm('이 펀딩을 삭제할까요? 되돌릴 수 없어요.')) return
    try {
      await deleteFunding(funding.id)
      navigate('/myposts', { replace: true })
    } catch {
      // toast
    }
  }

  function handleCloseFunding() {
    setShowMenu(false)
    if (!window.confirm('모집을 조기 마감할까요? 더 이상 새 참여자를 받지 않아요.')) return
    closeFunding(funding.id)
  }

  function handleWishlist() {
    if (!me) return
    toggleWishlist(me.email, funding.id)
  }

  function handleConfirm() {
    confirmFunding(funding.id)
  }

  async function handleShare() {
    await shareFunding({
      title: funding.title,
      description: `${funding.category} · ${funding.locationName} · ${funding.meetTimeText}`,
      path: `/funding/${funding.id}`,
      imageUrl: funding.coverImage?.startsWith('http') ? funding.coverImage : undefined,
    })
  }

  function openReportFunding() {
    setShowMenu(false)
    setReportTarget({
      type: 'funding',
      id: String(funding.id),
      email: funding.hostEmail,
      title: '펀딩 신고하기',
    })
    setReportOpen(true)
  }

  function openReportHost() {
    setShowMenu(false)
    setReportTarget({
      type: 'user',
      id: funding.hostEmail,
      email: funding.hostEmail,
      title: '개최자 신고하기',
    })
    setReportOpen(true)
  }

  const current = currentCountOf(funding)
  const matched = isMatched(funding)
  const expired = isExpired(funding)
  const closed = isClosed(funding)
  const joined = !!me && isParticipant(funding, me.email)
  const remaining = funding.targetCount - current
  const showNudge = !closed && !matched && remaining === 1
  const progress = Math.round((current / funding.targetCount) * 100)
  const serverRiskKey: RiskLevel =
    funding.aiRisk === '낮음' || funding.aiRisk === '중간' || funding.aiRisk === '높음'
      ? funding.aiRisk
      : '중간'
  const serverRiskIndex = Math.max(0, RISK_PREVIEW_ORDER.indexOf(serverRiskKey))
  const activeRiskIndex = isTestAccount
    ? (riskPreviewIndex ?? serverRiskIndex)
    : serverRiskIndex
  const activeRiskKey = RISK_PREVIEW_ORDER[activeRiskIndex] ?? '중간'
  const risk = riskCopy[activeRiskKey] ?? riskCopy['중간']

  function cycleRiskPreview(delta: number) {
    if (!isTestAccount) return
    setRiskPreviewIndex((prev) => {
      const base = prev ?? serverRiskIndex
      const next = (base + delta + RISK_PREVIEW_ORDER.length) % RISK_PREVIEW_ORDER.length
      return next
    })
  }

  const wishlisted = !!me && isWishlisted(me.email, funding.id)
  const comments = commentsOf(funding.id)
  const iAmHost = !!me && isHost(funding, me.email)
  const hostBlocked = isBlocked(funding.hostEmail)
  const joinable = isJoinable(funding)
  const calendarUrl =
    funding.meetAt &&
    buildGoogleCalendarUrl({
      title: `[명랑회] ${funding.title}`,
      description: funding.description,
      location: [funding.locationName, funding.address].filter(Boolean).join(' '),
      start: funding.meetAt,
    })
  const nudgeMessage =
    funding.nudgeMessage ?? `딱 한 명만 더 모이면 "${funding.title}"가 바로 출발해요!`

  useEffect(() => {
    if (!showNudge || funding.nudgeMessage) return
    void syncNudgeMessage(funding.id)
  }, [funding.id, funding.nudgeMessage, showNudge])

  function handleBlockHost() {
    setShowMenu(false)
    if (!funding.hostEmail || iAmHost) return
    if (
      !window.confirm(
        `${host?.name ?? '이 개최자'}님을 차단할까요? 해당 사용자의 펀딩이 목록에서 숨겨집니다.`,
      )
    ) {
      return
    }
    blockUser(funding.hostEmail)
  }

  function handleLeave() {
    if (!me || iAmHost) return
    leaveFunding(funding.id, me.email)
  }

  const infoRows = [
    { label: '일시', value: funding.meetTimeText },
    { label: '장소', value: funding.locationName },
    { label: '모집인원', value: `${funding.targetCount}명` },
    { label: '모집 마감', value: funding.deadlineText },
    { label: '참가비', value: funding.fee === 0 ? '무료' : `${funding.fee.toLocaleString()}원` },
  ]

  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-10 shrink-0 bg-white">
        <div className="h-[26px]" />
        <div className="relative flex h-[60px] items-center px-[17px]">
          <BackButton onClick={() => navigate(-1)} />
          <div className="absolute right-[17px] flex items-center gap-[10px]">
            {iAmHost && (
              <Link to={`/funding/${funding.id}/edit`} className="text-[13px] font-bold text-[var(--primary-deep)]">
                수정
              </Link>
            )}
            <button type="button" onClick={handleWishlist} aria-label="찜하기">
              <span className={`text-[22px] ${wishlisted ? 'text-[var(--red)]' : 'text-[var(--border)]'}`}>
                {wishlisted ? '♥' : '♡'}
              </span>
            </button>
            <button type="button" onClick={() => void handleShare()} aria-label="공유">
              <img src={shareBtn} alt="" className="size-[39px]" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((v) => !v)}
                aria-label="더보기"
                className="flex size-[36px] items-center justify-center rounded-full text-[18px] font-bold text-[var(--label)]"
              >
                ⋯
              </button>
              {showMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[40]"
                    aria-label="메뉴 닫기"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-[40px] z-[50] min-w-[160px] overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-white shadow-lg">
                    {iAmHost ? (
                      <>
                        {!closed && !matched && (
                          <button
                            type="button"
                            onClick={handleCloseFunding}
                            className="block w-full px-[14px] py-[12px] text-left text-[13px] text-[var(--heading)] hover:bg-[var(--hairline)]"
                          >
                            모집 조기 마감
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteFunding()}
                          className="block w-full px-[14px] py-[12px] text-left text-[13px] text-[var(--red)] hover:bg-[var(--hairline)]"
                        >
                          펀딩 삭제
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={openReportFunding}
                          className="block w-full px-[14px] py-[12px] text-left text-[13px] text-[var(--heading)] hover:bg-[var(--hairline)]"
                        >
                          펀딩 신고
                        </button>
                        <button
                          type="button"
                          onClick={openReportHost}
                          className="block w-full px-[14px] py-[12px] text-left text-[13px] text-[var(--heading)] hover:bg-[var(--hairline)]"
                        >
                          개최자 신고
                        </button>
                        <button
                          type="button"
                          onClick={handleBlockHost}
                          className="block w-full px-[14px] py-[12px] text-left text-[13px] text-[var(--red)] hover:bg-[var(--hairline)]"
                        >
                          {hostBlocked ? '이미 차단됨' : '개최자 차단'}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {hostBlocked && !iAmHost && (
        <div className="bg-[#FFF4F4] px-[17px] py-[10px] text-[13px] text-[var(--red)]">
          차단한 개최자의 펀딩입니다. 목록에는 표시되지 않아요.
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <FundingCover
          source={funding}
          size="hero"
          className="h-[236px] w-full"
          alt={funding.locationName || funding.title}
        >
          <span className="absolute bottom-[18px] left-[17px] z-[1] rounded-full bg-white px-[13px] py-[5px] text-[12px] font-bold text-[var(--red)]">
            {funding.best ? '인기 펀딩' : funding.category}
          </span>
          {!funding.coverImage && (
            <span className="absolute bottom-[18px] right-[17px] z-[1] rounded-full bg-black/45 px-[10px] py-[4px] text-[11px] font-medium text-white">
              위치 기반 지도
            </span>
          )}
        </FundingCover>

        <div className="flex flex-col gap-[4px] px-[17px] pt-[21px] pb-[4px]">
          <p className="text-[30px] font-bold text-[var(--heading)]">{funding.title}</p>

          <button
            type="button"
            onClick={() => setShowHostDetail(true)}
            className="flex w-full items-center justify-between border-t border-b border-[var(--hairline)] py-[15px]"
          >
            <div className="flex items-center gap-[11px]">
              <UserAvatar user={host} size={47} />
              <div className="flex flex-col items-start gap-[2px]">
                <div className="flex items-center gap-[6px]">
                  <p className="text-[16px] font-bold text-[var(--heading)]">{host?.name}</p>
                  <span className="rounded-[12px] bg-[var(--primary-tint)] px-[9px] py-[2px] text-[11px] font-bold text-[var(--primary-deep)]">
                    {host ? sunlightTier(host.sunlightScore) : ''}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--label)]">개최자 · 참여 {host?.participationCount ?? 0}회</p>
              </div>
            </div>
            <span className="text-[17px] font-bold text-[var(--border)]">›</span>
          </button>

          <div className="h-[13px]" />

          <div className="flex w-full flex-col gap-[13px] rounded-[4px] border border-[var(--border-card)] p-[17px] shadow-[0px_4px_13px_rgba(0,0,0,0.08)]">
            <div className="flex w-full items-center justify-between">
              <p className="text-[17px] font-bold text-[var(--heading)]">
                {current}명 참여 / 목표 {funding.targetCount}명
              </p>
              <p className="text-[13px] text-[var(--red)]">
                {closed ? '모집 마감' : matched ? '모집 완료' : `마감 ${funding.deadlineText}`}
              </p>
            </div>
            <div className="h-[9px] w-full overflow-hidden rounded-full bg-[var(--hairline)]">
              <div
                className="h-full rounded-full bg-[var(--primary-deep)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center">
              {funding.participants.slice(0, 4).map((email, i) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => setProfileEmail(email)}
                  className="relative -mr-[9px] rounded-full border-2 border-white"
                  style={{ zIndex: 4 - i }}
                  aria-label="참여자 프로필"
                >
                  <UserAvatar user={getUser(email)} size={30} />
                </button>
              ))}
              {current > 4 && (
                <div className="relative z-[0] flex size-[30px] items-center justify-center rounded-full border-2 border-white bg-[#303441]">
                  <span className="text-[11px] font-bold text-white">+{current - 4}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-[6px]">
              <img src={chatNoteIcon} alt="" className="size-[15px]" />
              <p className="text-[13px] text-[var(--label)]">
                {joined
                  ? '채팅방에 참여 중이에요'
                  : matched
                    ? '모집이 마감되어 더 이상 참여할 수 없어요'
                    : expired
                      ? '모집 기간이 지나 더 이상 참여할 수 없어요'
                      : '참여하면 바로 채팅방에 들어갈 수 있어요'}
              </p>
            </div>
            {iAmHost && !matched && current >= 2 && (
              <button
                type="button"
                onClick={handleConfirm}
                className="flex h-[40px] w-full items-center justify-center rounded-[4px] border border-[var(--primary-deep)] text-[14px] font-bold text-[var(--primary-deep)]"
              >
                이 인원({current}명)으로 확정하기
              </button>
            )}
          </div>

          {showNudge && (
            <div className="flex w-full items-start gap-[11px] rounded-[4px] border border-[var(--primary-deep)] bg-[var(--primary-tint)] p-[15px]">
              <AiBrandMark className="mt-[1px] h-[20px] w-auto shrink-0 object-contain object-left" />
              <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <p className="text-[14px] font-bold text-[var(--primary-deep)]">AI 성사 임박 넛지</p>
                <p className="text-[13px] text-[var(--label)]">{nudgeMessage}</p>
              </div>
            </div>
          )}

          <div className="h-[4px]" />

          {/* 성사 후 일정 확정 / 캘린더 */}
          {matched && joined && (
            <div className="mb-[8px] flex w-full flex-col gap-[10px] rounded-[4px] border border-[var(--primary-deep)] bg-[var(--primary-tint)] p-[15px]">
              <p className="text-[15px] font-bold text-[var(--heading)]">
                {funding.scheduleConfirmed ? '만남 일정 확정됨' : '만남 일정 잡기'}
              </p>
              <p className="text-[13px] text-[var(--label)]">
                {funding.scheduleConfirmed
                  ? `${funding.meetTimeText || '시간 확인'} · ${funding.locationName || '장소 확인'}`
                  : '성사된 모임의 시간과 장소를 확정하고 캘린더에 추가하세요.'}
              </p>
              <div className="flex flex-wrap gap-[8px]">
                {iAmHost && (
                  <button
                    type="button"
                    onClick={() => setShowSchedule(true)}
                    className="rounded-[4px] bg-[var(--primary-deep)] px-[12px] py-[8px] text-[12px] font-bold text-white"
                  >
                    {funding.scheduleConfirmed ? '일정 수정' : '일정 확정'}
                  </button>
                )}
                {funding.meetAt && (
                  <button
                    type="button"
                    onClick={() => {
                      const ok = addToDeviceCalendar(
                        {
                          title: `[명랑회] ${funding.title}`,
                          description: funding.description,
                          location: [funding.locationName, funding.address]
                            .filter(Boolean)
                            .join(' · '),
                          start: funding.meetAt,
                          fundingId: funding.id,
                        },
                        {
                          filename: `myeongrang-${funding.id}.ics`,
                          // 서버 .ics (inline) — iPhone Safari 가 캘린더 추가 시트 표시
                          serverIcsUrl: `${API_BASE_URL}/api/fundings/${funding.id}/calendar.ics`,
                        },
                      )
                      if (!ok) {
                        window.alert('일정 정보를 캘린더로 열 수 없어요. 만남 시간을 확인해 주세요.')
                      }
                    }}
                    className="rounded-[4px] bg-[var(--primary-deep)] px-[12px] py-[8px] text-[12px] font-bold text-white"
                  >
                    {isAppleMobileDevice() ? '아이폰 캘린더에 추가' : '캘린더에 추가 (.ics)'}
                  </button>
                )}
                {funding.meetAt && calendarUrl && (
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[4px] border border-[var(--primary-deep)] px-[12px] py-[8px] text-[12px] font-bold text-[var(--primary-deep)]"
                  >
                    Google 캘린더
                  </a>
                )}
              </div>
            </div>
          )}

          <div
            className={`flex w-full items-start gap-[8px] rounded-[4px] p-[15px] ${risk.boxClass}`}
            data-ai-risk={activeRiskKey}
            data-trust-level={
              activeRiskKey === '낮음' ? 'high' : activeRiskKey === '높음' ? 'low' : 'medium'
            }
          >
            {isTestAccount && (
              <button
                type="button"
                aria-label="이전 신뢰도 미리보기"
                onClick={() => cycleRiskPreview(-1)}
                className={`mt-[2px] flex size-[28px] shrink-0 items-center justify-center rounded-full bg-white/70 text-[16px] font-bold shadow-sm ${risk.titleClass}`}
              >
                ‹
              </button>
            )}
            <AiBrandMark
              className={`mt-[1px] h-[20px] w-auto shrink-0 object-contain object-left ${risk.logoClass}`}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <p className={`text-[14px] font-bold ${risk.titleClass}`}>{risk.label}</p>
              <p className="text-[13px] text-[var(--label)]">{risk.body}</p>
              {isTestAccount && (
                <p className="mt-[4px] text-[11px] font-medium text-[var(--border)]">
                  미리보기 {activeRiskIndex + 1}/{RISK_PREVIEW_ORDER.length} · 신뢰도 {risk.trustLabel}
                  {activeRiskKey !== serverRiskKey ? ' (실제와 다름)' : ''}
                </p>
              )}
            </div>
            {isTestAccount && (
              <button
                type="button"
                aria-label="다음 신뢰도 미리보기"
                onClick={() => cycleRiskPreview(1)}
                className={`mt-[2px] flex size-[28px] shrink-0 items-center justify-center rounded-full bg-white/70 text-[16px] font-bold shadow-sm ${risk.titleClass}`}
              >
                ›
              </button>
            )}
          </div>

          <div className="my-[4px] h-[1px] w-full bg-[var(--hairline)]" />

          <p className="text-[21px] font-bold text-[var(--heading)]">펀딩 소개</p>
          <p className="text-[17px] text-[var(--ink)]">{funding.description}</p>

          <div className="my-[4px] h-[1px] w-full bg-[var(--hairline)]" />

          {infoRows.map((row, i) => (
            <div
              key={row.label}
              className={`flex w-full items-center justify-between py-[13px] ${
                i < infoRows.length - 1 ? 'border-b border-[var(--hairline)]' : ''
              }`}
            >
              <div className="flex items-center gap-[9px]">
                <img src={infoIcon} alt="" className="size-[17px]" />
                <p className="text-[15px] text-[var(--label)]">{row.label}</p>
              </div>
              <p className="text-[15px] font-bold text-[var(--heading)]">{row.value}</p>
            </div>
          ))}

          <div className="mt-[13px] h-[160px] w-full overflow-hidden rounded-[4px] bg-[var(--hairline)]">
            {kakaoError ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[12px] text-[var(--label)]">
                지도를 불러오지 못했어요
              </div>
            ) : (
              <Map
                center={{ lat: funding.lat, lng: funding.lng }}
                level={4}
                scrollwheel={false}
                style={{ width: '100%', height: '100%' }}
                onCreate={(map) => {
                  requestAnimationFrame(() => {
                    try {
                      map.relayout()
                    } catch {
                      // ignore
                    }
                  })
                }}
              >
                {!kakaoLoading && (
                  <MapMarker position={{ lat: funding.lat, lng: funding.lng }} />
                )}
              </Map>
            )}
          </div>

          <div className="my-[4px] h-[1px] w-full bg-[var(--hairline)]" />

          <p className="text-[21px] font-bold text-[var(--heading)]">댓글 {comments.length}</p>
          <div className="flex flex-col gap-[15px] pt-[4px]">
            {comments.map((c) => {
              const author = getUser(c.authorEmail)
              const mine = !!me && me.email === c.authorEmail
              return (
                <div
                  key={`${c.fundingId}-${c.id}`}
                  className={`flex items-start gap-[9px] ${c.parentId ? 'ml-[28px]' : ''}`}
                >
                  <button type="button" onClick={() => setProfileEmail(c.authorEmail)} aria-label="프로필">
                    <UserAvatar user={author} size={30} />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <div className="flex items-center justify-between gap-[8px]">
                      <button
                        type="button"
                        onClick={() => setProfileEmail(c.authorEmail)}
                        className="text-[14px] font-bold text-[var(--heading)]"
                      >
                        {author?.name ?? '알 수 없음'}
                      </button>
                      {mine && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(c.id, c.authorEmail)}
                          disabled={deletingId === c.id}
                          className="shrink-0 text-[12px] font-medium text-[var(--label)] disabled:opacity-40"
                        >
                          {deletingId === c.id ? '삭제 중...' : '삭제'}
                        </button>
                      )}
                    </div>
                    <p className="text-[14px] text-[var(--ink)]">{c.content}</p>
                  </div>
                </div>
              )
            })}
            {comments.length === 0 && (
              <p className="text-[13px] text-[var(--border)]">아직 댓글이 없어요</p>
            )}
          </div>

          {joined ? (
            <div className="flex items-center gap-[8px] pt-[13px]">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onCommentKeyDown}
                disabled={commentSending}
                placeholder="일정이나 장소를 참여자들과 공유해보세요"
                className="h-[40px] flex-1 rounded-full bg-[var(--hairline)] px-[16px] text-[14px] text-[var(--heading)] placeholder:text-[var(--label)] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleAddComment()}
                disabled={commentSending || !draft.trim()}
                className="shrink-0 rounded-[4px] border border-[var(--border-card)] px-[14px] py-[10px] text-[13px] font-bold text-[var(--heading)] disabled:opacity-40"
              >
                {commentSending ? '등록 중...' : '등록'}
              </button>
            </div>
          ) : (
            <p className="pt-[13px] text-[12px] text-[var(--border)]">참여자만 댓글을 남길 수 있어요</p>
          )}
        </div>
      </main>

      <div className="flex shrink-0 flex-col gap-[8px] border-t border-[var(--hairline)] px-[17px] py-[13px]">
        {iAmHost && !matched && !expired && current >= 2 && (
          <button
            type="button"
            onClick={handleConfirm}
            className="flex h-[44px] w-full items-center justify-center rounded-[4px] border border-[var(--primary-deep)]"
          >
            <span className="text-[14px] font-bold text-[var(--primary-deep)]">
              현재 인원({current}명)으로 모집 확정
            </span>
          </button>
        )}
        <div className="flex items-center gap-[10px]">
          {joined ? (
            <>
              <button
                type="button"
                onClick={() => navigate(`/chat/${funding.id}`)}
                className="flex h-[56px] flex-1 items-center justify-center rounded-[4px] bg-[var(--primary)]"
              >
                <span className="text-[17px] font-medium text-[var(--on-primary)]">채팅방 입장하기</span>
              </button>
              {matched && (
                <button
                  type="button"
                  onClick={() => navigate(`/review/new/${funding.id}`)}
                  className="flex h-[56px] flex-1 items-center justify-center rounded-[4px] border border-[var(--primary-deep)]"
                >
                  <span className="text-[17px] font-medium text-[var(--primary-deep)]">후기 작성하기</span>
                </button>
              )}
              {!iAmHost && !matched && (
                <button
                  type="button"
                  onClick={handleLeave}
                  className="flex h-[56px] shrink-0 items-center justify-center rounded-[4px] border border-[var(--border)] px-[14px]"
                >
                  <span className="text-[14px] font-medium text-[var(--label)]">취소</span>
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              disabled={!joinable}
              className="flex h-[56px] flex-1 items-center justify-center rounded-[4px] bg-[var(--primary)] disabled:opacity-40"
            >
              <span className="text-[17px] font-medium text-[var(--on-primary)]">
                {closed
                  ? '호스트가 모집을 마감했어요'
                  : matched
                    ? '모집이 마감됐어요'
                    : expired
                      ? '모집 기간이 지났어요'
                      : '펀딩 참여하기'}
              </span>
            </button>
          )}
        </div>
      </div>

      {showHostDetail && (
        <HostDetailSheet
          hostEmail={funding.hostEmail}
          onClose={() => setShowHostDetail(false)}
          onReport={() => {
            setShowHostDetail(false)
            openReportHost()
          }}
          onBlock={() => {
            setShowHostDetail(false)
            handleBlockHost()
          }}
        />
      )}

      {profileEmail && (
        <UserProfileSheet email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}

      {showSchedule && (
        <ScheduleConfirmModal funding={funding} onClose={() => setShowSchedule(false)} />
      )}

      {reportTarget && (
        <ReportModal
          open={reportOpen}
          onClose={() => {
            setReportOpen(false)
            setReportTarget(null)
          }}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetEmail={reportTarget.email}
          title={reportTarget.title}
        />
      )}
    </div>
  )
}
