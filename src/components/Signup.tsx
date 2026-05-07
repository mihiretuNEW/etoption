import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, ChevronRight, Eye, EyeOff, AlertCircle, Zap, ShieldCheck, Target, Bell, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SignupProps {
  onSuccess: () => void;
}

export default function Signup({ onSuccess }: SignupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let authUser;
      if (isLogin) {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        authUser = data.user;
      } else {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signupError) throw signupError;
        authUser = data.user;
      }
      
      if (authUser) {
        // Ensure profile exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', authUser.id)
          .single();

        if (!profile) {
          const isAdminEmail = authUser.email === 'mirekasaye@gmail.com' || authUser.email === 'mihiretukasaye26@gmail.com';
          await supabase.from('profiles').insert([
            { 
              id: authUser.id, 
              email: authUser.email, 
              plan: isAdminEmail ? 'MASTER' : 'FREE',
              is_admin: isAdminEmail
            }
          ]);
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex items-center justify-center font-sans antialiased overflow-hidden relative">
      {/* Background Chart Flow */}
      <div className="absolute inset-0 z-0 opacity-20">
        <svg className="w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path 
            d="M0,800 Q100,750 200,780 T400,700 T600,750 T800,600 T1000,650" 
            fill="none" 
            stroke="rgba(37, 99, 235, 0.4)" 
            strokeWidth="3"
            className="animate-[dash_10s_linear_infinite]"
          />
          <path 
            d="M0,810 Q100,760 200,790 T400,710 T600,760 T800,610 T1000,660" 
            fill="none" 
            stroke="rgba(16, 185, 129, 0.2)" 
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="w-full max-w-7xl mx-auto px-10 grid lg:grid-cols-2 gap-20 items-center z-10">
        {/* Left Side: Hero Info */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-12"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-12 bg-white rounded-lg flex items-center justify-center transform -skew-x-12 shadow-[5px_5px_0px_#2563eb]">
                  <span className="text-blue-600 text-3xl font-black italic">ET</span>
                  <div className="absolute -top-3 -right-3">
                    <TrendingUp size={24} className="text-blue-500" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-black tracking-[0.2em] text-white">OPTION</span>
                <span className="text-[10px] font-bold tracking-[0.4em] text-blue-500 uppercase">Trading Signals</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-5xl lg:text-7xl font-black text-white leading-tight">
              Smart Signals,<br />
              Smarter <span className="text-blue-600">Trading</span>
            </h1>
            <p className="text-xl text-slate-400 font-medium max-w-lg">
              Get real-time ET Option trading signals and trade with confidence.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-blue-600/10 rounded-full flex items-center justify-center text-blue-500">
                <Target size={24} />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Accurate Signals</h4>
                <p className="text-[10px] text-slate-500 mt-1">High probability trade setups</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-blue-600/10 rounded-full flex items-center justify-center text-blue-500">
                <Bell size={24} />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Real-Time Alerts</h4>
                <p className="text-[10px] text-slate-500 mt-1">Instant notifications on every signal</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-blue-600/10 rounded-full flex items-center justify-center text-blue-500">
                <Shield size={24} />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Secure & Reliable</h4>
                <p className="text-[10px] text-slate-500 mt-1">Your data and trades are always safe</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Side: Auth Card */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex justify-center"
        >
          <div className="w-full max-w-md bg-[#0b1224]/80 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-12 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-white mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="text-slate-500 text-sm">{isLogin ? 'Login to your ET Option account' : 'Start your journey with professional signals'}</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Email</label>
                  <div className="relative group">
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full bg-[#121b2e] border border-white/5 focus:border-blue-500/50 outline-none rounded-2xl py-4 pl-4 pr-12 text-sm transition-all text-white placeholder:text-slate-700"
                    />
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Password</label>
                  <div className="relative group">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-[#121b2e] border border-white/5 focus:border-blue-500/50 outline-none rounded-2xl py-4 pl-4 pr-12 text-sm transition-all text-white placeholder:text-slate-700"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Lock size={20} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="hidden peer" />
                  <div className="w-5 h-5 rounded-md bg-[#121b2e] border border-white/5 flex items-center justify-center peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all">
                    <div className="w-2 h-2 rounded-full bg-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-slate-300 transition-colors">Remember me</span>
                </label>
                <button type="button" className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors">Forgot Password?</button>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                  <AlertCircle size={16} className="shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl transition-all shadow-[0_20px_40px_-10px_rgba(37,99,235,0.4)] relative overflow-hidden group"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                ) : (
                  <span className="uppercase tracking-[0.2em] text-sm">{isLogin ? 'Login' : 'Sign Up'}</span>
                )}
              </button>
            </form>

            <div className="mt-10 text-center">
              <p className="text-slate-500 text-sm font-medium">
                {isLogin ? "Don't have an account?" : "Already have an account?"} {' '}
                <button 
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-blue-500 font-bold hover:text-blue-400 transition-colors ml-1"
                >
                  {isLogin ? 'Sign up' : 'Login'}
                </button>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-10 inset-x-0 text-center">
        <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">
          © 2024 ET Option. All rights reserved.
        </p>
      </div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -1000;
          }
        }
      `}</style>
    </div>
  );
}

const TrendingUp = ({ size, className }: { size: number, className: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="3" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
