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
  return (
    <>
      <h1 className="type-h2 text-forest-900">Privacy notice</h1>
      <p className="mt-3 text-sm text-slate-500">Version {privacyNotice.version}. This notice must be reviewed and approved by the data protection lead before launch.</p>
      <p className="type-lead mt-6 text-slate-600">This notice explains how the APC Lagos Digital Management System handles the personal information you give us when you register, in line with the Nigeria Data Protection Act 2023 (NDPA).</p>

      <Section title="What we collect">
        <p>Your name, date of birth, email address, phone number, state and LGA of origin, your role, and the location you will serve (an LGA; for a Ward Collation Officer, also the ward; for Agent 1 and Agent 2, also the ward and polling unit), with its INEC code and senatorial district.</p>
        <p>Your National Identification Number (NIN), Voter Identification Number (VIN), APC party registration number, and the bank name, account name and account number for any allowance due to you.</p>
        <p>We also collect a passport photograph and a photo or scan of your Permanent Voter Card (PVC){OPTIONAL_FIELDS.selfie ? ' and a selfie' : ''}. These are sensitive: they identify you and show your voter registration details.</p>
        <p>We do not ask for your home address, bank card details or PINs, passwords, location from your device, or information about your religion or ethnicity. Photo location data (GPS) is removed from JPEG images when they are uploaded.</p>
      </Section>
      <Section title="Why we use it, and on what basis">
        <p>To register you in the role you chose, verify that you are a registered voter, contact you about your registration, and coordinate one person per position (one Agent 1 and one Agent 2 per polling unit, one Ward Collation Officer per ward and one LGA Collation Officer per LGA).</p>
        <p>Your NIN, VIN and APC party registration number are used to confirm your identity, voter registration and party membership. Your bank details are used only to pay any allowance due to you for your role.</p>
        <p>We rely on your explicit consent, which you give separately for your documents and for your identification and bank details when you submit the form. You can withdraw it at any time.</p>
      </Section>
      <Section title="How your documents are checked">
        <p>When you upload a file, the system checks its format and content: that it really is a JPG, PNG, WebP or PDF file (not just named like one), that it is complete and of a usable size, and that a PDF contains no scripts or attachments. These checks do not prove that a voter’s card is authentic. Authorised staff review cards separately.</p>
        <p>The form checks only the format of your NIN, VIN, party registration number and account number. They are not verified with NIMC, INEC, APC or your bank, and the account name is not matched against the account number, unless an authorised verification service is connected and confirms them.</p>
      </Section>
      <Section title="Who can see it">
        <p>Only authorised staff, through a password-protected administration system. Your documents are kept in private storage, never at a public link, and every time a staff member opens your record or a document, it is logged. Data exports never include your documents. Your NIN, VIN, party registration number and bank details are encrypted when saved, appear masked to staff, and only administrators can reveal them in full, which is logged.</p>
        <p>We use service providers to host the website and database, store documents privately and send emails. Approved collation officers can sign in to see figures for their own ward or LGA, such as how many positions are filled; they cannot see your personal details or documents. They process data only on our instructions. We do not sell your information or share it for marketing.</p>
      </Section>
      <Section title="How long we keep it">
        <p>For the election period your registration was collected for, and up to 12 months after it, or after a registration is not approved. Your record and every document are then permanently deleted.</p>
      </Section>
      <Section title="Your rights">
        <p>You can ask to see, correct or delete your information, object to its use, or withdraw your consent. Contact the coordination team{contact.email ? <> at <a className="font-semibold text-green-700 underline underline-offset-4" href={`mailto:${contact.email}`}>{contact.email}</a></> : ''} with your registration reference. We will confirm the request comes from you before acting on it.</p>
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
        <p>This website lets people register with APC Lagos as Agent 1 or Agent 2 for a polling unit, as a Ward Collation Officer for a ward, or as an LGA Collation Officer for an LGA in Lagos State. Registering does not guarantee appointment or any payment.</p>
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
