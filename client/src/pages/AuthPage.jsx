import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import PageContainer from '../components/layout/PageContainer.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function safeReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

export default function AuthPage({ mode }) {
  const registering = mode === 'register';
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [localError, setLocalError] = useState('');
  const returnTo = safeReturnPath(location.state?.from);

  // Reflect the selected auth mode in the browser tab title.
  useEffect(() => { document.title = `${registering ? 'Create account' : 'Sign in'} | UrbanKart`; }, [registering]);
  // After successful auth, return to the safe in-app destination requested by the visitor.
  useEffect(() => { if (auth.isAuthenticated) navigate(returnTo, { replace: true }); }, [auth.isAuthenticated, navigate, returnTo]);

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setLocalError('');
    if (auth.error) auth.clearError();
  };

  const submit = async (event) => {
    event.preventDefault();
    setLocalError('');
    if (!values.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      setLocalError('Enter a valid email address.');
      return;
    }
    const passwordBytes = new TextEncoder().encode(values.password).length;
    if (passwordBytes < 8 || passwordBytes > 72) {
      setLocalError('Password must be between 8 and 72 UTF-8 bytes.');
      return;
    }
    if (registering && !values.name.trim()) {
      setLocalError('Enter your name to create an account.');
      return;
    }
    const success = registering
      ? await auth.register({ name: values.name.trim(), email: values.email.trim(), password: values.password })
      : await auth.login({ email: values.email.trim(), password: values.password });
    if (success) navigate(returnTo, { replace: true });
  };

  return <PageContainer className="auth-page">
    <section className="auth-intro"><p className="eyebrow"><span className="eyebrow__rule" /> Welcome to UrbanKart</p><h1>{registering ? <>Make room for<br /><em>good things.</em></> : <>Good to have<br /><em>you back.</em></>}</h1><p>{registering ? 'Create an account to keep your selection close.' : 'Sign in to pick up where your collection left off.'}</p></section>
    <form className="auth-form" onSubmit={submit} noValidate>
      <h2>{registering ? 'Create your account' : 'Sign in'}</h2>
      {registering && <label>Full name<input name="name" autoComplete="name" value={values.name} onChange={update('name')} required maxLength="100" /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" value={values.email} onChange={update('email')} required maxLength="254" /></label>
      <label>Password<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={values.password} onChange={update('password')} required minLength="8" /></label>
      <p className="auth-form__hint">Use at least 8 characters. The server also enforces a 72-byte maximum.</p>
      {(localError || auth.error) && <p className="form-error" role="alert">{localError || auth.error.message}</p>}
      <button className="button button--dark" type="submit" disabled={auth.isSubmitting}>{auth.isSubmitting ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
      <p className="auth-form__switch">{registering ? 'Already have an account?' : 'New to UrbanKart?'} <Link to={registering ? '/login' : '/register'} state={{ from: returnTo }}>{registering ? 'Sign in' : 'Create an account'}</Link></p>
    </form>
  </PageContainer>;
}
