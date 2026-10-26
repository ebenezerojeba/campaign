import { AdireTile } from '../components/brand/Adire.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';

export default function NotFound() {
  return (
    <div className="container-page grid min-h-[60vh] items-center gap-10 py-16 md:grid-cols-[1fr_280px]">
      <div>
        <h1 className="type-h2 text-forest-900">This page could not be found</h1>
        <p className="type-lead mt-4 max-w-lg text-slate-600">The link may be out of date. You can register, check an application or return to the home page.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/">Go to the home page</ButtonLink>
          <ButtonLink to="/register" variant="secondary">Register</ButtonLink>
        </div>
      </div>
      <div className="hidden grid-cols-2 gap-2 md:grid" aria-hidden>
        {[['oniko', 'forest'], ['dots', 'gold'], ['lagoon', 'green'], ['leaf', 'mist']].map(([mo, p]) => <AdireTile key={mo} motif={mo} palette={p} className="aspect-square rounded-xl" />)}
      </div>
    </div>
  );
}
