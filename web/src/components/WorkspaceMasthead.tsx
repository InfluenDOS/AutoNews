import { useTheme } from '../context/ThemeContext'

export function WorkspaceMasthead() {
  const { skin } = useTheme()

  return (
    <header className="workspace-masthead">
      <div className="workspace-title-group">
        <h1>{skin === 'jimo' || skin === 'forest' ? '即墨' : '点翠'} · 编辑部工作台</h1>
        <p>专注信息价值，洞见产业未来</p>
        <span className="workspace-seal" aria-hidden="true">编</span>
      </div>
      <div className="workspace-branch" aria-hidden="true" />
    </header>
  )
}
