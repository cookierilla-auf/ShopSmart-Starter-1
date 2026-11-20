import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Only same-site paths are accepted as the return address, so ?next= cannot send a customer to another site.
const safeNext = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/orders');

function AuthForm({ title, submitLabel, fields, onSubmit }) {
  const [values, setValues] = useState(Object.fromEntries(fields.map((field) => [field.name, ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await onSubmit(values); }
    catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} aria-label={title}>
      <h2>{title}</h2>
      <StatusMessage type="error">{error}</StatusMessage>
      {fields.map((field) => (
        <label key={field.name}>{field.label}
          <input {...field} value={values[field.name]} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
        </label>
      ))}
      <button disabled={busy}>{busy ? 'Please wait…' : submitLabel}</button>
    </form>
  );
}

export default function AccountPage() {
  const { customer, checking, login, register, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;

  if (customer) return (
    <section className="account-card">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Signed in as {customer.name}</h1>
      <p>{customer.email}</p>
      <div className="card-actions">
        <Link className="button" to="/orders">View my orders</Link>
        <button type="button" className="danger" onClick={logout}>Sign out</button>
      </div>
    </section>
  );

  const email = { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email', required: true };
  return (
    <section>
      <p className="eyebrow">ACCOUNT</p>
      <h1>Sign in to check out and see your orders</h1>
      <p className="notice-fictional"><strong>Demo site:</strong> use a fictional name and email (for example <em>ana.santos@example.com</em>) and a password you do not use anywhere else.</p>
      <div className="account-layout">
        <AuthForm title="Sign in" submitLabel="Sign in"
          fields={[email, { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password', required: true }]}
          onSubmit={async (values) => { await login(values); navigate(next); }} />
        <AuthForm title="Create a test account" submitLabel="Create account"
          fields={[
            { name: 'name', label: 'Full name', autoComplete: 'name', minLength: 2, maxLength: 80, required: true },
            email,
            { name: 'password', label: 'Password (8 or more characters)', type: 'password', autoComplete: 'new-password', minLength: 8, maxLength: 72, required: true }
          ]}
          onSubmit={async (values) => { await register(values); navigate(next); }} />
      </div>
    </section>
  );
}
