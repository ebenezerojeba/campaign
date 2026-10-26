import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, m } from 'framer-motion';
import { Menu, X, Mail, Phone, MessageCircle, MapPin, ArrowRight } from 'lucide-react';
import { Logo } from '../brand/Logo.jsx';
import { AdireBand } from '../brand/Adire.jsx';
import { ButtonLink } from '../ui/Button.jsx';
import { Alert } from '../ui/Feedback.jsx';
import { site } from '../../content/site.js';
import { useConfig, whatsappLink } from '../../lib/config.jsx';
import { cx } from '../../lib/format.js';

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      // Wait a frame so the target section has rendered.
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}

function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef(null);
  const overHero = pathname === '/' && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header className={cx('sticky top-0 z-40 transition-colors duration-200', overHero ? 'bg-forest-900' : 'border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85')}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-gold-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-forest-950">Skip to content</a>
      <div className="container-page flex h-[72px] items-center justify-between gap-6">
        <Logo tone={overHero ? 'light' : 'dark'} />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link to={item.href} className={cx('rounded-md px-3 py-2 text-[15px] font-medium transition-colors', overHero ? 'text-green-50/85 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-mist hover:text-forest-900')}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <NavLink to="/status" className={({ isActive }) => cx('rounded-md px-3 py-2 text-[15px] font-medium transition-colors', overHero ? 'text-green-50/85 hover:bg-white/10 hover:text-white' : isActive ? 'text-forest-900' : 'text-slate-600 hover:bg-mist hover:text-forest-900')}>
                Check status
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block"><ButtonLink to="/register" variant={overHero ? 'gold' : 'primary'}>Register as an agent</ButtonLink></span>
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={cx('flex size-11 items-center justify-center rounded-[10px] lg:hidden', overHero ? 'text-white hover:bg-white/10' : 'text-forest-900 hover:bg-mist')}
          >
            {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <m.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-[72px] h-[calc(100dvh-72px)] overflow-y-auto border-t border-line bg-white lg:hidden"
          >
            <nav aria-label="Mobile" className="container-page flex flex-col py-4">
              {[...site.nav, { label: 'Check registration status', href: '/status' }].map((item) => (
                <Link key={item.href} to={item.href} className="flex items-center justify-between border-b border-line py-4 font-display text-2xl font-semibold text-forest-900">
                  {item.label}
                  <ArrowRight className="size-5 text-slate-400" aria-hidden />
                </Link>
              ))}
              <ButtonLink to="/register" size="lg" block className="mt-6">Register as an agent</ButtonLink>
            </nav>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function SiteFooter() {
  const { contact } = useConfig();
  const wa = whatsappLink(contact.whatsapp, 'Hello, I have a question about registering with APC Lagos.');
  const hasContact = contact.email || contact.phone || wa || contact.address;
  return (
    <footer id="contact" className="bg-forest-950 text-green-50/80">
      <AdireBand className="h-8 overflow-hidden opacity-90" />
      <div className="container-page grid gap-12 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-green-50/70">
            Registration for APC Lagos agents (Agent 1 and Agent 2) and collation officers (Ward and LGA) serving across Lagos State.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Registration</h2>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            <li><Link className="hover:text-white" to="/register">Register as an agent</Link></li>
            <li><Link className="hover:text-white" to="/status">Check registration status</Link></li>
            <li><Link className="hover:text-white" to="/#requirements">What you need</Link></li>
            <li><Link className="hover:text-white" to="/#faq">Questions and answers</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Contact</h2>
          {hasContact ? (
            <ul className="mt-4 space-y-3 text-[15px]">
              {contact.email && <li><a className="inline-flex items-center gap-2.5 hover:text-white" href={`mailto:${contact.email}`}><Mail className="size-4 text-gold-500" aria-hidden />{contact.email}</a></li>}
              {contact.phone && <li><a className="inline-flex items-center gap-2.5 hover:text-white" href={`tel:${contact.phone.replace(/\s/g, '')}`}><Phone className="size-4 text-gold-500" aria-hidden />{contact.phone}</a></li>}
              {wa && <li><a className="inline-flex items-center gap-2.5 hover:text-white" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="size-4 text-gold-500" aria-hidden />Message us on WhatsApp</a></li>}
              {contact.address && <li className="flex gap-2.5"><MapPin className="mt-1 size-4 shrink-0 text-gold-500" aria-hidden /><span>{contact.address}</span></li>}
            </ul>
          ) : (
            <p className="mt-4 text-[15px] text-green-50/70">Contact details for the coordination team will be published here. Everyone who registers is contacted by email.</p>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-sm text-green-50/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {site.brand.title}</p>
          <ul className="flex gap-5">
            <li><Link className="hover:text-white" to="/privacy">Privacy notice</Link></li>
            <li><Link className="hover:text-white" to="/terms">Terms of use</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function ServiceBanner() {
  const config = useConfig();
  if (!config.loaded) return null;
  if (!config.reachable) {
    return (
      <div className="container-page pt-4">
        <Alert tone="warning" title="We cannot reach the registration service right now">Check your internet connection. You can still read about registration.</Alert>
      </div>
    );
  }
  return null;
}

export function PublicLayout() {
  return (
    <>
      <ScrollManager />
      <SiteHeader />
      <ServiceBanner />
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
