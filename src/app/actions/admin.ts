"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminSession } from "@/lib/auth";

// Verifica que quien llama a esto es un superadmin
async function ensureSuperAdmin() {
  const session = await getAdminSession();
  if (!session || session.rol !== "superadmin") {
    throw new Error("No tienes permisos de superadmin para realizar esta acción.");
  }
}

export async function getAdminsAction() {
  try {
    const session = await getAdminSession();
    if (!session || !session.rol || !["superadmin", "administrador", "comite"].includes(session.rol)) {
      throw new Error("No autorizado");
    }

    // 1. Obtener de la tabla administradores
    const { data: adminsTable, error: err1 } = await supabaseAdmin
      .from("administradores")
      .select("*")
      .order("creado_en", { ascending: false });

    if (err1) throw err1;

    // 2. Obtener de la tabla estudiantes (solo comité)
    const { data: comiteTable, error: err2 } = await supabaseAdmin
      .from("estudiantes")
      .select("*")
      .eq("rol", "comite");

    if (err2) throw err2;

    // Combinar ambos resultados
    const combined = [...(adminsTable || []), ...(comiteTable || [])];
    return { data: combined };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function createManualAdminAction(adminData: any) {
  try {
    await ensureSuperAdmin();
    
    // Check if it's a 'comite' creation (goes to estudiantes) or 'administrador' (goes to administradores)
    if (adminData.rol === 'comite') {
      const { error } = await supabaseAdmin
        .from('estudiantes')
        .insert([{
          dni: adminData.dni,
          nombres: adminData.nombres,
          apellidos: adminData.apellidos,
          contrasena: adminData.contrasena,
          rol: adminData.rol,
          cargo: adminData.cargo
        }]);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('administradores')
        .insert([{
          dni: adminData.dni,
          nombres: adminData.nombres,
          apellidos: adminData.apellidos,
          contrasena: adminData.contrasena,
          rol: adminData.rol
        }]);
      if (error) throw error;
    }
    
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function editManualAdminAction(id: string, adminData: any, isComite: boolean = false) {
  try {
    await ensureSuperAdmin();
    
    if (isComite || adminData.rol === 'comite') {
      const { error } = await supabaseAdmin
        .from('estudiantes')
        .update({
          dni: adminData.dni,
          nombres: adminData.nombres,
          apellidos: adminData.apellidos,
          contrasena: adminData.contrasena,
          cargo: adminData.cargo
        })
        .eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('administradores')
        .update({
          dni: adminData.dni,
          nombres: adminData.nombres,
          apellidos: adminData.apellidos,
          contrasena: adminData.contrasena
        })
        .eq('id', id);
      if (error) throw error;
    }
    
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function demoteAdminAction(id: string, isComite: boolean = false) {
  try {
    await ensureSuperAdmin();
    
    if (isComite) {
      // Si es comité y está en estudiantes, simplemente le quitamos el rol y el cargo
      const { error } = await supabaseAdmin
        .from('estudiantes')
        .update({ rol: null, cargo: null })
        .eq('id', id);
      if (error) throw error;
    } else {
      // Si es de la tabla de administradores, lo eliminamos por completo
      const { error } = await supabaseAdmin
        .from('administradores')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function promoteStudentToComiteAction(studentId: string, roleTitle: string, newPassword?: string) {
  try {
    await ensureSuperAdmin();
    
    const updateData: any = { rol: 'comite', cargo: roleTitle };
    if (newPassword) updateData.contrasena = newPassword;
    
    const { error } = await supabaseAdmin
      .from('estudiantes')
      .update(updateData)
      .eq('id', studentId);
      
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateCargoAction(studentId: string, newCargo: string) {
  try {
    await ensureSuperAdmin();
    
    const { error } = await supabaseAdmin
      .from('estudiantes')
      .update({ cargo: newCargo })
      .eq('id', studentId);
      
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
