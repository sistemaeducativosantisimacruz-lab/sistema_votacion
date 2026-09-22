"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Users, Image as ImageIcon, Search, Settings, Save, Trash2, FileSpreadsheet, Upload, AlertCircle, CheckCircle2, ShieldCheck, UserX, Archive, Loader2, BarChart2, PlayCircle, StopCircle, Beaker, Camera, Edit, LogOut, Download, Square, X, Eye, EyeOff, UserPlus } from "lucide-react";
import Link from "next/link";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { getAdminSessionAction, logoutAdminAction } from "@/app/actions/auth";
import { getAdminsAction, createManualAdminAction, editManualAdminAction, demoteAdminAction, promoteStudentToComiteAction, updateCargoAction } from "@/app/actions/admin";
import { deleteElectionAction, updateElectionStatusAction, deletePartyAction, updateStudentsVoteStatusAction, deleteVotesByElectionAction, insertMockVotesAction, insertElectionAction, upsertPartyAction, updateElectionDataAction, updatePartyCandidatesAction, getCargosAction } from "@/app/actions/plantilla";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Party = {
  id?: string;
  nombre: string;
  logo_url: string;
  nivel?: "primaria" | "secundaria" | "general";
  numero_lista?: string | number;
  isEditing?: boolean;
  candidatos?: Record<string, any>;
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"plantilla" | "padron" | "accesos" | "progreso" | "historial">("plantilla");
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });
  
  // Plantilla State
  const [isMounted, setIsMounted] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<"oficial" | "simulacro">("oficial");
  
  useEffect(() => {
    const saved = sessionStorage.getItem("editing_workspace");
    if (saved === "oficial" || saved === "simulacro") {
      setEditingWorkspace(saved);
    }
    setIsMounted(true);
  }, []);

  const [electionId, setElectionId] = useState<string | null>(null);
  const [electionTitle, setElectionTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [electionYear, setElectionYear] = useState("");
  const [electionDate, setElectionDate] = useState("");
  const [isOfficialElectionActive, setIsOfficialElectionActive] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const [cargos, setCargos] = useState<{id: string, descripcion: string}[]>([]);

  useEffect(() => {
    const fetchCargos = async () => {
      const result = await getCargosAction();
      if (result.data) setCargos(result.data);
    };
    fetchCargos();
  }, []);

  const handleWorkspaceChange = (workspace: "oficial" | "simulacro") => {
    setEditingWorkspace(workspace);
    sessionStorage.setItem("editing_workspace", workspace);
  };
  const [plantillaMessage, setPlantillaMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [systemIsTestMode, setSystemIsTestMode] = useState(false);

  // Padrón State
  const [padronSearch, setPadronSearch] = useState("");
  const [padronNivel, setPadronNivel] = useState("");
  const [padronGrado, setPadronGrado] = useState("");
  const [padronSeccion, setPadronSeccion] = useState("");
  const [padronResults, setPadronResults] = useState<any[]>([]);
  const [padronTotalCount, setPadronTotalCount] = useState(0);
  const [padronPage, setPadronPage] = useState(1);
  const [padronLoading, setPadronLoading] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStudentData, setEditingStudentData] = useState<any>({});
  
  const [isDownloadingPadron, setIsDownloadingPadron] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [includeVoteStatus, setIncludeVoteStatus] = useState(false);
  const [nivelesDisponibles, setNivelesDisponibles] = useState<string[]>([]);
  const [rawFilterData, setRawFilterData] = useState<any[]>([]);

  // Filtros dinámicos Padrón
  const padronGradosDisponibles = useMemo(() => {
    const grados = new Set<string>();
    rawFilterData.forEach(d => {
      if (padronNivel && d.nivel?.trim() !== padronNivel) return;
      if (d.grado) grados.add(d.grado.trim());
    });
    return Array.from(grados).sort();
  }, [rawFilterData, padronNivel]);

  const padronSeccionesDisponibles = useMemo(() => {
    const secciones = new Set<string>();
    rawFilterData.forEach(d => {
      if (padronNivel && d.nivel?.trim() !== padronNivel) return;
      if (padronGrado && d.grado?.trim() !== padronGrado) return;
      if (d.seccion) secciones.add(d.seccion.trim());
    });
    return Array.from(secciones).sort();
  }, [rawFilterData, padronNivel, padronGrado]);
  // Roles Management State
  const [searchDni, setSearchDni] = useState("");
  const [foundStudent, setFoundStudent] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<"Secretario(a)" | "Vocal" | "VicePresidente" | "Presidente">("Vocal");
  const [editingCargoId, setEditingCargoId] = useState<string | null>(null);
  const [editingCargoValue, setEditingCargoValue] = useState<string>("");
  const [studentToRemove, setStudentToRemove] = useState<any>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [roleMessage, setRoleMessage] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isComite, setIsComite] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [archiveCountdown, setArchiveCountdown] = useState(0);
  const [showCleanSimulacrosConfirm, setShowCleanSimulacrosConfirm] = useState(false);
  const [cleanSimulacrosCountdown, setCleanSimulacrosCountdown] = useState(0);
  
  // Manual Admin Creation State
  const [manualDni, setManualDni] = useState("");
  const [manualNombres, setManualNombres] = useState("");
  const [manualApellidos, setManualApellidos] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [showManualAdminModal, setShowManualAdminModal] = useState(false);
  const [editingManualAdminId, setEditingManualAdminId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);

  // Progreso State
  const [progresoData, setProgresoData] = useState<any[]>([]);
  const [progresoLoading, setProgresoLoading] = useState(false);
  const [progresoNivel, setProgresoNivel] = useState("");
  const [progresoGrado, setProgresoGrado] = useState("");
  const [progresoSeccion, setProgresoSeccion] = useState("");

  // Historical State
  const [historicalElections, setHistoricalElections] = useState<any[]>([]);
  const [selectedHistoricalElection, setSelectedHistoricalElection] = useState<string>("");
  const [historicalResults, setHistoricalResults] = useState<any[]>([]);
  const [historicalRawVotes, setHistoricalRawVotes] = useState<any[]>([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);

  const loadHistoricalElections = async () => {
    const { data } = await supabase
      .from('elecciones')
      .select('id, titulo, creado_en')
      .eq('esta_activa', false)
      .order('creado_en', { ascending: false });
    if (data) setHistoricalElections(data);
  };

  const handleCleanSimulacrosHistory = async () => {
    setHistoricalLoading(true);
    try {
      await deleteElectionAction();
      setSelectedHistoricalElection("");
      await loadHistoricalElections();
      setHistoricalResults([]);
      setShowCleanSimulacrosConfirm(false);
    } catch (err: any) {
      console.error("Error cleaning simulacros:", err);
      setShowCleanSimulacrosConfirm(false);
    } finally {
      setHistoricalLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    const election = historicalElections.find(e => e.id === selectedHistoricalElection);
    if (!election || historicalResults.length === 0) return;

    setHistoricalLoading(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      const year = new Date(election.creado_en).getFullYear();

      // Funciones de utilidad para centrar texto
      const centerText = (text: string, y: number, size: number, isBold: boolean = false, color: number[] = [0,0,0]) => {
        doc.setFontSize(size);
        if (isBold) doc.setFont("helvetica", "bold");
        else doc.setFont("helvetica", "normal");
        doc.setTextColor(color[0], color[1], color[2]);
        const textWidth = doc.getTextWidth(text);
        doc.text(text, (pageWidth - textWidth) / 2, y);
      };

      // Usar ruta estatica. jsPDF necesita que la imagen cargue. Usaremos Image object.
      const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
      });

      let currentY = 80;

      try {
        const logo = await loadImage('/insignia.png');
        // Insignia grande en la primera pagina
        const logoWidth = 80;
        const logoHeight = (logo.height * logoWidth) / logo.width;
        doc.addImage(logo, 'PNG', (pageWidth - logoWidth) / 2, currentY, logoWidth, logoHeight);
        currentY += logoHeight + 30;
      } catch (e) {
        console.warn("No se pudo cargar la insignia para el PDF", e);
        currentY += 40;
      }

      // Título principal
      centerText(`RESULTADO DE ELECCIÓN ESTUDIANTIL (${year})`, currentY, 24, true, [30, 58, 138]); // Azul oscuro
      currentY += 15;
      centerText(election.titulo.toUpperCase(), currentY, 18, false, [100, 100, 100]);

      // ---------------- PÁGINA 2 ----------------
      doc.addPage();
      currentY = 20;

      const drawHeaderWithSmallLogo = async () => {
        try {
          const logo = await loadImage('/insignia.png');
          doc.addImage(logo, 'PNG', 15, 10, 15, (logo.height * 15) / logo.width);
        } catch(e){}
        centerText(`RESULTADO DE ELECCIÓN ESTUDIANTIL (${year})`, 20, 12, true, [100, 100, 100]);
      };
      
      await drawHeaderWithSmallLogo();
      currentY = 40;

      // Determinar Ganador
      const validParties = historicalResults.filter(p => p.id !== 'blanco');
      const winner = validParties.length > 0 ? validParties[0] : historicalResults[0];

      if (winner && winner.votos > 0) {
        // Título del Ganador
        doc.setFillColor(243, 244, 246); // bg-gray-100
        doc.roundedRect(15, currentY, pageWidth - 30, 35, 3, 3, 'F');
        
        let hasLogo = false;
        try {
          if (winner.logo_url) {
            const pLogo = await loadImage(winner.logo_url);
            doc.addImage(pLogo, 'PNG', 20, currentY + 5, 25, 25);
            hasLogo = true;
          }
        } catch(e){}

        const textStartX = hasLogo ? 55 : 25;

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38); // Rojo
        doc.text(`PARTIDO GANADOR`, textStartX, currentY + 15);
        
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 0);
        doc.text(`${winner.nombre.toUpperCase()} - LISTA N° ${winner.numero_lista || '1'}`, textStartX, currentY + 25);
        currentY += 55;
      }

      // GRÁFICO DE PORCENTAJES
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 138);
      doc.text("Desglose de Votación:", 15, currentY);
      currentY += 15;

      const totalVotes = historicalResults.reduce((sum, p) => sum + p.votos, 0);

      // Dibujar Gráfico de Barras Manual
      const chartX = 65;
      const chartWidth = pageWidth - chartX - 55; // 55 margin right para dejar espacio a los textos
      const barHeight = 8;
      const barSpacing = 12;

      for (let i = 0; i < historicalResults.length; i++) {
        const party = historicalResults[i];
        if (currentY > pageHeight - 30) {
          doc.addPage();
          currentY = 30;
          await drawHeaderWithSmallLogo();
        }

        // Nombre del partido (Truncado)
        doc.setFontSize(10);
        const isWinner = i === 0 && party.votos > 0;
        const isBlanco = party.id === 'blanco';
        if (isWinner && !isBlanco) doc.setFont("helvetica", "bold");
        else doc.setFont("helvetica", "normal");
        
        doc.setTextColor(0,0,0);
        let partyName = party.nombre;
        if (partyName.length > 25) partyName = partyName.substring(0, 23) + "...";
        doc.text(partyName, 15, currentY + 6);

        // Barra de fondo
        doc.setFillColor(229, 231, 235); // bg-gray-200
        doc.rect(chartX, currentY, chartWidth, barHeight, 'F');

        // Barra de progreso
        const progressWidth = (party.porcentaje / 100) * chartWidth;
        if (isBlanco) doc.setFillColor(156, 163, 175); // gray
        else if (isWinner) doc.setFillColor(79, 70, 229); // indigo
        else doc.setFillColor(129, 140, 248); // light indigo

        if (progressWidth > 0) {
          doc.rect(chartX, currentY, progressWidth, barHeight, 'F');
        }

        // Porcentaje y votos texto
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`${party.porcentaje.toFixed(1)}%`, chartX + chartWidth + 5, currentY + 6);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100,100,100);
        doc.text(`(${party.votos} votos)`, chartX + chartWidth + 18, currentY + 6);

        currentY += barSpacing;
      }

      currentY += 15;
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 100, 100);
      doc.text(`Total de votos emitidos: ${totalVotes}`, 15, currentY);
      currentY += 20;

      // Tabla de Estudiantes (Candidatos)
      if (winner && winner.votos > 0 && winner.partido_candidatos && winner.partido_candidatos.length > 0) {
        
        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = 30;
          await drawHeaderWithSmallLogo();
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 138);
        doc.text("Plancha Presidencial / Candidatos:", 15, currentY);
        currentY += 8;

        const tableData = winner.partido_candidatos.map((pc: any) => [
          pc.cargos?.descripcion || 'Cargo',
          `${pc.estudiantes?.nombres} ${pc.estudiantes?.apellidos}`,
          `${pc.estudiantes?.grado} ${pc.estudiantes?.seccion}`
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Cargo', 'Nombres y Apellidos', 'Grado / Sección']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 10, cellPadding: 5 },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 15, right: 15 },
        });
        
        currentY = (doc as any).lastAutoTable.finalY + 20;
      }

      // TABLA DEMOGRÁFICA
      if (historicalRawVotes && historicalRawVotes.length > 0) {
        doc.addPage();
        currentY = 30;
        await drawHeaderWithSmallLogo();
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 138);
        doc.text("Análisis Demográfico del Voto (Solo Uso Interno)", 15, currentY);
        currentY += 15;

        const renderDemographicTable = (nivelName: string, grados: string[]) => {
          if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = 30;
            drawHeaderWithSmallLogo();
          }

          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(`Nivel: ${nivelName}`, 15, currentY);
          currentY += 8;

          const levelVotes = historicalRawVotes.filter(v => (v.nivel_votante || 'secundaria').toLowerCase() === nivelName.toLowerCase());
          
          const validPartiesList = historicalResults.filter(p => p.id !== 'blanco');
          
          const head = [['Grado', ...validPartiesList.map(p => {
             let name = p.nombre;
             return name.length > 15 ? name.substring(0,13) + '...' : name;
          }), 'Blanco']];
          
          const body = grados.map(grado => {
            const row = [`${grado.replace(/[^0-9]/g, '')}° Grado`];
            const gradeVotes = levelVotes.filter(v => String(v.grado_votante) === grado);
            
            validPartiesList.forEach(p => {
              row.push(gradeVotes.filter(v => v.partido_id === p.id).length.toString());
            });
            // Blanco
            row.push(gradeVotes.filter(v => v.partido_id === null).length.toString());
            return row;
          });

          autoTable(doc, {
            startY: currentY,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'center' },
            bodyStyles: { halign: 'center' },
            columnStyles: { 0: { fontStyle: 'bold', halign: 'left' } },
            styles: { fontSize: 9, cellPadding: 4 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 15, right: 15 },
          });
          
          currentY = (doc as any).lastAutoTable.finalY + 15;
        };

        renderDemographicTable("Secundaria", ["1ro", "2do", "3ro", "4to", "5to"]);
        renderDemographicTable("Primaria", ["1ro", "2do", "3ro", "4to", "5to", "6to"]);
      }

      // FOOTER
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generado por Sistema de Votación Escolar - Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }

      // Descargar
      doc.save(`Resultado_Eleccion_${year}.pdf`);
      setPlantillaMessage({ type: 'success', text: "PDF generado y descargado correctamente." });
    } catch (err: any) {
      console.error(err);
      setPlantillaMessage({ type: 'error', text: "Error al generar PDF: " + err.message });
    } finally {
      setHistoricalLoading(false);
    }
  };

  const loadHistoricalResults = async (elecId: string) => {
    if (!elecId) {
      setHistoricalResults([]);
      return;
    }
    setHistoricalLoading(true);
    try {
      const { data: elecData } = await supabase.from('elecciones').select('snapshot_historico').eq('id', elecId).single();
      const { data: votesData } = await supabase.from('votos').select('partido_id, grado_votante, nivel_votante').eq('eleccion_id', elecId);
      
      setHistoricalRawVotes(votesData || []);

      let partiesSnapshot: any[] = [];
      if (elecData && elecData.snapshot_historico) {
        partiesSnapshot = typeof elecData.snapshot_historico === 'string' 
          ? JSON.parse(elecData.snapshot_historico) 
          : elecData.snapshot_historico;
      }

      const totalVotes = votesData ? votesData.length : 0;
      const validVotes = votesData ? votesData.filter(v => v.partido_id !== null).length : 0;
      const blankVotes = totalVotes - validVotes;

      const results = partiesSnapshot.map((p: any) => {
        const pVotes = votesData ? votesData.filter(v => v.partido_id === p.id).length : 0;
        return {
          ...p,
          votos: pVotes,
          porcentaje: totalVotes > 0 ? (pVotes / totalVotes) * 100 : 0
        };
      });

      results.sort((a: any, b: any) => b.votos - a.votos);

      if (blankVotes > 0) {
        results.push({
          id: 'blanco',
          nombre: 'Votos en Blanco',
          logo_url: null,
          votos: blankVotes,
          porcentaje: totalVotes > 0 ? (blankVotes / totalVotes) * 100 : 0,
          partido_candidatos: []
        });
      }

      setHistoricalResults(results);
    } catch (err) {
      console.error("Error loading historical results:", err);
    } finally {
      setHistoricalLoading(false);
    }
  };

  // Filtros dinámicos Progreso
  const progresoGradosDisponibles = useMemo(() => {
    const grados = new Set<string>();
    rawFilterData.forEach(d => {
      if (progresoNivel && d.nivel?.trim() !== progresoNivel) return;
      if (d.grado) grados.add(d.grado.trim());
    });
    return Array.from(grados).sort();
  }, [rawFilterData, progresoNivel]);

  const progresoSeccionesDisponibles = useMemo(() => {
    const secciones = new Set<string>();
    rawFilterData.forEach(d => {
      if (progresoNivel && d.nivel?.trim() !== progresoNivel) return;
      if (progresoGrado && d.grado?.trim() !== progresoGrado) return;
      if (d.seccion) secciones.add(d.seccion.trim());
    });
    return Array.from(secciones).sort();
  }, [rawFilterData, progresoNivel, progresoGrado]);

  // Candidates Modal State
  const [isCandidatesModalOpen, setIsCandidatesModalOpen] = useState(false);
  const [selectedPartyForCandidates, setSelectedPartyForCandidates] = useState<Party | null>(null);
  const [selectedPartyIndexForCandidates, setSelectedPartyIndexForCandidates] = useState<number | null>(null);
  const [candidatesForm, setCandidatesForm] = useState<Record<string, any>>({});
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [candidateSearchRole, setCandidateSearchRole] = useState<string | null>(null);
  const [candidateSearchResults, setCandidateSearchResults] = useState<any[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);



  const handleOpenCandidatesModal = (party: Party, index: number) => {
    if (!party.id) {
      setPlantillaMessage({ type: 'error', text: 'Guarda el partido antes de asignarle candidatos.' });
      return;
    }
    setSelectedPartyForCandidates(party);
    setSelectedPartyIndexForCandidates(index);
    setCandidatesForm(party.candidatos || {});
    setIsCandidatesModalOpen(true);
    setCandidateSearchQuery("");
    setCandidateSearchRole(null);
    setCandidateSearchResults([]);
  };

  const handleSearchCandidateForRole = async (query: string, role: string) => {
    setCandidateSearchQuery(query);
    setCandidateSearchRole(role);
    if (query.trim().length < 3) {
      setCandidateSearchResults([]);
      return;
    }
    setIsSearchingCandidates(true);
    const { data } = await supabase
      .from('estudiantes')
      .select('id, dni, nombres, apellidos, grado, seccion')
      .or(`nombres.ilike.%${query}%,apellidos.ilike.%${query}%,dni.ilike.%${query}%`)
      .limit(5);
    setCandidateSearchResults(data || []);
    setIsSearchingCandidates(false);
  };

  const handleSelectCandidate = (role: string, student: any) => {
    setCandidatesForm(prev => ({ ...prev, [role]: student }));
    setCandidateSearchQuery("");
    setCandidateSearchRole(null);
    setCandidateSearchResults([]);
  };

  const handleRemoveCandidate = (role: string) => {
    setCandidatesForm(prev => {
      const newForm = { ...prev };
      delete newForm[role];
      return newForm;
    });
  };

  const handleSaveCandidates = async () => {
    if (selectedPartyIndexForCandidates === null || !selectedPartyForCandidates?.id) return;
    setLoading(true);
    try {
      // Preparar el array de inserción relacional
      const relationalInserts = Object.keys(candidatesForm).map(cargoId => {
        const student = candidatesForm[cargoId];
        return {
          partido_id: selectedPartyForCandidates.id,
          estudiante_id: student.id,
          cargo_id: cargoId
        };
      });

      const { error } = await updatePartyCandidatesAction(selectedPartyForCandidates.id, relationalInserts);
      if (error) throw new Error(error as string);

      setParties(prev => {
        const newParties = [...prev];
        newParties[selectedPartyIndexForCandidates] = {
          ...newParties[selectedPartyIndexForCandidates],
          candidatos: candidatesForm
        };
        return newParties;
      });
      setPlantillaMessage({ type: 'success', text: 'Candidatos asignados correctamente al partido.' });
      setIsCandidatesModalOpen(false);
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: 'Error al guardar candidatos: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const router = useRouter();

  const checkSystemStatus = async () => {
    // maybeSingle fallará si hay más de 1 activa, vamos a curarnos en salud y usar limit(1)
    const { data: activeElec } = await supabase.from('elecciones').select('titulo').eq('esta_activa', true).order('creado_en', { ascending: false }).limit(1).maybeSingle();
    if (activeElec && activeElec.titulo.startsWith('[PRUEBA]')) {
      setSystemIsTestMode(true);
    } else {
      setSystemIsTestMode(false);
    }
  };

  const loadPadronFilters = async () => {
    const { data, error } = await supabase
      .from('estudiantes')
      .select('nivel, grado, seccion')
      .neq('rol', 'superadmin')
      .neq('rol', 'administrador');
      
    if (!error && data) {
      const niveles = new Set<string>();
      data.forEach(d => {
        if (d.nivel) niveles.add(d.nivel.trim());
      });
      setNivelesDisponibles(Array.from(niveles).sort());
      setRawFilterData(data);
    }
  };

  const handleSaveStudentEdit = async (studentId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('estudiantes')
        .update({
          dni: editingStudentData.dni,
          nombres: editingStudentData.nombres,
          apellidos: editingStudentData.apellidos,
          grado: editingStudentData.grado,
          seccion: editingStudentData.seccion
        })
        .eq('id', studentId);
        
      if (error) throw error;
      
      setPlantillaMessage({ type: 'success', text: 'Datos del estudiante actualizados correctamente.' });
      setEditingStudentId(null);
      handleSearchPadron(padronPage); // Refresh current page
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: 'Error al actualizar estudiante: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchPadron = async (page = padronPage) => {
    setPadronLoading(true);
    try {
      let query = supabase
        .from('estudiantes')
        .select('*', { count: 'exact' })
        .neq('rol', 'superadmin')
        .neq('rol', 'administrador');
      
      if (padronSearch) {
        query = query.or(`nombres.ilike.%${padronSearch}%,apellidos.ilike.%${padronSearch}%,dni.ilike.%${padronSearch}%`);
      }
      if (padronNivel) {
        query = query.ilike('nivel', `%${padronNivel}%`);
      }
      if (padronGrado) {
        query = query.ilike('grado', `%${padronGrado}%`);
      }
      if (padronSeccion) {
        query = query.ilike('seccion', `%${padronSeccion}%`);
      }
      
      const from = (page - 1) * 30;
      const to = from + 29;
      
      const { data, count, error } = await query
        .order('apellidos', { ascending: true })
        .range(from, to);
        
      if (!error && data) {
        setPadronResults(data);
        setPadronTotalCount(count || 0);
        setPadronPage(page);
      }
    } catch(err) {
      console.error(err);
    } finally {
      setPadronLoading(false);
    }
  };

  const loadProgresoData = async () => {
    setProgresoLoading(true);
    const { data, error } = await supabase.from('estudiantes').select('id, nivel, grado, seccion, ya_voto, rol');
    if (!error && data) {
      setProgresoData(data);
    }
    setProgresoLoading(false);
  };

  useEffect(() => {
    const initSession = async () => {
      const session = await getAdminSessionAction();
      if (!session) {
        router.push("/admin");
        return;
      }
      
      setCurrentUser(session);
      
      setIsSuperAdmin(session.rol === "superadmin");
      const esComite = session.rol === "comite";
      setIsComite(esComite);
      
      if (esComite) {
        setActiveTab("progreso");
      }
      
      checkSystemStatus();
    };

    initSession();
  }, [router]);

  useEffect(() => {
    if (!isMounted) return;

    if (activeTab === "accesos" && isSuperAdmin) {
      loadAdmins();
    } else {
      setRoleMessage("");
      setSearchDni("");
      setFoundStudent(null);
      setNewPassword("");
      setShowNewPassword(false);
    }

    if (activeTab === "plantilla") {
      loadWorkspaceData(editingWorkspace);
    }

    if (activeTab === "padron") {
      loadPadronFilters();
      handleSearchPadron(1);
    } else {
      setPadronSearch("");
      setPadronNivel("");
      setPadronGrado("");
      setPadronSeccion("");
      setPadronResults([]);
    }

    if (activeTab === "progreso") {
      loadProgresoData();
      if (nivelesDisponibles.length === 0) {
        loadPadronFilters();
      }
    }

    if (activeTab === "historial") {
      loadHistoricalElections();
    }
  }, [activeTab, isSuperAdmin, editingWorkspace, isMounted]);

  const generateAutoPassword = (n: string, a: string, d: string) => {
    const getParts = (str: string) => str.trim().split(/\s+/).map(word => word.substring(0, 2)).join('');
    const chars = "!@#$%&*";
    const special = chars[Math.floor(Math.random() * chars.length)];
    return (getParts(n) + getParts(a) + d.substring(0, 2)).toLowerCase() + special;
  };

  // Auto-generate manual password
  useEffect(() => {
    if (manualNombres.length >= 2 && manualApellidos.length >= 2 && manualDni.length >= 2 && !editingManualAdminId) {
      setManualPassword(generateAutoPassword(manualNombres, manualApellidos, manualDni));
    }
  }, [manualNombres, manualApellidos, manualDni, editingManualAdminId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showArchiveConfirm) {
      setArchiveCountdown(5);
      timer = setInterval(() => {
        setArchiveCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setArchiveCountdown(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showArchiveConfirm]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (studentToRemove) {
      setDeleteCountdown(3);
      timer = setInterval(() => {
        setDeleteCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setDeleteCountdown(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [studentToRemove]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showResetConfirm) {
      setResetCountdown(5);
      timer = setInterval(() => {
        setResetCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setResetCountdown(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showResetConfirm]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showCleanSimulacrosConfirm) {
      setCleanSimulacrosCountdown(3);
      timer = setInterval(() => {
        setCleanSimulacrosCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showCleanSimulacrosConfirm]);

  const filteredProgresoData = useMemo(() => {
    return progresoData.filter(student => {
      if (student.rol === 'superadmin' || student.rol === 'administrador') return false;
      if (!student.grado || !student.seccion || student.grado === 'N/A' || student.seccion === 'N/A' || student.grado === '-' || student.seccion === '-') return false;
      if (progresoNivel && student.nivel?.trim() !== progresoNivel) return false;
      if (progresoGrado && student.grado?.trim() !== progresoGrado) return false;
      if (progresoSeccion && student.seccion?.trim() !== progresoSeccion) return false;
      return true;
    });
  }, [progresoData, progresoNivel, progresoGrado, progresoSeccion]);

  const progresoTotals = useMemo(() => {
    const total = filteredProgresoData.length;
    const votaron = filteredProgresoData.filter(s => s.ya_voto).length;
    const pendientes = total - votaron;
    const porcentaje = total > 0 ? Number(((votaron / total) * 100).toFixed(4)) : 0;
    return { total, votaron, pendientes, porcentaje };
  }, [filteredProgresoData]);

  const progresoPrimaria = useMemo(() => {
    const data = filteredProgresoData.filter(s => s.nivel?.toLowerCase().includes('primaria'));
    const total = data.length;
    const votaron = data.filter(s => s.ya_voto).length;
    const pendientes = total - votaron;
    const porcentaje = total > 0 ? Number(((votaron / total) * 100).toFixed(4)) : 0;
    return { total, votaron, pendientes, porcentaje };
  }, [filteredProgresoData]);

  const progresoSecundaria = useMemo(() => {
    const data = filteredProgresoData.filter(s => s.nivel?.toLowerCase().includes('secundaria'));
    const total = data.length;
    const votaron = data.filter(s => s.ya_voto).length;
    const pendientes = total - votaron;
    const porcentaje = total > 0 ? Number(((votaron / total) * 100).toFixed(4)) : 0;
    return { total, votaron, pendientes, porcentaje };
  }, [filteredProgresoData]);

  const progresoBreakdown = useMemo(() => {
    const groups: Record<string, { total: number, votaron: number, grado: string, seccion: string, nivel: string }> = {};
    
    filteredProgresoData.forEach(student => {
      const g = student.grado?.trim() || '';
      const s = student.seccion?.trim() || '';
      const n = student.nivel?.trim() || 'N/A';
      
      const key = `${n}-${g}-${s}`;
      if (!groups[key]) {
        groups[key] = { total: 0, votaron: 0, grado: g, seccion: s, nivel: n };
      }
      groups[key].total++;
      if (student.ya_voto) groups[key].votaron++;
    });

    return Object.values(groups).sort((a, b) => {
      if (a.nivel !== b.nivel) return (a.nivel || '').localeCompare(b.nivel || '');
      if (a.grado !== b.grado) return a.grado.localeCompare(b.grado);
      return a.seccion.localeCompare(b.seccion);
    });
  }, [filteredProgresoData]);

  // ---------------- PLANTILLA ----------------
  const loadWorkspaceData = async (workspace: "oficial" | "simulacro") => {
    setLoading(true);
    let query = supabase.from("elecciones").select("*").order("creado_en", { ascending: false }).limit(1);
    
    if (workspace === "simulacro") {
      query = query.ilike("titulo", "[PRUEBA]%");
    } else {
      query = query.not("titulo", "ilike", "[PRUEBA]%");
    }

    const { data: election } = await query.maybeSingle();

    if (election) {
      setElectionId(election.id);
      
      const cleanTitle = election.titulo.replace("[PRUEBA]", "").trim();
      const match = cleanTitle.match(/(.*)\s+(\d{4})$/);
      if (match) {
        setElectionTitle(match[1].trim());
        setElectionYear(match[2]);
      } else {
        setElectionTitle(cleanTitle);
        setElectionYear(new Date().getFullYear().toString());
      }
      setElectionDate(election.fecha_votacion || "");
      if (workspace === "oficial") {
        setIsOfficialElectionActive(election.esta_activa);
      }
      
      const { data: partiesData } = await supabase
        .from("partidos")
        .select("id, nombre, logo_url, nivel, numero_lista, candidatos, partido_candidatos(cargo_id, cargos(descripcion), estudiantes(id, dni, nombres, apellidos, grado, seccion, nivel))")
        .eq("eleccion_id", election.id);
        
      if (partiesData) {
        const mappedParties = partiesData.map((p: any) => {
          const candidatosMap: Record<string, any> = {};
          
          if (p.partido_candidatos && Array.isArray(p.partido_candidatos) && p.partido_candidatos.length > 0) {
            p.partido_candidatos.forEach((pc: any) => {
              if (pc.estudiantes && pc.cargo_id) {
                // Attach description to student for rendering fallback
                const studentData = { ...pc.estudiantes, _cargo_desc: pc.cargos?.descripcion };
                candidatosMap[pc.cargo_id] = studentData;
              }
            });
          } else if (p.candidatos) {
            // Fallback por si hay datos viejos en la columna JSON
            Object.assign(candidatosMap, p.candidatos);
          }

          return {
            id: p.id,
            nombre: p.nombre,
            logo_url: p.logo_url,
            nivel: p.nivel,
            numero_lista: p.numero_lista,
            candidatos: candidatosMap,
            isEditing: false
          };
        });
        setParties(mappedParties);
      }
    } else {
      setElectionId(null);
      setElectionTitle(workspace === "simulacro" ? "Simulacro Electoral" : "Elecciones Escolares");
      setElectionYear(new Date().getFullYear().toString());
      setElectionDate("");
      if (workspace === "oficial") {
        setIsOfficialElectionActive(false);
      }
      setParties([]);
    }
    setIsEditingTitle(false);
    setLoading(false);
  };

  const addParty = () => {
    setParties([...parties, { nombre: "", logo_url: "", nivel: "general", numero_lista: "", isEditing: true }]);
  };

  const handleImageUpload = (index: number, file: File) => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar para no saturar la base de datos con un Base64 gigante
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
          const base64String = canvas.toDataURL(file.type || "image/jpeg", 0.7);
          updateParty(index, "logo_url", base64String);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeParty = async (index: number) => {
    const party = parties[index];
    if (party.id) {
      setLoading(true);
      try {
        await deletePartyAction(party.id);
      } catch (err: any) {
        setPlantillaMessage({ type: 'error', text: `Error al borrar partido de la base de datos: ${err.message}` });
      } finally {
        setLoading(false);
      }
    }
    const newParties = [...parties];
    newParties.splice(index, 1);
    setParties(newParties);
  };

  const updateParty = (index: number, field: keyof Party, value: any) => {
    const newParties = [...parties];
    newParties[index] = { ...newParties[index], [field]: value };
    setParties(newParties);
  };

  const savePartyToDB = async (index: number) => {
    const party = parties[index];
    if (!party.nombre.trim()) {
      setPlantillaMessage({ type: 'error', text: 'El partido debe tener un nombre.'});
      return;
    }

    if (!electionTitle || !electionYear) {
      setPlantillaMessage({ type: 'error', text: 'Ponle un nombre y año a la elección arriba antes de guardar el partido.'});
      return;
    }

    if (party.numero_lista === undefined || party.numero_lista === null || String(party.numero_lista).trim() === '') {
      setPlantillaMessage({ type: 'error', text: 'El partido debe tener un Número de lista.'});
      return;
    }

    // Validate uniqueness of numero_lista
    const isDuplicate = parties.some((p, i) => 
      i !== index && String(p.numero_lista).trim() === String(party.numero_lista).trim()
    );

    if (isDuplicate) {
      setPlantillaMessage({ type: 'error', text: `El número de lista ${party.numero_lista} ya está asignado a otro partido.`});
      return;
    }

    setLoading(true);
    setPlantillaMessage(null);

    try {
      let currentElectionId = electionId;
      
      if (!currentElectionId) {
        const baseTitle = `${electionTitle.trim()} ${electionYear.trim()}`;
        const finalTitle = editingWorkspace === "simulacro" ? `[PRUEBA] ${baseTitle}` : baseTitle;
        
        const { data: newElection, error: createErr } = await insertElectionAction(finalTitle);
          
        if (createErr) throw new Error(createErr as string);
        if (newElection) {
          currentElectionId = newElection.id;
          setElectionId(currentElectionId);
        }
      }

      const partyData = {
        eleccion_id: currentElectionId,
        nombre: party.nombre,
        logo_url: party.logo_url,
        nivel: party.nivel,
        numero_lista: Number(party.numero_lista)
      };

      let newPartyId = party.id;
      const { data: upsertedParty, error: upsertErr } = await upsertPartyAction(partyData, party.id);
      
      if (upsertErr) throw new Error(upsertErr as string);
      if (upsertedParty) {
        newPartyId = upsertedParty.id;
      }

      setParties(prevParties => {
        const newParties = [...prevParties];
        newParties[index] = { ...newParties[index], id: newPartyId, isEditing: false };
        return newParties;
      });
      setPlantillaMessage({ type: 'success', text: `Partido "${party.nombre}" guardado con éxito.` });
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: `Error al guardar partido: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlantilla = async () => {
    if (!electionTitle || !electionYear) {
      setPlantillaMessage({ type: 'error', text: "Debes ponerle un nombre y un año a la elección." });
      return;
    }

    setLoading(true);
    setPlantillaMessage(null);

    try {
      const baseTitle = `${electionTitle.trim()} ${electionYear.trim()}`;
      const finalTitle = editingWorkspace === "simulacro" ? `[PRUEBA] ${baseTitle}` : baseTitle;
      
      let currentElectionId = electionId;
      const updateData: any = { titulo: finalTitle };
      if (editingWorkspace === "oficial" && electionDate) {
        updateData.fecha_votacion = electionDate;
      }

      if (!currentElectionId) {
        const { data: newElection, error: createErr } = await insertElectionAction(finalTitle);
          
        if (createErr) throw new Error(createErr as string);
        if (newElection) {
          currentElectionId = newElection.id;
          setElectionId(currentElectionId);
        }
      } else {
        const { error: updateErr } = await updateElectionDataAction(currentElectionId, updateData);
          
        if (updateErr) throw new Error(updateErr as string);
      }

      setPlantillaMessage({ type: 'success', text: `Datos de la elección actualizados con éxito.` });
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: err.message || "Error al actualizar la elección." });
    } finally {
      setLoading(false);
    }
  };

  const deactivateElectionWithSnapshot = async (idToDeactivate: string) => {
    const { data: snapshotData, error: snapErr } = await supabase
      .from("partidos")
      .select("id, nombre, logo_url, nivel, numero_lista, partido_candidatos(cargo_id, cargos(descripcion), estudiantes(id, dni, nombres, apellidos, grado, seccion, nivel))")
      .eq("eleccion_id", idToDeactivate);

    await updateElectionStatusAction(idToDeactivate, false, (!snapErr && snapshotData) ? snapshotData : null);
  };

  const handleArchiveElection = async () => {
    if (!electionId) return;
    setLoading(true);
    try {
      // 1 y 2. Tomar el Snapshot Histórico y desactivar
      await deactivateElectionWithSnapshot(electionId);

      // 3. Limpiar padrón (quitar bandera de ya votó para la próxima elección)
      await updateStudentsVoteStatusAction(false);
      
      setElectionId(null);
      setElectionTitle(editingWorkspace === "simulacro" ? "Simulacro Electoral" : "Elecciones Escolares");
      setElectionYear(new Date().getFullYear().toString());
      setParties([]);
      setShowArchiveConfirm(false);
      setPlantillaMessage({ type: 'success', text: "Elección archivada correctamente con su Snapshot Histórico. Puedes iniciar un nuevo proceso." });
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: "Error al archivar: " + err.message });
      setShowArchiveConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMockVotes = async () => {
    if (!electionId) return;
    setLoading(true);
    try {
      // 1. Conseguir ids de los partidos
      const { data: partiesData } = await supabase.from('partidos').select('id').eq('eleccion_id', electionId);
      const partyIds = partiesData ? partiesData.map(p => p.id) : [];
      
      // 2. Traer todos los estudiantes reales
      const { data: estudiantesData } = await supabase
        .from('estudiantes')
        .select('id, grado, seccion, nivel')
        .neq('rol', 'superadmin')
        .neq('rol', 'administrador')
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (!estudiantesData || estudiantesData.length === 0) {
         setPlantillaMessage({ type: 'error', text: "No hay estudiantes en el padrón para generar votos." });
         setLoading(false);
         return;
      }

      // 3. Crear votos por cada estudiante
      const mockVotes = estudiantesData.map(est => {
        const isBlank = Math.random() < 0.1; // 10% blancos
        const randomPartyId = isBlank || partyIds.length === 0 ? null : partyIds[Math.floor(Math.random() * partyIds.length)];
        
        return {
          eleccion_id: electionId,
          partido_id: randomPartyId,
          grado_votante: est.grado,
          seccion_votante: est.seccion,
          nivel_votante: est.nivel || 'secundaria'
        };
      });
      
      // Opcional: Limpiar votos anteriores de prueba para no exceder el padrón
      await deleteVotesByElectionAction(electionId);

      // Insertar en bloques de 500
      for (let i = 0; i < mockVotes.length; i += 500) {
        const chunk = mockVotes.slice(i, i + 500);
        await insertMockVotesAction(chunk);
      }
      
      // Marcar a todos como que ya votaron para que avance la barra de progreso
      await updateStudentsVoteStatusAction(true);
      
      if (activeTab === 'progreso') {
        await loadProgresoData();
      }
      
      setPlantillaMessage({ type: 'success', text: `¡Se generaron ${mockVotes.length} votos de prueba (100% del padrón)!` });
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: "Error al generar votos: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetTestVotes = async () => {
    setLoading(true);
    try {
      if (editingWorkspace === "simulacro") {
        const { data: testElec } = await supabase.from("elecciones").select("id").ilike("titulo", "[PRUEBA]%").order("creado_en", { ascending: false }).limit(1).maybeSingle();
        if (testElec) {
          await deleteVotesByElectionAction(testElec.id);
        }
      } else {
        if (electionId) {
          await deleteVotesByElectionAction(electionId);
        }
      }
      
      await updateStudentsVoteStatusAction(false);
      
      setPlantillaMessage({ type: 'success', text: "Votos eliminados. La votación ha vuelto a cero." });
      
      if (activeTab === 'progreso') {
        await loadProgresoData();
      }
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: err.message || "Error al reiniciar votos de prueba." });
    } finally {
      setLoading(false);
      setShowResetConfirm(false);
    }
  };

  const handleToggleTestMode = async () => {
    setLoading(true);
    try {
      if (systemIsTestMode) {
        // Apagar todas las elecciones (incluyendo las de prueba)
        const { data: activeElecs } = await supabase.from("elecciones").select("id").eq("esta_activa", true);
        if (activeElecs && activeElecs.length > 0) {
          for (const elec of activeElecs) {
            await deactivateElectionWithSnapshot(elec.id);
          }
        }
        
        // Resetear a todos los estudiantes (ya_voto = false)
        await updateStudentsVoteStatusAction(false);
        
        // Al apagar el simulacro, dejamos la elección original apagada por defecto para que el usuario la inicie manualmente
        setIsOfficialElectionActive(false);

        setPlantillaMessage({ type: 'success', text: "Modo de Prueba desactivado. Los votos de prueba han sido limpiados." });
      } else {
        // Iniciar Modo Prueba
        const { data: testElec } = await supabase.from("elecciones").select("id").ilike("titulo", "[PRUEBA]%").order("creado_en", { ascending: false }).limit(1).maybeSingle();
        if (!testElec) {
          setPlantillaMessage({ type: 'error', text: "Debes guardar al menos una configuración en la pestaña 'Simulacro' antes de iniciar la prueba." });
          setLoading(false);
          return;
        }

        // Apagar todas las elecciones activas actuales (reales o simulacros previos)
        const { data: activeElecs } = await supabase.from("elecciones").select("id").eq("esta_activa", true);
        if (activeElecs && activeElecs.length > 0) {
          for (const elec of activeElecs) {
            await deactivateElectionWithSnapshot(elec.id);
          }
        }
        
        // Encender elección de simulacro
        await updateElectionStatusAction(testElec.id, true);

        setPlantillaMessage({ type: 'success', text: "¡Modo de Prueba Activo! El sistema está ahora usando tu lista de partidos de simulacro." });
      }
      
      await checkSystemStatus();
      await loadWorkspaceData(editingWorkspace);
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: err.message || "Error al cambiar el modo de prueba." });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOfficialMode = async () => {
    setLoading(true);
    try {
      if (!electionId) {
        setPlantillaMessage({ type: 'error', text: "Debes guardar la elección antes de iniciar." });
        return;
      }
      if (isOfficialElectionActive) {
        // Apagar
        await deactivateElectionWithSnapshot(electionId);
        setIsOfficialElectionActive(false);
        setPlantillaMessage({ type: 'success', text: "Votaciones oficiales detenidas." });
      } else {
        // Apagar todas las otras activas
        const { data: activeElecs } = await supabase.from("elecciones").select("id").eq("esta_activa", true);
        if (activeElecs && activeElecs.length > 0) {
          for (const elec of activeElecs) {
            await deactivateElectionWithSnapshot(elec.id);
          }
        }
        // Encender la oficial
        await updateElectionStatusAction(electionId, true);
        setIsOfficialElectionActive(true);
        setPlantillaMessage({ type: 'success', text: "¡Votaciones Oficiales iniciadas!" });
      }
      await checkSystemStatus();
    } catch (err: any) {
      setPlantillaMessage({ type: 'error', text: err.message || "Error al cambiar el estado." });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // [unchanged code]
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStatus({ type: null, message: '' });

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const formattedData = data.map((row: any) => ({
          dni: String(row.DNI || row.dni || '').trim(),
          nombres: String(row.Nombres || row.nombres || '').trim(),
          apellidos: String(row.Apellidos || row.apellidos || '').trim(),
          grado: String(row.Grado || row.grado || '').trim(),
          seccion: String(row.Seccion || row.seccion || row.Sección || '').trim(),
          nivel: String(row.Nivel || row.nivel || '').trim()
        })).filter(s => s.dni && s.nombres && s.apellidos);

        if (formattedData.length === 0) {
          throw new Error("No se encontraron registros válidos en el archivo.");
        }

        const { error } = await supabase
          .from('estudiantes')
          .upsert(formattedData, { onConflict: 'dni' });

        if (error) throw error;

        setUploadStatus({ type: 'success', message: `¡Se cargaron ${formattedData.length} estudiantes correctamente al padrón!` });
      } catch (err: any) {
        setUploadStatus({ type: 'error', message: err.message || 'Error procesando el archivo.' });
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadPadron = async () => {
    setIsDownloadingPadron(true);
    setUploadStatus({ type: null, message: '' });

    try {
      let allStudents: any[] = [];
      let hasMore = true;
      let from = 0;
      let to = 999;

      while (hasMore) {
        const { data, error } = await supabase
          .from('estudiantes')
          .select('dni, nombres, apellidos, grado, seccion, nivel, ya_voto')
          .neq('rol', 'superadmin')
          .neq('rol', 'administrador')
          .range(from, to);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allStudents = [...allStudents, ...data];
          from += 1000;
          to += 1000;
          if (data.length < 1000) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      if (allStudents.length === 0) {
        setUploadStatus({ type: 'error', message: 'No hay estudiantes en el padrón para descargar.' });
        setIsDownloadingPadron(false);
        return;
      }

      // Ordenar por Nivel (Pri -> Sec), Grado, Sección, Apellidos
      allStudents.sort((a, b) => {
        const nA = a.nivel || '';
        const nB = b.nivel || '';
        if (nA !== nB) return nA.localeCompare(nB);
        const gA = a.grado || '';
        const gB = b.grado || '';
        if (gA !== gB) return gA.localeCompare(gB);
        const sA = a.seccion || '';
        const sB = b.seccion || '';
        if (sA !== sB) return sA.localeCompare(sB);
        return (a.apellidos || '').localeCompare(b.apellidos || '');
      });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sistema de Votación';
      workbook.created = new Date();

      const formatWorksheet = (ws: ExcelJS.Worksheet, columns: any[], rows: any[]) => {
        ws.columns = columns;
        
        // Agregar Filas
        ws.addRows(rows);

        // Estilos para cabeceras (Celeste bajo)
        ws.getRow(1).eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD9E1F2' } // Color celeste bajo
          };
          cell.font = { bold: true, color: { argb: 'FF000000' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });

        // Estilos para el contenido (Centrado y bordes)
        ws.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            row.eachCell((cell) => {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            });
          }
        });
      };

      // HOJA 1: General
      const wsGeneral = workbook.addWorksheet('General');
      
      const columnsGeneral = [
        { header: 'DNI', key: 'dni', width: 15 },
        { header: 'Nombres', key: 'nombres', width: 30 },
        { header: 'Apellidos', key: 'apellidos', width: 30 },
        { header: 'Nivel', key: 'nivel', width: 15 },
        { header: 'Grado', key: 'grado', width: 15 },
        { header: 'Sección', key: 'seccion', width: 15 }
      ];
      
      if (includeVoteStatus) {
        columnsGeneral.push({ header: 'Votó', key: 'voto', width: 10 });
      }

      formatWorksheet(
        wsGeneral,
        columnsGeneral,
        allStudents.map(s => {
          const row: any = {
            dni: s.dni,
            nombres: s.nombres,
            apellidos: s.apellidos,
            nivel: s.nivel,
            grado: s.grado,
            seccion: s.seccion
          };
          if (includeVoteStatus) row.voto = s.ya_voto ? 'Sí' : 'No';
          return row;
        })
      );

      // Agrupar por hojas
      const groups: Record<string, any[]> = {};
      allStudents.forEach(s => {
        const nivelL = (s.nivel || '').toLowerCase();
        let nivelAbrev = 'OTR';
        if (nivelL.includes('primaria')) nivelAbrev = 'PRI';
        else if (nivelL.includes('secundaria')) nivelAbrev = 'SEC';

        const gradoRaw = s.grado || '';
        const gradoNum = gradoRaw.replace(/\D/g, '') || gradoRaw.charAt(0) || '0';
        const seccion = (s.seccion || '').toUpperCase();
        
        const sheetName = `${gradoNum}${seccion}-${nivelAbrev}`;
        if (!groups[sheetName]) groups[sheetName] = [];
        groups[sheetName].push(s);
      });

      // Ordenar las hojas: Primero todo Primaria ordenado, luego todo Secundaria ordenado
      const sortedSheetNames = Object.keys(groups).sort((a, b) => {
        const isPriA = a.includes('-PRI');
        const isPriB = b.includes('-PRI');
        if (isPriA && !isPriB) return -1;
        if (!isPriA && isPriB) return 1;
        // Si ambos son del mismo nivel, orden natural (1A, 1B, 2A...)
        return a.localeCompare(b);
      });

      // Añadir una hoja por cada grupo
      sortedSheetNames.forEach(sheetName => {
        const ws = workbook.addWorksheet(sheetName.substring(0, 31));
        
        const columnsGroup = [
          { header: 'DNI', key: 'dni', width: 15 },
          { header: 'Nombres', key: 'nombres', width: 30 },
          { header: 'Apellidos', key: 'apellidos', width: 30 }
        ];

        if (includeVoteStatus) {
          columnsGroup.push({ header: 'Votó', key: 'voto', width: 10 });
        }

        formatWorksheet(
          ws,
          columnsGroup,
          groups[sheetName].map(s => {
            const row: any = {
              dni: s.dni,
              nombres: s.nombres,
              apellidos: s.apellidos
            };
            if (includeVoteStatus) row.voto = s.ya_voto ? 'Sí' : 'No';
            return row;
          })
        );
      });

      // Descargar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, "padron_electoral_completo.xlsx");
      
      setUploadStatus({ type: 'success', message: '¡El Padrón se ha descargado exitosamente con el formato correcto!' });

    } catch (err: any) {
      console.error(err);
      setUploadStatus({ type: 'error', message: err.message || 'Error al descargar el padrón.' });
    } finally {
      setIsDownloadingPadron(false);
      setShowDownloadModal(false);
    }
  };

  const loadAdmins = async () => {
    const { data, error } = await getAdminsAction();
    if (!error && data) {
      setAdminsList(data);
    }
  };

  const handleSearchStudent = async () => {
    if (!searchDni) return;
    setRoleMessage("");
    setFoundStudent(null);
    setLoading(true);

    const { data, error } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('dni', searchDni)
      .single();

    setLoading(false);

    if (error || !data) {
      setRoleMessage("Estudiante no encontrado en el padrón.");
    } else {
      setFoundStudent(data);
      setNewPassword(generateAutoPassword(data.nombres, data.apellidos, data.dni));
    }
  };

  const handlePromoteToAdmin = async () => {
    if (!foundStudent || !newPassword) return;
    setLoading(true);

    const result = await promoteStudentToComiteAction(foundStudent.id, selectedCargo, newPassword);

    setLoading(false);

    if (result.error) {
      setRoleMessage("Error al promover al estudiante.");
    } else {
      setRoleMessage(`¡Estudiante promovido a Comité (${selectedCargo}) con éxito!`);
      setFoundStudent(null);
      setNewPassword("");
      setSearchDni("");
      loadAdmins();
    }
  };

  const handleUpdateCargo = async (id: string, newCargo: string) => {
    const result = await updateCargoAction(id, newCargo);

    if (!result.error) {
      setEditingCargoId(null);
      loadAdmins();
    }
  };

  const handleDeleteComiteConfirm = async () => {
    if (!studentToRemove) return;
    const result = await demoteAdminAction(studentToRemove.id, true);

    if (!result.error) {
      setStudentToRemove(null);
      loadAdmins();
    }
  };

  const handleDemoteAdmin = async (id: string, isComite: boolean = false) => {
    const result = await demoteAdminAction(id, isComite);

    if (!result.error) {
      loadAdmins();
    }
  };

  const handleOpenCreateManualAdmin = () => {
    setEditingManualAdminId(null);
    setManualDni("");
    setManualNombres("");
    setManualApellidos("");
    setManualPassword("");
    setManualMessage("");
    setShowManualAdminModal(true);
  };

  const handleEditManualAdmin = (admin: any) => {
    setEditingManualAdminId(admin.id);
    setManualDni(admin.dni);
    setManualNombres(admin.nombres);
    setManualApellidos(admin.apellidos);
    setManualPassword(admin.contrasena || "");
    setManualMessage("");
    setShowManualAdminModal(true);
  };

  const handleCreateManualAdmin = async () => {
    if (!manualDni || !manualNombres || !manualApellidos || !manualPassword) {
      setManualMessage("Por favor completa todos los campos.");
      return;
    }
    setLoading(true);
    setManualMessage("");

    if (editingManualAdminId) {
      const result = await editManualAdminAction(editingManualAdminId, {
        dni: manualDni,
        nombres: manualNombres,
        apellidos: manualApellidos,
        contrasena: manualPassword
      });
        
      setLoading(false);
      if (result.error) {
        setManualMessage("Error al actualizar el administrador.");
      } else {
        setShowManualAdminModal(false);
        loadAdmins();
      }
    } else {
      const result = await createManualAdminAction({
        dni: manualDni,
        nombres: manualNombres,
        apellidos: manualApellidos,
        contrasena: manualPassword,
        rol: 'administrador',
        grado: 'N/A',
        seccion: 'N/A',
        nivel: 'N/A',
        ya_voto: false
      });

      setLoading(false);

      if (result.error) {
        if (result.error.code === '23505' || result.error.includes?.('23505')) { 
          setManualMessage("El DNI ya existe en la base de datos.");
        } else {
          setManualMessage("Error al crear el administrador.");
        }
      } else {
        setShowManualAdminModal(false);
        loadAdmins();
      }
    }
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" /> Admin Panel
          </h2>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {!isComite && (
            <button 
              onClick={() => setActiveTab("plantilla")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'plantilla' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
            >
              <Users className="w-5 h-5" /> Plantilla Electoral
            </button>
          )}
          <button 
            onClick={() => setActiveTab("padron")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'padron' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
          >
            <FileSpreadsheet className="w-5 h-5" /> Padrón Electoral
          </button>
          <button 
            onClick={() => setActiveTab("progreso")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'progreso' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
          >
            <BarChart2 className="w-5 h-5" /> Progreso de Votación
          </button>
          <button 
            onClick={() => setActiveTab("historial")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'historial' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
          >
            <Archive className="w-5 h-5" /> Historial Electoral
          </button>
          {isSuperAdmin && (
            <button 
              onClick={() => setActiveTab("accesos")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'accesos' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
            >
              <ShieldCheck className="w-5 h-5" /> Gestión de Accesos
            </button>
          )}
        </nav>
        <div className="p-4 border-t border-border">
          <button 
            onClick={async () => {
              await logoutAdminAction();
              router.push("/admin");
            }}
            className="w-full text-muted-foreground hover:text-destructive text-sm flex items-center gap-2"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto flex flex-col">
        {currentUser && (
          <div className="w-full justify-end mb-4 hidden sm:flex">
            <div className="bg-card border border-border px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 animate-in fade-in">
              <span className="text-sm font-semibold">{currentUser.nombres} {currentUser.apellidos}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                {currentUser.cargo || currentUser.rol}
              </span>
            </div>
          </div>
        )}
        
        {activeTab === 'plantilla' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            
            {(systemIsTestMode || isOfficialElectionActive) && (
              <div className={`${systemIsTestMode ? 'bg-yellow-400 border-yellow-500' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4 md:p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md`}>
                <div className="flex items-center gap-4 w-full md:w-auto flex-1 justify-center md:justify-start">
                  <h3 className={`text-xl md:text-2xl font-black tracking-tight uppercase ${systemIsTestMode ? 'text-red-600' : 'text-emerald-700'}`}>
                    {systemIsTestMode ? 'Simulación de elección activa' : 'Elección Oficial en Curso'}
                  </h3>
                </div>
                <div className="flex gap-3 w-full md:w-auto justify-center md:justify-end shrink-0 flex-wrap md:flex-nowrap">
                  <button 
                    onClick={handleGenerateMockVotes}
                    disabled={loading}
                    className={`${systemIsTestMode ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20' : 'bg-primary hover:bg-primary/90 shadow-primary/20'} text-white px-4 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shrink-0 w-full md:w-auto justify-center`}
                  >
                    <Plus className="w-5 h-5" /> Generar Votos
                  </button>
                  <button 
                    onClick={() => setShowResetConfirm(true)}
                    disabled={loading}
                    className="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-orange-600 transition-colors flex items-center gap-2 shadow-lg shadow-orange-500/20 shrink-0 w-full md:w-auto justify-center"
                  >
                    <Trash2 className="w-5 h-5" /> Limpiar Votos
                  </button>
                  {systemIsTestMode ? (
                    <button 
                      onClick={handleToggleTestMode}
                      disabled={loading}
                      className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center gap-2 shadow-lg shadow-red-600/20 shrink-0 w-full md:w-auto justify-center"
                    >
                      <Square className="w-5 h-5 fill-current" /> Detener simulación
                    </button>
                  ) : (
                    <button 
                      onClick={handleToggleOfficialMode}
                      disabled={loading}
                      className="bg-rose-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-lg shadow-rose-600/20 shrink-0 w-full md:w-auto justify-center"
                    >
                      <StopCircle className="w-5 h-5 fill-current" /> Detener Votaciones
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Workspace Toggle */}
            <div className="flex gap-2 mb-8 bg-secondary/50 p-1.5 rounded-xl w-fit">
              <button 
                onClick={() => handleWorkspaceChange("oficial")}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${editingWorkspace === 'oficial' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Elección Oficial
              </button>
              <button 
                onClick={() => handleWorkspaceChange("simulacro")}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${editingWorkspace === 'simulacro' ? 'bg-amber-500 text-amber-950 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Simulacro
              </button>
            </div>

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {editingWorkspace === "oficial" ? "Plantilla Oficial" : "Plantilla de Simulacro"}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {editingWorkspace === "oficial" 
                    ? "Gestiona los candidatos que participarán en las elecciones reales." 
                    : "Configura partidos ficticios para que los estudiantes practiquen sin comprometer los datos oficiales."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {isSuperAdmin && !systemIsTestMode && editingWorkspace === "simulacro" && (
                  <button 
                    onClick={handleToggleTestMode}
                    disabled={loading}
                    className="bg-amber-500/10 text-amber-600 dark:text-amber-500 px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
                  >
                    <PlayCircle className="w-5 h-5" /> Iniciar Simulacro
                  </button>
                )}
                {isSuperAdmin && electionId && editingWorkspace === "oficial" && !isOfficialElectionActive && (
                  <button 
                    onClick={handleToggleOfficialMode}
                    disabled={loading}
                    className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors"
                  >
                    <PlayCircle className="w-5 h-5" /> Iniciar Votaciones
                  </button>
                )}
                {isSuperAdmin && electionId && editingWorkspace === "oficial" && (
                  <button 
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={loading}
                    className="bg-destructive/10 text-destructive px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-destructive/20 transition-colors"
                  >
                    <Archive className="w-5 h-5" /> Archivar
                  </button>
                )}
                <button 
                  onClick={handleSavePlantilla}
                  disabled={loading}
                  className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  <Save className="w-5 h-5" /> Guardar
                </button>
              </div>
            </header>

            {plantillaMessage && (
              <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 animate-in fade-in ${plantillaMessage.type === 'success' ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                {plantillaMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                <p>{plantillaMessage.text}</p>
              </div>
            )}

            {/* General Settings */}
            <div className={`rounded-2xl p-6 border shadow-sm mb-8 flex gap-8 items-center ${editingWorkspace === 'simulacro' ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-500/20' : 'bg-card border-border'}`}>
              <div className="flex-1 flex gap-4">
                <div className="flex-[2]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold">Nombre de la Elección</h3>
                    <button 
                      onClick={() => setIsEditingTitle(!isEditingTitle)}
                      className="text-muted-foreground hover:text-primary transition-colors p-1"
                      title="Editar nombre"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={electionTitle}
                    onChange={(e) => setElectionTitle(e.target.value)}
                    placeholder={editingWorkspace === "simulacro" ? "Elecciones de Prueba" : "Elecciones Escolares"} 
                    disabled={!isEditingTitle}
                    className="w-full px-4 py-2 mt-2 rounded-lg border border-border bg-background focus:border-primary outline-none disabled:opacity-60 disabled:bg-secondary"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">Año</h3>
                  <input 
                    type="number" 
                    value={electionYear}
                    onChange={(e) => setElectionYear(e.target.value)}
                    placeholder="Ej. 2024"
                    disabled={!isEditingTitle}
                    className="w-full px-4 py-2 mt-2 rounded-lg border border-border bg-background focus:border-primary outline-none disabled:opacity-60 disabled:bg-secondary"
                  />
                </div>
                {editingWorkspace === "oficial" && (
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">Fecha de Votación</h3>
                    <input 
                      type="date" 
                      value={electionDate}
                      onChange={(e) => setElectionDate(e.target.value)}
                      disabled={!isEditingTitle}
                      className="w-full px-4 py-2 mt-2 rounded-lg border border-border bg-background focus:border-primary outline-none disabled:opacity-60 disabled:bg-secondary"
                    />
                  </div>
                )}
              </div>
              <div className="w-48 text-center bg-background/50 p-4 rounded-xl border border-border/50">
                <p className="text-sm text-muted-foreground mb-1">Total Partidos</p>
                <p className="text-3xl font-bold text-primary">{parties.length}</p>
              </div>
            </div>

            {/* Parties List */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Listado de Partidos {editingWorkspace === "simulacro" ? "de Prueba" : ""}</h2>
                <button 
                  onClick={addParty}
                  className="flex items-center gap-2 text-sm font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Agregar Partido
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {parties.map((party, index) => (
                  <div key={index} className={`rounded-2xl border overflow-hidden shadow-sm group transition-all duration-300 ${editingWorkspace === 'simulacro' ? 'bg-card border-amber-500/20' : 'bg-card border-border'} ${party.isEditing ? 'ring-2 ring-primary/20 shadow-md' : ''}`}>
                    <div className={`p-1 border-b flex justify-between items-center px-4 ${editingWorkspace === 'simulacro' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-primary/10 border-border/50'}`}>
                      <span className={`text-xs font-bold uppercase ${editingWorkspace === 'simulacro' ? 'text-amber-600' : 'text-primary'}`}>Partido {index + 1}</span>
                      <div className="flex gap-1 py-1">
                        {!party.isEditing ? (
                          <>
                            <button 
                              onClick={() => handleOpenCandidatesModal(party, index)}
                              className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-primary/10"
                              title="Asignar candidatos"
                            >
                              <UserPlus className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => updateParty(index, "isEditing", true)}
                              className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-primary/10"
                              title="Editar partido"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button 
                            onClick={() => savePartyToDB(index)}
                            className="p-1.5 text-green-600 transition-colors rounded-lg hover:bg-green-500/10"
                            title="Confirmar partido y guardar"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => removeParty(index)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
                          title="Eliminar partido"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-6">
                      {party.isEditing ? (
                        <div className="flex gap-4 flex-wrap sm:flex-nowrap animate-in fade-in slide-in-from-top-2">
                          <div className="w-20 h-20 bg-background rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground overflow-hidden shrink-0 relative group/img">
                            {party.logo_url ? (
                              <img src={party.logo_url} alt="Logo" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 mb-1" />
                            )}
                            <label className="absolute inset-0 bg-black/50 hidden group-hover/img:flex items-center justify-center cursor-pointer transition-all">
                              <Camera className="w-5 h-5 text-white" />
                              <input 
                                type="file" 
                                accept="image/*"
                                className="hidden"
                                disabled={loading || (editingWorkspace === 'oficial' && systemIsTestMode)}
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleImageUpload(index, e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="flex-1 space-y-3 min-w-[200px]">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Número de lista</label>
                                <input 
                                  type="number"
                                  min="1"
                                  value={party.numero_lista || ""}
                                  onChange={(e) => updateParty(index, "numero_lista", e.target.value)}
                                  placeholder="Ej: 1"
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Nombre del Partido</label>
                                <input 
                                  type="text" 
                                  value={party.nombre}
                                  onChange={(e) => updateParty(index, "nombre", e.target.value)}
                                  placeholder=""
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex justify-between items-center">
                                Logo del Partido
                                {party.logo_url && (
                                  <button 
                                    onClick={() => updateParty(index, "logo_url", "")}
                                    className="text-destructive hover:underline text-[10px]"
                                  >
                                    Quitar Logo
                                  </button>
                                )}
                              </label>
                              <div className="flex items-center gap-2">
                                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed border-border bg-background hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors text-muted-foreground">
                                  <Upload className="w-4 h-4" />
                                  {party.logo_url ? 'Cambiar Imagen' : 'Subir Imagen'}
                                  <input 
                                    type="file" 
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        handleImageUpload(index, e.target.files[0]);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center gap-4 py-4 animate-in fade-in">
                          <h3 className="text-sm font-bold text-muted-foreground tracking-widest uppercase mb-2">Lista {party.numero_lista}</h3>
                          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-background border border-border shadow-sm flex items-center justify-center relative">
                            {party.logo_url ? (
                              <img src={party.logo_url} alt={`Logo ${party.nombre}`} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-4xl font-black text-muted-foreground">{party.nombre.charAt(0)}</span>
                            )}
                          </div>
                          <h4 className="text-xl font-bold">{party.nombre}</h4>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {parties.length === 0 && (
                  <div className="col-span-full py-12 text-center bg-secondary/30 rounded-2xl border border-dashed border-border">
                    <p className="text-muted-foreground">No hay partidos agregados. Haz clic en "Agregar Partido" para comenzar.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PADRON AND OTHERS TABS... */}
        {activeTab === 'padron' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Padrón Electoral</h1>
                <p className="text-muted-foreground mt-1">Gestiona y consulta la lista de estudiantes habilitados para votar.</p>
              </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-8">
              {/* Carga de Excel (Lado Izquierdo) */}
              {!isComite && (
                <div className="bg-card rounded-2xl p-6 border border-border shadow-sm w-full lg:w-1/3 h-fit">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-2">Cargar Excel</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Primera fila obligatoria:
                    </p>
                    <div className="flex gap-2 flex-wrap mb-4">
                      <span className="bg-secondary px-2 py-1 text-xs font-mono rounded-md border border-border">DNI</span>
                      <span className="bg-secondary px-2 py-1 text-xs font-mono rounded-md border border-border">Nombres</span>
                      <span className="bg-secondary px-2 py-1 text-xs font-mono rounded-md border border-border">Apellidos</span>
                      <span className="bg-secondary px-2 py-1 text-xs font-mono rounded-md border border-border">Grado</span>
                      <span className="bg-secondary px-2 py-1 text-xs font-mono rounded-md border border-border">Seccion</span>
                      <span className="bg-secondary px-2 py-1 text-xs font-mono rounded-md border border-border text-primary border-primary/30 bg-primary/10">Nivel</span>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center bg-secondary/20 hover:bg-secondary/40 transition-colors relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={loading}
                    />
                    <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                    <h4 className="text-base font-bold mb-1 text-center">
                      {loading ? 'Procesando...' : 'Arrastra tu archivo aquí'}
                    </h4>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border flex flex-col items-center">
                    <p className="text-sm text-muted-foreground mb-3 text-center">
                      ¿Necesitas una copia del padrón actual?
                    </p>
                    <button 
                      onClick={() => setShowDownloadModal(true)}
                      disabled={isDownloadingPadron}
                      className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 border border-border"
                    >
                      {isDownloadingPadron ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      {isDownloadingPadron ? 'Generando Excel...' : 'Descargar Padrón Completo'}
                    </button>
                  </div>

                  {uploadStatus.message && (
                    <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 animate-in fade-in ${uploadStatus.type === 'success' ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                      {uploadStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                      <p className="text-sm">{uploadStatus.message}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Buscador y Tabla (Lado Derecho) */}
              <div className={`bg-card rounded-2xl p-6 border border-border shadow-sm flex flex-col ${isComite ? 'w-full' : 'w-full lg:w-2/3'}`}>
                <h3 className="text-lg font-semibold mb-4">Buscar Estudiantes</h3>
                
                {/* Controles de Búsqueda */}
                <div className="flex flex-col xl:flex-row gap-4 mb-6">
                  <div className="flex-1 relative min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input 
                      type="text" 
                      placeholder="DNI, Nombres o Apellidos..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm"
                      value={padronSearch}
                      onChange={(e) => setPadronSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPadron(1)}
                    />
                  </div>
                  
                  <div className="flex gap-2 flex-wrap xl:flex-nowrap">
                    <select 
                      value={padronNivel} 
                      onChange={(e) => setPadronNivel(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm flex-1 min-w-[120px]"
                    >
                      <option value="">Nivel (Todos)</option>
                      {nivelesDisponibles.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    
                    <select 
                      value={padronGrado} 
                      onChange={(e) => setPadronGrado(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm flex-1 min-w-[120px]"
                    >
                      <option value="">Grado (Todos)</option>
                      {padronGradosDisponibles.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>

                    <select 
                      value={padronSeccion} 
                      onChange={(e) => setPadronSeccion(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm flex-1 min-w-[120px]"
                    >
                      <option value="">Sección (Todas)</option>
                      {padronSeccionesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <button 
                      onClick={() => handleSearchPadron(1)}
                      disabled={padronLoading}
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50 text-sm flex-1 xl:flex-none"
                    >
                      {padronLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
                    </button>
                  </div>
                </div>
                
                {/* Tabla de Resultados */}
                <div className="overflow-x-auto border border-border rounded-xl">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-secondary/50 uppercase border-b border-border">
                      <tr>
                        <th className="px-4 py-3 w-12">#</th>
                        <th className="px-4 py-3">DNI</th>
                        <th className="px-4 py-3 min-w-[200px]">Estudiante</th>
                        <th className="px-4 py-3">Nivel</th>
                        <th className="px-4 py-3">Grado y Secc.</th>
                        <th className="px-4 py-3 text-center">Votó</th>
                      </tr>
                    </thead>
                    <tbody>
                      {padronLoading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                            Cargando estudiantes...
                          </td>
                        </tr>
                      ) : padronResults.length > 0 ? (
                        padronResults.map((student, idx) => (
                          <tr key={student.id} className={`border-b border-border last:border-0 hover:bg-secondary/35 transition-colors ${editingStudentId === student.id ? 'bg-secondary/20' : ''}`}>
                            <td className="px-4 py-3 text-muted-foreground">{((padronPage - 1) * 30) + idx + 1}</td>
                            
                            {editingStudentId === student.id ? (
                              <>
                                <td className="px-4 py-3">
                                  <input type="text" className="w-full px-2 py-1 border border-border rounded bg-background text-sm outline-none focus:border-primary" value={editingStudentData.dni || ''} onChange={e => setEditingStudentData({...editingStudentData, dni: e.target.value})} />
                                </td>
                                <td className="px-4 py-3 flex gap-2">
                                  <input type="text" placeholder="Apellidos" className="w-1/2 px-2 py-1 border border-border rounded bg-background text-sm outline-none focus:border-primary" value={editingStudentData.apellidos || ''} onChange={e => setEditingStudentData({...editingStudentData, apellidos: e.target.value})} />
                                  <input type="text" placeholder="Nombres" className="w-1/2 px-2 py-1 border border-border rounded bg-background text-sm outline-none focus:border-primary" value={editingStudentData.nombres || ''} onChange={e => setEditingStudentData({...editingStudentData, nombres: e.target.value})} />
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{student.nivel}</td>
                                <td className="px-4 py-3 flex gap-2">
                                  <input type="text" placeholder="Grado" className="w-1/2 px-2 py-1 border border-border rounded bg-background text-sm outline-none focus:border-primary" value={editingStudentData.grado || ''} onChange={e => setEditingStudentData({...editingStudentData, grado: e.target.value})} />
                                  <input type="text" placeholder="Secc" className="w-1/2 px-2 py-1 border border-border rounded bg-background text-sm outline-none focus:border-primary" value={editingStudentData.seccion || ''} onChange={e => setEditingStudentData({...editingStudentData, seccion: e.target.value})} />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button 
                                      onClick={() => handleSaveStudentEdit(student.id)}
                                      disabled={loading}
                                      className="p-1.5 bg-green-500/10 text-green-600 rounded hover:bg-green-500/20 transition-colors disabled:opacity-50"
                                      title="Guardar cambios"
                                    >
                                      <CheckCircle2 className="w-5 h-5" />
                                    </button>
                                    <button 
                                      onClick={() => setEditingStudentId(null)}
                                      disabled={loading}
                                      className="p-1.5 bg-red-500/10 text-red-600 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                      title="Cancelar"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3 font-medium">{student.dni}</td>
                                <td className="px-4 py-3">{student.apellidos}, {student.nombres}</td>
                                <td className="px-4 py-3">{student.nivel}</td>
                                <td className="px-4 py-3">{student.grado} - "{student.seccion}"</td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-3">
                                    {student.ya_voto ? (
                                      <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-bold border border-green-500/20">
                                        Sí
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-bold border border-border">
                                        No
                                      </span>
                                    )}
                                    <button 
                                      onClick={() => {
                                        setEditingStudentId(student.id);
                                        setEditingStudentData({ ...student });
                                      }}
                                      className="p-1.5 text-muted-foreground hover:text-green-600 hover:bg-green-500/10 rounded-md transition-colors"
                                      title="Editar estudiante"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                            No se encontraron estudiantes con esos filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginación Avanzada */}
                {!padronLoading && padronTotalCount > 30 && (
                  <div className="flex flex-col xl:flex-row justify-between items-center gap-4 mt-6 text-sm text-muted-foreground">
                    <div>
                      Mostrando {Math.min(padronTotalCount, ((padronPage - 1) * 30) + 1)} a {Math.min(padronTotalCount, padronPage * 30)} de {padronTotalCount}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <button 
                        onClick={() => handleSearchPadron(padronPage - 1)}
                        disabled={padronPage === 1}
                        className="px-3 py-1.5 rounded-md border border-border hover:bg-secondary disabled:opacity-50 font-medium transition-colors"
                      >
                        Anterior
                      </button>
                      
                      <div className="flex items-center gap-1">
                        {(() => {
                          const totalPages = Math.ceil(padronTotalCount / 30);
                          const pages = [];
                          
                          if (totalPages <= 7) {
                            for (let i = 1; i <= totalPages; i++) {
                              pages.push(i);
                            }
                          } else {
                            if (padronPage <= 4) {
                              pages.push(1, 2, 3, 4, 5, '...', totalPages);
                            } else if (padronPage >= totalPages - 3) {
                              pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                            } else {
                              pages.push(1, '...', padronPage - 1, padronPage, padronPage + 1, '...', totalPages);
                            }
                          }

                          return pages.map((p, i) => (
                            p === '...' ? (
                              <span key={`ellipsis-${i}`} className="px-2 py-1">...</span>
                            ) : (
                              <button
                                key={`page-${p}-${i}`}
                                onClick={() => handleSearchPadron(p as number)}
                                className={`px-3 py-1.5 rounded-md border transition-colors ${
                                  padronPage === p 
                                    ? 'bg-primary border-primary text-primary-foreground font-bold shadow-sm' 
                                    : 'border-border hover:bg-secondary'
                                }`}
                              >
                                {p}
                              </button>
                            )
                          ));
                        })()}
                      </div>

                      <button 
                        onClick={() => handleSearchPadron(padronPage + 1)}
                        disabled={padronPage * 30 >= padronTotalCount}
                        className="px-3 py-1.5 rounded-md border border-border hover:bg-secondary disabled:opacity-50 font-medium transition-colors"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PROGRESO Y ACCESOS (Sin cambios estructurales) */}
        {activeTab === 'progreso' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {(systemIsTestMode || isOfficialElectionActive) && (
              <div className={`${systemIsTestMode ? 'bg-yellow-400 border-yellow-500' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4 md:p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md`}>
                <div className="flex items-center gap-4 w-full md:w-auto flex-1 justify-center md:justify-start">
                  <h3 className={`text-xl md:text-2xl font-black tracking-tight uppercase ${systemIsTestMode ? 'text-red-600' : 'text-emerald-700'}`}>
                    {systemIsTestMode ? 'Simulación de elección activa' : 'Elección Oficial en Curso'}
                  </h3>
                </div>
                <div className="flex gap-3 w-full md:w-auto justify-center md:justify-end shrink-0 flex-wrap md:flex-nowrap">
                  <button 
                    onClick={handleGenerateMockVotes}
                    disabled={loading}
                    className={`${systemIsTestMode ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20' : 'bg-primary hover:bg-primary/90 shadow-primary/20'} text-white px-4 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shrink-0 w-full md:w-auto justify-center`}
                  >
                    <Plus className="w-5 h-5" /> Generar Votos Aleatorios
                  </button>
                  <button 
                    onClick={() => setShowResetConfirm(true)}
                    disabled={loading}
                    className="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-orange-600 transition-colors flex items-center gap-2 shadow-lg shadow-orange-500/20 shrink-0 w-full md:w-auto justify-center"
                  >
                    <Trash2 className="w-5 h-5" /> Limpiar Votos
                  </button>
                  {systemIsTestMode ? (
                    <button 
                      onClick={handleToggleTestMode}
                      disabled={loading}
                      className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center gap-2 shadow-lg shadow-red-600/20 shrink-0 w-full md:w-auto justify-center"
                    >
                      <Square className="w-5 h-5 fill-current" /> Detener simulación
                    </button>
                  ) : (
                    <button 
                      onClick={handleToggleOfficialMode}
                      disabled={loading}
                      className="bg-rose-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-lg shadow-rose-600/20 shrink-0 w-full md:w-auto justify-center"
                    >
                      <StopCircle className="w-5 h-5 fill-current" /> Detener Votaciones
                    </button>
                  )}
                </div>
              </div>
            )}
            <header className="mb-8">
              <h1 className="text-3xl font-bold text-foreground">Progreso de Votación</h1>
              <p className="text-muted-foreground mt-1">Monitorea en tiempo real la participación de los estudiantes.</p>
            </header>

            {progresoLoading ? (
               <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                 <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                 <p>Calculando estadísticas...</p>
               </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  {/* Tarjetas Primaria */}
                  <div className="bg-card rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-center">
                    <h3 className="text-lg font-bold mb-4 text-foreground/80 text-center border-b border-border pb-2">Primaria</h3>
                    <div className="grid grid-cols-3 gap-2 text-center pb-4 border-b border-border mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Hábiles</p>
                        <p className="text-2xl font-black">{progresoPrimaria.total}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Votaron</p>
                        <p className="text-2xl font-black text-green-600">{progresoPrimaria.votaron}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Pendientes</p>
                        <p className="text-2xl font-black text-amber-600">{progresoPrimaria.pendientes}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Avance Nivel</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-primary">{progresoPrimaria.porcentaje}</span>
                        <span className="text-lg font-bold text-primary">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjetas Secundaria */}
                  <div className="bg-card rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-center">
                    <h3 className="text-lg font-bold mb-4 text-foreground/80 text-center border-b border-border pb-2">Secundaria</h3>
                    <div className="grid grid-cols-3 gap-2 text-center pb-4 border-b border-border mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Hábiles</p>
                        <p className="text-2xl font-black">{progresoSecundaria.total}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Votaron</p>
                        <p className="text-2xl font-black text-green-600">{progresoSecundaria.votaron}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Pendientes</p>
                        <p className="text-2xl font-black text-amber-600">{progresoSecundaria.pendientes}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Avance Nivel</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-primary">{progresoSecundaria.porcentaje}</span>
                        <span className="text-lg font-bold text-primary">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/10 rounded-2xl p-6 border border-primary/20 flex flex-col justify-center items-center text-center">
                    <p className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Avance Global</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black text-primary">{progresoTotals.porcentaje}</span>
                      <span className="text-2xl font-bold text-primary">%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-card rounded-2xl p-6 border border-border shadow-sm mb-8">
                  <h3 className="text-lg font-semibold mb-6">Desglose por Secciones</h3>
                  <div className="flex gap-4 flex-wrap mb-6">
                    <select value={progresoNivel} onChange={(e) => setProgresoNivel(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background outline-none text-sm min-w-[120px]">
                      <option value="">Todos los Niveles</option>
                      {nivelesDisponibles.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select value={progresoGrado} onChange={(e) => setProgresoGrado(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background outline-none text-sm min-w-[120px]">
                      <option value="">Todos los Grados</option>
                      {progresoGradosDisponibles.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select value={progresoSeccion} onChange={(e) => setProgresoSeccion(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background outline-none text-sm min-w-[120px]">
                      <option value="">Todas las Secciones</option>
                      {progresoSeccionesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {progresoBreakdown.length > 0 ? progresoBreakdown.map((group, idx) => {
                      const porcentaje = group.total > 0 ? Number(((group.votaron / group.total) * 100).toFixed(4)) : 0;
                      return (
                        <div key={idx} className="border border-border rounded-xl p-4 bg-secondary/30 relative overflow-hidden">
                          <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                              <h4 className="font-bold text-base leading-none mb-1">{group.grado} "{group.seccion}"</h4>
                              <p className="text-xs text-muted-foreground">{group.nivel}</p>
                            </div>
                            <span className="font-black text-lg text-primary">{porcentaje}%</span>
                          </div>
                          
                          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-3 relative z-10">
                            <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${porcentaje}%` }}></div>
                          </div>
                          
                          <div className="flex justify-between text-xs text-muted-foreground font-medium relative z-10">
                            <span>{group.votaron} votaron</span>
                            <span>{group.total - group.votaron} faltan</span>
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="col-span-full py-12 text-center text-muted-foreground">
                        No hay datos para los filtros seleccionados.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Historial Electoral</h1>
                <p className="text-muted-foreground mt-1">Consulta los resultados y candidatos de elecciones pasadas.</p>
              </div>
              <div className="flex gap-2">
                {selectedHistoricalElection && historicalResults.length > 0 && (
                  <button 
                    onClick={handleGeneratePDF}
                    disabled={historicalLoading}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shrink-0 shadow-lg shadow-primary/20"
                    title="Descargar resultados en PDF institucional"
                  >
                    <Download className="w-4 h-4" /> Exportar PDF
                  </button>
                )}
                <button 
                  onClick={() => setShowCleanSimulacrosConfirm(true)}
                  disabled={historicalLoading}
                  className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-medium hover:bg-destructive/10 hover:text-destructive transition-colors flex items-center gap-2 shrink-0 border border-border hover:border-destructive/30"
                  title="Elimina de la base de datos todos los simulacros archivados para mantener limpio el historial."
                >
                  <Trash2 className="w-4 h-4" /> Borrar Historial de Pruebas
                </button>
              </div>
            </header>

            <div className="mb-8 max-w-md">
              <label className="block text-sm font-medium text-foreground mb-2">Seleccionar Elección Archivada</label>
              <select
                value={selectedHistoricalElection}
                onChange={(e) => {
                  setSelectedHistoricalElection(e.target.value);
                  loadHistoricalResults(e.target.value);
                }}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
              >
                <option value="">-- Elige una elección --</option>
                {historicalElections.map(elec => (
                  <option key={elec.id} value={elec.id}>
                    {elec.titulo} ({new Date(elec.creado_en).getFullYear()})
                  </option>
                ))}
              </select>
            </div>

            {historicalLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <Loader2 className="w-12 h-12 mb-4 animate-spin opacity-50" />
                <p>Cargando resultados históricos...</p>
              </div>
            ) : selectedHistoricalElection && historicalResults.length > 0 ? (
              <div className="flex flex-col gap-4">
                {historicalResults.map((party, index) => {
                  const isWinner = index === 0 && party.votos > 0;
                  const isBlanco = party.id === "blanco";
                  
                  return (
                    <div 
                      key={party.id} 
                      className={`
                        relative bg-card rounded-2xl p-5 border shadow-sm transition-all duration-500
                        ${isWinner ? 'border-primary/50 shadow-[0_4px_20px_rgba(79,70,229,0.15)] scale-[1.02] z-10' : 'border-border'}
                      `}
                    >
                      <div className="flex flex-col md:flex-row md:items-start gap-6 relative z-10">
                        <div className={`
                          w-24 h-24 rounded-2xl flex items-center justify-center shrink-0 border-2 font-black text-4xl overflow-hidden
                          ${isBlanco ? 'bg-secondary border-border text-muted-foreground' : 'bg-background border-border'}
                        `}>
                          {party.logo_url && !isBlanco ? (
                            <img src={party.logo_url} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                            <span>{isBlanco ? '-' : (party.numero_lista || index + 1)}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 gap-4">
                            <div>
                              <h3 className={`text-2xl font-bold truncate ${isBlanco ? 'text-muted-foreground' : 'text-foreground'}`}>
                                {party.nombre}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {party.votos.toLocaleString()} votos
                              </p>
                            </div>
                            <div className="text-left md:text-right shrink-0">
                              <p className={`text-3xl font-black tabular-nums ${isWinner ? 'text-primary' : 'text-foreground'}`}>
                                {party.porcentaje.toFixed(1)}%
                              </p>
                            </div>
                          </div>

                          <div className="w-full h-3 bg-secondary rounded-full overflow-hidden mb-4">
                            <div 
                              className={`h-full transition-all duration-1500 ease-out ${isBlanco ? 'bg-muted-foreground/40' : (isWinner ? 'bg-primary' : 'bg-primary/60')}`} 
                              style={{ width: `${party.porcentaje}%` }}
                            ></div>
                          </div>

                          {!isBlanco && party.partido_candidatos && party.partido_candidatos.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-border/50">
                              <h4 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">Candidatos del año</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {party.partido_candidatos.map((pc: any, idx: number) => (
                                  <div key={idx} className="bg-secondary/30 rounded-xl p-3 border border-border/50 flex flex-col justify-center">
                                    <p className="text-xs font-semibold text-primary/80 mb-1">
                                      {pc.cargos?.descripcion || 'Cargo'}
                                    </p>
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {pc.estudiantes?.nombres} {pc.estudiantes?.apellidos}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {pc.estudiantes?.grado} {pc.estudiantes?.seccion}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : selectedHistoricalElection ? (
               <div className="flex flex-col items-center justify-center py-24 text-muted-foreground bg-secondary/20 rounded-2xl border border-dashed">
                 <Archive className="w-12 h-12 mb-4 opacity-50" />
                 <p>No hay resultados guardados en este Snapshot.</p>
                 <p className="text-sm opacity-70 mt-1 text-center">Quizá la elección se archivó antes de instalar el sistema de fotogramas,<br/>o la elección terminó sin votos.</p>
               </div>
            ) : null}
          </div>
        )}

        {activeTab === 'accesos' && isSuperAdmin && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Gestión de Accesos</h1>
                <p className="text-muted-foreground mt-1 text-sm">Administra los privilegios del panel administrativo.</p>
              </div>
              <button 
                onClick={handleOpenCreateManualAdmin}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20 text-sm"
              >
                <Plus className="w-4 h-4" /> Registrar Administrativo
              </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-card rounded-2xl p-6 border border-border shadow-sm h-fit">
                <h3 className="text-lg font-semibold mb-4">Promover Estudiante</h3>
                
                <div className="flex gap-2 mb-6">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input 
                      type="text" 
                      placeholder="DNI del estudiante..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none"
                      value={searchDni}
                      onChange={(e) => setSearchDni(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchDni && handleSearchStudent()}
                    />
                  </div>
                  <button 
                    onClick={handleSearchStudent}
                    disabled={loading || !searchDni}
                    className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-secondary/80 disabled:opacity-50"
                  >
                    Buscar
                  </button>
                </div>

                {roleMessage && (
                  <div className={`mb-4 p-3 rounded-lg text-sm ${roleMessage.includes('éxito') ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
                    {roleMessage}
                  </div>
                )}

                {foundStudent && (
                  <div className="border border-border rounded-xl p-4 bg-secondary/20 animate-in fade-in">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                        <UserX className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold">{foundStudent.nombres} {foundStudent.apellidos}</p>
                        <p className="text-xs text-muted-foreground">DNI: {foundStudent.dni} | {foundStudent.grado} "{foundStudent.seccion}"</p>
                      </div>
                    </div>

                    {foundStudent.rol !== 'estudiante' ? (
                      <p className="text-sm text-amber-600 bg-amber-500/10 p-2 rounded-md">Este usuario ya es {foundStudent.rol}.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <select
                            value={selectedCargo}
                            onChange={(e) => setSelectedCargo(e.target.value as "Secretario(a)" | "Vocal" | "VicePresidente" | "Presidente")}
                            className="w-1/3 px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm font-medium"
                          >
                            <option value="Presidente">Presidente</option>
                            <option value="VicePresidente">VicePresidente</option>
                            <option value="Secretario(a)">Secretario(a)</option>
                            <option value="Vocal">Vocal</option>
                          </select>
                          <div className="flex-1 relative">
                            <input 
                              type={showNewPassword ? "text" : "password"} 
                              placeholder="Asignar contraseña secreta..."
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm"
                            />
                            <button 
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <button 
                          onClick={handlePromoteToAdmin}
                          disabled={!newPassword || loading}
                          className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 text-sm"
                        >
                          Conceder Acceso de Comité Electoral
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-8 h-fit">
                {/* Administradores Actuales */}
                <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
                  <h3 className="text-lg font-semibold mb-4">Administradores Actuales</h3>
                  <div className="space-y-3">
                    {adminsList.filter(a => a.rol === 'administrador' || a.rol === 'superadmin').map(admin => (
                      <div key={admin.id} className="flex justify-between items-center p-3 border border-border rounded-xl hover:bg-secondary/30 transition-colors">
                        <div>
                          <p className="font-semibold text-sm">{admin.nombres} {admin.apellidos}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${admin.rol === 'superadmin' ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20' : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'}`}>
                              {admin.rol}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">
                              C: {admin.contrasena}
                            </span>
                          </div>
                        </div>
                        
                        {admin.rol !== 'superadmin' && (
                          <div className="flex gap-1">
                            {admin.grado === 'N/A' && admin.seccion === 'N/A' && (
                              <button 
                                onClick={() => handleEditManualAdmin(admin)}
                                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                title="Editar datos"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleDemoteAdmin(admin.id, admin.rol === 'comite')}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                              title="Revocar acceso"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {adminsList.filter(a => a.rol === 'administrador' || a.rol === 'superadmin').length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay administradores.</p>
                    )}
                  </div>
                </div>

                {/* Comité Electoral Actual */}
                <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
                  <h3 className="text-lg font-semibold mb-4">Comité Electoral Actual</h3>
                  <div className="space-y-3">
                    {adminsList.filter(a => a.rol === 'comite').map(comite => (
                      <div key={comite.id} className="flex justify-between items-center p-3 border border-border rounded-xl hover:bg-secondary/30 transition-colors">
                        <div>
                          <p className="font-semibold text-sm">{comite.nombres} {comite.apellidos}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              {comite.cargo || 'Comité'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">
                              DNI: {comite.dni}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">
                              C: {comite.contrasena}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex gap-1 items-center">
                          {editingCargoId === comite.id ? (
                            <>
                              <select
                                value={editingCargoValue}
                                onChange={(e) => setEditingCargoValue(e.target.value)}
                                className="px-2 py-1 rounded border border-border bg-background text-xs outline-none focus:border-primary"
                              >
                                <option value="Presidente">Presidente</option>
                                <option value="VicePresidente">VicePresidente</option>
                                <option value="Secretario(a)">Secretario(a)</option>
                                <option value="Vocal">Vocal</option>
                              </select>
                              <button 
                                onClick={() => handleUpdateCargo(comite.id, editingCargoValue)}
                                className="p-2 text-muted-foreground hover:text-green-600 hover:bg-green-500/10 rounded-lg transition-colors"
                                title="Guardar Cargo"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setEditingCargoId(null)}
                                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingCargoId(comite.id);
                                setEditingCargoValue(comite.cargo || "Vocal");
                              }}
                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Editar Cargo"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          
                          <button 
                            onClick={() => setStudentToRemove(comite)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            title="Revocar acceso"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {adminsList.filter(a => a.rol === 'comite').length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay miembros del comité electoral asignados.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Modal Crear/Editar Admin Manual */}
      {showManualAdminModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-sm rounded-3xl p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-4 text-foreground">
              {editingManualAdminId ? "Editar Administrativo" : "Registrar Administrativo"}
            </h2>
            
            {manualMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${manualMessage.includes('Error') || manualMessage.includes('Por favor') || manualMessage.includes('ya existe') ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'}`}>
                {manualMessage}
              </div>
            )}

            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="DNI"
                value={manualDni}
                onChange={(e) => setManualDni(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm"
              />
              <div className="flex gap-3">
                <input 
                  type="text" 
                  placeholder="Nombres"
                  value={manualNombres}
                  onChange={(e) => setManualNombres(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm"
                />
                <input 
                  type="text" 
                  placeholder="Apellidos"
                  value={manualApellidos}
                  onChange={(e) => setManualApellidos(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm"
                />
              </div>
              <div className="relative">
                <input 
                  type={showManualPassword ? "text" : "password"} 
                  placeholder="Contraseña"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm"
                />
                <button 
                  type="button"
                  onClick={() => setShowManualPassword(!showManualPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showManualPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setShowManualAdminModal(false)}
                  className="flex-1 py-2 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreateManualAdmin}
                  disabled={!manualDni || !manualNombres || !manualApellidos || !manualPassword || loading}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 text-sm shadow-lg shadow-primary/20"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Limpiar Votos Simulacro */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl p-6 md:p-8 shadow-2xl border border-border animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-2">Descargar Padrón Completo</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              Elige cómo deseas exportar el padrón electoral. El archivo de Excel contendrá una hoja general y una hoja por cada aula.
            </p>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-border hover:bg-secondary/20 transition-colors cursor-pointer mb-8">
              <div className="mt-0.5">
                <input 
                  type="checkbox" 
                  checked={includeVoteStatus}
                  onChange={(e) => setIncludeVoteStatus(e.target.checked)}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                />
              </div>
              <div>
                <p className="font-semibold text-foreground">Incluir columna de estado de votación</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Añadirá una columna "Votó" (Sí/No) para que sepas quiénes ya participaron. Útil si las elecciones ya empezaron.
                </p>
              </div>
            </label>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowDownloadModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDownloadPadron}
                disabled={isDownloadingPadron}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {isDownloadingPadron ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-orange-500">
              <Trash2 className="w-10 h-10" />
              <h2 className="text-2xl font-bold">Limpiar Votos</h2>
            </div>
            <p className="text-lg mb-4 text-foreground font-medium">
              ¿Estás seguro de borrar todos los votos registrados durante los simulacros?
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Esto volverá a 0 los resultados de prueba y permitirá a los estudiantes volver a votar en la simulación.
            </p>
            {resetCountdown > 0 ? (
              <div className="w-full py-3 rounded-xl font-bold text-center bg-secondary text-muted-foreground">
                Espera {resetCountdown} segundos...
              </div>
            ) : (
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleResetTestVotes}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/25 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sí, limpiar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Archivar Elección */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-destructive">
              <Archive className="w-10 h-10" />
              <h2 className="text-2xl font-bold">Archivar Elección</h2>
            </div>
            <p className="text-lg mb-4 text-foreground font-medium">
              ¿Estás seguro de archivar esta elección?
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Esta acción desactivará la elección actual y <strong>reiniciará el estado de votación de TODOS los estudiantes</strong> a cero. Esto se hace únicamente cuando un proceso electoral oficial ha concluido.
            </p>
            
            {archiveCountdown > 0 ? (
              <div className="w-full py-3 rounded-xl font-bold text-center bg-secondary text-muted-foreground">
                Espera {archiveCountdown} segundos...
              </div>
            ) : (
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowArchiveConfirm(false)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleArchiveElection}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/25 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Archivar Ahora'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Limpiar Simulacros */}
      {showCleanSimulacrosConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-destructive">
              <div className="p-3 bg-destructive/10 rounded-2xl">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">Borrar Historial de Pruebas</h3>
            </div>
            
            <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
              ¿Estás seguro que deseas <strong>eliminar definitivamente</strong> todos los <strong className="text-foreground">registros archivados de simulacro</strong> del historial? Esta acción borrará la elección de prueba junto con sus partidos clonados y votos pasados. Tus elecciones oficiales no se verán afectadas.
            </p>

            {cleanSimulacrosCountdown > 0 ? (
              <div className="w-full py-3 rounded-xl font-bold text-center bg-secondary text-muted-foreground">
                Espera {cleanSimulacrosCountdown} segundos...
              </div>
            ) : (
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowCleanSimulacrosConfirm(false)}
                  disabled={historicalLoading}
                  className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCleanSimulacrosHistory}
                  disabled={historicalLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/25 disabled:opacity-50"
                >
                  {historicalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  Eliminar Todo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {studentToRemove && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mb-6 text-destructive mx-auto">
              <UserX className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-center text-foreground">Remover del Comité</h2>
            <p className="text-center text-muted-foreground mb-6">
              ¿Seguro que deseas remover a <strong className="text-foreground">{studentToRemove.nombres} {studentToRemove.apellidos}</strong> del comité electoral? Esta acción le revocará el acceso al panel.
            </p>
            
            {deleteCountdown > 0 ? (
              <div className="w-full py-3 rounded-xl font-bold text-center bg-secondary text-muted-foreground">
                Espera {deleteCountdown} segundos...
              </div>
            ) : (
              <div className="flex gap-4">
                <button 
                  onClick={() => setStudentToRemove(null)}
                  className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteComiteConfirm}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/25"
                >
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Candidates Modal */}
      {isCandidatesModalOpen && selectedPartyForCandidates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-3xl rounded-3xl p-6 md:p-8 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <UserPlus className="w-7 h-7 text-primary" /> Asignar Candidatos
                </h2>
                <p className="text-muted-foreground">Partido: {selectedPartyForCandidates.nombre}</p>
              </div>
              <button 
                onClick={() => setIsCandidatesModalOpen(false)}
                className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {cargos.map((cargo) => (
                <div key={cargo.id} className="p-4 rounded-2xl border border-border bg-secondary/20">
                  <h4 className="font-semibold text-foreground mb-3">{cargo.descripcion}</h4>
                  
                  {candidatesForm[cargo.id] ? (
                    <div className="flex justify-between items-center bg-card p-3 rounded-xl border border-border shadow-sm">
                      <div>
                        <p className="font-bold">{candidatesForm[cargo.id].nombres} {candidatesForm[cargo.id].apellidos}</p>
                        <p className="text-sm text-muted-foreground">DNI: {candidatesForm[cargo.id].dni} | {candidatesForm[cargo.id].grado} {candidatesForm[cargo.id].seccion}</p>
                      </div>
                      <button 
                        onClick={() => handleRemoveCandidate(cargo.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Remover candidato"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      {candidateSearchRole === cargo.id ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input 
                              type="text" 
                              placeholder="Buscar por DNI o Nombres..."
                              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:border-primary outline-none"
                              value={candidateSearchQuery}
                              onChange={(e) => handleSearchCandidateForRole(e.target.value, cargo.id)}
                              autoFocus
                            />
                            <button 
                              onClick={() => {
                                setCandidateSearchRole(null);
                                setCandidateSearchQuery("");
                                setCandidateSearchResults([]);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {candidateSearchQuery.length >= 3 && (
                            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-md max-h-48 overflow-y-auto">
                              {isSearchingCandidates ? (
                                <div className="p-4 text-center text-sm text-muted-foreground flex justify-center items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                                </div>
                              ) : candidateSearchResults.length > 0 ? (
                                candidateSearchResults.map((student) => (
                                  <button
                                    key={student.id}
                                    onClick={() => handleSelectCandidate(cargo.id, student)}
                                    className="w-full text-left px-4 py-3 hover:bg-secondary border-b last:border-0 transition-colors flex justify-between items-center"
                                  >
                                    <div>
                                      <p className="font-semibold text-sm">{student.nombres} {student.apellidos}</p>
                                      <p className="text-xs text-muted-foreground">DNI: {student.dni}</p>
                                    </div>
                                    <span className="text-xs font-mono bg-secondary px-2 py-1 rounded-md">{student.grado} {student.seccion}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                  No se encontraron resultados
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button 
                          onClick={() => {
                            setCandidateSearchRole(cargo.id);
                            setCandidateSearchQuery("");
                            setCandidateSearchResults([]);
                          }}
                          className="w-full py-3 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-primary/50 transition-all flex items-center justify-center gap-2"
                        >
                          <Search className="w-4 h-4" /> Buscar Estudiante
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-4">
              <button 
                onClick={() => setIsCandidatesModalOpen(false)}
                className="flex-1 py-3 rounded-xl font-semibold border border-border hover:bg-secondary transition-colors"
                disabled={loading}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveCandidates}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Candidatos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Navigation (Bottom Bar) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-3 z-50 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)] pb-safe">
        {!isComite && (
          <button onClick={() => setActiveTab("plantilla")} className={`p-2.5 rounded-xl transition-colors ${activeTab === 'plantilla' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-secondary'}`} title="Plantilla">
            <Users className="w-6 h-6" />
          </button>
        )}
        <button onClick={() => setActiveTab("padron")} className={`p-2.5 rounded-xl transition-colors ${activeTab === 'padron' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-secondary'}`} title="Padrón">
          <FileSpreadsheet className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab("progreso")} className={`p-2.5 rounded-xl transition-colors ${activeTab === 'progreso' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-secondary'}`} title="Progreso">
          <BarChart2 className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab("historial")} className={`p-2.5 rounded-xl transition-colors ${activeTab === 'historial' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-secondary'}`} title="Historial">
          <Archive className="w-6 h-6" />
        </button>
        {isSuperAdmin && (
          <button onClick={() => setActiveTab("accesos")} className={`p-2.5 rounded-xl transition-colors ${activeTab === 'accesos' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-secondary'}`} title="Accesos">
            <ShieldCheck className="w-6 h-6" />
          </button>
        )}
        <button onClick={async () => { await logoutAdminAction(); router.push("/admin"); }} className="p-2.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Cerrar Sesión">
          <LogOut className="w-6 h-6" />
        </button>
      </nav>

    </div>
  );
}
