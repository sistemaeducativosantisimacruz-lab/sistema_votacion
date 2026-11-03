"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, AlertCircle, TrendingUp, Users, GraduationCap, AlignLeft, BarChart3, Beaker } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PartyResult = {
  id: string;
  nombre: string;
  logo_url: string;
  votos: number;
  porcentaje: number;
};

export default function ResultadosGeneralesPage() {
  const [resultMode, setResultMode] = useState<"escolar" | "apafa">("escolar");
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

      const isApafa = resultMode === "apafa";
      const electionTable = isApafa ? "elecciones_apafa" : "elecciones";
      const partyTable = isApafa ? "partidos_apafa" : "partidos";
      const voteTable = isApafa ? "votos_apafa" : "votos";

      const { data: election, error: electionErr } = await supabase
        .from(electionTable)
        .select("id, titulo")
        .eq("esta_activa", true)
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (electionErr || !election) {
        throw new Error(
          isApafa 
            ? "No hay elecciones de APAFA activas en este momento." 
            : "No hay elecciones escolares activas en este momento."
        );
      }
      setElectionTitle(election.titulo);

      const { data: partiesData, error: partiesErr } = await supabase
        .from(partyTable)
        .select("id, nombre, logo_url")
        .eq("eleccion_id", election.id);

      if (partiesErr) throw partiesErr;

      const { data: votesData, error: votesErr } = await supabase
        .from(voteTable)
        .select("partido_id, grado_votante, nivel_votante")
        .eq("eleccion_id", election.id);

      if (votesErr) throw votesErr;

      let electorsData: any[] = [];
      if (isApafa) {
        // En APAFA contamos familias únicas registradas en apoderados
        const { data: apoderadosData, error: apoErr } = await supabase
          .from("apoderados")
          .select("familia_id, ya_voto, grado, nivel");
        if (apoErr) throw apoErr;

        // Deduplicar por familia_id
        const famMap = new Map();
        (apoderadosData || []).forEach(a => {
          if (!famMap.has(a.familia_id)) famMap.set(a.familia_id, a);
        });
        electorsData = Array.from(famMap.values());
      } else {
        const { data: studentsData, error: studentsErr } = await supabase
          .from("estudiantes")
          .select("ya_voto, grado, nivel")
          .neq('rol', 'superadmin')
          .neq('rol', 'administrador');
        if (studentsErr) throw studentsErr;
        electorsData = studentsData || [];
      }

      setRawParties(partiesData || []);
      setRawVotes(votesData || []);
      setRawStudents(electorsData);

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
  }, [resultMode]);

  // Client-side calculate results when filters or data change
  useEffect(() => {
    if (!rawParties) return;

    let filteredVotes = rawVotes || [];
    let filteredStudents = rawStudents || [];

    if (selectedNivel !== "todos") {
      filteredVotes = filteredVotes.filter(v => v.nivel_votante?.toLowerCase() === selectedNivel.toLowerCase());
      filteredStudents = filteredStudents.filter(s => s.nivel?.toLowerCase() === selectedNivel.toLowerCase());
    }

    if (selectedGrado !== "todos") {
      filteredVotes = filteredVotes.filter(v => v.grado_votante?.toLowerCase() === selectedGrado.toLowerCase());
      filteredStudents = filteredStudents.filter(s => s.grado?.toLowerCase() === selectedGrado.toLowerCase());
    }

    const totalStudents = filteredStudents.length;
    const totalEmitidos = filteredVotes.length;
    setTotalVotes(totalEmitidos);

    setParticipation({
      total: totalStudents,
      voted: totalEmitidos,
      percentage: totalStudents > 0 ? Number(((totalEmitidos / totalStudents) * 100).toFixed(4)) : 0
    });

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
          
          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Conmutador Escolar vs APAFA */}
            <div className="flex bg-secondary/80 p-1 rounded-xl border border-border">
              <button
                onClick={() => setResultMode("escolar")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${resultMode === "escolar" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <GraduationCap className="w-3.5 h-3.5" /> Escolar
              </button>
              <button
                onClick={() => setResultMode("apafa")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${resultMode === "apafa" ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Users className="w-3.5 h-3.5" /> APAFA
              </button>
            </div>

            <button 
              onClick={fetchData}
              disabled={refreshing}
              className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50 text-xs"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {error ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Elección no disponible</h2>
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        ) : (
          <>
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
                    setSelectedGrado("todos");
                  }}
                  className="bg-background border border-input rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium w-full md:w-auto flex-1"
                >
                  <option value="todos">Todos los Niveles</option>
                  <option value="primaria">Primaria</option>
                  <option value="secundaria">Secundaria</option>
                </select>

                <select 
                  value={selectedGrado}
                  onChange={(e) => setSelectedGrado(e.target.value)}
                  className="bg-background border border-input rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium w-full md:w-auto flex-1"
                >
                  <option value="todos">Todos los Grados</option>
                  <option value="1°">1°</option>
                  <option value="2°">2°</option>
                  <option value="3°">3°</option>
                  <option value="4°">4°</option>
                  <option value="5°">5°</option>
                  <option value="6°">6°</option>
                </select>
              </div>

              {/* Botón cambiar orientación de gráficos */}
              <div className="flex bg-secondary p-1 rounded-xl w-full md:w-auto justify-center">
                <button
                  onClick={() => setViewMode("vertical")}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                    viewMode === "vertical" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Gráfico Horizontal"
                >
                  <BarChart3 className="w-4 h-4 rotate-90" /> Barras
                </button>
                <button
                  onClick={() => setViewMode("horizontal")}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                    viewMode === "horizontal" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Gráfico de Columnas"
                >
                  <BarChart3 className="w-4 h-4" /> Columnas
                </button>
              </div>
            </div>

            {/* Participation Banner */}
            <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 mb-12 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="w-5 h-5 text-primary" />
                    <span className="font-semibold uppercase tracking-wider text-xs">
                      {resultMode === "apafa" ? "Participación de Familias (APAFA)" : "Participación Estudiantil"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl sm:text-5xl font-black text-foreground">{participation.percentage.toFixed(1)}%</span>
                    <span className="text-sm text-muted-foreground">de electores registrados</span>
                  </div>
                </div>

                <div className="flex gap-4 w-full md:w-auto">
                  <div className="bg-secondary/50 rounded-2xl p-4 flex-1 md:w-32 text-center">
                    <p className="text-xs text-muted-foreground font-medium mb-1">
                      {resultMode === "apafa" ? "Familias que Votaron" : "Votos Emitidos"}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{participation.voted}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-2xl p-4 flex-1 md:w-32 text-center">
                    <p className="text-xs text-muted-foreground font-medium mb-1">
                      {resultMode === "apafa" ? "Total Familias" : "Padrón Total"}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{participation.total}</p>
                  </div>
                </div>
              </div>

              {/* Barra de progreso global */}
              <div className="w-full bg-secondary h-4 rounded-full mt-6 overflow-hidden p-0.5">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(participation.percentage, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Listado de Resultados */}
            <div className="space-y-4">
              {results.map((r, idx) => (
                <div key={r.id || idx} className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-xs text-muted-foreground">
                      #{idx + 1}
                    </span>
                    {r.logo_url && (
                      <img src={r.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover bg-white" />
                    )}
                    <div>
                      <h3 className="font-bold text-base text-foreground">{r.nombre}</h3>
                      <p className="text-xs text-muted-foreground">{r.votos} votos registrados</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-black text-foreground">{r.porcentaje.toFixed(1)}%</p>
                    <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${r.id === "blanco" ? "bg-gray-400" : "bg-primary"}`}
                        style={{ width: `${r.porcentaje}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </header>
    </main>
  );
}
