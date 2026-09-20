"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, User as UserIcon, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { loginAdminAction } from "@/app/actions/auth";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError("");

    try {
      const result = await loginAdminAction(username, password);
      
      if (result?.error) {
        throw new Error(result.error);
      }

      router.push("/admin/plantilla");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      
      <div className="absolute top-8 left-8 z-50">
        <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium bg-white/50 px-4 py-2 rounded-xl backdrop-blur-sm border border-border/50">
          <ArrowLeft className="w-5 h-5" />
          Volver a Votación
        </Link>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row-reverse items-center justify-center max-w-5xl w-full px-4 gap-8 md:gap-4 lg:translate-x-24 md:translate-x-12">
        
        {/* Lado Izquierdo: Ilustración Administrador */}
        <div className="hidden md:flex flex-1 justify-center z-20">
          <img 
            src="/administrador.jpg" 
            alt="Ilustración Administrador" 
            className="max-w-[500px] w-full h-auto object-contain mix-blend-multiply" 
          />
        </div>

        {/* Lado Derecho: Tarjeta de Login Admin */}
        <div className="bg-card w-full max-w-[450px] p-10 rounded-[2rem] shadow-2xl z-30 flex flex-col items-center border border-border/50">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 rotate-3">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          
          <h1 className="text-3xl font-bold text-foreground mb-2 text-center">
            Administración
          </h1>
          <p className="text-muted-foreground text-center mb-8 px-4 text-sm">
            Acceso exclusivo para el comité electoral
          </p>

          <form onSubmit={handleLogin} className="w-full space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-muted-foreground" /> Usuario
              </label>
              <input
                type="text"
                placeholder="admin"
                className="w-full px-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" /> Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-lg text-center animate-in fade-in">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background py-4 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] mt-2 text-lg disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Acceder al Panel"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
