"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminSession } from "@/lib/auth";

async function ensureSuperAdmin() {
  const session = await getAdminSession();
  if (!session || session.rol !== "superadmin") {
    throw new Error("No tienes permisos de superadmin para realizar esta acción.");
  }
}

// 1. Delete testing elections
export async function deleteElectionAction(electionId?: string) {
  try {
    await ensureSuperAdmin();
    if (electionId) {
      const { error } = await supabaseAdmin.from("elecciones").delete().eq("id", electionId);
      if (error) throw error;
    } else {
      // Delete all inactive PRUEBA elections
      const { error } = await supabaseAdmin.from("elecciones").delete().ilike("titulo", "[PRUEBA]%").eq("esta_activa", false);
      if (error) throw error;
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 2. Update election status and snapshot
export async function updateElectionStatusAction(electionId: string, isActive: boolean, snapshotData: any = null) {
  try {
    await ensureSuperAdmin();
    const updatePayload: any = { esta_activa: isActive };
    if (snapshotData !== null) {
      updatePayload.snapshot_historico = snapshotData;
    }
    const { error } = await supabaseAdmin.from("elecciones").update(updatePayload).eq("id", electionId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 3. Delete a party
export async function deletePartyAction(partyId: string) {
  try {
    await ensureSuperAdmin();
    const { error } = await supabaseAdmin.from("partidos").delete().eq("id", partyId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 4. Reset or set students ya_voto status
export async function updateStudentsVoteStatusAction(yaVoto: boolean) {
  try {
    await ensureSuperAdmin();
    if (yaVoto) {
      // Set to true (excluding admins/superadmins)
      const { error } = await supabaseAdmin.from("estudiantes").update({ ya_voto: true }).neq("rol", "superadmin").neq("rol", "administrador");
      if (error) throw error;
    } else {
      // Set to false for everyone except ghost user "0000..."
      const { error } = await supabaseAdmin.from("estudiantes").update({ ya_voto: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 5. Delete votes by election ID
export async function deleteVotesByElectionAction(electionId: string) {
  try {
    await ensureSuperAdmin();
    const { error } = await supabaseAdmin.from("votos").delete().eq("eleccion_id", electionId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 6. Insert mock votes in chunks
export async function insertMockVotesAction(votesChunk: any[]) {
  try {
    await ensureSuperAdmin();
    const { error } = await supabaseAdmin.from("votos").insert(votesChunk);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 7. Insert new election
export async function insertElectionAction(titulo: string) {
  try {
    await ensureSuperAdmin();
    const { data, error } = await supabaseAdmin
      .from("elecciones")
      .insert({ titulo, esta_activa: false })
      .select()
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 8. Upsert party (insert or update)
export async function upsertPartyAction(partyData: any, partyId?: string) {
  try {
    await ensureSuperAdmin();
    let result;
    if (partyId) {
      const { data, error } = await supabaseAdmin
        .from("partidos")
        .update(partyData)
        .eq("id", partyId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("partidos")
        .insert(partyData)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }
    return { success: true, data: result };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 9. Update election data
export async function updateElectionDataAction(electionId: string, updateData: any) {
  try {
    await ensureSuperAdmin();
    const { error } = await supabaseAdmin.from("elecciones").update(updateData).eq("id", electionId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

// 10. Update party candidates
export async function updatePartyCandidatesAction(partyId: string, relationalInserts: any[]) {
  try {
    await ensureSuperAdmin();
    const { error: deleteErr } = await supabaseAdmin.from("partido_candidatos").delete().eq("partido_id", partyId);
    if (deleteErr) throw deleteErr;

    if (relationalInserts.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from("partido_candidatos").insert(relationalInserts);
      if (insertErr) throw insertErr;
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
