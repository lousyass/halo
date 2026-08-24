import { supabase } from '../lib/supabase'

export default function Login() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) alert('Login failed: ' + error.message)
  }

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>Halo — Test Frontend</h1>
      <p>Sign in to test the backend.</p>
      <button onClick={handleGoogleLogin} style={{ padding: '10px 20px', fontSize: '16px' }}>
        Sign in with Google
      </button>
    </div>
  )
}
