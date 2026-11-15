"use server";

import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminSession, getVoterSession, clearVoterSession, setVoterSession } from "@/lib/auth";

// Helper para verificar permisos de administración (superadmin o admin)
async function ensureSuperAdmin() {
  const session = await getAdminSession();
  if (!session || (session.rol !== "superadmin" && session.rol !== "admin")) {
    throw new Error("No tienes permisos de administrador para realizar esta acción.");
  }
  return session;
}

// -------------------------------------------------------------
// 1. AUTENTICACIÓN Y EMISIÓN DE VOTO APAFA
// -------------------------------------------------------------

export async function loginApafaVoterAction(dni: string) {
  try {
    const rawClean = (dni || "").replace(/\D/g, "").trim();
    if (!rawClean) {
      return { error: "Por favor, ingresa un número de DNI válido." };
    }

    const padded8 = rawClean.padStart(8, "0");
    const unpadded = rawClean.replace(/^0+/, "");
    const rawTrimmed = (dni || "").trim();

    // Buscar por DNI normalizado de 8 dígitos, sin ceros iniciales, o texto original
    const candidates = Array.from(new Set([rawClean, padded8, unpadded, rawTrimmed])).filter(Boolean);
    const filterConditions = candidates.map(c => `dni.eq.${c}`).join(",");

    const { data, error } = await supabaseAdmin
      .from("apoderados")
      .select("*")
      .or(filterConditions)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        return { error: "La tabla de apoderados aún no ha sido creada en la base de datos. Por favor ejecute el script supabase_apafa.sql en Supabase." };
      }
      return { error: "Error al consultar el padrón de APAFA: " + error.message };
    }

    if (!data) {
      return { error: "DNI no encontrado en el padrón electoral de padres de familia (APAFA)." };
    }

    if (data.ya_voto) {
      const infoVoto = data.voto_emitido_por ? ` (${data.voto_emitido_por})` : "";
      return { error: `Esta familia ya ha emitido su voto.${infoVoto}` };
    }

    await setVoterSession({
      id: data.id,
      dni: data.dni,
      nombres: data.nombres,
      apellidos: data.apellidos,
      grado: data.grado || "",
      seccion: data.seccion || "",
      nivel: data.nivel || "",
      tipo: "apoderado",
      familia_id: data.familia_id,
      parentesco: data.parentesco || "APODERADO",
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Error al iniciar sesión como apoderado." };
  }
}

export async function submitVoteApafaAction(eleccionId: string, partidoId: string | null) {
  try {
    const user = await getVoterSession();

    if (!user || user.tipo !== "apoderado") {
      return { error: "Sesión de votante de APAFA inválida o expirada." };
    }

    // 1. Doble verificación de que la familia no haya votado
    const { data: apoderado, error: checkError } = await supabaseAdmin
      .from("apoderados")
      .select("ya_voto, familia_id, nombres, apellidos, parentesco, dni")
      .eq("id", user.id)
      .single();

    if (checkError || !apoderado) {
      return { error: "Error al verificar la identidad del apoderado." };
    }

    if (apoderado.ya_voto) {
      await clearVoterSession();
      return { error: "Esta familia ya ha emitido su voto." };
    }

    // 2. Verificar que la elección de APAFA siga activa
    const { data: election, error: electionErr } = await supabaseAdmin
      .from("elecciones_apafa")
      .select("esta_activa")
      .eq("id", eleccionId)
      .single();

    if (electionErr || !election || !election.esta_activa) {
      await clearVoterSession();
      return { error: "La votación de APAFA está cerrada o no se encuentra activa en este momento." };
    }

    // 3. Insertar voto anónimo en votos_apafa
    const { error: voteErr } = await supabaseAdmin.from("votos_apafa").insert({
      eleccion_id: eleccionId,
      partido_id: partidoId,
      familia_id: apoderado.familia_id,
      grado_votante: user.grado,
      seccion_votante: user.seccion,
      nivel_votante: user.nivel,
    });

    if (voteErr) {
      throw voteErr;
    }

    // 4. Marcar a TODOS los apoderados con este familia_id como ya_voto = true
    const detalleVoto = `Votó ${apoderado.parentesco || 'Apoderado'}: ${apoderado.apellidos}, ${apoderado.nombres} (DNI ${apoderado.dni})`;
    const { error: apoderadoErr } = await supabaseAdmin
      .from("apoderados")
      .update({
        ya_voto: true,
        voto_emitido_por: detalleVoto
      })
      .eq("familia_id", apoderado.familia_id);

    if (apoderadoErr) {
      throw apoderadoErr;
    }

    await clearVoterSession();
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Error interno al procesar el voto de APAFA." };
  }
}

// -------------------------------------------------------------
// 2. GESTIÓN DE PLANTILLAS Y ELECCIONES APAFA (ADMIN)
// -------------------------------------------------------------

export async function getCargosApafaAction() {
  try {
    const requiredCargos = [
      { descripcion: "Presidente", orden: 1 },
      { descripcion: "Vicepresidente", orden: 2 },
      { descripcion: "Tesorero(a)", orden: 3 },
      { descripcion: "Secretario(a)", orden: 4 },
      { descripcion: "Vocal 1", orden: 5 },
      { descripcion: "Vocal 2", orden: 6 },
      { descripcion: "Vocal 3", orden: 7 }
    ];

    const { data: existing, error } = await supabaseAdmin
      .from("cargos_apafa")
      .select("*")
      .order("orden", { ascending: true });

    if (error) {
      return {
        data: requiredCargos.map((c, i) => ({ id: String(i + 1), ...c }))
      };
    }

    const existingNames = (existing || []).map(c => c.descripcion.toLowerCase().trim());
    const isExact = existing && existing.length === 7 &&
      existingNames.some(n => n.includes("presidente") && !n.includes("vice")) &&
      existingNames.some(n => n.includes("vice")) &&
      existingNames.some(n => n.includes("tesorer")) &&
      existingNames.some(n => n.includes("secretar")) &&
      existingNames.some(n => n === "vocal 1") &&
      existingNames.some(n => n === "vocal 2") &&
      existingNames.some(n => n === "vocal 3");

    if (!isExact) {
      await supabaseAdmin.from("cargos_apafa").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const { data: created } = await supabaseAdmin
        .from("cargos_apafa")
        .insert(requiredCargos)
        .select("*")
        .order("orden", { ascending: true });
      return { data: created || requiredCargos.map((c, i) => ({ id: String(i + 1), ...c })) };
    }

    return { data: existing };
  } catch (err: any) {
    return {
      data: [
        { id: "1", descripcion: "Presidente", orden: 1 },
        { id: "2", descripcion: "Vicepresidente", orden: 2 },
        { id: "3", descripcion: "Tesorero(a)", orden: 3 },
        { id: "4", descripcion: "Secretario(a)", orden: 4 },
        { id: "5", descripcion: "Vocal 1", orden: 5 },
        { id: "6", descripcion: "Vocal 2", orden: 6 },
        { id: "7", descripcion: "Vocal 3", orden: 7 }
      ]
    };
  }
}

export async function searchApoderadosAction(query: string) {
  try {
    const cleanQuery = query.trim();
    if (!cleanQuery) return { data: [] };

    // Si es búsqueda numérica (DNI)
    if (/^\d+$/.test(cleanQuery)) {
      const { data, error } = await supabaseAdmin
        .from("apoderados")
        .select("id, dni, nombres, apellidos, parentesco, hijos, grado, seccion, nivel, familia_id")
        .ilike("dni", `%${cleanQuery}%`)
        .order("apellidos", { ascending: true })
        .limit(12);

      if (error) throw error;
      return { data: data || [] };
    }

    // Si son palabras (nombres y/o apellidos)
    const words = cleanQuery.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      const term = words[0];
      const { data, error } = await supabaseAdmin
        .from("apoderados")
        .select("id, dni, nombres, apellidos, parentesco, hijos, grado, seccion, nivel, familia_id")
        .or(`dni.ilike.%${term}%,nombres.ilike.%${term}%,apellidos.ilike.%${term}%`)
        .order("apellidos", { ascending: true })
        .limit(12);

      if (error) throw error;
      return { data: data || [] };
    } else {
      // Múltiples palabras: ej "Juan Perez" o "Perez Juan"
      const orConditions = words.map(w => `nombres.ilike.%${w}%,apellidos.ilike.%${w}%`).join(",");
      const { data, error } = await supabaseAdmin
        .from("apoderados")
        .select("id, dni, nombres, apellidos, parentesco, hijos, grado, seccion, nivel, familia_id")
        .or(orConditions)
        .limit(30);

      if (error) throw error;

      // Ordenar priorizando coincidencias que contengan más palabras buscadas
      const sorted = (data || []).sort((a: any, b: any) => {
        const fullA = `${a.apellidos || ""} ${a.nombres || ""} ${a.dni || ""}`.toLowerCase();
        const fullB = `${b.apellidos || ""} ${b.nombres || ""} ${b.dni || ""}`.toLowerCase();
        const matchCountA = words.filter(w => fullA.includes(w.toLowerCase())).length;
        const matchCountB = words.filter(w => fullB.includes(w.toLowerCase())).length;
        return matchCountB - matchCountA;
      });

      return { data: sorted.slice(0, 12) };
    }
  } catch (err: any) {
    return { error: err.message, data: [] };
  }
}

function parseFullNames(fullName: string) {
  const clean = fullName.trim();
  if (clean.includes(",")) {
    const parts = clean.split(",");
    return {
      apellidos: parts[0].trim(),
      nombres: parts.slice(1).join(" ").trim() || parts[0].trim()
    };
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return { apellidos: clean, nombres: clean };
  }
  if (words.length === 2) {
    return { nombres: words[0], apellidos: words[1] };
  }
  if (words.length === 3) {
    return { nombres: words[0], apellidos: `${words[1]} ${words[2]}` };
  }
  const mid = Math.floor(words.length / 2);
  return {
    nombres: words.slice(0, mid).join(" "),
    apellidos: words.slice(mid).join(" ")
  };
}

async function ensureCandidateInPadron(cand: { dni?: string; nombre?: string; cargo?: string; parentesco?: string }) {
  try {
    if (!cand || !cand.dni) return;
    const cleanDni = cand.dni.replace(/\D/g, "").slice(0, 8);
    if (cleanDni.length !== 8) return;

    const { data: existing } = await supabaseAdmin
      .from("apoderados")
      .select("id")
      .eq("dni", cleanDni)
      .maybeSingle();

    if (!existing) {
      const { nombres, apellidos } = parseFullNames(cand.nombre || "");
      const cargoNote = cand.cargo ? `Directivo APAFA (${cand.cargo})` : "Directivo APAFA";

      await supabaseAdmin.from("apoderados").insert({
        dni: cleanDni,
        nombres: nombres || "Apoderado",
        apellidos: apellidos || "Directivo",
        parentesco: cand.parentesco || "APODERADO",
        familia_id: `FAM-${cleanDni}`,
        hijos: cargoNote,
        nivel: "general",
        grado: "Directiva",
        seccion: "-",
        ya_voto: false
      });
    }
  } catch (err: any) {
    console.warn("Aviso en ensureCandidateInPadron:", err?.message || err);
  }
}

export async function registerManualApoderadoAction(params: {
  dni: string;
  nombreCompleto: string;
  cargo?: string;
  parentesco?: string;
}) {
  try {
    await ensureSuperAdmin();
    const rawDigits = params.dni.replace(/\D/g, "");
    const cleanDni = rawDigits.length === 7 ? rawDigits.padStart(8, "0") : rawDigits.slice(0, 8);
    if (cleanDni.length !== 8) {
      return { error: "El DNI debe tener 7 u 8 dígitos para habilitar su voto." };
    }

    const { data: existing, error: checkErr } = await supabaseAdmin
      .from("apoderados")
      .select("id, dni, nombres, apellidos, parentesco, familia_id")
      .eq("dni", cleanDni)
      .maybeSingle();

    if (existing) {
      return {
        success: true,
        apoderado: existing,
        alreadyExisted: true
      };
    }

    const { nombres, apellidos } = parseFullNames(params.nombreCompleto);
    const cargoNote = params.cargo ? `Directivo APAFA (${params.cargo})` : "Directivo APAFA";

    const newApoderado = {
      dni: cleanDni,
      nombres: nombres || "Apoderado",
      apellidos: apellidos || "Directivo",
      parentesco: params.parentesco || "APODERADO",
      familia_id: `FAM-${cleanDni}`,
      hijos: cargoNote,
      nivel: "general",
      grado: "Directiva",
      seccion: "-",
      ya_voto: false
    };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("apoderados")
      .insert(newApoderado)
      .select()
      .single();

    if (insErr) throw insErr;

    return {
      success: true,
      apoderado: inserted,
      alreadyExisted: false
    };
  } catch (err: any) {
    return { error: err.message || "Error al registrar el apoderado en la base de datos." };
  }
}

export async function getApafaWorkspaceDataAction(workspace: "oficial" | "simulacro") {
  try {
    const isSimulacro = workspace === "simulacro";

    let query = supabaseAdmin
      .from("elecciones_apafa")
      .select("*");

    if (isSimulacro) {
      query = query.ilike("titulo", "[PRUEBA]%");
    } else {
      query = query.not("titulo", "ilike", "[PRUEBA]%");
    }

    const { data: election, error: elecErr } = await query
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (elecErr && !elecErr.message.includes("does not exist")) {
      throw elecErr;
    }

    let parties: any[] = [];
    if (election?.id) {
      const { data: partiesData, error: partErr } = await supabaseAdmin
        .from("partidos_apafa")
        .select("*")
        .eq("eleccion_id", election.id)
        .order("creado_en", { ascending: true });

      if (partErr) throw partErr;
      parties = partiesData || [];
    }

    // Verificar si alguna elección de APAFA está activa actualmente
    const { data: activeElection } = await supabaseAdmin
      .from("elecciones_apafa")
      .select("id, titulo, esta_activa")
      .eq("esta_activa", true)
      .limit(1)
      .maybeSingle();

    const { data: cargos } = await getCargosApafaAction();

    return {
      success: true,
      election: election || null,
      parties,
      cargos: cargos || [],
      activeElection: activeElection || null
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function saveApafaElectionAction(electionData: {
  id?: string;
  titulo: string;
  fecha_votacion?: string;
  partidos: Array<{
    id?: string;
    nombre: string;
    numero_lista?: string;
    logo_url?: string;
    color?: string;
    candidatos?: any[];
  }>;
}) {
  try {
    await ensureSuperAdmin();

    let electionId = electionData.id;

    if (electionId) {
      const { error: updErr } = await supabaseAdmin
        .from("elecciones_apafa")
        .update({
          titulo: electionData.titulo,
          fecha_votacion: electionData.fecha_votacion || null
        })
        .eq("id", electionId);
      if (updErr) throw updErr;
    } else {
      const { data: newElec, error: insErr } = await supabaseAdmin
        .from("elecciones_apafa")
        .insert({
          titulo: electionData.titulo,
          fecha_votacion: electionData.fecha_votacion || null,
          esta_activa: false
        })
        .select()
        .single();
      if (insErr) throw insErr;
      electionId = newElec.id;
    }

    // Guardar o sincronizar partidos
    const currentPartyIds: string[] = [];

    for (const p of electionData.partidos) {
      const partyPayload: any = {
        eleccion_id: electionId,
        nombre: p.nombre,
        numero_lista: p.numero_lista || null,
        logo_url: p.logo_url || null,
        color: p.color || null,
        candidatos: p.candidatos || []
      };

      if (Array.isArray(p.candidatos)) {
        for (const cand of p.candidatos) {
          await ensureCandidateInPadron(cand);
        }
      }

      if (p.id && !p.id.startsWith("temp-")) {
        const { data: updated, error: updPErr } = await supabaseAdmin
          .from("partidos_apafa")
          .update(partyPayload)
          .eq("id", p.id)
          .select("id")
          .single();
        if (updPErr) throw updPErr;
        if (updated) currentPartyIds.push(updated.id);
      } else {
        const { data: inserted, error: insPErr } = await supabaseAdmin
          .from("partidos_apafa")
          .insert(partyPayload)
          .select("id")
          .single();
        if (insPErr) throw insPErr;
        if (inserted) currentPartyIds.push(inserted.id);
      }
    }

    // Sincronizar y eliminar partidos que ya no están en la lista
    const { data: existingParties } = await supabaseAdmin
      .from("partidos_apafa")
      .select("id")
      .eq("eleccion_id", electionId);

    const idsToDelete = (existingParties || [])
      .map(p => p.id)
      .filter(id => !currentPartyIds.includes(id));

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("partidos_apafa")
        .delete()
        .in("id", idsToDelete);
      if (delErr) throw delErr;
    }

    return { success: true, electionId };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function saveSingleApafaPartyAction(params: {
  electionId?: string;
  electionTitle: string;
  fechaVotacion?: string;
  isSimulacro: boolean;
  party: {
    id?: string;
    nombre?: string;
    numero_lista?: string;
    logo_url?: string;
    color?: string;
    candidatos?: any[];
  };
}) {
  try {
    await ensureSuperAdmin();

    let electionId = params.electionId;

    if (!electionId) {
      // Buscar o crear la elección del workspace
      let q = supabaseAdmin
        .from("elecciones_apafa")
        .select("id");

      if (params.isSimulacro) {
        q = q.ilike("titulo", "[PRUEBA]%");
      } else {
        q = q.not("titulo", "ilike", "[PRUEBA]%");
      }

      const { data: existingElec } = await q
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingElec) {
        electionId = existingElec.id;
      } else {
        const finalTitle = params.isSimulacro && !params.electionTitle.startsWith("[PRUEBA]")
          ? `[PRUEBA] ${params.electionTitle}`
          : params.electionTitle;

        const { data: newElec, error: insErr } = await supabaseAdmin
          .from("elecciones_apafa")
          .insert({
            titulo: finalTitle,
            fecha_votacion: params.fechaVotacion || null,
            esta_activa: false
          })
          .select()
          .single();

        if (insErr) throw insErr;
        electionId = newElec.id;
      }
    }

    const party = params.party;
    const finalName = party.nombre?.trim() || (party.numero_lista ? `Lista ${party.numero_lista}` : "Nueva Lista");

    const partyPayload: any = {
      eleccion_id: electionId,
      nombre: finalName,
      numero_lista: party.numero_lista || null,
      logo_url: party.logo_url || null,
      color: party.color || "#d97706",
      candidatos: party.candidatos || []
    };

    let savedParty: any = null;

    if (Array.isArray(party.candidatos)) {
      for (const cand of party.candidatos) {
        await ensureCandidateInPadron(cand);
      }
    }

    if (party.id && !party.id.startsWith("temp-")) {
      const { data, error } = await supabaseAdmin
        .from("partidos_apafa")
        .update(partyPayload)
        .eq("id", party.id)
        .select()
        .single();
      if (error) throw error;
      savedParty = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("partidos_apafa")
        .insert(partyPayload)
        .select()
        .single();
      if (error) throw error;
      savedParty = data;
    }

    return { success: true, party: savedParty, electionId };
  } catch (err: any) {
    return { error: err.message || "Error al guardar la lista." };
  }
}

export async function deleteApafaPartyAction(partyId: string) {
  try {
    await ensureSuperAdmin();
    if (!partyId || partyId.startsWith("temp-")) {
      return { success: true };
    }
    const { error } = await supabaseAdmin
      .from("partidos_apafa")
      .delete()
      .eq("id", partyId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Error al eliminar la lista de APAFA." };
  }
}

export async function toggleApafaElectionStatusAction(
  electionId: string,
  isActive: boolean,
  snapshotData: any = null
) {
  try {
    await ensureSuperAdmin();

    if (isActive) {
      // Desactivar cualquier otra elección de APAFA previamente activa
      await supabaseAdmin
        .from("elecciones_apafa")
        .update({ esta_activa: false })
        .neq("id", electionId);
    }

    const payload: any = { esta_activa: isActive };
    if (snapshotData !== null) {
      payload.snapshot_historico = snapshotData;
    }

    const { error } = await supabaseAdmin
      .from("elecciones_apafa")
      .update(payload)
      .eq("id", electionId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function resetApafaVotesAction(electionId?: string, resetPadron: boolean = false) {
  try {
    await ensureSuperAdmin();

    if (electionId) {
      const { error: vErr } = await supabaseAdmin
        .from("votos_apafa")
        .delete()
        .eq("eleccion_id", electionId);
      if (vErr) throw vErr;
    } else {
      const { error: vErr } = await supabaseAdmin
        .from("votos_apafa")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (vErr) throw vErr;
    }

    if (resetPadron) {
      const { error: pErr } = await supabaseAdmin
        .from("apoderados")
        .update({ ya_voto: false, voto_emitido_por: null })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (pErr) throw pErr;
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function insertMockVotesApafaAction(votesChunk: any[]) {
  try {
    await ensureSuperAdmin();
    const { error } = await supabaseAdmin.from("votos_apafa").insert(votesChunk);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function generateMockVotesApafaAction(electionId: string, count: number = 40) {
  try {
    await ensureSuperAdmin();

    // 1. Obtener partidos de esta elección
    const { data: partiesData, error: partyErr } = await supabaseAdmin
      .from("partidos_apafa")
      .select("id")
      .eq("eleccion_id", electionId);

    if (partyErr) throw partyErr;
    const partyIds = (partiesData || []).map(p => p.id);

    // 2. Obtener apoderados reales de la base de datos
    const { data: apoderados, error: apoErr } = await supabaseAdmin
      .from("apoderados")
      .select("id, dni, nombres, apellidos, parentesco, familia_id, ya_voto, nivel, grado, seccion")
      .order("creado_en", { ascending: true });

    if (apoErr) throw apoErr;

    if (!apoderados || apoderados.length === 0) {
      throw new Error("No hay apoderados registrados en el padrón de APAFA. Sube primero el archivo Excel del Padrón.");
    }

    // 3. Agrupar por familia_id
    const familiasMap = new Map<string, any[]>();
    for (const a of apoderados) {
      if (!familiasMap.has(a.familia_id)) {
        familiasMap.set(a.familia_id, []);
      }
      familiasMap.get(a.familia_id)!.push(a);
    }

    // Filtrar familias que aún no han votado
    const familiasPendientes = Array.from(familiasMap.entries()).filter(([_, members]) => {
      return !members.some(m => m.ya_voto);
    });

    if (familiasPendientes.length === 0) {
      return { 
        success: false, 
        message: "Todas las familias del padrón de APAFA ya han votado en esta simulación. Utiliza 'Limpiar Votos' si deseas reiniciar la prueba." 
      };
    }

    // Tomar el lote de familias
    const familiasASeleccionar = familiasPendientes.slice(0, count);

    const mockVotes: any[] = [];
    const updatesPorFamilia: Array<{ familia_id: string; detalle: string }> = [];

    for (const [famId, members] of familiasASeleccionar) {
      const chosenParent = members[Math.floor(Math.random() * members.length)];
      
      // Decidir voto (10% en blanco / nulo, 90% a algún partido registrado)
      const isBlank = Math.random() < 0.1 || partyIds.length === 0;
      const randomPartyId = isBlank ? null : partyIds[Math.floor(Math.random() * partyIds.length)];

      mockVotes.push({
        eleccion_id: electionId,
        partido_id: randomPartyId,
        familia_id: famId,
        nivel_votante: chosenParent.nivel || "secundaria",
        grado_votante: chosenParent.grado || "1°",
        seccion_votante: chosenParent.seccion || "A"
      });

      updatesPorFamilia.push({
        familia_id: famId,
        detalle: `Votó (Simulacro) ${chosenParent.parentesco || 'Apoderado'}: ${chosenParent.apellidos}, ${chosenParent.nombres} (DNI ${chosenParent.dni})`
      });
    }

    // 4. Insertar votos en votos_apafa
    const { error: insVotesErr } = await supabaseAdmin
      .from("votos_apafa")
      .insert(mockVotes);

    if (insVotesErr) throw insVotesErr;

    // 5. Actualizar ya_voto y detalle en apoderados por cada familia seleccionada
    for (const item of updatesPorFamilia) {
      await supabaseAdmin
        .from("apoderados")
        .update({
          ya_voto: true,
          voto_emitido_por: item.detalle
        })
        .eq("familia_id", item.familia_id);
    }

    return { 
      success: true, 
      votosGenerados: mockVotes.length,
      familiasRestantes: familiasPendientes.length - mockVotes.length
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteApafaElectionAction(electionId?: string) {
  try {
    await ensureSuperAdmin();
    if (electionId) {
      const { error } = await supabaseAdmin
        .from("elecciones_apafa")
        .delete()
        .eq("id", electionId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("elecciones_apafa")
        .delete()
        .ilike("titulo", "[PRUEBA]%")
        .eq("esta_activa", false);
      if (error) throw error;
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// -------------------------------------------------------------
// 3. GESTIÓN DEL PADRÓN DE APODERADOS (CARGA MASIVA Y FILTROS)
// -------------------------------------------------------------

export async function uploadPadronApafaAction(apoderadosList: any[]) {
  try {
    await ensureSuperAdmin();

    if (!apoderadosList || apoderadosList.length === 0) {
      throw new Error("No hay registros de apoderados válidos para cargar.");
    }

    // 1. Obtener votos emitidos y TODOS los apoderados existentes (paginando para no topar el límite de 1000 de Supabase)
    const existingMap = new Map<string, any>();
    const votedFamiliaIds = new Set<string>();
    const votedInfoByFamily = new Map<string, string>();

    try {
      // 1.1 Identificar familias que ya votaron en la tabla independiente de votos_apafa
      const { data: votosList } = await supabaseAdmin
        .from("votos_apafa")
        .select("familia_id");

      if (votosList) {
        for (const v of votosList) {
          if (v.familia_id) votedFamiliaIds.add(v.familia_id);
        }
      }

      // 1.2 Cargar todos los registros existentes paginando de 1000 en 1000
      let from = 0;
      const step = 1000;
      while (true) {
        const { data: chunk, error: exErr } = await supabaseAdmin
          .from("apoderados")
          .select("id, dni, familia_id, hijos, grado, seccion, nivel, ya_voto, voto_emitido_por")
          .range(from, from + step - 1);

        if (exErr || !chunk || chunk.length === 0) break;

        for (const item of chunk) {
          existingMap.set(item.dni, item);
          if (item.ya_voto) {
            if (item.familia_id) {
              votedFamiliaIds.add(item.familia_id);
              if (item.voto_emitido_por) {
                votedInfoByFamily.set(item.familia_id, item.voto_emitido_por);
              }
            }
          }
        }

        if (chunk.length < step) break;
        from += step;
      }
    } catch (e) {
      console.warn("Aviso al consultar apoderados existentes:", e);
    }

    // 2. Mapear incoming familia_id a canonical existing familia_id si alguno de los miembros ya existe en BD
    const incomingToCanonicalFamiliaId = new Map<string, string>();
    for (const ap of apoderadosList) {
      const existing = existingMap.get(ap.dni);
      if (existing && existing.familia_id) {
        incomingToCanonicalFamiliaId.set(ap.familia_id, existing.familia_id);
      }
    }

    // 3. Fusionar datos entrantes con existentes garantizando que NINGÚN voto previo se pierda
    const mergedList = apoderadosList.map(ap => {
      const existing = existingMap.get(ap.dni);
      // Usar familia_id canónico si algún miembro de la familia ya existía en la BD
      let familiaId = incomingToCanonicalFamiliaId.get(ap.familia_id) || existing?.familia_id || ap.familia_id;
      let hijos = ap.hijos;
      let grado = ap.grado;
      let seccion = ap.seccion;
      let nivel = ap.nivel;

      if (existing) {
        // Fusionar la lista de hijos (evitando duplicar cadenas idénticas)
        const currentHijos = (existing.hijos || "").split(";").map((h: string) => h.trim()).filter(Boolean);
        const incomingHijos = (ap.hijos || "").split(";").map((h: string) => h.trim()).filter(Boolean);
        const uniqueHijos = Array.from(new Set([...incomingHijos, ...currentHijos]));
        hijos = uniqueHijos.join("; ") || ap.hijos;

        // Combinar grados únicos
        const incomingGrados = (ap.grado || "").split(",").map((g: string) => g.trim()).filter(Boolean);
        const existingGrados = (existing.grado || "").split(",").map((g: string) => g.trim()).filter(Boolean);
        
        // Si existingGrados contenía solo "2°" debido a un bug de año previo pero ap no lo incluye, filtrarlo
        const validExistingGrados = existingGrados.filter((g: string) => {
          if (g === "2°" && !incomingGrados.includes("2°") && !existing.hijos?.includes("2°")) {
            return false;
          }
          return true;
        });

        const allGrados = Array.from(new Set([...incomingGrados, ...validExistingGrados]));
        allGrados.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
        grado = allGrados.join(", ") || ap.grado;

        // Combinar secciones únicas
        const incomingSecs = (ap.seccion || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        const existingSecs = (existing.seccion || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        const allSecs = Array.from(new Set([...incomingSecs, ...existingSecs])).sort();
        seccion = allSecs.join(", ") || ap.seccion;

        // Combinar niveles
        const incomingNiveles = (ap.nivel || "").split(",").map((n: string) => n.trim().toLowerCase()).filter(Boolean);
        const existingNiveles = (existing.nivel || "").split(",").map((n: string) => n.trim().toLowerCase()).filter(Boolean);
        const allNiv = new Set([...incomingNiveles, ...existingNiveles]);
        if (allNiv.has("mixto") || (allNiv.has("primaria") && allNiv.has("secundaria"))) {
          nivel = "mixto";
        } else if (allNiv.has("secundaria")) {
          nivel = "secundaria";
        } else {
          nivel = "primaria";
        }
      }

      // Verificación estricta de voto previo por DNI o por Grupo Familiar
      const hasVoted = Boolean(
        existing?.ya_voto ||
        votedFamiliaIds.has(familiaId) ||
        (existing?.familia_id && votedFamiliaIds.has(existing.familia_id)) ||
        (ap.familia_id && votedFamiliaIds.has(ap.familia_id))
      );

      const voteInfo = existing?.voto_emitido_por || 
        votedInfoByFamily.get(familiaId) || 
        (existing?.familia_id ? votedInfoByFamily.get(existing.familia_id) : null) || 
        (hasVoted ? "Voto de familia ya emitido" : null);

      return {
        ...ap,
        familia_id: familiaId,
        hijos,
        grado,
        seccion,
        nivel,
        ya_voto: hasVoted,
        voto_emitido_por: voteInfo,
      };
    });

    // Upsert por lotes de 500 para evitar sobrecarga en la consulta HTTP
    const chunkSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < mergedList.length; i += chunkSize) {
      const chunk = mergedList.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from("apoderados")
        .upsert(chunk, { onConflict: "dni" });

      if (error) throw error;
      insertedCount += chunk.length;
    }

    return { success: true, count: insertedCount };
  } catch (err: any) {
    return { error: err.message || "Error al cargar el padrón de apoderados." };
  }
}

export async function getPadronApafaAction(params: {
  search?: string;
  nivel?: string;
  grado?: string;
  seccion?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const page = params.page || 1;
    const pageSize = params.pageSize || 15;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from("apoderados")
      .select("*", { count: "exact" });

    if (params.search && params.search.trim()) {
      const rawQ = params.search.trim();
      const cleanDigits = rawQ.replace(/\D/g, "");
      const padded = cleanDigits.length >= 7 ? cleanDigits.padStart(8, "0") : "";
      if (padded && padded !== rawQ) {
        query = query.or(`dni.ilike.%${rawQ}%,dni.ilike.%${padded}%,nombres.ilike.%${rawQ}%,apellidos.ilike.%${rawQ}%,hijos.ilike.%${rawQ}%`);
      } else {
        query = query.or(`dni.ilike.%${rawQ}%,nombres.ilike.%${rawQ}%,apellidos.ilike.%${rawQ}%,hijos.ilike.%${rawQ}%`);
      }
    }

    if (params.nivel && params.nivel !== "todos") {
      const niv = params.nivel.toLowerCase();
      if (niv === "primaria" || niv === "secundaria") {
        query = query.or(`nivel.eq.${niv},nivel.eq.mixto`);
      } else {
        query = query.eq("nivel", niv);
      }
    }

    if (params.grado && params.grado !== "todos") {
      query = query.ilike("grado", `%${params.grado}%`);
    }

    if (params.seccion && params.seccion !== "todos") {
      query = query.ilike("seccion", `%${params.seccion.toUpperCase()}%`);
    }

    query = query
      .order("apellidos", { ascending: true })
      .range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data: data || [],
      totalCount: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getFamilyDetailsAction(familiaId: string) {
  try {
    if (!familiaId) return { error: "ID de familia no proporcionado.", members: [] };
    const { data, error } = await supabaseAdmin
      .from("apoderados")
      .select("id, dni, nombres, apellidos, parentesco, familia_id, hijos, nivel, grado, seccion, ya_voto, voto_emitido_por")
      .eq("familia_id", familiaId)
      .order("parentesco", { ascending: true });

    if (error) throw error;
    return { success: true, members: data || [] };
  } catch (err: any) {
    return { error: err.message || "Error al obtener datos de la familia.", members: [] };
  }
}

export async function saveFamilyApoderadosAction(params: {
  familiaId?: string;
  hijos: string;
  nivel: string;
  grado: string;
  seccion: string;
  padre?: {
    id?: string;
    dni: string;
    nombres: string;
    apellidos: string;
    parentesco?: string;
  } | null;
  madre?: {
    id?: string;
    dni: string;
    nombres: string;
    apellidos: string;
    parentesco?: string;
  } | null;
  deletedMemberIds?: string[];
}) {
  try {
    await ensureSuperAdmin();

    const cleanHijos = (params.hijos || "").trim();
    if (!cleanHijos) {
      return { error: "Debe ingresar los apellidos y nombres del estudiante o hijos representados." };
    }

    const cleanNivel = (params.nivel || "primaria").toLowerCase().trim();
    const cleanGrado = (params.grado || "").trim();
    const cleanSeccion = (params.seccion || "").toUpperCase().trim();

    const rawDniPadre = params.padre?.dni ? params.padre.dni.replace(/\D/g, "") : "";
    const cleanDniPadre = rawDniPadre.length === 7 ? rawDniPadre.padStart(8, "0") : rawDniPadre.slice(0, 8);

    const rawDniMadre = params.madre?.dni ? params.madre.dni.replace(/\D/g, "") : "";
    const cleanDniMadre = rawDniMadre.length === 7 ? rawDniMadre.padStart(8, "0") : rawDniMadre.slice(0, 8);

    const hasPadre = Boolean(cleanDniPadre && params.padre?.nombres?.trim() && params.padre?.apellidos?.trim());
    const hasMadre = Boolean(cleanDniMadre && params.madre?.nombres?.trim() && params.madre?.apellidos?.trim());

    if (!hasPadre && !hasMadre) {
      return { error: "Debe completar los datos (DNI de 7 u 8 dígitos, nombres y apellidos) de al menos un apoderado (Padre o Madre)." };
    }

    if (hasPadre && cleanDniPadre.length !== 8) {
      return { error: "El DNI del padre debe tener 7 u 8 dígitos numéricos." };
    }

    if (hasMadre && cleanDniMadre.length !== 8) {
      return { error: "El DNI de la madre debe tener 7 u 8 dígitos numéricos." };
    }

    if (hasPadre && hasMadre && cleanDniPadre === cleanDniMadre) {
      return { error: "El DNI del padre y de la madre no pueden ser iguales." };
    }

    // Determinar familia_id canónico
    let targetFamiliaId = params.familiaId?.trim() || "";
    if (!targetFamiliaId) {
      targetFamiliaId = `FAM-${cleanDniPadre || cleanDniMadre}`;
    }

    // 1. Procesar Padre
    if (hasPadre && params.padre) {
      const padrePayload = {
        dni: cleanDniPadre,
        nombres: params.padre.nombres.trim().toUpperCase(),
        apellidos: params.padre.apellidos.trim().toUpperCase(),
        parentesco: params.padre.parentesco || "PADRE",
        familia_id: targetFamiliaId,
        hijos: cleanHijos,
        nivel: cleanNivel,
        grado: cleanGrado,
        seccion: cleanSeccion
      };

      const { data: existingPadre } = await supabaseAdmin
        .from("apoderados")
        .select("id, ya_voto")
        .eq("dni", cleanDniPadre)
        .maybeSingle();

      if (existingPadre || params.padre.id) {
        const updateId = params.padre.id || existingPadre?.id;
        const { error: updErr } = await supabaseAdmin
          .from("apoderados")
          .update(padrePayload)
          .eq("id", updateId);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabaseAdmin
          .from("apoderados")
          .insert({
            ...padrePayload,
            ya_voto: false
          });
        if (insErr) throw insErr;
      }
    }

    // 2. Procesar Madre
    if (hasMadre && params.madre) {
      const madrePayload = {
        dni: cleanDniMadre,
        nombres: params.madre.nombres.trim().toUpperCase(),
        apellidos: params.madre.apellidos.trim().toUpperCase(),
        parentesco: params.madre.parentesco || "MADRE",
        familia_id: targetFamiliaId,
        hijos: cleanHijos,
        nivel: cleanNivel,
        grado: cleanGrado,
        seccion: cleanSeccion
      };

      const { data: existingMadre } = await supabaseAdmin
        .from("apoderados")
        .select("id, ya_voto")
        .eq("dni", cleanDniMadre)
        .maybeSingle();

      if (existingMadre || params.madre.id) {
        const updateId = params.madre.id || existingMadre?.id;
        const { error: updErr } = await supabaseAdmin
          .from("apoderados")
          .update(madrePayload)
          .eq("id", updateId);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabaseAdmin
          .from("apoderados")
          .insert({
            ...madrePayload,
            ya_voto: false
          });
        if (insErr) throw insErr;
      }
    }

    // 3. Sincronizar hijos, grado, sección y nivel en todos los integrantes de esta familia
    await supabaseAdmin
      .from("apoderados")
      .update({
        hijos: cleanHijos,
        nivel: cleanNivel,
        grado: cleanGrado,
        seccion: cleanSeccion
      })
      .eq("familia_id", targetFamiliaId);

    // 4. Si se eliminó algún miembro explícitamente durante la edición
    if (params.deletedMemberIds && params.deletedMemberIds.length > 0) {
      await supabaseAdmin
        .from("apoderados")
        .delete()
        .in("id", params.deletedMemberIds);
    }

    return { success: true, familiaId: targetFamiliaId };
  } catch (err: any) {
    return { error: err.message || "Error al guardar los datos de la familia en el padrón." };
  }
}

export async function deleteApoderadoAction(apoderadoId: string) {
  try {
    await ensureSuperAdmin();
    if (!apoderadoId) return { error: "ID no proporcionado." };
    const { error } = await supabaseAdmin
      .from("apoderados")
      .delete()
      .eq("id", apoderadoId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Error al eliminar apoderado." };
  }
}

export async function getProgresoApafaDataAction() {
  try {
    // 1. Obtener elección APAFA activa
    const { data: election, error: elecErr } = await supabaseAdmin
      .from("elecciones_apafa")
      .select("*")
      .eq("esta_activa", true)
      .limit(1)
      .maybeSingle();

    if (elecErr && !elecErr.message.includes("does not exist")) throw elecErr;

    if (!election) {
      return { success: false, message: "No hay ninguna elección de APAFA activa actualmente." };
    }

    // 2. Obtener partidos de APAFA
    const { data: parties } = await supabaseAdmin
      .from("partidos_apafa")
      .select("id, nombre, numero_lista, logo_url, color")
      .eq("eleccion_id", election.id);

    // 3. Obtener votos emitidos
    const { data: votes } = await supabaseAdmin
      .from("votos_apafa")
      .select("id, partido_id, familia_id, nivel_votante, grado_votante, seccion_votante")
      .eq("eleccion_id", election.id);

    // 4. Obtener estadísticas del padrón (Familias únicas y Apoderados)
    const { data: apoderados } = await supabaseAdmin
      .from("apoderados")
      .select("id, familia_id, ya_voto, nivel, grado, seccion");

    const totalApoderados = apoderados ? apoderados.length : 0;
    
    // Contar familias únicas
    const familiasMap = new Map<string, { ya_voto: boolean; nivel?: string; grado?: string; seccion?: string }>();
    if (apoderados) {
      for (const a of apoderados) {
        if (!familiasMap.has(a.familia_id)) {
          familiasMap.set(a.familia_id, {
            ya_voto: a.ya_voto,
            nivel: a.nivel,
            grado: a.grado,
            seccion: a.seccion
          });
        }
      }
    }

    const totalFamilias = familiasMap.size;
    let familiasVotaron = 0;
    for (const f of familiasMap.values()) {
      if (f.ya_voto) familiasVotaron++;
    }

    // Si existen votos emitidos en votos_apafa pero el padrón aún no se marcó (ej. simulaciones previas)
    if (familiasVotaron === 0 && votes && votes.length > 0 && apoderados && apoderados.length > 0) {
      const allFamilyIds = Array.from(familiasMap.keys());
      const countToMark = Math.min(votes.length, totalFamilias);
      const familiesToMark = allFamilyIds.slice(0, countToMark);

      if (familiesToMark.length > 0) {
        for (let i = 0; i < familiesToMark.length; i += 100) {
          const chunk = familiesToMark.slice(i, i + 100);
          await supabaseAdmin
            .from("apoderados")
            .update({
              ya_voto: true,
              voto_emitido_por: "Votó (Simulacro registrado)"
            })
            .in("familia_id", chunk);
        }
        familiasVotaron = familiesToMark.length;
      }
    }

    return {
      success: true,
      election,
      parties: parties || [],
      votes: votes || [],
      stats: {
        totalApoderados,
        totalFamilias,
        familiasVotaron,
        porcentajeParticipacion: totalFamilias > 0 ? (familiasVotaron / totalFamilias) * 100 : 0,
        totalVotosEmitidos: votes ? votes.length : 0
      }
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

// -------------------------------------------------------------
// 4. CONFIGURACIÓN GLOBAL DEL MODO DE VOTACIÓN DEL SISTEMA
// -------------------------------------------------------------

export async function getSystemVotingModeAction(): Promise<{ modo: "escolar" | "apafa" }> {
  try {
    // 1. Intentar leer desde cookies primero para SSR ultrarrápido y persistencia local
    try {
      const cookieStore = await cookies();
      const cookieMode = cookieStore.get("public_voting_mode")?.value;
      if (cookieMode === "apafa" || cookieMode === "escolar") {
        return { modo: cookieMode };
      }
    } catch (e) {
      // Ignorar si cookies() no está disponible en este contexto
    }

    // 2. Consultar tabla de configuración en Supabase
    try {
      const { data, error } = await supabaseAdmin
        .from("configuracion_sistema")
        .select("valor")
        .eq("clave", "modo_votacion")
        .maybeSingle();

      if (!error && data?.valor) {
        if (data.valor === "apafa" || data.valor === "escolar") {
          return { modo: data.valor };
        }
      }
    } catch (e) {
      // Si la tabla configuracion_sistema no existe aún en schema cache, continuar
    }

    // 3. Fallback: inferir por elección de APAFA activa
    try {
      const { data: apafaActive } = await supabaseAdmin
        .from("elecciones_apafa")
        .select("id")
        .eq("esta_activa", true)
        .limit(1)
        .maybeSingle();

      if (apafaActive) {
        return { modo: "apafa" };
      }
    } catch (e) {
      // Ignorar
    }

    return { modo: "escolar" };
  } catch (err: any) {
    return { modo: "escolar" };
  }
}

export async function setSystemVotingModeAction(modo: "escolar" | "apafa") {
  try {
    await ensureSuperAdmin();

    // 1. Guardar SIEMPRE en cookies de inmediato (garantiza que el navegador actual y SSR funcionen sin fallar)
    try {
      const cookieStore = await cookies();
      cookieStore.set("public_voting_mode", modo, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 año
        sameSite: "lax",
      });
    } catch (cookieErr) {
      console.warn("Aviso al guardar cookie public_voting_mode:", cookieErr);
    }

    // 2. Intentar guardar en la tabla configuracion_sistema de Supabase
    let tableMissing = false;
    try {
      const { error } = await supabaseAdmin
        .from("configuracion_sistema")
        .upsert({
          clave: "modo_votacion",
          valor: modo,
          actualizado_en: new Date().toISOString()
        }, { onConflict: "clave" });

      if (error) {
        // Verificar si es porque la tabla no existe en el schema cache de PostgREST
        if (
          error.message?.includes("schema cache") || 
          error.message?.includes("does not exist") || 
          error.code === "42P01" ||
          error.code === "PGRST205"
        ) {
          tableMissing = true;
        } else {
          throw error;
        }
      }
    } catch (dbErr: any) {
      tableMissing = true;
    }

    return { success: true, modo, tableMissing };
  } catch (err: any) {
    return { error: err.message || "Error al actualizar el modo de votación del sistema." };
  }
}

