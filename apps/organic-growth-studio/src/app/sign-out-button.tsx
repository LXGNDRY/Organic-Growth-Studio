'use client';

export default function SignOutButton() {
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }
  return <button className="sign-out" onClick={signOut}>Sign out</button>;
}
