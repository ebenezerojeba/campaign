import { useState } from 'react';
import { m } from 'framer-motion';
import { Check, Copy, MailCheck, MessageCircle, Search, UserPlus } from 'lucide-react';
import { Button, ButtonLink } from './ui/Button.jsx';
import { Alert } from './ui/Feedback.jsx';
import { AdireTile } from './brand/Adire.jsx';
import { useConfig, whatsappLink } from '../lib/config.jsx';
import { CONTACT_METHODS } from '../../../shared/options.js';

export function RegistrationSuccess({ result, onReset }) {
  const { contact } = useConfig();
  const [copied, setCopied] = useState(false);
  const wa = whatsappLink(contact.whatsapp, `Hello, I just registered as a volunteer. My reference is ${result.reference}.`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable: the reference is selectable text.
    }
  };

  return (
    <div className="bg-mist py-10 sm:py-16">
      <div className="container-page max-w-3xl">
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden rounded-[var(--radius-xl)] border border-line bg-white shadow-soft">
          <div className="relative bg-forest-900 px-6 pb-10 pt-10 text-white sm:px-10">
            <div className="absolute inset-y-0 right-0 flex w-40 opacity-30 sm:w-56" aria-hidden>
              <AdireTile motif="sun" palette="deep" className="h-full w-full" />
            </div>
            <m.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 18 }} className="relative flex size-14 items-center justify-center rounded-full bg-gold-500 text-forest-950">
              <Check className="size-8" strokeWidth={3} aria-hidden />
            </m.span>
            <h1 className="type-h2 relative mt-6" tabIndex={-1}>Thank you, {result.firstName}. Your application is in.</h1>
            <p className="type-lead relative mt-3 max-w-xl text-green-50/85">Keep your registration reference. You will need it, with your phone number, to check your status.</p>
          </div>

          <div className="px-6 py-8 sm:px-10">
            <div className="flex flex-col gap-4 rounded-xl border-2 border-dashed border-green-600/40 bg-green-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Your registration reference</p>
                <p className="mt-1 select-all font-mono text-3xl font-bold tracking-wider text-forest-900 sm:text-4xl" aria-live="polite">{result.reference}</p>
              </div>
              <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy reference'}</Button>
            </div>

            {result.confirmationEmail === 'sent' && (
              <Alert tone="success" className="mt-5" title="Confirmation email sent">We sent your reference to {result.email}. If it is not in your inbox, check your spam folder.</Alert>
            )}
            {result.confirmationEmail === 'failed' && (
              <Alert tone="warning" className="mt-5" title="We could not send your confirmation email">Your application is saved. Write down or screenshot your reference above.</Alert>
            )}

            <h2 className="mt-10 font-display text-2xl font-semibold text-forest-900">What happens next</h2>
            <ol className="mt-5 space-y-5">
              {[
                ['The programme team reviews your application.', 'Applications are reviewed in the order they arrive.'],
                [`We contact you ${CONTACT_METHODS.find((c) => c.value === result.contactMethod)?.phrase ?? 'by your preferred method'}.`, 'You will hear from us when there is a decision and with details of activities that match your interests.'],
                ['Check your status at any time.', 'Use your reference and phone number on the status page.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest-900 text-sm font-bold text-gold-500">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-ink">{title}</p>
                    <p className="mt-0.5 text-[15px] text-slate-600">{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink to="/status" variant="primary" icon={Search}>Check application status</ButtonLink>
              {wa && <ButtonLink href={wa} target="_blank" rel="noreferrer" variant="secondary" icon={MessageCircle}>Message the team on WhatsApp</ButtonLink>}
              {result.confirmationEmail === 'sent' && <ButtonLink to="/portal" variant="secondary" icon={MailCheck}>Volunteer sign in</ButtonLink>}
              <Button variant="ghost" icon={UserPlus} onClick={onReset}>Register someone else on this device</Button>
            </div>
          </div>
        </m.div>
      </div>
    </div>
  );
}
