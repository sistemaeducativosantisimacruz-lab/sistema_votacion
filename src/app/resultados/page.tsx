"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, AlertCircle, TrendingUp, Users, AlignLeft, BarChart3, Beaker } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PartyResult = {
  id: string;
  nombre: string;
  logo_url: string;
  votos: number;
  porcentaje: number;
};

export default function ResultadosGeneralesPage() {
  const [viewMode, setViewMode] = useState<"horizontal" | "vertical">("vertical");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [electionTitle, setElectionTitle] = useState("");
  const [results, setResults] = useState<PartyResult[]>([]);
  const [participation, setParticipation] = useState({ total: 0, voted: 0, percentage: 0 });
  const [totalVotes, setTotalVotes] = useState(0);

  // Raw data for client-side filtering
  const [rawParties, setRawParties] = useState<any[]>([]);
  const [rawVotes, setRawVotes] = useState<any[]>([]);
  const [rawStudents, setRawStudents] = useState<any[]>([]);

  // Filters
  const [selectedNivel, setSelectedNivel] = useState<string>("todos");
  const [selectedGrado, setSelectedGrado] = useState<string>("todos");

  const fetchData = async () => {
    try {
      setRefreshing(true);
      setError("");

      const { data: election, error: electionErr } = await supabase
        .from("elecciones")
        .select("id, titulo")
        .eq("esta_activa", true)
        .single();

      if (electionErr || !election) {
        throw new Error("No hay elecciones activas en este momento.");
      }
      setElectionTitle(election.titulo);

      const { data: partiesData, error: partiesErr } = await supabase
        .from("partidos")
        .select("id, nombre, logo_url")
        .eq("eleccion_id", election.id);

      if (partiesErr) throw partiesErr;

      const { data: votesData, error: votesErr } = await supabase
        .from("votos")
        .select("partido_id, grado_votante, nivel_votante")
        .eq("eleccion_id", election.id);

      if (votesErr) throw votesErr;

      const { data: studentsData, error: studentsErr } = await supabase
        .from("estudiantes")
        .select("ya_voto, grado, nivel")
        .neq('rol', 'superadmin')
        .neq('rol', 'administrador');

      if (studentsErr) throw studentsErr;

      setRawParties(partiesData || []);
      setRawVotes(votesData || []);
      setRawStudents(studentsData || []);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Client-side calculate results when filters or data change
  useEffect(() => {
    if (!rawParties) return;
    if (rawVotes.length > 0) console.log("Sample vote:", rawVotes[0]);
    if (rawStudents.length > 0) console.log("Sample student:", rawStudents[0]);

    let filteredVotes = rawVotes || [];
    let filteredStudents = rawStudents || [];

    if (selectedNivel !== "todos") {
      filteredVotes = filteredVotes.filter(v => (v.nivel_votante || 'secundaria').toLowerCase() === selectedNivel.toLowerCase());
      filteredStudents = filteredStudents.filter(s => (s.nivel || 'secundaria').toLowerCase() === selectedNivel.toLowerCase());
    }
    
    if (selectedGrado !== "todos") {
      filteredVotes = filteredVotes.filter(v => String(v.grado_votante) === selectedGrado);
      filteredStudents = filteredStudents.filter(s => String(s.grado) === selectedGrado);
    }

    const totalStudents = filteredStudents.length;
    const votedStudents = filteredStudents.filter(s => s.ya_voto).length;
    setParticipation({
      total: totalStudents,
      voted: votedStudents,
      percentage: totalStudents > 0 ? Number(((votedStudents / totalStudents) * 100).toFixed(4)) : 0
    });

    const totalEmitidos = filteredVotes.length;
    setTotalVotes(totalEmitidos);

    let processedResults: PartyResult[] = [];

    (rawParties || []).forEach(party => {
      const votosPartido = filteredVotes.filter(v => v.partido_id === party.id).length;
      const porcentaje = totalEmitidos > 0 ? (votosPartido / totalEmitidos) * 100 : 0;
      processedResults.push({
        id: party.id,
        nombre: party.nombre,
        logo_url: party.logo_url,
        votos: votosPartido,
        porcentaje: Number(porcentaje.toFixed(4))
      });
    });

    const votosBlanco = filteredVotes.filter(v => v.partido_id === null).length;
    const porcentajeBlanco = totalEmitidos > 0 ? (votosBlanco / totalEmitidos) * 100 : 0;
    processedResults.push({
      id: "blanco",
      nombre: "Voto en Blanco",
      logo_url: "",
      votos: votosBlanco,
      porcentaje: Number(porcentajeBlanco.toFixed(4))
    });

    processedResults.sort((a, b) => b.votos - a.votos);
    setResults(processedResults);
  }, [rawVotes, rawParties, rawStudents, selectedNivel, selectedGrado]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium">Cargando resultados...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Resultados no disponibles</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 bg-primary/5 -skew-y-3 origin-top-left -z-10"></div>
      
      <header className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary p-2 rounded-xl text-primary-foreground">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-foreground">Resultados Generales</h1>
            </div>
            <div className="flex items-center gap-3 ml-14">
              <p className="text-xl text-muted-foreground font-medium">
                {electionTitle.replace("[PRUEBA]", "").trim()}
              </p>
              {electionTitle.startsWith("[PRUEBA]") && (
                <span className="bg-amber-500 text-amber-950 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
                  <Beaker className="w-3 h-3" /> MODO SIMULACRO
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2.5 rounded-xl font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50 self-start md:self-auto"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Filtros Demográficos */}
        <div className="bg-card border border-border rounded-2xl p-4 mb-8 flex flex-col md:flex-row gap-4 items-center shadow-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="flex items-center gap-2 text-muted-foreground w-full md:w-auto">
            <span className="font-semibold uppercase tracking-wider text-xs">Filtros:</span>
          </div>
          <div className="flex flex-1 gap-4 w-full md:w-auto">
            <select 
              value={selectedNivel}
              onChange={(e) => {
                setSelectedNivel(e.target.value);
                setSelectedGrado("todos"); // Reset grado al cambiar nivel
              }}
              className="bg-background border border-input rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium w-full md:w-auto flex-1"
            >
              <option value="todos">Todos los Niveles</option>
              <option value="secundaria">Secundaria</option>
              <option value="primaria">Primaria</option>
            </select>
            
            <select 
              value={selectedGrado}
              onChange={(e) => setSelectedGrado(e.target.value)}
              className="bg-background border border-input rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium w-full md:w-auto flex-1 disabled:opacity-50"
            >
              <option value="todos">Todos los Grados</option>
              <option value="1ro">1er Grado</option>
              <option value="2do">2do Grado</option>
              <option value="3ro">3er Grado</option>
              <option value="4to">4to Grado</option>
              <option value="5to">5to Grado</option>
              {selectedNivel === "primaria" && <option value="6to">6to Grado</option>}
            </select>
          </div>
        </div>

        <section className="glass rounded-3xl p-6 md:p-8 mb-10 border border-border shadow-xl shadow-black/5 animate-in fade-in slide-in-from-bottom-4 duration-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Users className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <h2 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-6">Avance de Participación</h2>
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-end mb-6">
              <div className="text-6xl font-black text-foreground tracking-tighter">
                {participation.percentage}<span className="text-4xl text-primary">%</span>
              </div>
              <div className="flex-1 w-full flex justify-between items-end pb-2">
                <div>
                  <p className="text-2xl font-bold text-foreground">{participation.voted}</p>
                  <p className="text-sm text-muted-foreground font-medium">Votos Emitidos</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">{participation.total}</p>
                  <p className="text-sm text-muted-foreground font-medium">Electores Hábiles</p>
                </div>
              </div>
            </div>
            <div className="w-full h-4 bg-secondary rounded-full overflow-hidden shadow-inner relative">
              <div 
                className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1500 ease-out relative overflow-hidden" 
                style={{ width: `${participation.percentage}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: 'shimmer 2s infinite' }}></div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              Desglose de Votos 
              <span className="text-sm font-normal text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {totalVotes} votos totales
              </span>
            </h2>
            
            <div className="flex items-center bg-secondary/50 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode("horizontal")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${viewMode === 'horizontal' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <AlignLeft className="w-4 h-4" /> Lista
              </button>
              <button 
                onClick={() => setViewMode("vertical")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${viewMode === 'vertical' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <BarChart3 className="w-4 h-4" /> Gráfico
              </button>
            </div>
          </div>
          
          {viewMode === "horizontal" ? (
            <div className="flex flex-col gap-4">
              {results.map((party, index) => {
                const isWinner = index === 0 && party.votos > 0;
                const isBlanco = party.id === "blanco";
                
                return (
                  <div 
                    key={party.id} 
                    className={`
                      relative bg-card rounded-2xl p-5 border shadow-sm transition-all duration-500
                      animate-in fade-in slide-in-from-bottom-8
                      ${isWinner ? 'border-primary/50 shadow-[0_4px_20px_rgba(79,70,229,0.15)] scale-[1.02] z-10' : 'border-border'}
                    `}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={`
                        w-16 h-16 rounded-xl flex items-center justify-center shrink-0 border-2 font-black text-2xl overflow-hidden
                        ${isBlanco ? 'bg-secondary border-border text-muted-foreground' : 'bg-background border-border'}
                      `}>
                        {party.logo_url && !isBlanco ? (
                          <img src={party.logo_url} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <span>{isBlanco ? '-' : index + 1}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className={`text-lg font-bold truncate pr-4 ${isBlanco ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {party.nombre}
                          </h3>
                          <div className="text-right shrink-0">
                            <p className={`text-2xl font-black tabular-nums ${isWinner ? 'text-primary' : 'text-foreground'}`}>
                              {party.porcentaje}%
                            </p>
                          </div>
                        </div>

                        <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden mb-2">
                          <div 
                            className={`h-full transition-all duration-1500 ease-out ${isBlanco ? 'bg-muted-foreground/40' : (isWinner ? 'bg-primary' : 'bg-primary/60')}`} 
                            style={{ width: `${party.porcentaje}%`, transitionDelay: '300ms' }}
                          ></div>
                        </div>

                        <p className="text-sm font-medium text-muted-foreground">
                          {party.votos.toLocaleString()} votos
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-card rounded-3xl p-6 md:p-8 border border-border shadow-sm w-full overflow-x-auto animate-in fade-in zoom-in-95 duration-500">
              <div className="min-w-[600px] h-[450px] relative mt-10">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[88px]">
                  {[100, 75, 50, 25, 0].map((tick) => (
                    <div key={tick} className="flex items-center w-full relative">
                      <span className="absolute -translate-y-1/2 -left-2 text-xs font-semibold text-muted-foreground w-12 text-right pr-2">
                        {tick}%
                      </span>
                      <div className="w-full border-b border-dashed border-border/60 ml-10"></div>
                    </div>
                  ))}
                </div>

                <div className="absolute inset-0 ml-10 flex items-end justify-around">
                  {results.map((party, index) => {
                    const isWinner = index === 0 && party.votos > 0;
                    const isBlanco = party.id === "blanco";
                    
                    return (
                      <div key={party.id} className="relative flex flex-col items-center group w-20 md:w-28 h-full justify-end">
                        <div className="relative flex flex-col items-center justify-end w-full pb-[88px]" style={{ height: '100%' }}>
                          <div className="relative flex flex-col items-center justify-end w-full" style={{ height: `${party.porcentaje}%` }}>
                            <div className={`absolute bottom-full mb-2 w-max font-black text-lg text-center transition-all duration-700 ${isWinner ? 'text-primary' : 'text-foreground'}`}>
                              {party.porcentaje}%
                              <div className="text-xs font-normal text-muted-foreground">{party.votos.toLocaleString()} v</div>
                            </div>

                            <div 
                              className={`w-12 md:w-16 rounded-t-xl transition-all duration-1000 ease-out relative h-full
                                ${isBlanco ? 'bg-muted-foreground/30' : (isWinner ? 'bg-primary shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'bg-primary/50')}
                              `}
                              style={{ 
                                minHeight: party.votos > 0 ? '4px' : '0px'
                              }}
                          >
                            {isWinner && <div className="absolute inset-0 bg-white/20 w-full rounded-t-xl" style={{ backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.4), transparent)' }}></div>}
                          </div>
                        </div>
                        </div>

                        <div className="absolute bottom-0 w-full h-[88px] flex flex-col items-center justify-start pt-3">
                          <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border bg-background shrink-0 overflow-hidden mb-2 ${isBlanco ? 'border-border' : 'border-border/50'}`}>
                            {party.logo_url && !isBlanco ? (
                              <img src={party.logo_url} alt="Logo" className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-bold text-muted-foreground">{isBlanco ? '-' : index + 1}</span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-center text-muted-foreground line-clamp-2 px-1 w-full">
                            {party.nombre}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </header>
    </main>
  );
}
