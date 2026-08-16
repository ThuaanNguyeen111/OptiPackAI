import { ActorsSection } from '../components/landing/ActorsSection'
import { AiDemoCard } from '../components/landing/AiDemoCard'
import { FeatureGrid } from '../components/landing/FeatureGrid'
import { HeroSection } from '../components/landing/HeroSection'
import { LandingFooter } from '../components/landing/LandingFooter'
import { LandingHeader } from '../components/landing/LandingHeader'

export function LandingPage() {
  return (
    <div id="top" className="landing min-h-svh">
      <LandingHeader />
      <main>
        <HeroSection />
        <AiDemoCard />
        <FeatureGrid />
        <ActorsSection />
      </main>
      <LandingFooter />
    </div>
  )
}
