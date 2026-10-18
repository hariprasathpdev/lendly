import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, uploadItemPhotos } from '../../services/api.js';

const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const dateField = z.string()
  .refine((value) => value === '' || isCalendarDate(value), 'Enter a valid calendar date.')
  .transform((value) => value || null);
const formSchema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(120),
  description: z.string().trim().min(10, 'Add a little more detail.').max(5000),
  categoryId: z.string().uuid('Choose a category.'),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  pricePerDay: z.coerce.number().finite().min(0).max(1000000),
  depositAmount: z.coerce.number().finite().min(0).max(1000000),
  lateFeePerDay: z.coerce.number().finite().min(0).max(1000000),
  handoverLocation: z.string().trim().min(2).max(160),
  rules: z.string().trim().max(2000).transform((value) => value || null),
  availableFrom: dateField,
  availableUntil: dateField,
}).strict().refine(
  (value) => !value.availableFrom || !value.availableUntil || value.availableUntil >= value.availableFrom,
  { path: ['availableUntil'], message: 'The end date must be on or after the start date.' },
);

const defaults = {
  title: '', description: '', categoryId: '', condition: 'good', pricePerDay: 0,
  depositAmount: 0, lateFeePerDay: 0, handoverLocation: 'Kongu campus', rules: '',
  availableFrom: '', availableUntil: '',
};
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const maxFileSize = 5 * 1024 * 1024;

function Field({ label, name, register, errors, type = 'text', ...props }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input type={type} aria-invalid={Boolean(errors[name])} {...register(name)} {...props} />
      {errors[name] && <small role="alert">{errors[name].message}</small>}
    </label>
  );
}

export default function ListingFormPage() {
  const { id } = useParams();
  const edit = Boolean(id);
  const navigate = useNavigate();
  const previewUrls = useRef(new Set());
  const {
    register, handleSubmit, reset, setError, clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: defaults });
  const [categories, setCategories] = useState([]);
  const [categoryState, setCategoryState] = useState({ loaded: false, error: null });
  const [record, setRecord] = useState({ id: null, item: null, error: null });
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState(null);
  const [progress, setProgress] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest('/categories')
      .then((data) => {
        if (active) {
          setCategories(data);
          setCategoryState({ loaded: true, error: null });
        }
      })
      .catch((error) => {
        if (active) setCategoryState({ loaded: true, error });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!edit) return undefined;
    let active = true;
    apiRequest(`/items/${id}`)
      .then((item) => {
        if (active) {
          setRecord({ id, item, error: null });
          reset({
            ...defaults,
            title: item.title,
            description: item.description,
            categoryId: item.category?.id ?? '',
            condition: item.condition,
            pricePerDay: item.pricePerDay,
            depositAmount: item.depositAmount,
            lateFeePerDay: item.lateFeePerDay,
            handoverLocation: item.handoverLocation,
            rules: item.rules ?? '',
            availableFrom: item.availableFrom ?? '',
            availableUntil: item.availableUntil ?? '',
          });
        }
      })
      .catch((error) => {
        if (active) setRecord({ id, item: null, error });
      });
    return () => { active = false; };
  }, [edit, id, reset]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  function selectFiles(event) {
    const selected = Array.from(event.target.files ?? []);
    const allowed = selected.filter((file) => imageTypes.includes(file.type) && file.size <= maxFileSize);
    const savedPhotoCount = record.item?.photos?.length ?? 0;
    const remaining = Math.max(0, 10 - savedPhotoCount - files.length);
    const added = allowed.slice(0, remaining).map((file) => {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return { file, url };
    });
    if (added.length) setFiles((current) => [...current, ...added]);
    if (selected.length !== allowed.length || allowed.length > remaining) {
      setMessage({ kind: 'error', text: 'Use JPG, PNG, WebP, or AVIF photos up to 5 MB each. A listing can have up to ten photos.' });
    } else {
      setMessage(null);
    }
    event.target.value = '';
  }

  function removeFile(index) {
    setFiles((current) => {
      const removed = current[index];
      if (removed) {
        URL.revokeObjectURL(removed.url);
        previewUrls.current.delete(removed.url);
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  async function removePhoto(photo) {
    if (!window.confirm('Remove this photo from the listing?')) return;
    try {
      await apiRequest(`/items/${id}/photos/${photo.id}`, { method: 'DELETE' });
      setRecord((current) => ({
        ...current,
        item: { ...current.item, photos: current.item.photos.filter((item) => item.id !== photo.id) },
      }));
      setMessage({ kind: 'success', text: 'Photo removed.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    }
  }

  async function refreshListing(listingId) {
    try {
      const item = await apiRequest(`/items/${listingId}`);
      setRecord({ id: listingId, item, error: null });
    } catch (error) {
      setRecord({ id: listingId, item: null, error });
    }
  }

  async function submit(values) {
    setMessage(null);
    clearErrors();
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field) setError(field, { type: 'validate', message: issue.message });
      }
      return;
    }
    if (!categoryState.loaded || categoryState.error) {
      setMessage({ kind: 'error', text: categoryState.error?.message ?? 'Categories are still loading.' });
      return;
    }
    if (files.length + (record.item?.photos?.length ?? 0) > 10) {
      setMessage({ kind: 'error', text: 'A listing can have up to ten photos.' });
      return;
    }

    setSaving(true);
    try {
      const listing = edit
        ? await apiRequest(`/items/${id}`, { method: 'PATCH', body: parsed.data })
        : await apiRequest('/items', { method: 'POST', body: parsed.data });

      if (!edit) navigate(`/my-listings/${listing.id}/edit`, { replace: true });
      if (files.length) {
        setProgress(0);
        try {
          await uploadItemPhotos(listing.id, files.map(({ file }) => file), setProgress);
        } catch (error) {
          const uploadedCount = Math.max(0, Math.min(files.length, error.uploadedCount ?? 0));
          for (const { url } of files.slice(0, uploadedCount)) {
            URL.revokeObjectURL(url);
            previewUrls.current.delete(url);
          }
          setFiles((current) => current.slice(uploadedCount));
          await refreshListing(listing.id);
          setMessage({ kind: 'error', text: `Listing saved for review, but photo upload failed: ${error.message} Try the remaining photos again.` });
          return;
        }
      }
      navigate('/my-listings', { replace: true });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  if (edit && record.id !== id) {
    return (
      <main className="info">
        {record.error ? <><h1>We couldn’t load this listing.</h1><p>{record.error.message}</p><Link className="button" to="/my-listings">Back to my listings</Link></> : <p>Loading your listing…</p>}
      </main>
    );
  }

  return (
    <main id="main" className="form-page wrap">
      <Link className="back-link" to="/my-listings">← Back to my listings</Link>
      <div className="form-page-heading">
        <div className="eyebrow">SHARE SOMETHING USEFUL</div>
        <h1>{edit ? 'Edit your listing' : 'List an item'}</h1>
        <p>{edit ? 'Changes to the listing go back to moderation review.' : 'Tell campus borrowers what they need to know before requesting your item.'}</p>
      </div>

      <form className="listing-form" onSubmit={handleSubmit(submit)} noValidate>
        <div className="form-section">
          <h2>Item details</h2>
          <div className="form-grid">
            <Field label="Item title" name="title" register={register} errors={errors} maxLength={120} placeholder="For example, scientific calculator" />
            <label className="form-field">
              <span>Category</span>
              <select aria-invalid={Boolean(errors.categoryId)} {...register('categoryId')}>
                <option value="">Choose a category</option>
                {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
              {errors.categoryId && <small role="alert">{errors.categoryId.message}</small>}
              {categoryState.error && <small role="alert">Categories could not be loaded: {categoryState.error.message}</small>}
            </label>
            <label className="form-field full-width">
              <span>Description</span>
              <textarea rows="5" maxLength={5000} aria-invalid={Boolean(errors.description)} placeholder="Describe condition, what's included, and anything a borrower should know." {...register('description')} />
              {errors.description && <small role="alert">{errors.description.message}</small>}
            </label>
            <label className="form-field">
              <span>Condition</span>
              <select {...register('condition')}><option value="new">New</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair</option></select>
            </label>
            <Field label="Campus handover location" name="handoverLocation" register={register} errors={errors} placeholder="Library entrance" />
          </div>
        </div>

        <div className="form-section">
          <h2>Borrowing terms</h2>
          <div className="form-grid">
            <Field label="Price per day (₹)" name="pricePerDay" register={register} errors={errors} type="number" min="0" step="0.01" />
            <Field label="Refundable deposit requested (₹)" name="depositAmount" register={register} errors={errors} type="number" min="0" step="0.01" />
            <Field label="Late fee per day (₹)" name="lateFeePerDay" register={register} errors={errors} type="number" min="0" step="0.01" />
            <Field label="Available from" name="availableFrom" register={register} errors={errors} type="date" />
            <Field label="Available until" name="availableUntil" register={register} errors={errors} type="date" />
            <label className="form-field full-width">
              <span>Rules and instructions <small className="optional-label">Optional</small></span>
              <textarea rows="3" maxLength={2000} placeholder="Pickup instructions, safe-use notes, or return expectations." {...register('rules')} />
            </label>
          </div>
          <div className="policy-note"><b>Payment note:</b> The app is currently in setup mode. A displayed deposit is not escrowed and no real payment or late fee is collected.</div>
        </div>

        <div className="form-section">
          <h2>Photos</h2>
          <p className="form-help">Add up to ten JPG, PNG, WebP, or AVIF photos. Up to 5 MB per image.</p>
          <label className="upload-picker">
            <span>Choose photos</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={saving} onChange={selectFiles} />
          </label>
          <div className="preview-grid">
            {(record.item?.photos ?? []).filter((photo) => photo.url).map((photo) => (
              <div className="photo-preview" key={photo.id}>
                <img src={photo.url} alt="Current listing" />
                <button type="button" aria-label="Remove photo" disabled={saving} onClick={() => removePhoto(photo)}>×</button>
              </div>
            ))}
            {files.map(({ file, url }, index) => (
              <div className="photo-preview" key={url}>
                <img src={url} alt={`Preview of ${file.name}`} />
                <button type="button" aria-label={`Remove ${file.name}`} disabled={saving} onClick={() => removeFile(index)}>×</button>
              </div>
            ))}
          </div>
          {progress !== null && <div className="upload-progress" role="status"><progress value={progress} max="100" /><span>Uploading photos: {progress}%</span></div>}
        </div>

        {message && <div className={`form-alert ${message.kind}`} role="status">{message.text}</div>}
        <div className="form-actions">
          <button className="button" disabled={isSubmitting || saving || Boolean(categoryState.error)}>
            {saving ? 'Saving…' : edit ? 'Save changes' : 'Create listing'} <span aria-hidden="true">→</span>
          </button>
          <span>{edit ? 'Changes require moderation review.' : 'New listings are reviewed before they appear in search.'}</span>
        </div>
      </form>
    </main>
  );
}
