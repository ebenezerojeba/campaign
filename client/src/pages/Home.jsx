import { useId, useState } from 'react';
import { Link } from 'react-router';
import { m, AnimatePresence } from 'framer-motion';
import { Users, Sprout, CalendarCheck, BookOpenText, Plus, Minus, ArrowRight, Compass } from 'lucide-react';
import { AdireTile } from '../components/brand/Adire.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { Badge, EmptyState } from '../components/ui/Feedback.jsx';
import { OpportunityCard, OpportunityCardSkeleton } from '../components/OpportunityCard.jsx';
import { site } from '../content/site.js';
import { get } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { useConfig } from '../lib/config.jsx';
import { formatNumber, cx } from '../lib/format.js';

const ICONS = { Users, Sprout, CalendarCheck, BookOpenText };
const ease = [0.22, 1, 0.36, 1];

// 3 columns × 4 rows of cloth on large screens.
const WALL = [
  ['oniko', 'forest'], ['dots', 'gold'], ['lagoon', 'green'],
  ['stitch', 'paper'], ['leaf', 'green'], ['sun', 'gold'],
  ['chevron', 'green'], ['checks', 'gold'], ['oniko', 'paper'],
  ['lagoon', 'forest'], ['oniko', 'gold'], ['dots', 'mist'],
];

function Hero() {
  const { registrationOpen, loaded } = useConfig();
  const photos = site.heroPhotos;
  return (
    <section className="relative overflow-hidden bg-forest-900 text-white" aria-labelledby="hero-title">
      <div className="container-page grid gap-10 pb-14 pt-10 sm:pt-14 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[1.45fr_1fr] lg:items-center lg:gap-12 lg:pb-20">
        <div className="relative z-10">
          {loaded && registrationOpen && (
            <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-green-50">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-gold-500 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-gold-500" /></span>
              Volunteer registration is open across Lagos State
            </m.p>
          )}
          <h1 id="hero-title" className="type-hero">
            {site.hero.headline.map((line, i) => (
              <m.span
                key={line}
                className={cx('block sm:whitespace-nowrap', i === 1 && 'sm:pl-[0.6em]', i === 2 && 'text-gold-500 sm:pl-[1.2em]')}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease }}
              >
                {line}
              </m.span>
            ))}
          </h1>
          <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }} className="type-lead mt-7 max-w-[34rem] text-green-50/85">
            {site.hero.body}
          </m.p>
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/register" variant="gold" size="lg" iconRight={ArrowRight}>{site.hero.primary}</ButtonLink>
            <ButtonLink to="/#about" variant="onDark" size="lg">{site.hero.secondary}</ButtonLink>
          </m.div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-white/12 pt-6">
            {[['20', 'local government areas'], ['5 min', 'to register on a phone'], ['Free', 'no fees, ever']].map(([v, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-2xl font-bold text-white sm:text-3xl">{v}</dd>
                <dd className="mt-0.5 text-[13px] leading-snug text-green-50/65 sm:text-sm">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The cloth wall: one orchestrated reveal on load. */}
        <div className="relative" aria-hidden={photos.length === 0}>
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2 lg:grid-cols-3">
            {WALL.map(([motif, palette], i) => {
              const photo = photos[i % 4 === 1 ? Math.floor(i / 4) : -1];
              return (
                <m.div
                  key={i}
                  className={cx('overflow-hidden rounded-[10px] ring-1 ring-inset ring-white/10 lg:rounded-xl', i >= 6 && 'hidden lg:block')}
                  initial={{ opacity: 0, scale: 0.86, rotate: i % 2 ? 4 : -4 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ duration: 0.65, delay: 0.25 + ((i % 3) + Math.floor(i / 3)) * 0.07, ease }}
                >
                  {photo ? (
                    <img src={photo.src} alt={photo.alt} className="aspect-square size-full object-cover" loading="eager" />
                  ) : (
                    <AdireTile motif={motif} palette={palette} className="block aspect-square size-full" />
                  )}
                </m.div>
              );
            })}
          </div>
          <p className="mt-3 hidden text-right text-xs text-green-50/50 lg:block">Patterns inspired by Adire, the resist-dyed cloth of Yoruba craft</p>
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="py-20 sm:py-28" aria-labelledby="about-title">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="about-title" className="type-h2 text-forest-900">{site.about.title}</h2>
          <p className="type-lead mt-6 text-slate-600">{site.about.body}</p>
          <ButtonLink to="/register" variant="dark" className="mt-8" iconRight={ArrowRight}>Start your application</ButtonLink>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-line bg-line sm:grid-cols-2">
          {site.about.areas.map((area) => {
            const Icon = ICONS[area.icon];
            return (
              <li key={area.title} className="bg-white p-7 sm:p-8">
                <span className="flex size-12 items-center justify-center rounded-xl bg-green-50 text-green-700"><Icon className="size-6" aria-hidden /></span>
                <h3 className="type-h3 mt-6 text-forest-900">{area.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">{area.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-mist py-20 sm:py-28" aria-labelledby="how-title">
      <div className="container-page">
        <h2 id="how-title" className="type-h2 max-w-2xl text-forest-900">Registering takes three steps</h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {site.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-forest-900 font-display text-2xl font-bold text-gold-500">{i + 1}</span>
                {i < site.steps.length - 1 && <span className="hidden h-px flex-1 bg-line-strong md:block" aria-hidden />}
              </div>
              <h3 className="type-h3 mt-6 text-forest-900">{step.title}</h3>
              <p className="mt-2.5 max-w-sm text-[15px] leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/register" size="lg">Complete your application</ButtonLink>
          <ButtonLink to="/status" variant="secondary" size="lg">Check an existing application</ButtonLink>
        </div>
      </div>
    </section>
  );
}

function OpportunitiesPreview() {
  const { data, loading, error, reload } = useFetch((signal) => get('/opportunities?limit=6', { signal }), 'home-opps');
  return (
    <section id="opportunities" className="py-20 sm:py-28" aria-labelledby="opps-title">
      <div className="container-page">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h2 id="opps-title" className="type-h2 text-forest-900">Ways to take part</h2>
            <p className="type-lead mt-4 text-slate-600">Activities published by the programme team. Register first, and the team will match you with the ones that fit your interests and availability.</p>
          </div>
          {data?.length > 0 && <ButtonLink to="/opportunities" variant="secondary" iconRight={ArrowRight}>See all opportunities</ButtonLink>}
        </div>
        <div className="mt-12">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <OpportunityCardSkeleton key={i} />)}</div>
          ) : error ? (
            <EmptyState icon={Compass} title="Opportunities are not available right now" action={error.code !== 'DB_NOT_CONFIGURED' && <button type="button" className="font-semibold text-green-700 underline underline-offset-4" onClick={reload}>Try again</button>}>
              {error.code === 'DB_NOT_CONFIGURED' ? 'Published activities will appear here once the programme database is connected.' : error.message}
            </EmptyState>
          ) : data.length === 0 ? (
            <EmptyState icon={Compass} title="New opportunities are on the way" action={<ButtonLink to="/register">Register to be notified</ButtonLink>}>
              The programme team has not published activities yet. Register now and you will be among the first to hear about them.
            </EmptyState>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.map((item) => <OpportunityCard key={item._id} item={item} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Impact() {
  const { data, loading, error } = useFetch((signal) => get('/stats', { signal }), 'stats');
  if (error) return null; // nothing to show without verified figures
  const stats = data && [
    { value: data.volunteers, label: 'volunteers registered' },
    { value: data.approved, label: 'applications approved' },
    { value: data.lgasRepresented, label: 'of 20 LGAs represented' },
    { value: data.opportunities, label: 'opportunities open now' },
  ];
  return (
    <section className="relative overflow-hidden bg-forest-900 py-20 text-white sm:py-24" aria-labelledby="impact-title">
      <div className="absolute inset-y-0 right-0 hidden w-48 opacity-25 lg:block" aria-hidden>
        <div className="grid h-full grid-rows-4">
          {['oniko', 'lagoon', 'dots', 'stitch'].map((motif) => <AdireTile key={motif} motif={motif} palette="deep" className="h-full w-full" />)}
        </div>
      </div>
      <div className="container-page relative">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="impact-title" className="type-h2">The programme so far</h2>
          {data?.includesSampleData && <Badge tone="sample">Demonstration data</Badge>}
        </div>
        {loading ? (
          <div className="mt-12 grid grid-cols-2 gap-8 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/5" />)}</div>
        ) : data.volunteers === 0 ? (
          <p className="type-lead mt-6 max-w-xl text-green-50/80">Registration has just opened. Figures will appear here as volunteers join. <Link to="/register" className="font-semibold text-gold-500 underline underline-offset-4">Be among the first to register.</Link></p>
        ) : (
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col border-l-2 border-gold-500 pl-5">
                <dt className="order-2 mt-1 text-[15px] text-green-50/75">{s.label}</dt>
                <dd className="font-display text-5xl font-bold tracking-tight tabular sm:text-6xl">{formatNumber(s.value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {data?.includesSampleData && <p className="mt-10 max-w-2xl text-sm text-green-50/60">These figures include sample records created for demonstration. They are not real registrations.</p>}
      </div>
    </section>
  );
}

function FaqItem({ item, open, onToggle }) {
  const id = useId();
  return (
    <li className="border-b border-line">
      <h3>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-lg font-semibold text-forest-900 sm:text-xl">
          {item.q}
          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors', open ? 'border-forest-900 bg-forest-900 text-white' : 'border-line-strong text-forest-900')}>
            {open ? <Minus className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div id={id} role="region" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
            <p className="max-w-2xl pb-6 text-[16px] leading-relaxed text-slate-600">{item.a}</p>
          </m.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-20 sm:py-28" aria-labelledby="faq-title">
      <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <h2 id="faq-title" className="type-h2 text-forest-900">Questions and answers</h2>
          <p className="type-lead mt-5 text-slate-600">What to expect when you register, and how your information is handled.</p>
          <Link to="/privacy" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-green-700 underline-offset-4 hover:underline">Read the privacy notice <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
        <ul className="border-t border-line">
          {site.faq.map((item, i) => <FaqItem key={item.q} item={item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}
        </ul>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="pb-20 sm:pb-28" aria-labelledby="cta-title">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-green-600 px-6 py-14 text-white sm:px-12 sm:py-16">
          <div className="absolute -right-10 -top-10 hidden size-72 rotate-6 overflow-hidden rounded-3xl opacity-40 md:block" aria-hidden>
            <AdireTile motif="oniko" palette="green" className="size-full" />
          </div>
          <div className="relative max-w-xl">
            <h2 id="cta-title" className="type-h2">Lagos works when its people take part</h2>
            <p className="type-lead mt-4 text-green-50/90">Five minutes on your phone is all it takes to register. No fees, no documents to upload.</p>
            <ButtonLink to="/register" variant="gold" size="lg" className="mt-8" iconRight={ArrowRight}>Become a Volunteer</ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <About />
      <HowItWorks />
      <OpportunitiesPreview />
      <Impact />
      <Faq />
      <ClosingCta />
    </>
  );
}
