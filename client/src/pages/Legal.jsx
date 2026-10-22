import { Link } from 'react-router';
import { privacyNotice } from '../content/site.js';
import { useConfig } from '../lib/config.jsx';

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-semibold text-forest-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[16px] leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

function Privacy() {
  const { contact } = useConfig();
  return (
    <>
      <h1 className="type-h2 text-forest-900">Privacy notice</h1>
      <p className="mt-3 text-sm text-slate-500">Version {privacyNotice.version}. This notice must be reviewed by the programme’s data protection lead before launch.</p>
      <p className="type-lead mt-6 text-slate-600">This notice explains how the APC Lagos Volunteer Programme handles the personal information you give us, in line with the Nigeria Data Protection Act 2023.</p>

      <Section title="What we collect">
        <p>Your name, phone number, optional email address, preferred contact method, local government area (and optionally your development area, ward and community), the activities you are interested in, your skills and availability, and anything you choose to tell us about why you want to volunteer.</p>
        <p>We do not ask for your voter card, identity documents, bank details, exact address, location from your device, or information about your religion, ethnicity or voting intention.</p>
      </Section>
      <Section title="Why we use it">
        <p>To register you as a volunteer, review your application, contact you about the programme, match you with suitable activities and produce anonymous totals (for example, the number of volunteers per local government area). We rely on your consent, which you give when you submit the form.</p>
        <p>If you opt in, we will also send you news about upcoming activities. You can opt out at any time.</p>
      </Section>
      <Section title="Who can see it">
        <p>Only authorised programme staff, through a password-protected administration system. Every administrative action, including viewing and exporting records, is logged. We use service providers to host the database and send emails; they process data only on our instructions. We do not sell your information.</p>
      </Section>
      <Section title="How long we keep it">
        <p>While you remain a volunteer, and for up to 12 months after you leave the programme or after an application is not approved. After that, your record is deleted.</p>
      </Section>
      <Section title="Your rights">
        <p>You can ask to see, correct, export or delete your information, or withdraw your consent. Registered volunteers with an email address can do this from their <Link to="/portal" className="font-semibold text-green-700 underline underline-offset-4">volunteer account</Link>. Otherwise, contact the programme team{contact.email ? <> at <a className="font-semibold text-green-700 underline underline-offset-4" href={`mailto:${contact.email}`}>{contact.email}</a></> : ''} with your registration reference.</p>
        <p>You may also complain to the Nigeria Data Protection Commission.</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 className="type-h2 text-forest-900">Terms of use</h1>
      <p className="mt-3 text-sm text-slate-500">These terms must be reviewed by the programme before launch.</p>
      <Section title="Using this website">
        <p>This website lets residents of Lagos State register interest in volunteering with the APC Lagos Volunteer Programme. Registering does not guarantee a volunteer role or any payment.</p>
      </Section>
      <Section title="Your information">
        <p>Please give accurate information and register only yourself, unless you are helping someone who has agreed to register. Our <Link to="/privacy" className="font-semibold text-green-700 underline underline-offset-4">privacy notice</Link> explains how your information is used.</p>
      </Section>
      <Section title="Acceptable use">
        <p>Do not attempt to access records that are not yours, interfere with the service, or submit registrations automatically. Volunteering is unpaid and voluntary, and you may withdraw at any time.</p>
      </Section>
    </>
  );
}

export default function Legal({ page }) {
  return (
    <div className="py-12 sm:py-20">
      <div className="container-page max-w-3xl">{page === 'privacy' ? <Privacy /> : <Terms />}</div>
    </div>
  );
}
