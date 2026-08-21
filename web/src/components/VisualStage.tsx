type Props = {
  src: string
  variant?: 'hero' | 'empty'
  className?: string
  children?: React.ReactNode
}

/** Layered photo stage: blurred depth plate + masked sharp plate + soft veil. */
export function VisualStage({ src, variant = 'hero', className = '', children }: Props) {
  return (
    <div className={`visual-stage visual-stage-${variant} ${className}`.trim()} aria-hidden="true">
      <div
        className="visual-stage-blur"
        style={{ backgroundImage: `url(${src})` }}
      />
      <div className="visual-stage-sharp-wrap">
        <img src={src} alt="" className="visual-stage-sharp" />
      </div>
      <div className="visual-stage-bloom" />
      <div className="visual-stage-veil" />
      {children ? <div className="visual-stage-slot">{children}</div> : null}
    </div>
  )
}
