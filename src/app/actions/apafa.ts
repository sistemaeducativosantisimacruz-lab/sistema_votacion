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
    const cleanDni = dni.trim();
    const { data, error } = await supabaseAdmin
      .from("apoderados")
      .select("*")
      .eq("dni", cleanDni)
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
      { descripcion: "Tesorero", orden: 2 },
      { descripcion: "Vocal", orden: 3 }
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
    const isExact = existing && existing.length === 3 &&
      existingNames.includes("presidente") &&
      existingNames.includes("tesorero") &&
      existingNames.includes("vocal");

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
        { id: "2", descripcion: "Tesorero", orden: 2 },
        { id: "3", descripcion: "Vocal", orden: 3 }
      ]
    };
  }
}

export async function searchApoderadosAction(query: string) {
  try {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return { data: [] };

    const { data, error } = await supabaseAdmin
      .from("apoderados")
      .select("id, dni, nombres, apellidos, parentesco, hijos, grado, seccion, nivel")
      .or(`dni.ilike.%${cleanQuery}%,nombres.ilike.%${cleanQuery}%,apellidos.ilike.%${cleanQuery}%`)
      .order("apellidos", { ascending: true })
      .limit(8);

    if (error) throw error;
    return { data: data || [] };
  } catch (err: any) {
    return { error: err.message, data: [] };
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

    // 1. Obtener apoderados ya existentes en la BD para fusionar inteligentemente (ej. Primaria + Secundaria)
    const existingMap = new Map<string, any>();
    try {
      const { data: existingList, error: exErr } = await supabaseAdmin
        .from("apoderados")
        .select("id, dni, familia_id, hijos, ya_voto, voto_emitido_por");

      if (!exErr && existingList) {
        for (const item of existingList) {
          existingMap.set(item.dni, item);
        }
      }
    } catch (e) {
      // Ignorar si aún no existe la tabla
    }

    // 2. Mapear incoming familia_id a canonical existing familia_id si alguno de los miembros ya existe en BD
    const incomingToCanonicalFamiliaId = new Map<string, string>();
    for (const ap of apoderadosList) {
      const existing = existingMap.get(ap.dni);
      if (existing && existing.familia_id) {
        incomingToCanonicalFamiliaId.set(ap.familia_id, existing.familia_id);
      }
    }

    // 3. Fusionar datos entrantes con existentes
    const mergedList = apoderadosList.map(ap => {
      const existing = existingMap.get(ap.dni);
      // Usar familia_id canónico si algún miembro de la familia ya existía en la BD
      let familiaId = incomingToCanonicalFamiliaId.get(ap.familia_id) || existing?.familia_id || ap.familia_id;
      let hijos = ap.hijos;

      if (existing) {
        // Fusionar la lista de hijos (evitando duplicar cadenas idénticas)
        const currentHijos = (existing.hijos || "").split(";").map((h: string) => h.trim()).filter(Boolean);
        const incomingHijos = (ap.hijos || "").split(";").map((h: string) => h.trim()).filter(Boolean);
        const uniqueHijos = Array.from(new Set([...currentHijos, ...incomingHijos]));
        hijos = uniqueHijos.join("; ") || ap.hijos;
      }

      return {
        ...ap,
        familia_id: familiaId,
        hijos,
        ya_voto: existing?.ya_voto ?? ap.ya_voto ?? false,
        voto_emitido_por: existing?.voto_emitido_por ?? null,
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
      const q = params.search.trim();
      query = query.or(`dni.ilike.%${q}%,nombres.ilike.%${q}%,apellidos.ilike.%${q}%,hijos.ilike.%${q}%`);
    }

    if (params.nivel && params.nivel !== "todos") {
      query = query.eq("nivel", params.nivel.toLowerCase());
    }

    if (params.grado && params.grado !== "todos") {
      query = query.eq("grado", params.grado);
    }

    if (params.seccion && params.seccion !== "todos") {
      query = query.eq("seccion", params.seccion.toUpperCase());
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
    // 1. Intentar leer desde cookies primero para SSR ultrarrápido
    try {
      const cookieStore = await cookies();
      const cookieMode = cookieStore.get("public_voting_mode")?.value;
      if (cookieMode === "apafa" || cookieMode === "escolar") {
        // Retornamos el modo de la cookie pero sincronizamos con DB si es posible
        return { modo: cookieMode };
      }
    } catch (e) {
      // Ignorar si cookies() no está disponible en este contexto
    }

    // 2. Consultar tabla de configuración en Supabase
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

    // 3. Fallback si la tabla aún no existe: inferir por elección activa
    const { data: apafaActive } = await supabaseAdmin
      .from("elecciones_apafa")
      .select("id")
      .eq("esta_activa", true)
      .limit(1)
      .maybeSingle();

    if (apafaActive) {
      return { modo: "apafa" };
    }

    return { modo: "escolar" };
  } catch (err: any) {
    return { modo: "escolar" };
  }
}

export async function setSystemVotingModeAction(modo: "escolar" | "apafa") {
  try {
    await ensureSuperAdmin();

    const { error } = await supabaseAdmin
      .from("configuracion_sistema")
      .upsert({
        clave: "modo_votacion",
        valor: modo,
        actualizado_en: new Date().toISOString()
      }, { onConflict: "clave" });

    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        throw new Error("La tabla configuracion_sistema aún no existe en Supabase. Ejecuta el script supabase_apafa.sql.");
      }
      throw error;
    }

    // Guardar también en cookies para que SSR en la ruta raíz '/' lo lea al instante en cada recarga
    try {
      const cookieStore = await cookies();
      cookieStore.set("public_voting_mode", modo, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 año
        sameSite: "lax",
      });
    } catch (e) {
      // Continuar si la cookie no pudo ser escrita
    }

    return { success: true, modo };
  } catch (err: any) {
    return { error: err.message || "Error al actualizar el modo de votación del sistema." };
  }
}

