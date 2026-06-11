import AppHeader from '@/components/AppHeader'

export default function Career(): React.JSX.Element {
  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Career" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-serif text-accent text-2xl">Career</p>
          <p className="text-sm text-muted font-mono">Coming soon.</p>
        </div>
      </div>
    </div>
  )
}
