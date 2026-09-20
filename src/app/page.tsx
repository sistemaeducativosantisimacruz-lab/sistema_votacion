"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldAlert, Loader2, CalendarClock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { loginVoterAction } from "@/app/actions/auth";

export default function StudentLogin() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const [activeYear, setActiveYear] = useState("");
  const [activeName, setActiveName] = useState("");
  const [isSimulacroMode, setIsSimulacroMode] = useState(false);
  const [officialElection, setOfficialElection] = useState<any>(null);
  const [simulacroElection, setSimulacroElection] = useState<any>(null);
  const [showInactiveMessage, setShowInactiveMessage] = useState(false);

  useEffect(() => {
    const fetchElections = async () => {
      // Official
      const { data: official } = await supabase
        .from("elecciones")
        .select("*")
        .not("titulo", "ilike", "[PRUEBA]%")
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (official) {
        setOfficialElection(official);
        const match = official.titulo.match(/(.*)\s+(\d{4})$/);
        if (match) {
          setActiveName(match[1].trim());
          setActiveYear(match[2]);
        } else {
          setActiveName(official.titulo);
          setActiveYear(new Date().getFullYear().toString());
        }
      } else {
        setActiveYear(new Date().getFullYear().toString());
      }

      // Simulacro
      const { data: simulacro } = await supabase
        .from("elecciones")
        .select("*")
        .ilike("titulo", "[PRUEBA]%")
        .eq("esta_activa", true)
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (simulacro) {
        setSimulacroElection(simulacro);
      }
    };
    fetchElections();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dni.length !== 8) return;

    setLoading(true);
    setError("");

    // Verificar si la elección correspondiente está activa
    if (isSimulacroMode) {
      if (!simulacroElection || !simulacroElection.esta_activa) {
        setShowInactiveMessage(true);
        setLoading(false);
        return;
      }
    } else {
      if (!officialElection || !officialElection.esta_activa) {
        setShowInactiveMessage(true);
        setLoading(false);
        return;
      }
    }

    try {
      const result = await loginVoterAction(dni);
      
      if (result?.error) {
        throw new Error(result.error);
      }

      router.push("/votacion");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      
      {/* Diseño de franjas verticales */}
      <div className="absolute top-0 left-0 h-full flex pointer-events-none z-0">
        {/* Franja azul predominante */}
        <div className="h-full w-16 sm:w-24 md:w-32 lg:w-48 xl:w-64 bg-[#13439c] shadow-2xl"></div>
        {/* Tres líneas amarillas delgadas */}
        <div className="flex h-full ml-3 gap-2">
          <div className="h-full w-1.5 lg:w-2 bg-[#dfb629] shadow-[0_0_15px_rgba(223,182,41,0.6)]"></div>
          <div className="h-full w-1 lg:w-1.5 bg-[#dfb629] shadow-[0_0_10px_rgba(223,182,41,0.5)] opacity-90"></div>
          <div className="h-full w-0.5 lg:w-1 bg-[#dfb629] shadow-[0_0_5px_rgba(223,182,41,0.4)] opacity-70"></div>
        </div>
      </div>

      {/* Contenedor principal que maneja el layout con Flexbox para que no colisionen */}
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between w-full min-h-screen pl-[5.5rem] sm:pl-[8rem] md:pl-[10rem] lg:pl-[14rem] xl:pl-[18rem] pr-4 lg:pr-8 xl:pr-16 gap-8 py-8 overflow-hidden">
        
        {/* Grupo Izquierdo/Centro: Ilustración y Tarjeta de Login */}
        <div className="flex flex-col md:flex-row items-center justify-center lg:justify-start gap-8 w-full max-w-6xl xl:max-w-7xl z-30">
          
          {/* Ilustración */}
          <div className="hidden md:flex flex-1 justify-end md:-mr-8 relative translate-y-10 lg:translate-y-16">
            <img 
              src="/imagen.png" 
              alt="Ilustración Estudiante" 
              className="max-w-[850px] w-full h-auto object-contain drop-shadow-2xl relative z-10 animate-in fade-in slide-in-from-left-8 duration-1000 scale-110 lg:scale-125 origin-right xl:origin-bottom-right" 
            />
          </div>

          {/* Tarjeta de Login / Mensaje Inactivo */}
          <div className="bg-card w-full max-w-[420px] p-8 lg:p-10 rounded-[2rem] shadow-2xl flex flex-col items-center border border-border/50 md:-ml-8 md:-translate-x-4 lg:-translate-x-8 relative flex-shrink-0 min-h-[500px] justify-center">
            
            {showInactiveMessage ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500 w-full">
                <div className="w-24 h-24 lg:w-28 lg:h-28 mb-5 relative opacity-90">
                  <img src="/insignia.png" alt="Insignia Escolar" className="w-full h-full object-contain" />
                </div>
                
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 text-blue-600">
                  <CalendarClock className="w-8 h-8" />
                </div>
                
                <h2 className="text-2xl font-bold text-foreground mb-4 text-center">
                  Votaciones Programadas
                </h2>
                
                <p className="text-center text-muted-foreground mb-8">
                  Las elecciones escolares {isSimulacroMode ? 'de simulacro ' : ''}están programadas para la fecha:<br/>
                  <strong className="text-lg text-foreground block mt-2">
                    {officialElection?.fecha_votacion 
                      ? officialElection.fecha_votacion.split("-").reverse().join("/") 
                      : "Aún por definir"}
                  </strong>
                </p>

                <button 
                  onClick={() => setShowInactiveMessage(false)}
                  className="w-full py-3 rounded-xl border border-border hover:bg-secondary font-semibold transition-colors flex justify-center items-center gap-2 mb-4"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver
                </button>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center animate-in fade-in">
                <div className="w-24 h-24 lg:w-28 lg:h-28 mb-5 relative">
                  <img src="/insignia.png" alt="Insignia Escolar" className="w-full h-full object-contain" />
                </div>
                
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2 text-center">
                  Portal de Votación {isSimulacroMode && <span className="text-amber-500 block text-lg mt-1">(Simulacro)</span>}
                </h1>
                <p className="text-muted-foreground text-center mb-8 text-sm lg:text-base px-2">
                  Ingresa tu DNI para participar en las elecciones escolares
                </p>

                <form onSubmit={handleLogin} className="w-full space-y-6">
                  <div className="space-y-3">
                    <label htmlFor="dni" className="text-base font-medium text-foreground">
                      Documento de Identidad (DNI)
                    </label>
                    <input
                      id="dni"
                      type="text"
                      className="w-full px-5 py-4 text-lg rounded-2xl border border-border bg-background focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none disabled:opacity-50"
                      value={dni}
                      onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
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
                    disabled={loading || dni.length !== 8}
                    className={`w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100 text-white py-4 text-lg rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${isSimulacroMode ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-primary/90'}`}
                  >
                    {loading ? (
                      <>Verificando <Loader2 className="w-6 h-6 animate-spin" /></>
                    ) : (
                      <>Ingresar <LogIn className="w-6 h-6" /></>
                    )}
                  </button>
                </form>

                <div className="mt-8 pt-6 border-t border-border w-full flex flex-col items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setIsSimulacroMode(!isSimulacroMode)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                  >
                    {isSimulacroMode ? "Ir a la elección oficial" : "Ir a simulacro"}
                  </button>
                  <Link 
                    href="/admin"
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    Acceso Administrativo
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grupo Derecho: Texto de Fondo Decorativo */}
        {activeYear && (
          <div className="hidden lg:flex flex-col items-center justify-center font-black select-none pointer-events-none z-0 flex-shrink min-w-[250px]">
            {activeName && (
               <div className="text-[clamp(1.5rem,2.5vw,3rem)] text-[#13439c]/50 tracking-widest uppercase mb-4 text-center text-balance leading-tight">
                 {activeName}
               </div>
            )}
            <div className="flex flex-col items-center text-[clamp(6rem,12vw,14rem)] leading-[0.75] tracking-tighter text-[#13439c]/25 tabular-nums">
              <span>{activeYear.slice(0, 2)}</span>
              <span>{activeYear.slice(2, 4)}</span>
            </div>
          </div>
        )}
        
      </div>
    </main>
  );
}
