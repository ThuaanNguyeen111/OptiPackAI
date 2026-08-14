import { Header } from '../components/layout/Header'

type PlaceholderPageProps = {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <Header title={title} description={description} />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-hairline bg-surface-1 p-8 text-center">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="mt-2 text-sm text-ink-subtle">
            Module sẽ được triển khai theo <code className="text-ink-muted">DESIGN.md</code>.
          </p>
        </div>
      </main>
    </>
  )
}
