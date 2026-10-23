import { Link } from 'react-router';
import { privacyNotice } from '../content/site.js';
import { useConfig } from '../lib/config.jsx';
import { OPTIONAL_FIELDS } from '../../../shared/agentForm.js';

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
  const extra = [OPTIONAL_FIELDS.nin && 'National Identification Number (NIN)', OPTIONAL_FIELDS.selfie && 'a selfie'].filter(Boolean);
  return (
    <>
      <h1 className="type-h2 text-forest-900">Privacy notice</h1>
      <p className="mt-3 text-sm text-slate-500">Version {privacyNotice.version}. This notice must be reviewed and approved by the data protection lead before launch.</p>
      <p className="type-lead mt-6 text-slate-600">This notice explains how APC Lagos Polling Unit Agent Registration handles the personal information you give us, in line with the Nigeria Data Protection Act 2023 (NDPA).</p>

      <Section title="What we collect">
        <p>Your name, email address, phone number{OPTIONAL_FIELDS.dateOfBirth ? ', date of birth' : ''}, state and LGA of origin{extra.length ? `, ${extra.join(', ')}` : ''}, your agent category, and the LGA, ward and polling unit you will serve, with its INEC code and senatorial district.</p>
        {!OPTIONAL_FIELDS.financialIdentityDetails && <p>Bank account and additional identification-number fields are not currently collected. They will remain off until the programme approves and publishes their specific purposes and handling in this notice.</p>}
        {OPTIONAL_FIELDS.financialIdentityDetails && <p>Bank account and identification details are collected only for the purposes specifically approved and described by the programme in this notice. Account-format checks do not verify account ownership, and identification numbers are not verified unless an authorised service confirms them.</p>}
        <p>We also collect a passport photograph and a photo or scan of your Permanent Voter Card (PVC){OPTIONAL_FIELDS.selfie ? ' and a selfie' : ''}. These are sensitive: they identify you and show your voter registration details.</p>
        <p>We do not ask for bank details, your home address, location from your device, or information about your religion or ethnicity. Photo location data (GPS) is removed from JPEG images when they are uploaded.</p>
      </Section>
      <Section title="Why we use it, and on what basis">
        <p>To register you as a polling unit agent, confirm that you meet the minimum age requirement, verify that you are a registered voter at the polling unit you will serve, contact you about your registration, and coordinate agents per polling unit. We rely on your explicit consent, which you give when you submit the form. You can withdraw it at any time.</p>
      </Section>
      <Section title="How your documents are checked">
        <p>When you upload a file, the system checks its format and content: that it really is a JPG, PNG, WebP or PDF file (not just named like one), that it is complete and of a usable size, and that a PDF contains no scripts or attachments. These checks do not prove that a voter’s card is authentic. Authorised staff review cards separately.</p>
      </Section>
      <Section title="Who can see it">
        <p>Only authorised registration staff, through a password-protected administration system. Your documents are stored in a protected database, never at a public link, and every time a staff member opens your record or a document, it is logged. Data exports never include your documents{OPTIONAL_FIELDS.nin ? ' or NIN' : ''}.{OPTIONAL_FIELDS.nin ? ' Your NIN is encrypted, and revealing it is logged.' : ''}</p>
        <p>We use service providers to host the website and database and to send emails. They process data only on our instructions. We do not sell your information or share it for marketing.</p>
      </Section>
      <Section title="How long we keep it">
        <p>For the election period your registration was collected for, and up to 12 months after it, or after a registration is not approved. Your record and every document are then permanently deleted.</p>
      </Section>
      <Section title="Your rights">
        <p>You can ask to see, correct or delete your information, object to its use, or withdraw your consent. Contact the registration team{contact.email ? <> at <a className="font-semibold text-green-700 underline underline-offset-4" href={`mailto:${contact.email}`}>{contact.email}</a></> : ''} with your registration reference. We will confirm the request comes from you before acting on it.</p>
        <p>You may also complain to the Nigeria Data Protection Commission (NDPC).</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 className="type-h2 text-forest-900">Terms of use</h1>
      <p className="mt-3 text-sm text-slate-500">These terms must be reviewed before launch.</p>
      <Section title="Using this website">
        <p>This website lets people register as an agent, canvasser, mobilizer or polling unit agent for a polling unit in Lagos State. Registering does not guarantee appointment or any payment.</p>
      </Section>
      <Section title="Your information and documents">
        <p>Register only yourself, give accurate information, and upload only your own passport photograph and voter’s card. Submitting another person’s documents, or altered documents, is not allowed and will lead to your registration being rejected. Our <Link to="/privacy" className="font-semibold text-green-700 underline underline-offset-4">privacy notice</Link> explains how your information is used.</p>
      </Section>
      <Section title="Acceptable use">
        <p>Do not attempt to access records that are not yours, interfere with the service, or submit registrations automatically.</p>
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
