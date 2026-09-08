import type { ReactNode } from 'react'

type IconProps = { className?: string }

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1.15em"
      height="1.15em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** 关键词 / linked key nodes */
export function IconKeywords({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="15.8" cy="5.7" r="2.1" />
      <path d="M10.8 7.2 13.7 6.3M7.1 11l-3.6 8M9.8 10.1l4.5 8.2M12.7 15.3l-5.4 1" />
    </Svg>
  )
}

/** 添加 */
export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

/** 单个关键词条目 */
export function IconHash({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 4 6 20M18 4l-2 16M4 9h16M3.5 15h16" />
    </Svg>
  )
}

/** 收藏夹 */
export function IconStar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m12 3.6 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.7 6.9 19l.9-5.6-4-3.9 5.6-.8L12 3.6Z" />
    </Svg>
  )
}

/** 登录 */
export function IconLogin({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5" />
      <path d="M14 7l5 5-5 5" />
      <path d="M19 12H9" />
    </Svg>
  )
}

/** 退出 */
export function IconLogout({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 17h5a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-5" />
      <path d="m10 7-5 5 5 5" />
      <path d="M5 12h10" />
    </Svg>
  )
}

/** 展开/收起箭头 */
export function IconChevron({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m8 10 4 4 4-4" />
    </Svg>
  )
}

/** 抓取源 / globe */
export function IconRss({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4M12 3.5c2.3 2.3 3.5 5.1 3.5 8.5S14.3 18.2 12 20.5M12 3.5C9.7 5.8 8.5 8.6 8.5 12s1.2 6.2 3.5 8.5" />
    </Svg>
  )
}

/** 显示密码 */
export function IconEye({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  )
}

/** 隐藏密码 */
export function IconEyeOff({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A2.6 2.6 0 0 0 13.4 13.4" />
      <path d="M6.5 6.7C4.2 8.2 2.8 10.3 2 12c1.2 2.6 4.7 7 10 7 1.8 0 3.4-.5 4.8-1.2" />
      <path d="M9.7 5.2C10.4 5.1 11.2 5 12 5c5.3 0 8.8 4.4 10 7-.5 1.1-1.3 2.3-2.4 3.4" />
    </Svg>
  )
}

/** 皮肤 */
export function IconPalette({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3a9 9 0 1 0 0 18 2.4 2.4 0 0 0 2.1-3.6 2.2 2.2 0 0 1 1.9-3.4H17a4 4 0 0 0 0-8h-.3A9 9 0 0 0 12 3Z" />
      <circle cx="7.8" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.2" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** 删除 */
export function IconTrash({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  )
}
