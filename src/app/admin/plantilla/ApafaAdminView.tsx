"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Users, Plus, Trash2, Save, FileSpreadsheet, Upload, AlertCircle, 
  CheckCircle2, PlayCircle, StopCircle, RefreshCw, Download, 
  Search, BarChart2, Beaker, Check, X, Loader2, Sparkles,
  Camera, Image as ImageIcon, Edit, UserPlus
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
  searchApoderadosAction,
  saveSingleApafaPartyAction,
  generateMockVotesApafaAction,
  registerManualApoderadoAction,
  getFamilyDetailsAction,
  saveFamilyApoderadosAction,
  deleteApoderadoAction
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
  const [manualCandidateForm, setManualCandidateForm] = useState<{ [key: string]: { nombres: string; dni: string; parentesco: string } }>({});
  const [savingManualCandidateKey, setSavingManualCandidateKey] = useState<string | null>(null);
  const [savingPartyIdx, setSavingPartyIdx] = useState<number | null>(null);
  const [savedPartyIdx, setSavedPartyIdx] = useState<number | null>(null);

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

  // Estados para Modal Añadir / Editar Miembros de Familia (Padrón APAFA)
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [isEditingFamily, setIsEditingFamily] = useState(false);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);

  const [familyForm, setFamilyForm] = useState<{
    familiaId?: string;
    hijos: string;
    nivel: string;
    grado: string;
    seccion: string;
    padre: {
      id?: string;
      dni: string;
      nombres: string;
      apellidos: string;
      parentesco: string;
    };
    madre: {
      id?: string;
      dni: string;
      nombres: string;
      apellidos: string;
      parentesco: string;
    };
    deletedMemberIds: string[];
  }>({
    hijos: "",
    nivel: "primaria",
    grado: "1°",
    seccion: "A",
    padre: { dni: "", nombres: "", apellidos: "", parentesco: "PADRE" },
    madre: { dni: "", nombres: "", apellidos: "", parentesco: "MADRE" },
    deletedMemberIds: []
  });

  const [padreSearchQuery, setPadreSearchQuery] = useState("");
  const [padreSearchResults, setPadreSearchResults] = useState<any[]>([]);
  const [isSearchingPadre, setIsSearchingPadre] = useState(false);
  const [showPadreResults, setShowPadreResults] = useState(false);

  const [madreSearchQuery, setMadreSearchQuery] = useState("");
  const [madreSearchResults, setMadreSearchResults] = useState<any[]>([]);
  const [isSearchingMadre, setIsSearchingMadre] = useState(false);
  const [showMadreResults, setShowMadreResults] = useState(false);

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

      // Normalizar cada partido a los 7 roles de APAFA: Presidente, Vicepresidente, Tesorero(a), Secretario(a), Vocal 1, Vocal 2, Vocal 3
      const targetRoles = ["Presidente", "Vicepresidente", "Tesorero(a)", "Secretario(a)", "Vocal 1", "Vocal 2", "Vocal 3"];
      const normalizedParties = (res?.parties || []).map((p: any) => {
        const existingCands = Array.isArray(p.candidatos) ? p.candidatos : [];
        const candidateMap = new Map<string, any>();
        for (const c of existingCands) {
          if (c && c.cargo) {
            const key = c.cargo.toLowerCase().trim();
            const prev = candidateMap.get(key);
            if (!prev || (!prev.nombre && Boolean(c.nombre || c.dni))) {
              candidateMap.set(key, c);
            }
          }
        }

        const normalizedCandidatos = targetRoles.map(role => {
          let found = candidateMap.get(role.toLowerCase());
          if (!found || !found.nombre) {
            let altFound: any = null;
            if (role === "Presidente") {
              altFound = existingCands.find((c: any) => c.cargo?.toLowerCase().includes("presiden") && !c.cargo?.toLowerCase().includes("vice") && Boolean(c.nombre));
            } else if (role === "Vicepresidente") {
              altFound = existingCands.find((c: any) => c.cargo?.toLowerCase().includes("vice") && Boolean(c.nombre));
            } else if (role === "Tesorero(a)") {
              altFound = existingCands.find((c: any) => c.cargo?.toLowerCase().includes("tesorer") && Boolean(c.nombre));
            } else if (role === "Secretario(a)") {
              altFound = existingCands.find((c: any) => c.cargo?.toLowerCase().includes("secretar") && Boolean(c.nombre));
            } else if (role === "Vocal 1") {
              altFound = existingCands.find((c: any) => (c.cargo?.toLowerCase() === "vocal 1" || c.cargo?.toLowerCase() === "vocal") && Boolean(c.nombre));
            } else if (role === "Vocal 2") {
              altFound = existingCands.find((c: any) => c.cargo?.toLowerCase() === "vocal 2" && Boolean(c.nombre));
            } else if (role === "Vocal 3") {
              altFound = existingCands.find((c: any) => c.cargo?.toLowerCase() === "vocal 3" && Boolean(c.nombre));
            }
            if (altFound) found = altFound;
          }

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

  // 4. Agregar y actualizar listas de partidos con los 7 roles de APAFA: Presidente, Vicepresidente, Tesorero(a), Secretario(a), Vocal 1, Vocal 2, Vocal 3
  const handleAddParty = () => {
    const nextNumber = parties.length + 1;
    const defaultCandidatos = [
      { cargo: "Presidente", nombre: "", dni: "", parentesco: "" },
      { cargo: "Vicepresidente", nombre: "", dni: "", parentesco: "" },
      { cargo: "Tesorero(a)", nombre: "", dni: "", parentesco: "" },
      { cargo: "Secretario(a)", nombre: "", dni: "", parentesco: "" },
      { cargo: "Vocal 1", nombre: "", dni: "", parentesco: "" },
      { cargo: "Vocal 2", nombre: "", dni: "", parentesco: "" },
      { cargo: "Vocal 3", nombre: "", dni: "", parentesco: "" }
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

  const handleLogoUpload = (partyIndex: number, file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar para no saturar la base de datos con un Base64 gigante (igual que estudiantes)
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64String = canvas.toDataURL(file.type || "image/jpeg", 0.75);
          handleUpdateParty(partyIndex, "logo_url", base64String);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCandidateSearch = async (partyIdx: number, candIdx: number, query: string) => {
    const key = `${partyIdx}-${candIdx}`;
    setSearchQueryMap(prev => ({ ...prev, [key]: query }));
    setActiveSearchKey(key);

    if (query.trim().length < 1) {
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

  const handleOpenManualEntry = (partyIdx: number, candIdx: number, initialQuery: string = "", initialDni: string = "") => {
    const key = `${partyIdx}-${candIdx}`;
    const raw = initialQuery.trim();
    const isDigits = /^\d+$/.test(raw);
    
    setManualCandidateForm(prev => ({
      ...prev,
      [key]: {
        nombres: isDigits ? "" : raw,
        dni: initialDni ? initialDni : (isDigits ? raw.slice(0, 8) : ""),
        parentesco: "APODERADO"
      }
    }));
    setActiveSearchKey(null);
  };

  const handleConfirmManualCandidate = async (pIdx: number, cIdx: number, candCargo: string) => {
    const key = `${pIdx}-${cIdx}`;
    const form = manualCandidateForm[key];
    if (!form || !form.nombres.trim()) return;

    const cleanDni = (form.dni || "").replace(/\D/g, "").slice(0, 8);
    setSavingManualCandidateKey(key);

    try {
      if (cleanDni) {
        if (cleanDni.length !== 8) {
          alert("El DNI debe tener 8 dígitos numéricos para que el directivo pueda votar en el sistema.");
          setSavingManualCandidateKey(null);
          return;
        }
        // Registrar en la base de datos (padrón de apoderados) para que pueda votar
        const res = await registerManualApoderadoAction({
          dni: cleanDni,
          nombreCompleto: form.nombres.trim(),
          cargo: candCargo,
          parentesco: form.parentesco || "APODERADO"
        });
        if (res.error) {
          console.warn("Aviso al registrar integrante en padrón:", res.error);
        }
      }

      // 1. Actualizar estado local inmediatamente
      const updated = [...parties];
      const party = updated[pIdx];
      if (!party) return;

      const candList = [...(party.candidatos || [])];
      const finalNombre = form.nombres.trim();

      candList[cIdx] = {
        cargo: candCargo,
        nombre: finalNombre,
        dni: cleanDni,
        parentesco: form.parentesco || "APODERADO"
      };

      const updatedParty = {
        ...party,
        candidatos: candList
      };
      updated[pIdx] = updatedParty;
      setParties(updated);

      // Limpiar formulario y modo manual
      setSearchQueryMap(prev => ({ ...prev, [key]: "" }));
      setSearchResultsMap(prev => ({ ...prev, [key]: [] }));
      setActiveSearchKey(null);
      setManualCandidateForm(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });

      // 2. Guardar DIRECTAMENTE en la base de datos (partidos_apafa) para persistir al actualizar
      const saveRes = await saveSingleApafaPartyAction({
        electionId: electionId || undefined,
        electionTitle: titulo || (workspace === "simulacro" ? "[PRUEBA] Elecciones APAFA 2026" : "Elecciones APAFA 2026"),
        fechaVotacion: fechaVotacion || undefined,
        isSimulacro: workspace === "simulacro",
        party: {
          id: updatedParty.id,
          nombre: updatedParty.nombre?.trim() || `Lista ${updatedParty.numero_lista || pIdx + 1}`,
          numero_lista: String(updatedParty.numero_lista || pIdx + 1),
          logo_url: updatedParty.logo_url || "",
          color: updatedParty.color || "#d97706",
          candidatos: candList
        }
      });

      if (saveRes.error) {
        console.error("Error al persistir lista en BD:", saveRes.error);
        setMessage({ type: "error", text: `Error al guardar en base de datos: ${saveRes.error}` });
      } else {
        if (saveRes.electionId && !electionId) {
          setElectionId(saveRes.electionId);
        }
        if (saveRes.party) {
          setParties(prev => {
            const next = [...prev];
            if (next[pIdx]) {
              next[pIdx] = {
                ...next[pIdx],
                id: saveRes.party.id,
                candidatos: candList
              };
            }
            return next;
          });
        }
        setMessage({
          type: "success",
          text: `¡${candCargo} (${finalNombre}) guardado correctamente en la base de datos!`
        });
      }
    } catch (err: any) {
      console.error("Error al registrar candidato manual:", err);
      setMessage({ type: "error", text: `Error al registrar candidato: ${err.message}` });
    } finally {
      setSavingManualCandidateKey(null);
    }
  };

  const handleSelectCandidate = async (partyIdx: number, candIdx: number, apoderado: any) => {
    const key = `${partyIdx}-${candIdx}`;
    const updated = [...parties];
    const party = updated[partyIdx];
    if (!party) return;

    const candList = [...(party.candidatos || [])];
    
    let finalNombre = "";
    if (apoderado.apellidos && apoderado.nombres) {
      finalNombre = `${apoderado.apellidos}, ${apoderado.nombres}`;
    } else {
      finalNombre = apoderado.nombres || apoderado.nombre || apoderado.apellidos || "";
    }

    const candCargo = candList[candIdx]?.cargo || "Integrante";

    candList[candIdx] = {
      ...candList[candIdx],
      cargo: candCargo,
      nombre: finalNombre,
      dni: apoderado.dni || "",
      parentesco: apoderado.parentesco || "APODERADO"
    };

    const updatedParty = {
      ...party,
      candidatos: candList
    };
    updated[partyIdx] = updatedParty;
    setParties(updated);

    // Limpiar búsqueda y modo manual
    setSearchQueryMap(prev => ({ ...prev, [key]: "" }));
    setSearchResultsMap(prev => ({ ...prev, [key]: [] }));
    setActiveSearchKey(null);
    setManualCandidateForm(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    // Guardar DIRECTAMENTE en la base de datos (partidos_apafa) para que persista al refrescar
    try {
      const saveRes = await saveSingleApafaPartyAction({
        electionId: electionId || undefined,
        electionTitle: titulo || (workspace === "simulacro" ? "[PRUEBA] Elecciones APAFA 2026" : "Elecciones APAFA 2026"),
        fechaVotacion: fechaVotacion || undefined,
        isSimulacro: workspace === "simulacro",
        party: {
          id: updatedParty.id,
          nombre: updatedParty.nombre?.trim() || `Lista ${updatedParty.numero_lista || partyIdx + 1}`,
          numero_lista: String(updatedParty.numero_lista || partyIdx + 1),
          logo_url: updatedParty.logo_url || "",
          color: updatedParty.color || "#d97706",
          candidatos: candList
        }
      });

      if (saveRes.electionId && !electionId) {
        setElectionId(saveRes.electionId);
      }
      if (saveRes.party) {
        setParties(prev => {
          const next = [...prev];
          if (next[partyIdx]) {
            next[partyIdx] = {
              ...next[partyIdx],
              id: saveRes.party.id,
              candidatos: candList
            };
          }
          return next;
        });
      }
      setMessage({
        type: "success",
        text: `¡${candCargo} (${finalNombre}) asignado y guardado en la base de datos!`
      });
    } catch (e: any) {
      console.warn("Aviso al auto-guardar integrante en BD:", e);
    }
  };

  const handleRemoveCandidate = async (partyIdx: number, candIdx: number) => {
    const key = `${partyIdx}-${candIdx}`;
    const updated = [...parties];
    const party = updated[partyIdx];
    if (!party) return;

    const candList = [...(party.candidatos || [])];
    const removedCargo = candList[candIdx]?.cargo || "Integrante";

    candList[candIdx] = {
      ...candList[candIdx],
      nombre: "",
      dni: "",
      parentesco: ""
    };

    const updatedParty = {
      ...party,
      candidatos: candList
    };
    updated[partyIdx] = updatedParty;
    setParties(updated);

    setManualCandidateForm(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    // Guardar la remoción en la base de datos
    try {
      await saveSingleApafaPartyAction({
        electionId: electionId || undefined,
        electionTitle: titulo || (workspace === "simulacro" ? "[PRUEBA] Elecciones APAFA 2026" : "Elecciones APAFA 2026"),
        fechaVotacion: fechaVotacion || undefined,
        isSimulacro: workspace === "simulacro",
        party: {
          id: updatedParty.id,
          nombre: updatedParty.nombre?.trim() || `Lista ${updatedParty.numero_lista || partyIdx + 1}`,
          numero_lista: String(updatedParty.numero_lista || partyIdx + 1),
          logo_url: updatedParty.logo_url || "",
          color: updatedParty.color || "#d97706",
          candidatos: candList
        }
      });
      setMessage({
        type: "success",
        text: `${removedCargo} removido y actualizado en la base de datos.`
      });
    } catch (e: any) {
      console.warn("Aviso al auto-guardar remoción en BD:", e);
    }
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

  const handleSavePartyDirect = async (pIdx: number) => {
    const party = parties[pIdx];
    if (!party) return;

    setSavingPartyIdx(pIdx);
    setMessage(null);

    try {
      const res = await saveSingleApafaPartyAction({
        electionId: electionId || undefined,
        electionTitle: titulo || (workspace === "simulacro" ? "[PRUEBA] Elecciones APAFA 2026" : "Elecciones APAFA 2026"),
        fechaVotacion: fechaVotacion || undefined,
        isSimulacro: workspace === "simulacro",
        party: {
          id: party.id,
          nombre: party.nombre?.trim() || `Lista ${party.numero_lista || pIdx + 1}`,
          numero_lista: String(party.numero_lista || pIdx + 1),
          logo_url: party.logo_url || "",
          candidatos: party.candidatos || []
        }
      });

      if (res.error) throw new Error(res.error);

      if (res.electionId && !electionId) {
        setElectionId(res.electionId);
      }

      if (res.party) {
        const updated = [...parties];
        updated[pIdx] = {
          ...updated[pIdx],
          id: res.party.id,
          nombre: res.party.nombre,
          numero_lista: res.party.numero_lista,
          logo_url: res.party.logo_url || "",
          candidatos: (res.party.candidatos && res.party.candidatos.length > 0) ? res.party.candidatos : updated[pIdx].candidatos
        };
        setParties(updated);
      }

      setSavedPartyIdx(pIdx);
      setTimeout(() => setSavedPartyIdx(null), 2500);

      setMessage({
        type: "success",
        text: `¡${party.nombre?.trim() || `Lista ${party.numero_lista || pIdx + 1}`} guardada con éxito en la base de datos!`
      });
    } catch (err: any) {
      setMessage({ type: "error", text: `Error al guardar la lista: ${err.message}` });
    } finally {
      setSavingPartyIdx(null);
    }
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

  // 5.1 Gestión de Familia (Añadir / Editar Miembros en Padrón)
  const handleOpenNewFamilyModal = () => {
    setIsEditingFamily(false);
    setFamilyForm({
      familiaId: undefined,
      hijos: "",
      nivel: "primaria",
      grado: "1°",
      seccion: "A",
      padre: { dni: "", nombres: "", apellidos: "", parentesco: "PADRE" },
      madre: { dni: "", nombres: "", apellidos: "", parentesco: "MADRE" },
      deletedMemberIds: []
    });
    setPadreSearchQuery("");
    setPadreSearchResults([]);
    setShowPadreResults(false);
    setMadreSearchQuery("");
    setMadreSearchResults([]);
    setShowMadreResults(false);
    setShowFamilyModal(true);
  };

  const handleOpenEditFamilyModal = async (ap: any) => {
    setIsEditingFamily(true);
    setShowFamilyModal(true);
    setFamilyLoading(true);

    setPadreSearchQuery("");
    setPadreSearchResults([]);
    setShowPadreResults(false);
    setMadreSearchQuery("");
    setMadreSearchResults([]);
    setShowMadreResults(false);

    try {
      const res = await getFamilyDetailsAction(ap.familia_id);
      const members = res?.members || [];

      const pMember = members.find((m: any) => m.parentesco === "PADRE") || 
        (ap.parentesco === "PADRE" ? ap : null);
      const mMember = members.find((m: any) => m.parentesco === "MADRE") || 
        (ap.parentesco === "MADRE" ? ap : null);
      const otherMember = members.find((m: any) => m.parentesco !== "PADRE" && m.parentesco !== "MADRE");

      setFamilyForm({
        familiaId: ap.familia_id,
        hijos: ap.hijos || pMember?.hijos || mMember?.hijos || "",
        nivel: ap.nivel || pMember?.nivel || mMember?.nivel || "primaria",
        grado: ap.grado || pMember?.grado || mMember?.grado || "1°",
        seccion: ap.seccion || pMember?.seccion || mMember?.seccion || "A",
        padre: pMember ? {
          id: pMember.id,
          dni: pMember.dni || "",
          nombres: pMember.nombres || "",
          apellidos: pMember.apellidos || "",
          parentesco: pMember.parentesco || "PADRE"
        } : (!mMember && otherMember ? {
          id: otherMember.id,
          dni: otherMember.dni || "",
          nombres: otherMember.nombres || "",
          apellidos: otherMember.apellidos || "",
          parentesco: otherMember.parentesco || "PADRE"
        } : { dni: "", nombres: "", apellidos: "", parentesco: "PADRE" }),
        madre: mMember ? {
          id: mMember.id,
          dni: mMember.dni || "",
          nombres: mMember.nombres || "",
          apellidos: mMember.apellidos || "",
          parentesco: mMember.parentesco || "MADRE"
        } : (pMember && otherMember ? {
          id: otherMember.id,
          dni: otherMember.dni || "",
          nombres: otherMember.nombres || "",
          apellidos: otherMember.apellidos || "",
          parentesco: otherMember.parentesco || "MADRE"
        } : { dni: "", nombres: "", apellidos: "", parentesco: "MADRE" }),
        deletedMemberIds: []
      });
    } catch (err: any) {
      console.error("Error al cargar detalles de la familia:", err);
      setFamilyForm({
        familiaId: ap.familia_id,
        hijos: ap.hijos || "",
        nivel: ap.nivel || "primaria",
        grado: ap.grado || "1°",
        seccion: ap.seccion || "A",
        padre: ap.parentesco === "PADRE" ? {
          id: ap.id,
          dni: ap.dni || "",
          nombres: ap.nombres || "",
          apellidos: ap.apellidos || "",
          parentesco: "PADRE"
        } : { dni: "", nombres: "", apellidos: "", parentesco: "PADRE" },
        madre: ap.parentesco === "MADRE" ? {
          id: ap.id,
          dni: ap.dni || "",
          nombres: ap.nombres || "",
          apellidos: ap.apellidos || "",
          parentesco: "MADRE"
        } : { dni: "", nombres: "", apellidos: "", parentesco: "MADRE" },
        deletedMemberIds: []
      });
    } finally {
      setFamilyLoading(false);
    }
  };

  const handleSearchPadre = async (query: string) => {
    setPadreSearchQuery(query);
    if (!query.trim()) {
      setPadreSearchResults([]);
      setShowPadreResults(false);
      return;
    }
    setIsSearchingPadre(true);
    setShowPadreResults(true);
    try {
      const res = await searchApoderadosAction(query);
      setPadreSearchResults(res?.data || []);
    } catch (e) {
      setPadreSearchResults([]);
    } finally {
      setIsSearchingPadre(false);
    }
  };

  const handleSelectPadreFromSearch = async (ap: any) => {
    setFamilyForm(prev => ({
      ...prev,
      padre: {
        id: ap.id,
        dni: ap.dni || "",
        apellidos: ap.apellidos || "",
        nombres: ap.nombres || "",
        parentesco: ap.parentesco || "PADRE"
      },
      hijos: prev.hijos || ap.hijos || "",
      nivel: prev.nivel || ap.nivel || "primaria",
      grado: prev.grado || ap.grado || "1°",
      seccion: prev.seccion || ap.seccion || "A",
      familiaId: prev.familiaId || ap.familia_id || undefined
    }));

    if (ap.familia_id && !familyForm.madre.dni) {
      try {
        const famRes = await getFamilyDetailsAction(ap.familia_id);
        const madreMember = (famRes?.members || []).find((m: any) => m.parentesco === "MADRE" || m.dni !== ap.dni);
        if (madreMember && madreMember.dni !== ap.dni) {
          setFamilyForm(prev => ({
            ...prev,
            madre: {
              id: madreMember.id,
              dni: madreMember.dni || "",
              apellidos: madreMember.apellidos || "",
              nombres: madreMember.nombres || "",
              parentesco: madreMember.parentesco || "MADRE"
            }
          }));
        }
      } catch (err) {
        // Ignore
      }
    }

    setPadreSearchQuery("");
    setShowPadreResults(false);
  };

  const handleClearPadre = () => {
    setFamilyForm(prev => ({
      ...prev,
      deletedMemberIds: prev.padre.id ? [...prev.deletedMemberIds, prev.padre.id] : prev.deletedMemberIds,
      padre: { dni: "", nombres: "", apellidos: "", parentesco: "PADRE" }
    }));
  };

  const handleSearchMadre = async (query: string) => {
    setMadreSearchQuery(query);
    if (!query.trim()) {
      setMadreSearchResults([]);
      setShowMadreResults(false);
      return;
    }
    setIsSearchingMadre(true);
    setShowMadreResults(true);
    try {
      const res = await searchApoderadosAction(query);
      setMadreSearchResults(res?.data || []);
    } catch (e) {
      setMadreSearchResults([]);
    } finally {
      setIsSearchingMadre(false);
    }
  };

  const handleSelectMadreFromSearch = async (ap: any) => {
    setFamilyForm(prev => ({
      ...prev,
      madre: {
        id: ap.id,
        dni: ap.dni || "",
        apellidos: ap.apellidos || "",
        nombres: ap.nombres || "",
        parentesco: ap.parentesco || "MADRE"
      },
      hijos: prev.hijos || ap.hijos || "",
      nivel: prev.nivel || ap.nivel || "primaria",
      grado: prev.grado || ap.grado || "1°",
      seccion: prev.seccion || ap.seccion || "A",
      familiaId: prev.familiaId || ap.familia_id || undefined
    }));

    if (ap.familia_id && !familyForm.padre.dni) {
      try {
        const famRes = await getFamilyDetailsAction(ap.familia_id);
        const padreMember = (famRes?.members || []).find((m: any) => m.parentesco === "PADRE" || m.dni !== ap.dni);
        if (padreMember && padreMember.dni !== ap.dni) {
          setFamilyForm(prev => ({
            ...prev,
            padre: {
              id: padreMember.id,
              dni: padreMember.dni || "",
              apellidos: padreMember.apellidos || "",
              nombres: padreMember.nombres || "",
              parentesco: padreMember.parentesco || "PADRE"
            }
          }));
        }
      } catch (err) {
        // Ignore
      }
    }

    setMadreSearchQuery("");
    setShowMadreResults(false);
  };

  const handleClearMadre = () => {
    setFamilyForm(prev => ({
      ...prev,
      deletedMemberIds: prev.madre.id ? [...prev.deletedMemberIds, prev.madre.id] : prev.deletedMemberIds,
      madre: { dni: "", nombres: "", apellidos: "", parentesco: "MADRE" }
    }));
  };

  const handleSaveFamily = async () => {
    if (!familyForm.hijos.trim()) {
      alert("Debe ingresar los apellidos y nombres del estudiante o hijos representados.");
      return;
    }

    const cleanDniPadre = familyForm.padre.dni.replace(/\D/g, "").slice(0, 8);
    const cleanDniMadre = familyForm.madre.dni.replace(/\D/g, "").slice(0, 8);

    const hasPadre = Boolean(cleanDniPadre && familyForm.padre.nombres.trim() && familyForm.padre.apellidos.trim());
    const hasMadre = Boolean(cleanDniMadre && familyForm.madre.nombres.trim() && familyForm.madre.apellidos.trim());

    if (!hasPadre && !hasMadre) {
      alert("Debe completar los datos (DNI de 8 dígitos, nombres y apellidos) de al menos un apoderado (Padre o Madre).");
      return;
    }

    if (hasPadre && cleanDniPadre.length !== 8) {
      alert("El DNI del padre debe tener exactamente 8 dígitos numéricos.");
      return;
    }

    if (hasMadre && cleanDniMadre.length !== 8) {
      alert("El DNI de la madre debe tener exactamente 8 dígitos numéricos.");
      return;
    }

    if (hasPadre && hasMadre && cleanDniPadre === cleanDniMadre) {
      alert("El DNI del padre y de la madre no pueden ser iguales.");
      return;
    }

    setSavingFamily(true);
    try {
      const res = await saveFamilyApoderadosAction({
        familiaId: familyForm.familiaId,
        hijos: familyForm.hijos.trim(),
        nivel: familyForm.nivel,
        grado: familyForm.grado.trim() || "1°",
        seccion: familyForm.seccion.trim() || "A",
        padre: hasPadre ? {
          id: familyForm.padre.id,
          dni: cleanDniPadre,
          nombres: familyForm.padre.nombres.trim(),
          apellidos: familyForm.padre.apellidos.trim(),
          parentesco: familyForm.padre.parentesco || "PADRE"
        } : null,
        madre: hasMadre ? {
          id: familyForm.madre.id,
          dni: cleanDniMadre,
          nombres: familyForm.madre.nombres.trim(),
          apellidos: familyForm.madre.apellidos.trim(),
          parentesco: familyForm.madre.parentesco || "MADRE"
        } : null,
        deletedMemberIds: familyForm.deletedMemberIds
      });

      if (res.error) {
        throw new Error(res.error);
      }

      setMessage({
        type: "success",
        text: isEditingFamily 
          ? "¡Datos de la familia y apoderados actualizados correctamente en el padrón!"
          : "¡Nueva familia y miembros añadidos exitosamente al padrón!"
      });
      setShowFamilyModal(false);
      loadPadron();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSavingFamily(false);
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
        const data = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
        fileBuffers.push({ name: file.name, data });
      }

      // Parsear todos los archivos simultáneamente (Primaria y/o Secundaria)
      const parseResult = parseApafaWorkbooks(fileBuffers);

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

  // 9. Generar votos simulados para APAFA vinculados al padrón real de familias
  const handleGenerateMockVotes = async () => {
    if (!activeElection || !activeElection.id) {
      setMessage({ type: "error", text: "Debe haber una elección de simulacro de APAFA activa para generar votos." });
      return;
    }

    setIsGeneratingMock(true);
    setMessage(null);
    try {
      const res = await generateMockVotesApafaAction(activeElection.id, 40);
      if (res.error) throw new Error(res.error);

      if (res.success) {
        setMessage({
          type: "success",
          text: `¡Se generaron ${res.votosGenerados} votos de prueba con familias reales del padrón! (Familias pendientes: ${res.familiasRestantes})`
        });
      } else {
        setMessage({
          type: "error",
          text: res.message || "No se pudieron generar más votos de prueba."
        });
      }

      if (activeTab === "progreso") loadProgreso();
      if (activeTab === "padron") loadPadron();
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
                    {/* Header de la Lista con Logo y Datos */}
                    <div className="flex items-start justify-between gap-4 pb-5 border-b border-border">
                      <div className="flex gap-4 flex-1 flex-wrap sm:flex-nowrap">
                        {/* Logo Preview & File Upload Box */}
                        <div className="w-20 h-20 bg-background rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground overflow-hidden shrink-0 relative group/img shadow-inner">
                          {party.logo_url ? (
                            <img src={party.logo_url} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                          )}
                          <label className="absolute inset-0 bg-black/60 hidden group-hover/img:flex flex-col items-center justify-center cursor-pointer transition-all text-white text-[10px] font-semibold">
                            <Camera className="w-5 h-5 mb-0.5" />
                            <span>Subir</span>
                            <input 
                              type="file" 
                              accept="image/*"
                              className="hidden"
                              disabled={loading}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleLogoUpload(pIdx, e.target.files[0]);
                                }
                              }}
                            />
                          </label>
                        </div>

                        {/* Campos de Nombre, Número y Opciones de Logo */}
                        <div className="flex-1 space-y-3 min-w-[200px]">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div className="sm:col-span-1 space-y-1">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">N° Lista</label>
                              <input
                                type="text"
                                value={party.numero_lista || ""}
                                onChange={(e) => handleUpdateParty(pIdx, "numero_lista", e.target.value)}
                                placeholder="1"
                                className="w-full px-3 py-1.5 text-sm font-bold rounded-lg border border-border bg-background focus:border-amber-500 outline-none text-center"
                              />
                            </div>
                            <div className="sm:col-span-3 space-y-1">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nombre de la Lista / Partido</label>
                              <input
                                type="text"
                                value={party.nombre || ""}
                                onChange={(e) => handleUpdateParty(pIdx, "nombre", e.target.value)}
                                placeholder="Ej. Integración Familiar 2026"
                                className="w-full px-3 py-1.5 text-sm font-bold rounded-lg border border-border bg-background focus:border-amber-500 outline-none"
                              />
                            </div>
                          </div>

                          {/* Controles de Logo: Subir archivo, Quitar Logo y URL opcional */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Logo de la Lista
                              </label>
                              {party.logo_url && (
                                <button 
                                  type="button"
                                  onClick={() => handleUpdateParty(pIdx, "logo_url", "")}
                                  className="text-destructive hover:underline text-[11px] font-semibold"
                                >
                                  Quitar Logo
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-dashed border-border bg-background hover:border-amber-500/50 hover:bg-amber-500/5 cursor-pointer transition-colors text-foreground">
                                <Upload className="w-3.5 h-3.5 text-amber-600" />
                                {party.logo_url ? "Cambiar Imagen de Logo" : "Subir Archivo de Logo"}
                                <input 
                                  type="file" 
                                  accept="image/*"
                                  className="hidden"
                                  disabled={loading}
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleLogoUpload(pIdx, e.target.files[0]);
                                    }
                                  }}
                                />
                              </label>

                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  value={party.logo_url && party.logo_url.startsWith("data:") ? "(Imagen cargada)" : (party.logo_url || "")}
                                  onChange={(e) => {
                                    if (!e.target.value.startsWith("(Imagen")) {
                                      handleUpdateParty(pIdx, "logo_url", e.target.value);
                                    }
                                  }}
                                  placeholder="o pegar URL..."
                                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:border-amber-500 outline-none font-mono text-muted-foreground"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSavePartyDirect(pIdx)}
                          disabled={savingPartyIdx === pIdx}
                          className={`p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                            savedPartyIdx === pIdx
                              ? "bg-green-500/15 text-green-600 border border-green-500/30 scale-105"
                              : "text-muted-foreground hover:text-green-600 hover:bg-green-500/10 border border-border/70 hover:border-green-500/30"
                          }`}
                          title="Guardar esta lista con los datos actuales"
                        >
                          {savingPartyIdx === pIdx ? (
                            <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveParty(party.id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border/70 hover:border-destructive/30 rounded-xl transition-colors shrink-0 cursor-pointer"
                          title="Eliminar lista"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Candidatos Directivos de APAFA (Presidente, Vicepresidente, Tesorero(a), Secretario(a), Vocal 1, Vocal 2, Vocal 3) */}
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-amber-600" /> Integrantes del Consejo Directivo (7 Cargos)
                        </label>
                        <span className="text-[11px] text-muted-foreground font-medium">Búsqueda directa por DNI o Nombres</span>
                      </div>

                      <div className="space-y-3">
                        {(party.candidatos || []).map((cand: any, cIdx: number) => {
                          const searchKey = `${pIdx}-${cIdx}`;
                          const isAssigned = Boolean(cand.nombre || cand.dni);
                          const currentQuery = searchQueryMap[searchKey] || "";
                          const isSearching = isSearchingMap[searchKey] || false;
                          const results = searchResultsMap[searchKey] || [];
                          const hasSearchActive = activeSearchKey === searchKey && currentQuery.trim().length >= 1;
                          const isManualOpen = Boolean(manualCandidateForm[searchKey]);
                          const manualForm = manualCandidateForm[searchKey] || { nombres: "", dni: "", parentesco: "APODERADO" };

                          return (
                            <div key={cIdx} className="rounded-xl border border-border bg-card p-3 space-y-2 transition-all">
                              {isManualOpen ? (
                                <div className="rounded-2xl border-2 border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/90 p-4 space-y-4 shadow-sm animate-in fade-in">
                                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                                    <div className="flex items-center gap-2.5">
                                      <span className="shrink-0 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm">
                                        {cand.cargo}
                                      </span>
                                      <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                                        Ingreso Manual de Datos
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setManualCandidateForm(prev => { const copy = { ...prev }; delete copy[searchKey]; return copy; })}
                                      className="p-1 rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                                      title="Cancelar ingreso manual"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    <div>
                                      <label className="text-xs font-extrabold text-slate-900 dark:text-slate-100 block mb-1.5">
                                        Apellidos y Nombres <span className="text-destructive">*</span>
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Ej. Pérez García, Juan Carlos"
                                        value={manualForm.nombres}
                                        onChange={(e) => setManualCandidateForm(prev => ({
                                          ...prev,
                                          [searchKey]: { ...prev[searchKey], nombres: e.target.value }
                                        }))}
                                        className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 outline-none shadow-sm"
                                        autoFocus
                                      />
                                    </div>

                                    <div>
                                      <label className="text-xs font-extrabold text-slate-900 dark:text-slate-100 block mb-1.5">
                                        DNI (8 dígitos)
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="8 dígitos numéricos"
                                        maxLength={8}
                                        value={manualForm.dni}
                                        onChange={(e) => setManualCandidateForm(prev => ({
                                          ...prev,
                                          [searchKey]: { ...prev[searchKey], dni: e.target.value.replace(/\D/g, '').slice(0, 8) }
                                        }))}
                                        className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 outline-none font-mono shadow-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between pt-1 flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                      * Se guardará en la base de datos para habilitar su voto como apoderado.
                                    </span>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setManualCandidateForm(prev => { const copy = { ...prev }; delete copy[searchKey]; return copy; })}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!manualForm.nombres.trim() || savingManualCandidateKey === searchKey}
                                        onClick={() => handleConfirmManualCandidate(pIdx, cIdx, cand.cargo)}
                                        className="px-5 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {savingManualCandidateKey === searchKey ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" /> Guardando en BD...
                                          </>
                                        ) : (
                                          <>
                                            <Check className="w-4 h-4 stroke-[2.5]" /> Guardar y Asignar como {cand.cargo}
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : isAssigned ? (
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="shrink-0 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                      {cand.cargo}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-foreground truncate">
                                        {cand.nombre}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        {cand.dni && (
                                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-secondary border border-border text-foreground">
                                            DNI: {cand.dni}
                                          </span>
                                        )}
                                        {cand.parentesco && (
                                          <span className="text-xs text-muted-foreground font-medium">
                                            • {cand.parentesco}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenManualEntry(pIdx, cIdx, cand.nombre, cand.dni)}
                                      className="px-3.5 py-1.5 rounded-lg text-xs font-black text-black dark:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-2 border-slate-900 dark:border-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                                      title="Editar nombres o DNI"
                                    >
                                      <Edit className="w-3.5 h-3.5 text-black dark:text-white stroke-[2.5]" /> Editar
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCandidate(pIdx, cIdx)}
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border hover:border-destructive/30 transition-colors flex items-center gap-1 cursor-pointer"
                                      title="Quitar este candidato"
                                    >
                                      <X className="w-3.5 h-3.5" /> Quitar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {/* Input de Búsqueda */}
                                  <div className="flex items-center gap-2">
                                    <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-secondary text-foreground border border-border min-w-[100px] text-center">
                                      {cand.cargo}
                                    </span>

                                    <div className="relative flex-1">
                                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                      <input
                                        type="text"
                                        placeholder={`Buscar ${cand.cargo} por DNI o Nombres...`}
                                        value={currentQuery}
                                        onChange={(e) => handleCandidateSearch(pIdx, cIdx, e.target.value)}
                                        onFocus={() => {
                                          setActiveSearchKey(searchKey);
                                          if (currentQuery && (!results || results.length === 0)) {
                                            handleCandidateSearch(pIdx, cIdx, currentQuery);
                                          }
                                        }}
                                        className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:border-amber-500 outline-none text-foreground placeholder:text-muted-foreground"
                                      />
                                      {isSearching ? (
                                        <Loader2 className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 animate-spin" />
                                      ) : currentQuery ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSearchQueryMap(prev => ({ ...prev, [searchKey]: "" }));
                                            setSearchResultsMap(prev => ({ ...prev, [searchKey]: [] }));
                                          }}
                                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      ) : null}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenManualEntry(pIdx, cIdx, currentQuery)}
                                      className="px-3.5 py-1.5 rounded-lg text-xs font-black text-black dark:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-2 border-slate-900 dark:border-white transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                                      title="Ingresar nombres y DNI manualmente"
                                    >
                                      <UserPlus className="w-3.5 h-3.5 text-black dark:text-white stroke-[2.5]" /> Manual
                                    </button>
                                  </div>

                                  {/* Panel de Resultados IN-FLOW (Empuja hacia abajo, NO se sobrepone jamás) */}
                                  {hasSearchActive && (
                                    <div className="mt-2 rounded-xl border border-amber-500/40 bg-secondary/30 p-2.5 space-y-2 animate-in fade-in">
                                      <div className="flex items-center justify-between px-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-amber-600" /> Resultados del Padrón ({results.length})
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setActiveSearchKey(null)}
                                          className="text-[11px] text-muted-foreground hover:text-foreground font-semibold"
                                        >
                                          Cerrar
                                        </button>
                                      </div>

                                      {isSearching ? (
                                        <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                                          <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> Buscando apoderados en el padrón...
                                        </div>
                                      ) : results.length > 0 ? (
                                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                          {results.map((ap: any) => (
                                            <div
                                              key={ap.id}
                                              className="p-2.5 rounded-lg border border-border/80 bg-background hover:border-amber-500/50 hover:bg-amber-500/5 transition-all flex items-center justify-between gap-3"
                                            >
                                              <div className="min-w-0">
                                                <p className="font-bold text-xs text-foreground truncate">
                                                  {ap.apellidos}, {ap.nombres}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                                                  <span className="font-mono font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                    DNI: {ap.dni}
                                                  </span>
                                                  {ap.parentesco && (
                                                    <span className="bg-secondary px-1.5 py-0.5 rounded font-medium">
                                                      {ap.parentesco}
                                                    </span>
                                                  )}
                                                  {ap.nivel && (
                                                    <span className="capitalize">
                                                      • {ap.nivel}
                                                    </span>
                                                  )}
                                                  {ap.grado && (
                                                    <span>
                                                      • {ap.grado} "{ap.seccion}"
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => handleSelectCandidate(pIdx, cIdx, ap)}
                                                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                                              >
                                                <Check className="w-3.5 h-3.5" /> Asignar
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="py-3 px-2 text-center text-xs text-muted-foreground">
                                          No se encontraron apoderados que coincidan con "{currentQuery}".
                                        </div>
                                      )}

                                      {/* Opción de asignación manual con apertura de campos */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenManualEntry(pIdx, cIdx, currentQuery)}
                                        className="w-full text-left p-3 rounded-xl bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800 dark:hover:bg-slate-700/90 border-2 border-dashed border-slate-400 dark:border-slate-500 text-slate-900 dark:text-white font-bold flex items-center justify-between gap-2 transition-all cursor-pointer shadow-sm"
                                      >
                                        <span className="flex items-center gap-2 truncate text-slate-900 dark:text-white text-xs">
                                          <Plus className="w-4 h-4 text-slate-900 dark:text-white shrink-0 stroke-[2.5]" />
                                          {currentQuery.trim() ? (
                                            <span>Asignar <strong className="text-black dark:text-white underline font-extrabold">"{currentQuery}"</strong> como {cand.cargo} (manual)</span>
                                          ) : (
                                            <span>Escribir datos manualmente para {cand.cargo}</span>
                                          )}
                                        </span>
                                        <span className="text-xs bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-3 py-1 rounded-lg font-bold shrink-0">
                                          Abrir campos para escribir
                                        </span>
                                      </button>
                                    </div>
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
                type="button"
                onClick={handleOpenNewFamilyModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4 stroke-[2.5]" /> Añadir Miembro de Familia
              </button>
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
                    <th className="px-4 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {padronLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
                        <span className="text-xs text-muted-foreground">Cargando padrón...</span>
                      </td>
                    </tr>
                  ) : padronData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        No se encontraron registros en el padrón de APAFA. Sube un archivo Excel para comenzar o añade una familia manualmente.
                      </td>
                    </tr>
                  ) : (
                    padronData.map((a: any) => (
                      <tr key={a.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-foreground">{a.dni}</td>
                        <td className="px-4 py-3 font-semibold">{a.apellidos}, {a.nombres}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${a.parentesco === 'PADRE' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'bg-pink-500/10 text-pink-700 dark:text-pink-300'}`}>
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
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEditFamilyModal(a)}
                            className="px-3 py-1.5 rounded-lg text-xs font-black text-black dark:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-2 border-slate-900 dark:border-white transition-all inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                            title="Editar datos de la familia, padres, grado y sección"
                          >
                            <Edit className="w-3.5 h-3.5 text-black dark:text-white stroke-[2.5]" /> Editar
                          </button>
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

      {/* Modal de Añadir / Editar Familia en Padrón APAFA */}
      {showFamilyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-card text-card-foreground border border-border w-full max-w-3xl rounded-3xl p-5 sm:p-7 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${isEditingFamily ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                  {isEditingFamily ? <Edit className="w-6 h-6 stroke-[2.5]" /> : <UserPlus className="w-6 h-6 stroke-[2.5]" />}
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-foreground">
                    {isEditingFamily ? "Editar Familia y Apoderados del Padrón" : "Añadir Miembro de Familia al Padrón"}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    Permite registrar al padre, madre y los datos del estudiante para habilitar su voto oficial en APAFA.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFamilyModal(false)}
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                title="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="overflow-y-auto pr-1 space-y-5 flex-1">
              {familyLoading ? (
                <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                  <span className="text-xs font-semibold">Cargando datos de la familia...</span>
                </div>
              ) : (
                <>
                  {/* SECCIÓN 1: DATOS DEL ESTUDIANTE A CARGO */}
                  <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-600" /> 1. Datos del Estudiante (Hijo a Cargo)
                      </span>
                      <span className="text-[11px] text-muted-foreground font-semibold">
                        Requerido para asociar el grado y sección
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                      <div className="sm:col-span-12">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Apellidos y Nombres del Estudiante <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. BARRANZUELA PALACIOS, FERNANDO FABRICIO"
                          value={familyForm.hijos}
                          onChange={(e) => setFamilyForm(prev => ({ ...prev, hijos: e.target.value.toUpperCase() }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-amber-500 outline-none text-foreground placeholder:text-muted-foreground uppercase shadow-sm"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Nivel Educativo <span className="text-destructive">*</span>
                        </label>
                        <select
                          value={familyForm.nivel}
                          onChange={(e) => setFamilyForm(prev => ({ ...prev, nivel: e.target.value }))}
                          className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-amber-500 outline-none text-foreground shadow-sm"
                        >
                          <option value="primaria">Primaria</option>
                          <option value="secundaria">Secundaria</option>
                          <option value="mixto">Mixto (Ambos Niveles)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Grado <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 1°, 2°, 3°"
                          value={familyForm.grado}
                          onChange={(e) => setFamilyForm(prev => ({ ...prev, grado: e.target.value }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-amber-500 outline-none text-foreground placeholder:text-muted-foreground shadow-sm"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Sección <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. A, B, C, U"
                          maxLength={5}
                          value={familyForm.seccion}
                          onChange={(e) => setFamilyForm(prev => ({ ...prev, seccion: e.target.value.toUpperCase() }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-amber-500 outline-none text-foreground placeholder:text-muted-foreground uppercase shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: DATOS DEL PADRE */}
                  <div className="rounded-2xl border-2 border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider bg-blue-600 text-white shadow-sm">
                          PADRE
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {familyForm.padre.dni ? "Apoderado Registrado / En edición" : "Opcional si solo vota la madre"}
                        </span>
                      </div>
                      {(familyForm.padre.dni || familyForm.padre.nombres) && (
                        <button
                          type="button"
                          onClick={handleClearPadre}
                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Limpiar padre
                        </button>
                      )}
                    </div>

                    {/* Búsqueda de Padre */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar padre existente por DNI o Apellidos para autocompletar..."
                        value={padreSearchQuery}
                        onChange={(e) => handleSearchPadre(e.target.value)}
                        onFocus={() => { if (padreSearchQuery.trim()) setShowPadreResults(true); }}
                        className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-border bg-background focus:border-blue-500 outline-none text-foreground placeholder:text-muted-foreground shadow-sm"
                      />
                      {isSearchingPadre ? (
                        <Loader2 className="w-4 h-4 absolute right-2.5 top-2.5 text-blue-600 animate-spin" />
                      ) : padreSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => { setPadreSearchQuery(""); setShowPadreResults(false); }}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}

                      {/* Dropdown Resultados Búsqueda Padre */}
                      {showPadreResults && (
                        <div className="mt-2 rounded-xl border border-blue-500/40 bg-card p-2.5 space-y-2 shadow-lg animate-in fade-in">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Resultados de búsqueda ({padreSearchResults.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowPadreResults(false)}
                              className="text-[11px] text-muted-foreground hover:text-foreground font-semibold"
                            >
                              Cerrar
                            </button>
                          </div>

                          {padreSearchResults.length > 0 ? (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {padreSearchResults.map((ap: any) => (
                                <div
                                  key={ap.id}
                                  className="p-2 rounded-lg border border-border/80 bg-background hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0">
                                    <p className="font-bold text-foreground truncate">
                                      {ap.apellidos}, {ap.nombres}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground font-mono">
                                      DNI: {ap.dni} {ap.hijos ? `• Hijo: ${ap.hijos}` : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectPadreFromSearch(ap)}
                                    className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                                  >
                                    <Check className="w-3 h-3" /> Seleccionar
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-2 px-1 text-xs text-muted-foreground">
                              No se encontró apoderado con "{padreSearchQuery}".
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const clean = padreSearchQuery.trim();
                              const isNum = /^\d+$/.test(clean);
                              setFamilyForm(prev => ({
                                ...prev,
                                padre: {
                                  ...prev.padre,
                                  dni: isNum ? clean.slice(0, 8) : prev.padre.dni,
                                  apellidos: !isNum && !prev.padre.apellidos ? clean.toUpperCase() : prev.padre.apellidos
                                }
                              }));
                              setShowPadreResults(false);
                            }}
                            className="w-full text-left p-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-dashed border-blue-400 text-blue-950 dark:text-blue-200 text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer"
                          >
                            <span>Completar manualmente usando "{padreSearchQuery}"</span>
                            <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inputs Directos Padre */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          DNI Padre (8 dígitos)
                        </label>
                        <input
                          type="text"
                          placeholder="8 dígitos"
                          maxLength={8}
                          value={familyForm.padre.dni}
                          onChange={(e) => setFamilyForm(prev => ({
                            ...prev,
                            padre: { ...prev.padre, dni: e.target.value.replace(/\D/g, '').slice(0, 8) }
                          }))}
                          className="w-full px-3.5 py-2 text-xs font-bold font-mono rounded-xl border border-border bg-background focus:border-blue-500 outline-none text-foreground placeholder:text-muted-foreground shadow-sm"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Apellidos del Padre
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. PÉREZ GARCÍA"
                          value={familyForm.padre.apellidos}
                          onChange={(e) => setFamilyForm(prev => ({
                            ...prev,
                            padre: { ...prev.padre, apellidos: e.target.value.toUpperCase() }
                          }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-blue-500 outline-none text-foreground placeholder:text-muted-foreground uppercase shadow-sm"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Nombres del Padre
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. JUAN CARLOS"
                          value={familyForm.padre.nombres}
                          onChange={(e) => setFamilyForm(prev => ({
                            ...prev,
                            padre: { ...prev.padre, nombres: e.target.value.toUpperCase() }
                          }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-blue-500 outline-none text-foreground placeholder:text-muted-foreground uppercase shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: DATOS DE LA MADRE */}
                  <div className="rounded-2xl border-2 border-pink-500/30 bg-pink-500/5 dark:bg-pink-950/20 p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-pink-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider bg-pink-600 text-white shadow-sm">
                          MADRE / APODERADA
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {familyForm.madre.dni ? "Apoderada Registrada / En edición" : "Opcional si solo vota el padre"}
                        </span>
                      </div>
                      {(familyForm.madre.dni || familyForm.madre.nombres) && (
                        <button
                          type="button"
                          onClick={handleClearMadre}
                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Limpiar madre
                        </button>
                      )}
                    </div>

                    {/* Búsqueda de Madre */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar madre existente por DNI o Apellidos para autocompletar..."
                        value={madreSearchQuery}
                        onChange={(e) => handleSearchMadre(e.target.value)}
                        onFocus={() => { if (madreSearchQuery.trim()) setShowMadreResults(true); }}
                        className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-border bg-background focus:border-pink-500 outline-none text-foreground placeholder:text-muted-foreground shadow-sm"
                      />
                      {isSearchingMadre ? (
                        <Loader2 className="w-4 h-4 absolute right-2.5 top-2.5 text-pink-600 animate-spin" />
                      ) : madreSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => { setMadreSearchQuery(""); setShowMadreResults(false); }}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}

                      {/* Dropdown Resultados Búsqueda Madre */}
                      {showMadreResults && (
                        <div className="mt-2 rounded-xl border border-pink-500/40 bg-card p-2.5 space-y-2 shadow-lg animate-in fade-in">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Resultados de búsqueda ({madreSearchResults.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowMadreResults(false)}
                              className="text-[11px] text-muted-foreground hover:text-foreground font-semibold"
                            >
                              Cerrar
                            </button>
                          </div>

                          {madreSearchResults.length > 0 ? (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {madreSearchResults.map((ap: any) => (
                                <div
                                  key={ap.id}
                                  className="p-2 rounded-lg border border-border/80 bg-background hover:border-pink-500/50 hover:bg-pink-500/5 transition-all flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0">
                                    <p className="font-bold text-foreground truncate">
                                      {ap.apellidos}, {ap.nombres}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground font-mono">
                                      DNI: {ap.dni} {ap.hijos ? `• Hijo: ${ap.hijos}` : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectMadreFromSearch(ap)}
                                    className="shrink-0 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                                  >
                                    <Check className="w-3 h-3" /> Seleccionar
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-2 px-1 text-xs text-muted-foreground">
                              No se encontró apoderada con "{madreSearchQuery}".
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const clean = madreSearchQuery.trim();
                              const isNum = /^\d+$/.test(clean);
                              setFamilyForm(prev => ({
                                ...prev,
                                madre: {
                                  ...prev.madre,
                                  dni: isNum ? clean.slice(0, 8) : prev.madre.dni,
                                  apellidos: !isNum && !prev.madre.apellidos ? clean.toUpperCase() : prev.madre.apellidos
                                }
                              }));
                              setShowMadreResults(false);
                            }}
                            className="w-full text-left p-2 rounded-lg bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-900/50 border border-dashed border-pink-400 text-pink-950 dark:text-pink-200 text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer"
                          >
                            <span>Completar manualmente usando "{madreSearchQuery}"</span>
                            <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inputs Directos Madre */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          DNI Madre (8 dígitos)
                        </label>
                        <input
                          type="text"
                          placeholder="8 dígitos"
                          maxLength={8}
                          value={familyForm.madre.dni}
                          onChange={(e) => setFamilyForm(prev => ({
                            ...prev,
                            madre: { ...prev.madre, dni: e.target.value.replace(/\D/g, '').slice(0, 8) }
                          }))}
                          className="w-full px-3.5 py-2 text-xs font-bold font-mono rounded-xl border border-border bg-background focus:border-pink-500 outline-none text-foreground placeholder:text-muted-foreground shadow-sm"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Apellidos de la Madre
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. DOMÍNGUEZ ZETA"
                          value={familyForm.madre.apellidos}
                          onChange={(e) => setFamilyForm(prev => ({
                            ...prev,
                            madre: { ...prev.madre, apellidos: e.target.value.toUpperCase() }
                          }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-pink-500 outline-none text-foreground placeholder:text-muted-foreground uppercase shadow-sm"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-xs font-bold text-foreground block mb-1">
                          Nombres de la Madre
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. CARMEN ROSA"
                          value={familyForm.madre.nombres}
                          onChange={(e) => setFamilyForm(prev => ({
                            ...prev,
                            madre: { ...prev.madre, nombres: e.target.value.toUpperCase() }
                          }))}
                          className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background focus:border-pink-500 outline-none text-foreground placeholder:text-muted-foreground uppercase shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border pt-4 mt-4 shrink-0 flex-wrap gap-2">
              <span className="text-xs text-muted-foreground font-semibold">
                * Con al menos un DNI registrado, la familia queda habilitada para votar.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFamilyModal(false)}
                  disabled={savingFamily}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border border-border hover:bg-secondary transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveFamily}
                  disabled={savingFamily || familyLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {savingFamily ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Guardando en Padrón...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 stroke-[2.5]" /> {isEditingFamily ? "Guardar Cambios" : "Guardar Familia en Padrón"}
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

