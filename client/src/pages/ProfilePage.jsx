import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

export default function ProfilePage() {
  const [retryCount, setRetryCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, profile: null, error: null });
  const requestKey = String(retryCount);

  useEffect(() => {
    let active = true;
    apiRequest('/me')
      .then((profile) => {
        if (active) setResult({ key: requestKey, profile, error: null });
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, profile: null, error });
      });
    return () => { active = false; };
  }, [requestKey]);

  const loading = result.key !== requestKey;
  if (loading) return <main className="info" aria-live="polite"><p>Loading your profile…</p></main>;
  if (result.error) {
    return (
      <main className="info" role="alert">
        <div className="eyebrow">YOUR ACCOUNT</div><h1>We couldn’t load your profile.</h1>
        <p>{result.error.message}</p>
        <button className="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
      </main>
    );
  }

  const { profile } = result;
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get('fullName') ?? '').trim();
    const studentId = String(form.get('studentId') ?? '').trim();
    try {
      const updated = await apiRequest('/me', {
        method: 'PATCH',
        body: { full_name: fullName, student_id: studentId || null },
      });
      setResult((current) => ({ ...current, profile: { ...current.profile, ...updated } }));
      setNotice({ kind: 'success', text: 'Your profile has been saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main" className="form-page wrap">
      <Link className="back-link" to="/dashboard">← Back to dashboard</Link>
      <div className="form-page-heading">
        <div className="eyebrow">YOUR ACCOUNT</div><h1>Manage your profile.</h1>
        <p>Your college email and account role are managed by Lendly.</p>
      </div>
      <form className="listing-form" onSubmit={save}>
        <div className="form-section">
          <h2>Student profile</h2>
          <div className="form-grid">
            <label className="form-field"><span>Full name</span><input name="fullName" autoComplete="name" required minLength={2} maxLength={100} defaultValue={profile.fullName} /></label>
            <label className="form-field"><span>College email</span><input type="email" value={profile.email} readOnly disabled /></label>
            <label className="form-field"><span>Student ID <small className="optional-label">Optional</small></span><input name="studentId" maxLength={80} defaultValue={profile.studentId ?? ''} /></label>
            <label className="form-field"><span>Account role</span><input value={profile.role === 'admin' ? 'Administrator' : 'Student'} readOnly disabled /></label>
          </div>
          <div className="policy-note"><b>Verified college account.</b> You accepted Lendly’s current Terms and Privacy Policy {profile.termsAcceptedAt ? `on ${new Date(profile.termsAcceptedAt).toLocaleDateString()}.` : 'during registration.'}</div>
        </div>
        {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
        <div className="form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} <span aria-hidden="true">→</span></button></div>
      </form>
    </main>
  );
}
