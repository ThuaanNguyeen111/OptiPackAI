import { useEffect } from 'react'
import { ActorsSection } from '../components/landing/ActorsSection'
import { AiDemoCard } from '../components/landing/AiDemoCard'
import { FeatureGrid } from '../components/landing/FeatureGrid'
import { HeroSection } from '../components/landing/HeroSection'
import { LandingAside } from '../components/landing/LandingAside'
import { LandingFooter } from '../components/landing/LandingFooter'
import { LandingHeader } from '../components/landing/LandingHeader'
import { scrollLandingSection } from '../components/landing/scroll-landing'

export function LandingPage() {
  useEffect(() => {
    if (window.location.hash) {
      scrollLandingSection(window.location.hash)
    }
  }, [])

  return (
    <div className="landing-shell">
      <LandingHeader />
      <div className="landing-body">
        <LandingAside />
        <main className="landing-main">
          <HeroSection />
          <AiDemoCard />
          <FeatureGrid />
          <ActorsSection />
          <LandingFooter />
        </main>
      </div>
    </div>
  )
}
