import { useEffect } from 'react'
import { EditorialFooter } from '../components/landing/editorial/EditorialFooter'
import { EditorialHero } from '../components/landing/editorial/EditorialHero'
import { EditorialNav } from '../components/landing/editorial/EditorialNav'
import { EditorialProcess } from '../components/landing/editorial/EditorialProcess'
import { EditorialScrollStats } from '../components/landing/editorial/EditorialScrollStats'
import { EditorialServices } from '../components/landing/editorial/EditorialServices'
import { EditorialWorks } from '../components/landing/editorial/EditorialWorks'
import '../components/landing/editorial/editorial-landing.css'
import { scrollLandingSection } from '../components/landing/scroll-landing'

export function LandingPage() {
  useEffect(() => {
    if (window.location.hash) {
      scrollLandingSection(window.location.hash)
    }
  }, [])

  return (
    <div className="editorial-landing">
      <EditorialNav />
      <main>
        <EditorialHero />
        <EditorialScrollStats />
        <EditorialServices />
        <EditorialProcess />
        <EditorialWorks />
        <EditorialFooter />
      </main>
    </div>
  )
}
