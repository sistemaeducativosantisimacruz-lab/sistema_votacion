"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVoterSession, clearVoterSession } from "@/lib/auth";

export async function submitVoteAction(eleccionId: string, partidoId: string | null) {
  try {
    const user = await getVoterSession();

    if (!user) {
      return { error: "Sesión de votante inválida o expirada." };
    }

    // Doble verificación: comprobar en BD si ya votó antes de hacer nada (para evitar race conditions)
    const { data: estudiante, error: checkError } = await supabaseAdmin
      .from("estudiantes")
      .select("ya_voto")
      .eq("id", user.id)
      .single();

    if (checkError || !estudiante) {
      return { error: "Error al verificar la identidad del elector." };
    }

    if (estudiante.ya_voto) {
      // Limpiar sesión si intenta hacer trampa
      await clearVoterSession();
      return { error: "Este estudiante ya ha emitido su voto." };
    }

    // Insertar el voto (Mantenemos la lógica de anonimato, solo registramos datos demográficos)
    const { error: voteErr } = await supabaseAdmin.from("votos").insert({
      eleccion_id: eleccionId,
      partido_id: partidoId,
      grado_votante: user.grado,
      seccion_votante: user.seccion,
      nivel_votante: user.nivel,
    });

    if (voteErr) {
      throw voteErr;
    }

    // Marcar al estudiante como que ya votó
    const { error: studentErr } = await supabaseAdmin
      .from("estudiantes")
      .update({ ya_voto: true })
      .eq("id", user.id);

    if (studentErr) {
      throw studentErr;
    }

    // Destruir la sesión después de votar exitosamente
    await clearVoterSession();

    return { success: true };
  } catch (err: any) {
    return { error: "Error interno del servidor al procesar el voto." };
  }
}
