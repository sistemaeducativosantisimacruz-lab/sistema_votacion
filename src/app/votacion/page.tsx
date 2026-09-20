"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, LogOut, Loader2, Beaker } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getVoterSessionAction, logoutVoterAction } from "@/app/actions/auth";
import { submitVoteAction } from "@/app/actions/vote";

type UserSession = {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  grado: string;
  seccion: string;
  nivel: string;
};

type Election = {
  id: string;
  titulo: string;
};

type Party = {
  id: string;
  nombre: string;
  logo_url: string;
  nivel?: string;
  numero_lista?: string | number;
};

export default function VotacionPage() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [election, setElection] = useState<Election | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  useEffect(() => {
    // 1. Validar sesión desde el servidor
    const checkSession = async () => {
      const session = await getVoterSessionAction();
      if (!session) {
        router.push("/");
        return;
      }
      setUser(session);
    };
    checkSession();

    // 2. Cargar elección activa y partidos
    const fetchElectionData = async () => {
      try {
        const { data: electionData, error: electionErr } = await supabase
          .from("elecciones")
          .select("id, titulo")
          .eq("esta_activa", true)
          .order("creado_en", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (electionErr || !electionData) {
          throw new Error("No hay elecciones activas en este momento.");
        }
        setElection(electionData);

        const { data: partiesData, error: partiesErr } = await supabase
          .from("partidos")
          .select("id, nombre, logo_url, nivel, numero_lista")
          .eq("eleccion_id", electionData.id);

        if (partiesErr) throw partiesErr;
        
        let filteredParties = partiesData || [];
        setParties(filteredParties);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchElectionData();
  }, [router]);

  const handleLogout = async () => {
    await logoutVoterAction();
    router.push("/");
  };

  const handleVote = async () => {
    if (!selectedParty || !user || !election) return;
    setSubmitting(true);
    setError("");

    try {
      const result = await submitVoteAction(election.id, selectedParty === "blanco" ? null : selectedParty);
      
      if (result?.error) {
        throw new Error(result.error);
      }

      // Éxito
      setShowConfirm(false);
      setIsSuccess(true);

      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Error al registrar el voto. Por favor, intenta de nuevo o llama a un supervisor.");
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Ups, algo salió mal</h1>
        <p className="text-muted-foreground">{error}</p>
        <button onClick={() => router.push("/")} className="mt-8 text-primary hover:underline">
          Volver al inicio
        </button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/20 rounded-full blur-[100px]"></div>
        </div>
        <div className="glass p-10 rounded-3xl flex flex-col items-center text-center z-10 max-w-lg w-full animate-in fade-in zoom-in duration-500">
          <CheckCircle2 className="w-24 h-24 text-green-500 mb-6" />
          <h1 className="text-4xl font-bold text-foreground mb-4">¡Gracias por participar!</h1>
          <p className="text-lg text-muted-foreground">Tu voto ha sido registrado correctamente.</p>
          <p className="text-sm text-muted-foreground mt-8 animate-pulse">Redirigiendo al inicio...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full glass border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">
                {election?.titulo.replace("[PRUEBA]", "").trim() || "Elecciones Escolares"}
              </h1>
              {election?.titulo.startsWith("[PRUEBA]") && (
                <span className="bg-amber-500 text-amber-950 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm">
                  <Beaker className="w-3 h-3" /> SIMULACRO
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Sistema de Votación Institucional</p>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-destructive hover:bg-destructive/10 px-3 py-2 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {error && (
          <div className="mb-8 p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        )}

        {/* Student Info Card */}
        {user && (
          <section className="bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border mb-8 flex flex-wrap gap-6 items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Elector</p>
              <h2 className="text-2xl font-bold">{user.nombres} {user.apellidos}</h2>
            </div>
            <div className="flex gap-6 flex-wrap">
              <div className="bg-secondary/50 px-4 py-2 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">DNI</p>
                <p className="font-semibold">{user.dni}</p>
              </div>
              <div className="bg-secondary/50 px-4 py-2 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Grado y Sección</p>
                <p className="font-semibold">{user.grado} "{user.seccion}" {user.nivel ? `- ${user.nivel}` : ''}</p>
              </div>
            </div>
          </section>
        )}

        {/* Voting Options */}
        <section>
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">Selecciona tu candidato</h3>
            <p className="text-muted-foreground">Marca la opción de tu preferencia haciendo clic en la tarjeta.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {parties.map((party) => {
              const isSelected = selectedParty === party.id;
              return (
                <div 
                  key={party.id}
                  onClick={() => setSelectedParty(party.id)}
                  className={`
                    relative group cursor-pointer rounded-3xl p-6 transition-all duration-300
                    border-2 flex flex-col items-center text-center
                    ${isSelected 
                      ? 'border-primary bg-primary/5 shadow-[0_0_30px_rgba(79,70,229,0.2)] scale-[1.02]' 
                      : 'border-border bg-card hover:border-primary/50 hover:shadow-lg hover:-translate-y-1'
                    }
                  `}
                >
                  <div className={`
                    absolute top-4 right-4 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors
                    ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}
                  `}>
                    {isSelected && <CheckCircle2 className="w-5 h-5" />}
                  </div>

                  {party.numero_lista && (
                    <h3 className="text-sm font-bold text-muted-foreground tracking-widest uppercase mb-2">Lista {party.numero_lista}</h3>
                  )}

                  <div className="w-32 h-32 rounded-2xl overflow-hidden mb-6 ring-4 ring-background shadow-md group-hover:scale-105 transition-transform bg-white flex items-center justify-center">
                    {party.logo_url ? (
                      <img src={party.logo_url} alt={`Logo ${party.nombre}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground text-4xl font-bold">{party.nombre.charAt(0)}</span>
                    )}
                  </div>
                  <h4 className="text-lg font-bold text-foreground leading-tight">{party.nombre}</h4>
                </div>
              );
            })}

            {/* Voto en Blanco */}
            <div 
              onClick={() => setSelectedParty("blanco")}
              className={`
                relative group cursor-pointer rounded-3xl p-6 transition-all duration-300
                border-2 flex flex-col items-center text-center
                ${selectedParty === "blanco"
                  ? 'border-primary bg-primary/5 shadow-[0_0_30px_rgba(79,70,229,0.2)] scale-[1.02]' 
                  : 'border-border bg-card hover:border-primary/50 hover:shadow-lg hover:-translate-y-1'
                }
              `}
            >
              <div className={`
                absolute top-4 right-4 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors
                ${selectedParty === "blanco" ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}
              `}>
                {selectedParty === "blanco" && <CheckCircle2 className="w-5 h-5" />}
              </div>

              <div className="w-32 h-32 rounded-2xl overflow-hidden mb-6 mt-4 ring-4 ring-background shadow-md group-hover:scale-105 transition-transform bg-gray-100 flex items-center justify-center">
                 <span className="text-gray-400 font-bold">Voto en Blanco</span>
              </div>
              <h4 className="text-lg font-bold text-foreground leading-tight">Voto en Blanco</h4>
            </div>

          </div>
        </section>
      </div>

      {/* Floating Action Button */}
      <div className={`
        fixed bottom-0 left-0 w-full p-6 glass border-t border-border/50 flex justify-end
        transition-transform duration-500 z-40
        ${selectedParty ? 'translate-y-0' : 'translate-y-full'}
      `}>
        <div className="container mx-auto flex justify-end px-4 max-w-5xl">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!selectedParty}
            className="bg-primary text-primary-foreground px-10 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-primary/25 hover:bg-primary/90 hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-3"
          >
            Emitir Voto
            <CheckCircle2 className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card text-card-foreground border border-border w-full max-w-md rounded-3xl p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-primary">
              <AlertCircle className="w-10 h-10" />
              <h2 className="text-2xl font-bold">Confirmar Voto</h2>
            </div>
            <p className="text-lg mb-8">
              ¿Estás seguro de emitir tu voto por <strong>
                {selectedParty === "blanco" ? "Voto en Blanco" : parties.find(p => p.id === selectedParty)?.nombre}
              </strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleVote}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sí, confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
