import logo from '../assets/shared/logo.png'

type Props = {
  /** Tailwind size classes. 기본은 카드 인라인 아이콘 높이. */
  className?: string
  alt?: string
}

/**
 * AI 기능 UI용 브랜드 마크.
 * 홈 헤더 우측 상단과 동일한 새싹(잎) 로고를 사용한다.
 */
export default function AiBrandMark({
  className = 'h-[20px] w-auto shrink-0 object-contain object-left',
  alt = '명랑회 AI',
}: Props) {
  return <img src={logo} alt={alt} className={className} />
}

/** 알림 등 URL 문자열이 필요한 곳용 에셋 경로 */
export { logo as aiBrandLogo }
