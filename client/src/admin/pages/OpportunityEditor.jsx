import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { ArrowLeft, Save, Send, EyeOff, Archive, ImageUp } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { Card, PageHeader } from '../ui.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField, TextArea, SelectField, ChoiceGroup, Checkbox } from '../../components/ui/Field.jsx';
import { Alert, Badge, Dialog, ErrorState, Skeleton, StatusBadge } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { OPP_STATUS } from './Opportunities.jsx';
import { LGA_NAMES } from '../../../../shared/lagos.js';
import { INTERESTS, SKILLS } from '../../../../shared/options.js';

const EMPTY = {
  title: '', summary: '', description: '', category: '', skills: [], eligibility: '',
  location: { lga: '', venue: '', isRemote: false }, startDate: '', endDate: '', commitment: '', capacity: '',
  coverImage: { url: '', alt: '' }, status: 'draft',
};

const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function toForm(o) {
  return {
    ...EMPTY, ...o,
    location: { ...EMPTY.location, ...(o.location ?? {}) },
    coverImage: { url: o.coverImage?.url ?? '', alt: o.coverImage?.alt ?? '', publicId: o.coverImage?.publicId },
    startDate: toInputDate(o.startDate), endDate: toInputDate(o.endDate), capacity: o.capacity ?? '',
  };
}

function toPayload(v, status) {
  const payload = {
    title: v.title, summary: v.summary, description: v.description, category: v.category, skills: v.skills, eligibility: v.eligibility,
    location: { lga: v.location.isRemote ? '' : v.location.lga, venue: v.location.isRemote ? '' : v.location.venue, isRemote: v.location.isRemote },
    startDate: v.startDate || null, endDate: v.endDate || null, commitment: v.commitment,
    capacity: v.capacity === '' ? null : Number(v.capacity), status,
  };
  if (v.coverImage?.url) payload.coverImage = { url: v.coverImage.url, alt: v.coverImage.alt, ...(v.coverImage.publicId ? { publicId: v.coverImage.publicId } : {}) };
  else payload.coverImage = { url: '', alt: '' };
  return payload;
}

export default function OpportunityEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { api, base, user } = useAdmin();
  const navigate = useNavigate();
  const notify = useToast();
  const manage = can(user, 'opportunities:manage');
  const [loadState, setLoadState] = useState({ loading: !isNew, error: null, item: null });
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { register, control, handleSubmit, reset, watch, setValue, setError: setFieldError, formState: { errors } } = useForm({ defaultValues: EMPTY });

  useEffect(() => {
    if (isNew) return;
    api.get(`/opportunities/${id}`)
      .then((item) => { reset(toForm(item)); setLoadState({ loading: false, error: null, item }); })
      .catch((err) => setLoadState({ loading: false, error: err, item: null }));
  }, [id, isNew, api, reset]);

  const save = (status) => handleSubmit(async (values) => {
    setSaving(status);
    setError(null);
    try {
      const payload = toPayload(values, status);
      const saved = isNew ? await api.post('/opportunities', payload) : await api.patch(`/opportunities/${id}`, payload);
      notify(status === 'published' ? 'Opportunity published' : status === 'draft' && loadState.item?.status === 'published' ? 'Opportunity unpublished' : 'Opportunity saved');
      if (isNew) navigate(`${base}/opportunities/${saved._id}`, { replace: true });
      else { reset(toForm(saved)); setLoadState((s) => ({ ...s, item: { ...s.item, ...saved } })); }
    } catch (err) {
      Object.entries(err.fields ?? {}).forEach(([name, message]) => setFieldError(name, { message }));
      setError(err.message);
    } finally {
      setSaving(null);
    }
  })();

  const archive = async () => {
    try {
      await api.del(`/opportunities/${id}`);
      notify('Opportunity archived');
      navigate(`${base}/opportunities`);
    } catch (err) {
      setError(err.message);
      setConfirmArchive(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setUploading(true);
    try {
      const image = await api.upload('/uploads/image', fd);
      setValue('coverImage.url', image.url, { shouldDirty: true });
      setValue('coverImage.publicId', image.publicId);
      notify('Image uploaded');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loadState.loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>;
  if (loadState.error) return <ErrorState error={loadState.error} />;

  const status = loadState.item?.status ?? 'draft';
  const remote = watch('location.isRemote');
  const cover = watch('coverImage.url');
  const readOnly = !manage;

  return (
    <>
      <PageHeader
        title={isNew ? 'New opportunity' : loadState.item.title}
        description={!isNew && <span className="flex items-center gap-2"><Badge tone={OPP_STATUS[status].tone}>{OPP_STATUS[status].label}</Badge>{loadState.item.isSample && <Badge tone="sample">Sample</Badge>}</span>}
        actions={manage && (
          <>
            {!isNew && status !== 'archived' && <Button variant="dangerSoft" icon={Archive} onClick={() => setConfirmArchive(true)}>Archive</Button>}
            {status === 'published'
              ? <Button variant="secondary" icon={EyeOff} loading={saving === 'draft'} onClick={() => save('draft')}>Unpublish</Button>
              : <Button variant="secondary" icon={Save} loading={saving === 'draft'} onClick={() => save('draft')}>Save draft</Button>}
            <Button icon={Send} loading={saving === 'published'} onClick={() => save('published')}>{status === 'published' ? 'Save changes' : 'Publish'}</Button>
          </>
        )}
      >
        <Link to={`${base}/opportunities`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline"><ArrowLeft className="size-4" aria-hidden />All opportunities</Link>
      </PageHeader>

      {error && <Alert tone="error" className="mb-6" title="The opportunity was not saved">{error}</Alert>}

      <fieldset disabled={readOnly} className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Description">
            <div className="grid gap-5">
              <TextField label="Title" error={errors.title?.message} {...register('title', { required: 'Add a title', minLength: { value: 3, message: 'Add a title' } })} />
              <TextField label="Summary" hint="One or two sentences shown on cards (up to 280 characters)." maxLength={280} error={errors.summary?.message} {...register('summary', { required: 'Add a short summary', minLength: { value: 10, message: 'Add a short summary' } })} />
              <SelectField label="Category" placeholder="Choose a category" options={INTERESTS} error={errors.category?.message} {...register('category', { required: 'Choose a category' })} />
              <Controller control={control} name="description" render={({ field }) => <TextArea label="Full description" optional rows={6} maxLength={4000} {...field} />} />
              <Controller control={control} name="eligibility" render={({ field }) => <TextArea label="Who can take part" optional rows={3} maxLength={1000} hint="Eligibility requirements, for example age or language." {...field} />} />
              <Controller control={control} name="skills" render={({ field }) => <ChoiceGroup legend="Useful skills" optional options={SKILLS} value={field.value} onChange={field.onChange} />} />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="When and where">
            <div className="grid gap-5">
              <Controller control={control} name="location.isRemote" render={({ field }) => <Checkbox checked={field.value} onChange={field.onChange}>This activity is remote</Checkbox>} />
              {!remote && (
                <>
                  <SelectField label="LGA" optional placeholder="Any or several LGAs" options={LGA_NAMES.map((l) => ({ value: l, label: l }))} {...register('location.lga')} />
                  <TextField label="Venue" optional {...register('location.venue')} />
                </>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Start date" optional type="date" {...register('startDate')} />
                <TextField label="End date" optional type="date" error={errors.endDate?.message} {...register('endDate')} />
              </div>
              <TextField label="Time commitment" optional placeholder="For example, two Saturdays a month" {...register('commitment')} />
              <TextField label="Volunteers needed" optional type="number" min="0" inputMode="numeric" {...register('capacity')} />
            </div>
          </Card>
          <Card title="Cover image" description="Use only approved photography.">
            <div className="grid gap-4">
              {cover && <img src={cover} alt="" className="aspect-[16/7] w-full rounded-lg object-cover" />}
              <TextField label="Image link" optional placeholder="https://…" error={errors.coverImage?.url?.message} {...register('coverImage.url')} />
              <TextField label="Image description (alt text)" optional {...register('coverImage.alt')} />
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 py-2.5 text-sm font-semibold text-forest-900 hover:bg-mist has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold-500/50">
                <ImageUp className="size-4" aria-hidden />{uploading ? 'Uploading…' : 'Upload an image'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              <p className="text-xs text-slate-500">JPG, PNG or WebP up to 5 MB. Uploads need Cloudinary to be configured.</p>
            </div>
          </Card>
          {!isNew && loadState.item.volunteers?.length > 0 && (
            <Card title="Volunteers" bodyClassName="py-2">
              <ul className="divide-y divide-line">
                {loadState.item.volunteers.map((v) => (
                  <li key={v._id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <Link to={`${base}/volunteers/${v._id}`} className="font-medium text-forest-900 hover:underline">{v.firstName} {v.lastName}</Link>
                    <span className="flex items-center gap-2"><StatusBadge status={v.status} /><Badge tone={v.assignment?.status === 'assigned' ? 'approved' : 'info'}>{v.assignment?.status}</Badge></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </fieldset>

      <Dialog open={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive this opportunity?" footer={<><Button variant="secondary" onClick={() => setConfirmArchive(false)}>Cancel</Button><Button variant="danger" icon={Archive} onClick={archive}>Archive</Button></>}>
        <p className="text-[15px] text-slate-600">It will be removed from the public site and volunteer accounts. Volunteer assignments are kept for the record.</p>
      </Dialog>
    </>
  );
}
