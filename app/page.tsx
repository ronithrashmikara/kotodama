import { BuilderBadge } from "@/components/builder-badge";
import { IsekaiGame } from "@/components/isekai-game";

const GITHUB_URL = "https://github.com/ronithrashmikara/yume";

export default function Home() {
  return (
    <main className="isekai-main">
      {/* Passed as children so they stay server-rendered, while the game owns
          whether they show — they're hidden once you enter a world. */}
      <IsekaiGame>
        <VideoSection />
        <WhyOrbisSection />
        <TechStackSection />
        <GithubSection />
        <Credits />
      </IsekaiGame>
      <BuilderBadge />
    </main>
  );
}

function SectionHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="section-header">
      <span className="section-eyebrow">{eyebrow}</span>
      <h2 className="section-title">{title}</h2>
      {lede && <p className="section-lede">{lede}</p>}
    </div>
  );
}

function VideoSection() {
  return (
    <section className="landing-section">
      <SectionHeader
        eyebrow="Watch it in action"
        title="See Yume in motion"
        lede="A short walkthrough of the game, the tech behind it, and why it had to be built on live, steerable video."
      />
      <div className="video-placeholder" role="img" aria-label="Demo video coming soon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="video-placeholder-bg" src="/art/park.webp" alt="" />
        <div className="video-placeholder-scrim" />
        <span className="video-placeholder-play">
          <PlayIcon />
        </span>
        <span className="video-placeholder-label">Full walkthrough — coming soon</span>
      </div>
    </section>
  );
}

const WHY_CARDS = [
  {
    num: "01",
    title: "Correct answers move the world",
    text: "A right sentence steers the live Orbis scene within seconds — the same running world, not a new clip.",
  },
  {
    num: "02",
    title: "Wrong answers change nothing",
    text: "If the meaning doesn't land, the world holds still. The video itself is the feedback.",
  },
  {
    num: "03",
    title: "State persists, turn after turn",
    text: "Every correct answer builds on the last — a cat, then a dog beside it, then rain — one continuous scene shaped entirely by language.",
  },
];

function WhyOrbisSection() {
  return (
    <section className="landing-section">
      <SectionHeader
        eyebrow="Why live video"
        title="Pre-rendered video can't do this"
        lede="The learner's next sentence is unpredictable, every single turn. Yume keeps one running world alive and steers it in real time as each answer lands — that's not a visual flourish, it's the entire teaching mechanic."
      />
      <div className="why-grid">
        {WHY_CARDS.map((c) => (
          <div className="why-card" key={c.num}>
            <span className="why-card-num">{c.num}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const TECH_STACK: { name: string; role: string; logo?: string }[] = [
  { name: "Next.js 16", role: "App shell, UI, and API routes", logo: "/logos/nextjs.png" },
  { name: "Orbis · Reactor", role: "Live, steerable video world over WebRTC", logo: "/logos/reactor.png" },
  {
    name: "GPT-OSS 120B",
    role: "Grades answers and narrates the scene on Groq, ~500 tok/s, offline fallback",
    logo: "/logos/groq.png",
  },
  { name: "Fish Audio", role: "Narrates the world and speaks each correction aloud", logo: "/logos/fish-audio.png" },
  { name: "fal.ai", role: "Generated every background, favicon, and mascot on this page", logo: "/logos/fal.png" },
];

function TechStackSection() {
  return (
    <section className="landing-section">
      <SectionHeader eyebrow="Under the hood" title="The stack" />
      <div className="tech-grid">
        {TECH_STACK.map((t) => (
          <div className="tech-card" key={t.name}>
            <div className="tech-card-icon">
              {t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt="" />
              ) : (
                <SparkleIcon />
              )}
            </div>
            <h3>{t.name}</h3>
            <p>{t.role}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function GithubSection() {
  return (
    <section className="landing-section">
      <a className="github-card" href={GITHUB_URL} target="_blank" rel="noreferrer">
        <span className="github-card-icon">
          <GithubIcon />
        </span>
        <span className="github-card-text">
          <span className="github-card-title">Read the source</span>
          <span className="github-card-sub">Full code, scenarios, and grading logic on GitHub</span>
        </span>
        <span className="github-card-arrow">
          <ArrowRightIcon />
        </span>
      </a>
    </section>
  );
}

function Credits() {
  return (
    <footer className="credits">
      <p className="credits-line">
        A hackathon submission for the{" "}
        <a href="https://www.visko.ai/challenge/orbis-september-2026" target="_blank" rel="noreferrer">
          Visko Orbis Online Challenge
        </a>
        . Thank you to the teams behind the tech that made it possible.
      </p>

      <a className="credits-visko" href="https://www.visko.ai" target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/visko.png" alt="Visko" />
      </a>

      <div className="credits-logos">
        <CreditChip href="https://www.reactor.inc" src="/logos/reactor.png" name="Reactor" />
        <CreditChip href="https://groq.com" src="/logos/groq.png" name="Groq" />
        <CreditChip href="https://fish.audio" src="/logos/fish-audio.png" name="Fish Audio" />
        <CreditChip href="https://fal.ai" src="/logos/fal.png" name="fal" />
      </div>
    </footer>
  );
}

function CreditChip({ href, src, name }: { href: string; src: string; name: string }) {
  return (
    <a className="credit-chip" href={href} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="credit-chip-mark" src={src} alt="" />
      {name}
    </a>
  );
}

function PlayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7Z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6ZM19 15c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.7.5.5 5.7.5 12a11.5 11.5 0 0 0 7.86 10.94c.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.7 1.25 3.36.95.1-.75.4-1.25.73-1.53-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a10.9 10.9 0 0 1 5.79 0c2.2-1.5 3.18-1.18 3.18-1.18.62 1.6.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.27 5.68.42.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5Z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
