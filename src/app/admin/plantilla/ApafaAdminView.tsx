"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Users, Plus, Trash2, Save, FileSpreadsheet, Upload, AlertCircle, 
  CheckCircle2, PlayCircle, StopCircle, RefreshCw, Download, 
  Search, BarChart2, Beaker, Check, X, Loader2, Sparkles
} from "lucide-react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { 
  getApafaWorkspaceDataAction, 
  saveApafaElectionAction, 
  deleteApafaPartyAction,
  toggleApafaElectionStatusAction,
  resetApafaVotesAction,
  insertMockVotesApafaAction,
  uploadPadronApafaAction,
  getPadronApafaAction,
  getProgresoApafaDataAction,
  getCargosApafaAction,
  searchApoderadosAction
} from "@/app/actions/apafa";
import { parseApafaWorkbook, parseApafaWorkbooks } from "@/lib/apafaExcelParser";

interface ApafaAdminViewProps {
  isSuperAdmin: boolean;
  currentUser: any;
  activeTab?: "plantilla" | "padron" | "progreso";
  setActiveTab?: (tab: "plantilla" | "padron" | "progreso") => void;
}

export default function ApafaAdminView({ 
  isSuperAdmin, 
  currentUser,
  activeTab: propActiveTab = "plantilla",
  setActiveTab: propSetActiveTab
}: ApafaAdminViewProps) {
  const [internalTab, setInternalTab] = useState<"plantilla" | "padron" | "progreso">("plantilla");
  const activeTab = propSetActiveTab ? propActiveTab : internalTab;
  const setActiveTab = propSetActiveTab || setInternalTab;
  const [workspace, setWorkspace] = useState<"oficial" | "simulacro">("oficial");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Plantilla State
  const [electionId, setElectionId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("Elecciones APAFA 2026");
  const [fechaVotacion, setFechaVotacion] = useState("");
  const [parties, setParties] = useState<any[]>([]);
  const [cargos, setCargos] = useState<any[]>([]);
  const [activeElection, setActiveElection] = useState<any>(null);

  // Estados para búsqueda de candidatos por DNI
  const [searchQueryMap, setSearchQueryMap] = useState<{ [key: string]: string }>({});
  const [searchResultsMap, setSearchResultsMap] = useState<{ [key: string]: any[] }>({});
  const [isSearchingMap, setIsSearchingMap] = useState<{ [key: string]: boolean }>({});
  const [activeSearchKey, setActiveSearchKey] = useState<string | null>(null);

  // Padron State
  const [padronData, setPadronData] = useState<any[]>([]);
  const [padronCount, setPadronCount] = useState(0);
  const [padronPage, setPadronPage] = useState(1);
  const [padronSearch, setPadronSearch] = useState("");
  const [padronNivel, setPadronNivel] = useState("todos");
  const [padronGrado, setPadronGrado] = useState("todos");
  const [padronSeccion, setPadronSeccion] = useState("todos");
  const [padronLoading, setPadronLoading] = useState(false);
  const [uploadStats, setUploadStats] = useState<any | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progreso State
  const [progresoData, setProgresoData] = useState<any | null>(null);
  const [progresoLoading, setProgresoLoading] = useState(false);

  // Modales
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isGeneratingMock, setIsGeneratingMock] = useState(false);

  // 1. Cargar datos de la plantilla APAFA
  const loadPlantillaData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await getApafaWorkspaceDataAction(workspace);
      if (res?.error) {
        if (res.error.includes("does not exist")) {
          setMessage({
            type: "error",
            text: "Las tablas de APAFA aún no han sido creadas en Supabase. Por favor ejecute el script supabase_apafa.sql en el Editor SQL de Supabase."
          });
        } else {
          setMessage({ type: "error", text: res.error });
        }
        return;
      }

      if (res?.election) {
        setElectionId(res.election.id);
        setTitulo(res.election.titulo);
        setFechaVotacion(res.election.fecha_votacion || "");
      } else {
        setElectionId(null);
        setTitulo(workspace === "simulacro" ? "[PRUEBA] Elecciones APAFA 2026" : "Elecciones APAFA 2026");
        setFechaVotacion("");
      }

      // Normalizar cada partido a exactamente los 3 roles reglamentarios de APAFA: Presidente, Tesorero, Vocal
      const targetRoles = ["Presidente", "Tesorero", "Vocal"];
      const normalizedParties = (res?.parties || []).map((p: any) => {
        const existingCands = Array.isArray(p.candidatos) ? p.candidatos : [];
        const candidateMap = new Map<string, any>();
        for (const c of existingCands) {
          if (c && c.cargo) candidateMap.set(c.cargo.toLowerCase().trim(), c);
        }

        const normalizedCandidatos = targetRoles.map(role => {
          const found = candidateMap.get(role.toLowerCase()) || 
            existingCands.find((c: any) => c.cargo?.toLowerCase().includes(role.toLowerCase()));
          return {
            cargo: role,
            nombre: found?.nombre || "",
            dni: found?.dni || "",
            parentesco: found?.parentesco || ""
          };
        });

        return {
          ...p,
          candidatos: normalizedCandidatos
        };
      });

      setParties(normalizedParties);
      setCargos(res?.cargos || []);
      setActiveElection(res?.activeElection || null);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "plantilla") {
      loadPlantillaData();
    } else if (activeTab === "padron") {
      loadPadron();
    } else if (activeTab === "progreso") {
      loadProgreso();
    }
  }, [activeTab, workspace, padronPage, padronNivel]);

  // 2. Guardar Plantilla APAFA
  const handleSavePlantilla = async () => {
    if (!titulo.trim()) {
      setMessage({ type: "error", text: "Debe ingresar un título para la elección." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const formattedTitle = workspace === "simulacro" && !titulo.startsWith("[PRUEBA]")
        ? `[PRUEBA] ${titulo}`
        : titulo;

      const res = await saveApafaElectionAction({
        id: electionId || undefined,
        titulo: formattedTitle,
        fecha_votacion: fechaVotacion || undefined,
        partidos: parties.map(p => ({
          id: p.id,
          nombre: p.nombre,
          numero_lista: p.numero_lista,
          logo_url: p.logo_url,
          color: p.color,
          candidatos: p.candidatos || []
        }))
      });

      if (res.error) throw new Error(res.error);

      setMessage({ type: "success", text: "¡Plantilla de APAFA guardada correctamente!" });
      if (res.electionId) setElectionId(res.electionId);
      loadPlantillaData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Error al guardar la plantilla de APAFA." });
    } finally {
      setLoading(false);
    }
  };

  // 3. Activar / Desactivar Elección de APAFA
  const handleToggleElection = async () => {
    if (!electionId) {
      setMessage({ type: "error", text: "Debes guardar la elección antes de iniciarla." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const isCurrentlyActive = activeElection?.id === electionId;
      const willBeActive = !isCurrentlyActive;

      // Si se activa la oficial, resetear estado de voto en padrón para empezar de cero
      if (willBeActive && workspace === "oficial") {
        await resetApafaVotesAction(electionId, true);
      }

      const res = await toggleApafaElectionStatusAction(electionId, willBeActive);
      if (res.error) throw new Error(res.error);

      setMessage({
        type: "success",
        text: willBeActive 
          ? `¡Votación de APAFA (${workspace.toUpperCase()}) INICIADA exitosamente!` 
          : "Votación de APAFA DETENIDA."
      });
      loadPlantillaData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // 4. Agregar y actualizar listas de partidos con los 3 roles reglamentarios de APAFA
  const handleAddParty = () => {
    const nextNumber = parties.length + 1;
    const defaultCandidatos = [
      { cargo: "Presidente", nombre: "", dni: "", parentesco: "" },
      { cargo: "Tesorero", nombre: "", dni: "", parentesco: "" },
      { cargo: "Vocal", nombre: "", dni: "", parentesco: "" }
    ];

    setParties([
      ...parties,
      {
        id: `temp-${Date.now()}`,
        nombre: `Lista ${nextNumber}`,
        numero_lista: String(nextNumber),
        logo_url: "",
        color: "#d97706",
        candidatos: defaultCandidatos
      }
    ]);
  };

  const handleCandidateSearch = async (partyIdx: number, candIdx: number, query: string) => {
    const key = `${partyIdx}-${candIdx}`;
    setSearchQueryMap(prev => ({ ...prev, [key]: query }));
    setActiveSearchKey(key);

    if (query.trim().length < 2) {
      setSearchResultsMap(prev => ({ ...prev, [key]: [] }));
      return;
    }

    setIsSearchingMap(prev => ({ ...prev, [key]: true }));
    try {
      const res = await searchApoderadosAction(query);
      setSearchResultsMap(prev => ({ ...prev, [key]: res.data || [] }));
    } catch (err) {
      console.error("Error searching apoderados:", err);
    } finally {
      setIsSearchingMap(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSelectCandidate = (partyIdx: number, candIdx: number, apoderado: any) => {
    const key = `${partyIdx}-${candIdx}`;
    const updated = [...parties];
    const candList = [...(updated[partyIdx].candidatos || [])];
    candList[candIdx] = {
      ...candList[candIdx],
      nombre: apoderado.nombres ? `${apoderado.apellidos}, ${apoderado.nombres}` : apoderado.apellidos,
      dni: apoderado.dni,
      parentesco: apoderado.parentesco || "APODERADO"
    };
    updated[partyIdx].candidatos = candList;
    setParties(updated);

    // Limpiar búsqueda
    setSearchQueryMap(prev => ({ ...prev, [key]: "" }));
    setSearchResultsMap(prev => ({ ...prev, [key]: [] }));
    setActiveSearchKey(null);
  };

  const handleRemoveCandidate = (partyIdx: number, candIdx: number) => {
    const updated = [...parties];
    const candList = [...(updated[partyIdx].candidatos || [])];
    candList[candIdx] = {
      ...candList[candIdx],
      nombre: "",
      dni: "",
      parentesco: ""
    };
    updated[partyIdx].candidatos = candList;
    setParties(updated);
  };

  const handleRemoveParty = async (partyId: string) => {
    if (!partyId) return;

    if (!partyId.startsWith("temp-")) {
      setLoading(true);
      try {
        const res = await deleteApafaPartyAction(partyId);
        if (res?.error) throw new Error(res.error);
        setMessage({ type: "success", text: "Lista eliminada correctamente de la base de datos." });
      } catch (err: any) {
        setMessage({ type: "error", text: `Error al eliminar la lista: ${err.message}` });
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }

    setParties(prev => prev.filter(p => p.id !== partyId));
  };

  const handleUpdateParty = (index: number, field: string, value: any) => {
    const updated = [...parties];
    updated[index] = { ...updated[index], [field]: value };
    setParties(updated);
  };

  const handleUpdateCandidate = (partyIndex: number, candIndex: number, field: string, value: string) => {
    const updated = [...parties];
    const candList = [...(updated[partyIndex].candidatos || [])];
    candList[candIndex] = { ...candList[candIndex], [field]: value };
    updated[partyIndex].candidatos = candList;
    setParties(updated);
  };

  // 5. Cargar Padrón APAFA
  const loadPadron = async () => {
    setPadronLoading(true);
    try {
      const res = await getPadronApafaAction({
        search: padronSearch,
        nivel: padronNivel,
        grado: padronGrado,
        seccion: padronSeccion,
        page: padronPage,
        pageSize: 15
      });

      if (res?.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setPadronData(res.data || []);
        setPadronCount(res.totalCount || 0);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setPadronLoading(false);
    }
  };

  // 6. Subir y procesar Excel (soporta 1 o 2 archivos: Primaria y/o Secundaria)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadStats(null);
    setMessage(null);

    try {
      const fileBuffers: Array<{ name: string; data: string | ArrayBuffer }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await new Promise<string | ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string | ArrayBuffer);
          reader.onerror = reject;
          reader.readAsBinaryString(file);
        });
        fileBuffers.push({ name: file.name, data });
      }

      // Parsear todos los archivos simultáneamente (Primaria y/o Secundaria)
      const parseResult = parseApafaWorkbooks(fileBuffers.map(f => f.data));

      if (parseResult.apoderados.length === 0) {
        throw new Error("No se encontraron registros válidos de padres/madres en los archivos Excel.");
      }

      // Subir al servidor (con fusión inteligente en base de datos)
      const uploadRes = await uploadPadronApafaAction(parseResult.apoderados);
      if (uploadRes.error) throw new Error(uploadRes.error);

      setUploadStats({
        filesCount: files.length,
        sheets: parseResult.totalSheets,
        sheetNames: parseResult.sheetNames,
        familias: parseResult.totalFamilias,
        apoderados: parseResult.totalApoderados
      });

      setMessage({
        type: "success",
        text: `¡Padrón de APAFA cargado con éxito! Se procesaron ${files.length} archivo(s) (${fileBuffers.map(f => f.name).join(", ")}) con ${parseResult.totalSheets} pestañas. Se registraron/actualizaron ${parseResult.totalFamilias} familias y ${parseResult.totalApoderados} apoderados.`
      });

      loadPadron();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Error al procesar los archivos Excel." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 7. Descargar Padrón APAFA a Excel
  const handleDownloadPadron = async () => {
    try {
      setLoading(true);
      // Obtener todos los apoderados
      const res = await getPadronApafaAction({ pageSize: 10000 });
      if (!res.data || res.data.length === 0) {
        setMessage({ type: "error", text: "No hay apoderados registrados para exportar." });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("PADRON_APAFA_2026");

      ws.columns = [
        { header: "DNI", key: "dni", width: 14 },
        { header: "APELLIDOS", key: "apellidos", width: 25 },
        { header: "NOMBRES", key: "nombres", width: 25 },
        { header: "PARENTESCO", key: "parentesco", width: 14 },
        { header: "CÓDIGO FAMILIA", key: "familia_id", width: 22 },
        { header: "HIJOS / ALUMNOS REPRESENTADOS", key: "hijos", width: 45 },
        { header: "NIVEL", key: "nivel", width: 12 },
        { header: "GRADO", key: "grado", width: 10 },
        { header: "SECCIÓN", key: "seccion", width: 10 },
        { header: "¿YA VOTÓ LA FAMILIA?", key: "ya_voto", width: 20 },
        { header: "DETALLE DEL VOTO", key: "voto_emitido_por", width: 35 }
      ];

      res.data.forEach((a: any) => {
        ws.addRow({
          dni: a.dni,
          apellidos: a.apellidos,
          nombres: a.nombres,
          parentesco: a.parentesco,
          familia_id: a.familia_id,
          hijos: a.hijos,
          nivel: a.nivel,
          grado: a.grado,
          seccion: a.seccion,
          ya_voto: a.ya_voto ? "SÍ" : "NO",
          voto_emitido_por: a.voto_emitido_por || "Pendiente"
        });
      });

      // Estilo de encabezados
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF9A3412" } // Warm amber / brown
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, "padron_apafa_completo.xlsx");

      setMessage({ type: "success", text: "¡Padrón de APAFA descargado con éxito!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // 7.1. Descargar Formato Modelo de Excel para APAFA
  const handleDownloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("1° - A");

      ws.mergeCells("E1:H1");
      const titleCell = ws.getCell("E1");
      titleCell.value = "PADRON DE PADRES DE FAMILIA 2026";
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center" };

      ws.mergeCells("E2:H2");
      const subCell = ws.getCell("E2");
      subCell.value = "NIVEL: PRIMARIA  1° - A";
      subCell.font = { bold: true, size: 12 };
      subCell.alignment = { horizontal: "center" };

      ws.mergeCells("F4:G4");
      ws.getCell("F4").value = "PADRE";
      ws.getCell("F4").font = { bold: true };
      ws.getCell("F4").alignment = { horizontal: "center" };

      ws.mergeCells("H4:I4");
      ws.getCell("H4").value = "MADRE";
      ws.getCell("H4").font = { bold: true };
      ws.getCell("H4").alignment = { horizontal: "center" };

      ws.getCell("J4").value = "HERMANOS EN OTROS GRADOS";
      ws.getCell("J4").font = { bold: true };
      ws.getCell("J4").alignment = { horizontal: "center" };

      ws.getRow(5).values = [
        "ITEM",
        "DNI",
        "APELLIDO PATERNO",
        "APELLIDO MATERNO",
        "NOMBRES",
        "APELLIDOS Y NOMBRES",
        "DNI",
        "APELLIDOS Y NOMBRES",
        "DNI",
        "HERMANOS EN OTROS GRADOS"
      ];
      ws.getRow(5).font = { bold: true };

      ws.addRow([
        1,
        "81388537",
        "BARRANZUELA",
        "PALACIOS",
        "FERNANDO FABRICIO",
        "BARRANZUELA MIRANDA CARLOS ALEX",
        "80537851",
        "PALACIOS CARHUAPOMA ESTANY",
        "41523711",
        "5° A SEC"
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, "formato_modelo_padron_apafa.xlsx");
    } catch (err: any) {
      console.error("Error generating template:", err);
    }
  };

  // 8. Cargar Progreso de Votación APAFA
  const loadProgreso = async () => {
    setProgresoLoading(true);
    try {
      const res = await getProgresoApafaDataAction();
      if (res?.success) {
        setProgresoData(res);
      } else {
        setProgresoData(null);
        if (res?.message) setMessage({ type: "error", text: res.message });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setProgresoLoading(false);
    }
  };

  // 9. Generar votos simulados para APAFA
  const handleGenerateMockVotes = async () => {
    if (!activeElection || !activeElection.id) {
      setMessage({ type: "error", text: "Debe haber una elección de simulacro de APAFA activa para generar votos." });
      return;
    }

    setIsGeneratingMock(true);
    setMessage(null);
    try {
      const partyOptions = parties.map(p => p.id);
      partyOptions.push(null as any); // Voto en blanco

      const mockVotes = [];
      for (let i = 0; i < 40; i++) {
        const randomParty = partyOptions[Math.floor(Math.random() * partyOptions.length)];
        mockVotes.push({
          eleccion_id: activeElection.id,
          partido_id: randomParty,
          familia_id: `FAM-MOCK-${i + 1}`,
          nivel_votante: i % 2 === 0 ? "primaria" : "secundaria",
          grado_votante: `${(i % 5) + 1}°`,
          seccion_votante: ["A", "B", "C"][i % 3]
        });
      }

      await insertMockVotesApafaAction(mockVotes);
      setMessage({ type: "success", text: "¡Se generaron 40 votos de prueba en el simulacro de APAFA!" });
      if (activeTab === "progreso") loadProgreso();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsGeneratingMock(false);
    }
  };

  // 10. Limpiar votos de prueba
  const handleResetVotes = async () => {
    setLoading(true);
    try {
      await resetApafaVotesAction(activeElection?.id, true);
      setMessage({ type: "success", text: "¡Votos y estado del padrón de APAFA reiniciados correctamente!" });
      setShowResetConfirm(false);
      if (activeTab === "progreso") loadProgreso();
      if (activeTab === "padron") loadPadron();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const isElectionCurrentlyActive = activeElection?.id === electionId && activeElection?.esta_activa;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in">
      
      {/* Banner de Elección APAFA Activa */}
      {activeElection?.esta_activa && (
        <div className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 ${
          activeElection.titulo?.startsWith("[PRUEBA]")
            ? "bg-amber-100 border-amber-400 dark:bg-amber-950 dark:border-amber-600"
            : "bg-emerald-100 border-emerald-400 dark:bg-emerald-950 dark:border-emerald-600"
        }`}>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                activeElection.titulo?.startsWith("[PRUEBA]") ? "bg-amber-600" : "bg-emerald-600"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                activeElection.titulo?.startsWith("[PRUEBA]") ? "bg-amber-700" : "bg-emerald-700"
              }`}></span>
            </span>
            <div>
              <p className="font-extrabold text-slate-950 dark:text-white text-base md:text-lg tracking-tight">
                Votación de APAFA en Curso: <span className="underline decoration-2">{activeElection.titulo}</span>
              </p>
              <p className="text-xs md:text-sm text-slate-900 dark:text-slate-100 font-semibold mt-0.5">
                Los padres de familia pueden emitir su voto ingresando su DNI en el portal principal.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleGenerateMockVotes}
              disabled={isGeneratingMock}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> Generar Votos de Prueba
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Trash2 className="w-4 h-4" /> Limpiar Votos
            </button>
            <button
              onClick={handleToggleElection}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <StopCircle className="w-4 h-4" /> Detener Votaciones
            </button>
          </div>
        </div>
      )}

      {/* Sub-Navegación de APAFA */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex gap-2 p-1 bg-secondary/50 rounded-xl">
          <button
            onClick={() => setActiveTab("plantilla")}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === "plantilla" ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="w-4 h-4" /> Plantilla de Listas APAFA
          </button>
          <button
            onClick={() => setActiveTab("padron")}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === "padron" ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FileSpreadsheet className="w-4 h-4" /> Padrón de Padres (Excel)
          </button>
          <button
            onClick={() => setActiveTab("progreso")}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === "progreso" ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <BarChart2 className="w-4 h-4" /> Progreso de Votación APAFA
          </button>
        </div>

        {activeTab === "plantilla" && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-secondary/60 rounded-xl border border-border">
              <button
                onClick={() => setWorkspace("oficial")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${workspace === "oficial" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Elección Oficial
              </button>
              <button
                onClick={() => setWorkspace("simulacro")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${workspace === "simulacro" ? "bg-amber-500 text-amber-950 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Simulacro
              </button>
            </div>

            {isSuperAdmin && (
              <>
                <button
                  onClick={handleToggleElection}
                  disabled={loading}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all text-white ${isElectionCurrentlyActive ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {isElectionCurrentlyActive ? (
                    <>
                      <StopCircle className="w-4 h-4" /> Detener Votación
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4" /> Iniciar Votación
                    </>
                  )}
                </button>
                <button
                  onClick={handleSavePlantilla}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" /> Guardar Plantilla
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Notificaciones */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in ${message.type === "success" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30" : "bg-destructive/10 text-destructive border border-destructive/30"}`}>
          {message.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 1: PLANTILLA DE LISTAS Y CANDIDATOS APAFA */}
      {/* ========================================================= */}
      {activeTab === "plantilla" && (
        <div className="space-y-6">
          {/* Card Configuración de la Elección */}
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-bold text-foreground">Título de la Elección APAFA</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-amber-500 outline-none text-base font-semibold"
                placeholder="Ej. Elecciones Consejo Directivo APAFA 2026"
              />
            </div>
            <div className="w-full md:w-64 space-y-2">
              <label className="text-sm font-bold text-foreground">Fecha Programada</label>
              <input
                type="date"
                value={fechaVotacion}
                onChange={(e) => setFechaVotacion(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              />
            </div>
          </div>

          {/* Listas Postulantes */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Listas Postulantes a APAFA</h3>
              <p className="text-sm text-muted-foreground">Configura los candidatos que integrarán cada lista del Consejo Directivo.</p>
            </div>
            <button
              onClick={handleAddParty}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" /> Agregar Lista
            </button>
          </div>

          {parties.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-border rounded-2xl">
              <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-base font-semibold text-muted-foreground">No hay listas registradas todavía.</p>
              <p className="text-xs text-muted-foreground mt-1">Haz clic en "Agregar Lista" para registrar la primera candidatura a APAFA.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {parties.map((party, pIdx) => (
                <div key={party.id || pIdx} className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    {/* Header de la Lista */}
                    <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                      <div className="flex-1 space-y-3">
                        <div className="flex gap-3">
                          <div className="w-24 space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">N° Lista</label>
                            <input
                              type="text"
                              value={party.numero_lista || ""}
                              onChange={(e) => handleUpdateParty(pIdx, "numero_lista", e.target.value)}
                              placeholder="1"
                              className="w-full px-3 py-1.5 text-sm font-bold rounded-lg border border-border bg-background outline-none text-center"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nombre de la Lista / Partido</label>
                            <input
                              type="text"
                              value={party.nombre || ""}
                              onChange={(e) => handleUpdateParty(pIdx, "nombre", e.target.value)}
                              placeholder="Ej. Unidos por el Colegio"
                              className="w-full px-3 py-1.5 text-sm font-bold rounded-lg border border-border bg-background outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">URL del Logo / Emblema</label>
                          <input
                            type="text"
                            value={party.logo_url || ""}
                            onChange={(e) => handleUpdateParty(pIdx, "logo_url", e.target.value)}
                            placeholder="https://ejemplo.com/logo.png o /logos/lista1.png"
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background outline-none font-mono"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveParty(party.id)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                        title="Eliminar lista"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Candidatos Directivos de APAFA (Roles Reglamentarios: Presidente, Tesorero, Vocal) */}
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-amber-600" /> Integrantes del Consejo Directivo (3 Cargos)
                        </label>
                        <span className="text-[11px] text-muted-foreground font-medium">Búsqueda directa por DNI o Nombres</span>
                      </div>

                      <div className="space-y-2.5">
                        {(party.candidatos || []).map((cand: any, cIdx: number) => {
                          const searchKey = `${pIdx}-${cIdx}`;
                          const isAssigned = Boolean(cand.nombre || cand.dni);
                          const currentQuery = searchQueryMap[searchKey] || "";
                          const isSearching = isSearchingMap[searchKey] || false;
                          const results = searchResultsMap[searchKey] || [];
                          const isDropdownOpen = activeSearchKey === searchKey && currentQuery.trim().length >= 2;

                          return (
                            <div key={cIdx} className="relative">
                              {isAssigned ? (
                                <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-secondary/40 hover:bg-secondary/60 transition-colors">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                                      {cand.cargo}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-foreground truncate">
                                        {cand.nombre}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {cand.dni && (
                                          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-background border border-border text-muted-foreground font-semibold">
                                            DNI: {cand.dni}
                                          </span>
                                        )}
                                        {cand.parentesco && (
                                          <span className="text-[11px] text-muted-foreground">
                                            • {cand.parentesco}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCandidate(pIdx, cIdx)}
                                    className="shrink-0 ml-2 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"
                                    title="Quitar o cambiar este candidato"
                                  >
                                    <X className="w-3.5 h-3.5" /> Cambiar
                                  </button>
                                </div>
                              ) : (
                                <div className="relative">
                                  <div className="flex items-center gap-2 p-1.5 rounded-xl border border-dashed border-border bg-background focus-within:border-amber-500 transition-colors">
                                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-muted text-muted-foreground min-w-[90px] text-center">
                                      {cand.cargo}
                                    </span>

                                    <div className="relative flex-1">
                                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                      <input
                                        type="text"
                                        placeholder={`Buscar ${cand.cargo} por DNI o Nombres...`}
                                        value={currentQuery}
                                        onChange={(e) => handleCandidateSearch(pIdx, cIdx, e.target.value)}
                                        onFocus={() => setActiveSearchKey(searchKey)}
                                        className="w-full pl-8 pr-7 py-1 text-xs rounded-lg bg-transparent outline-none placeholder:text-muted-foreground/60"
                                      />
                                      {isSearching ? (
                                        <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 animate-spin" />
                                      ) : currentQuery ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSearchQueryMap(prev => ({ ...prev, [searchKey]: "" }));
                                            setSearchResultsMap(prev => ({ ...prev, [searchKey]: [] }));
                                          }}
                                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>

                                  {/* Dropdown de Búsqueda de Apoderados */}
                                  {isDropdownOpen && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setActiveSearchKey(null)}
                                      />
                                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto p-1.5 animate-in fade-in zoom-in-95">
                                        {isSearching ? (
                                          <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> Buscando en el padrón de padres...
                                          </div>
                                        ) : results.length > 0 ? (
                                          <div className="space-y-1">
                                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                              Apoderados encontrados ({results.length})
                                            </div>
                                            {results.map((ap: any) => (
                                              <button
                                                key={ap.id}
                                                type="button"
                                                onClick={() => handleSelectCandidate(pIdx, cIdx, ap)}
                                                className="w-full text-left p-2 rounded-lg hover:bg-secondary transition-colors flex items-center justify-between gap-2 group"
                                              >
                                                <div className="min-w-0">
                                                  <p className="font-bold text-xs text-foreground group-hover:text-amber-600 transition-colors truncate">
                                                    {ap.apellidos}, {ap.nombres}
                                                  </p>
                                                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                                                    <span className="font-mono font-bold text-amber-600">DNI: {ap.dni}</span>
                                                    {ap.parentesco && <span>• {ap.parentesco}</span>}
                                                    {ap.nivel && <span className="capitalize">• {ap.nivel}</span>}
                                                    {ap.grado && <span>{ap.grado} "{ap.seccion}"</span>}
                                                  </p>
                                                </div>
                                                <span className="shrink-0 text-[11px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                                  Asignar
                                                </span>
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="p-2.5 text-center text-xs text-muted-foreground">
                                            No se encontraron apoderados que coincidan con "{currentQuery}".
                                          </div>
                                        )}

                                        {/* Opción para asignar manualmente si no está en el padrón */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const raw = currentQuery.trim();
                                            const isDni = /^\d{8}$/.test(raw);
                                            handleSelectCandidate(pIdx, cIdx, {
                                              nombres: isDni ? "" : raw,
                                              apellidos: isDni ? "" : "",
                                              dni: isDni ? raw : "",
                                              parentesco: "APODERADO"
                                            });
                                          }}
                                          className="w-full text-left p-2 mt-1 rounded-lg hover:bg-amber-500/10 text-xs text-amber-600 font-semibold flex items-center gap-1.5 border-t border-border pt-2"
                                        >
                                          <Plus className="w-3.5 h-3.5" /> Asignar "{currentQuery}" manualmente
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: PADRÓN ELECTORAL DE APODERADOS (EXCEL) */}
      {/* ========================================================= */}
      {activeTab === "padron" && (
        <div className="space-y-6">
          {/* Header con botón de subida y descarga */}
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-amber-600" /> Padrón de Padres de Familia (APAFA)
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Puedes subir los 2 archivos Excel a la vez (Primaria y Secundaria) o subirlos por separado. El sistema vincula automáticamente a los padres que tienen hijos en ambos niveles para que solo emitan un voto por familia.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx, .xls"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? "Procesando Excel..." : "Subir Padrón APAFA (Excel Primaria / Secundaria)"}
              </button>
              <button
                onClick={handleDownloadPadron}
                disabled={loading}
                className="border border-border hover:bg-secondary px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" /> Descargar Padrón
              </button>
              <button
                onClick={handleDownloadTemplate}
                type="button"
                className="border border-border hover:bg-secondary px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all text-amber-700 dark:text-amber-400"
                title="Descarga el formato modelo para llenar los padrones de primaria y secundaria"
              >
                <FileSpreadsheet className="w-4 h-4" /> Formato Modelo
              </button>
            </div>
          </div>

          {/* Estadísticas de la última subida */}
          {uploadStats && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold">Hojas Procesadas</p>
                <p className="text-2xl font-black text-amber-900 dark:text-amber-200">{uploadStats.sheets}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold">Familias Únicas</p>
                <p className="text-2xl font-black text-amber-900 dark:text-amber-200">{uploadStats.familias}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold">Apoderados Registrados</p>
                <p className="text-2xl font-black text-amber-900 dark:text-amber-200">{uploadStats.apoderados}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold">Regla de Votación</p>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">1 Voto por Familia Activo</p>
              </div>
            </div>
          )}

          {/* Filtros de Búsqueda */}
          <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                type="text"
                value={padronSearch}
                onChange={(e) => {
                  setPadronSearch(e.target.value);
                  setPadronPage(1);
                }}
                placeholder="Buscar por DNI, padre, madre o hijo..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-background outline-none"
              />
            </div>
            <select
              value={padronNivel}
              onChange={(e) => {
                setPadronNivel(e.target.value);
                setPadronPage(1);
              }}
              className="px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none"
            >
              <option value="todos">Todos los Niveles</option>
              <option value="primaria">Primaria</option>
              <option value="secundaria">Secundaria</option>
            </select>
            <button
              onClick={loadPadron}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-secondary hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Filtrar
            </button>
          </div>

          {/* Tabla de Apoderados */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/60 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">Apellidos y Nombres</th>
                    <th className="px-4 py-3">Parentesco</th>
                    <th className="px-4 py-3">Hijo(s) Representado(s)</th>
                    <th className="px-4 py-3">Grado / Sec</th>
                    <th className="px-4 py-3">Estado Familiar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {padronLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
                        <span className="text-xs text-muted-foreground">Cargando padrón...</span>
                      </td>
                    </tr>
                  ) : padronData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        No se encontraron registros en el padrón de APAFA. Sube un archivo Excel para comenzar.
                      </td>
                    </tr>
                  ) : (
                    padronData.map((a: any) => (
                      <tr key={a.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-foreground">{a.dni}</td>
                        <td className="px-4 py-3 font-semibold">{a.apellidos}, {a.nombres}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${a.parentesco === 'PADRE' ? 'bg-blue-500/10 text-blue-700' : 'bg-pink-500/10 text-pink-700'}`}>
                            {a.parentesco}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate" title={a.hijos}>
                          {a.hijos}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium uppercase">
                          {a.grado} {a.seccion ? `"${a.seccion}"` : ""} <span className="text-muted-foreground">{a.nivel}</span>
                        </td>
                        <td className="px-4 py-3">
                          {a.ya_voto ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" title={a.voto_emitido_por}>
                              <Check className="w-3 h-3" /> Votó la familia
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-muted-foreground">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Total: <strong>{padronCount}</strong> apoderados registrados</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPadronPage(p => Math.max(1, p - 1))}
                  disabled={padronPage === 1 || padronLoading}
                  className="px-3 py-1 rounded-lg border border-border hover:bg-secondary disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="px-2 py-1 font-semibold">Página {padronPage}</span>
                <button
                  onClick={() => setPadronPage(p => p + 1)}
                  disabled={padronData.length < 15 || padronLoading}
                  className="px-3 py-1 rounded-lg border border-border hover:bg-secondary disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 3: PROGRESO DE VOTACIÓN EN VIVO APAFA */}
      {/* ========================================================= */}
      {activeTab === "progreso" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Progreso Electoral de APAFA</h3>
              <p className="text-sm text-muted-foreground">Resultados y participación familiar en tiempo real.</p>
            </div>
            <button
              onClick={loadProgreso}
              disabled={progresoLoading}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-secondary hover:bg-secondary/80 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${progresoLoading ? "animate-spin" : ""}`} /> Actualizar
            </button>
          </div>

          {!progresoData?.election ? (
            <div className="p-12 text-center border border-border rounded-2xl bg-card">
              <AlertCircle className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
              <p className="font-semibold text-foreground">No hay elecciones de APAFA activas en este momento.</p>
              <p className="text-xs text-muted-foreground mt-1">Inicia una elección en la pestaña "Plantilla" para ver el avance en vivo.</p>
            </div>
          ) : (
            <>
              {/* Tarjetas Métricas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Familias Asociadas</p>
                  <p className="text-3xl font-black mt-2">{progresoData.stats.totalFamilias}</p>
                </div>
                <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Familias que Votaron</p>
                  <p className="text-3xl font-black text-amber-600 mt-2">{progresoData.stats.familiasVotaron}</p>
                </div>
                <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Participación APAFA</p>
                  <p className="text-3xl font-black text-emerald-600 mt-2">
                    {progresoData.stats.porcentajeParticipacion.toFixed(1)}%
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Total Votos Emitidos</p>
                  <p className="text-3xl font-black mt-2">{progresoData.stats.totalVotosEmitidos}</p>
                </div>
              </div>

              {/* Resultados por Lista */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="font-bold text-lg">Distribución de Votos por Candidatura</h4>
                <div className="space-y-4">
                  {progresoData.parties.map((p: any) => {
                    const partyVotes = (progresoData.votes || []).filter((v: any) => v.partido_id === p.id).length;
                    const totalVotes = progresoData.stats.totalVotosEmitidos || 1;
                    const pct = ((partyVotes / totalVotes) * 100).toFixed(1);

                    return (
                      <div key={p.id} className="space-y-1.5">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-bold">{p.nombre} {p.numero_lista ? `(Lista ${p.numero_lista})` : ''}</span>
                          <span className="font-mono font-bold text-muted-foreground">{partyVotes} votos ({pct}%)</span>
                        </div>
                        <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-600 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Votos en Blanco */}
                  {(() => {
                    const blancoVotes = (progresoData.votes || []).filter((v: any) => !v.partido_id).length;
                    const totalVotes = progresoData.stats.totalVotosEmitidos || 1;
                    const blancoPct = ((blancoVotes / totalVotes) * 100).toFixed(1);

                    return (
                      <div className="space-y-1.5 pt-2 border-t border-border">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold text-muted-foreground">Votos en Blanco / Nulos</span>
                          <span className="font-mono text-muted-foreground">{blancoVotes} votos ({blancoPct}%)</span>
                        </div>
                        <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-400 rounded-full transition-all duration-500"
                            style={{ width: `${blancoPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Confirmación Reset Votos */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card text-card-foreground border border-border w-full max-w-md rounded-3xl p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-orange-600">
              <AlertCircle className="w-10 h-10" />
              <h2 className="text-2xl font-bold">Limpiar Votos APAFA</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              Esta acción eliminará todos los votos registrados para la elección activa de APAFA y <strong>restablecerá el estado de voto de todas las familias a pendiente</strong>. Los datos de la votación estudiantil NO serán afectados.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetVotes}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors shadow-lg"
              >
                {loading ? "Limpiando..." : "Sí, Limpiar Votos"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

