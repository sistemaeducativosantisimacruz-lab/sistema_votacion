"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setVoterSession, setAdminSession, clearVoterSession, clearAdminSession, getVoterSession, getAdminSession } from "@/lib/auth";

export async function loginVoterAction(dni: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("estudiantes")
      .select("*")
      .eq("dni", dni)
      .single();

    if (error || !data) {
      return { error: "DNI no encontrado en el padrón electoral." };
    }

    if (data.ya_voto) {
      return { error: "Este DNI ya ha emitido su voto." };
    }

    await setVoterSession({
      id: data.id,
      dni: data.dni,
      nombres: data.nombres,
      apellidos: data.apellidos,
      grado: data.grado,
      seccion: data.seccion,
      nivel: data.nivel,
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Error al iniciar sesión" };
  }
}

export async function loginAdminAction(dni: string, contrasena: string) {
  try {
    // 1. Buscar primero en la nueva tabla de 'administradores' (para superadmin y administrador)
    let { data: user, error: adminErr } = await supabaseAdmin
      .from("administradores")
      .select("*")
      .eq("dni", dni)
      .eq("contrasena", contrasena)
      .single();

    // 2. Si no lo encuentra ahí, buscamos en la tabla de 'estudiantes' (solo para el rol 'comite')
    if (adminErr || !user) {
      const { data: student, error: studentErr } = await supabaseAdmin
        .from("estudiantes")
        .select("*")
        .eq("dni", dni)
        .eq("contrasena", contrasena)
        .eq("rol", "comite")
        .single();

      if (studentErr || !student) {
        return { error: "Usuario o contraseña incorrectos, o no tienes permisos de administrador." };
      }
      user = student;
    }

    await setAdminSession({
      id: user.id,
      dni: user.dni,
      nombres: user.nombres,
      apellidos: user.apellidos,
      grado: user.grado || "", // Administradores puros podrían no tener grado
      seccion: user.seccion || "",
      nivel: user.nivel || "",
      rol: user.rol,
      cargo: user.cargo || "", // Administradores puros podrían no tener cargo
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Error al iniciar sesión como administrador" };
  }
}

export async function logoutVoterAction() {
  await clearVoterSession();
  return { success: true };
}

export async function logoutAdminAction() {
  await clearAdminSession();
  return { success: true };
}

export async function getVoterSessionAction() {
  const session = await getVoterSession();
  return session;
}

export async function getAdminSessionAction() {
  const session = await getAdminSession();
  return session;
}
