import * as XLSX from "xlsx";

export type ApoderadoParsed = {
  dni: string;
  nombres: string;
  apellidos: string;
  parentesco: "PADRE" | "MADRE" | "APODERADO";
  familia_id: string;
  hijos: string;
  nivel: string;
  grado: string;
  seccion: string;
  ya_voto: boolean;
};

export type ParseApafaResult = {
  apoderados: ApoderadoParsed[];
  totalSheets: number;
  sheetNames: string[];
  totalFamilias: number;
  totalApoderados: number;
  warnings: string[];
};

// Limpia y normaliza DNI a 8 dígitos (agrega ceros a la izquierda si tiene 7 o menos, descarta caracteres no numéricos)
function cleanDni(val: any): string | null {
  if (val === null || val === undefined) return null;
  const digits = String(val).replace(/\D/g, "").trim();
  if (digits.length >= 7 && digits.length <= 9) {
    return digits.padStart(8, "0");
  }
  return null;
}

// Separa nombre completo en apellidos y nombres de forma inteligente
function splitFullName(fullName: string): { apellidos: string; nombres: string } {
  const clean = fullName.replace(/\s+/g, " ").trim();
  if (!clean) return { apellidos: "", nombres: "" };

  if (clean.includes(",")) {
    const parts = clean.split(",");
    return {
      apellidos: parts[0].trim(),
      nombres: parts.slice(1).join(",").trim() || parts[0].trim(),
    };
  }

  const words = clean.split(" ");
  if (words.length <= 2) {
    return {
      apellidos: words[0] || clean,
      nombres: words.slice(1).join(" ") || words[0] || clean,
    };
  }

  // Generalmente en Perú los 2 primeros son Apellido Paterno y Materno
  return {
    apellidos: `${words[0]} ${words[1]}`,
    nombres: words.slice(2).join(" "),
  };
}

// Extrae Nivel, Grado y Sección a partir del texto de la hoja o el encabezado
function parseNivelGradoSeccion(headerText: string, sheetName: string): {
  nivel: string;
  grado: string;
  seccion: string;
} {
  let nivel = "";
  let grado = "";
  let seccion = "";

  const combined = `${headerText} ${sheetName}`.toUpperCase();

  // Nivel
  if (combined.includes("PRIM")) {
    nivel = "primaria";
  } else if (combined.includes("SEC")) {
    nivel = "secundaria";
  } else if (combined.includes("INIC")) {
    nivel = "inicial";
  }

  // Grado: buscar patrones como 1°, 2DO, 3RO, 4TO, 5TO, 6TO o dígitos 1-6
  const gradoMatch = combined.match(/([1-6])\s*(?:°|º|RO|DO|ER|TO)?/);
  if (gradoMatch) {
    grado = `${gradoMatch[1]}°`;
  }

  // Sección: buscar letra de sección A, B, C, D, E, F
  const seccionMatch = combined.match(/(?:SECCI[OÓ]N|SEC|[-–])\s*([A-F])\b/) || 
                       combined.match(/\b([1-6])\s*(?:°|º)?\s*[-–]?\s*([A-F])\b/);
  if (seccionMatch) {
    seccion = (seccionMatch[2] || seccionMatch[1]).toUpperCase();
  }

  // Si no se encontró grado/sección en el texto, inferir por el nombre de la pestaña (ej: "4°B SEC", "5A")
  if (!grado || !seccion) {
    const tabMatch = sheetName.toUpperCase().match(/([1-6])\s*(?:°|º)?\s*([A-F])/);
    if (tabMatch) {
      if (!grado) grado = `${tabMatch[1]}°`;
      if (!seccion) seccion = tabMatch[2];
    }
  }

  return {
    nivel: nivel || "primaria",
    grado: grado || "1°",
    seccion: seccion || "A",
  };
}

/**
 * Parsea múltiples libros Excel (ej. uno de Primaria y uno de Secundaria) unificando familias y apoderados
 */
export function parseApafaWorkbooks(workbooksData: (string | ArrayBuffer)[]): ParseApafaResult {
  const dniToFamiliaIdMap = new Map<string, string>();
  const apoderadosMap = new Map<string, ApoderadoParsed>();
  const warnings: string[] = [];
  const processedSheets: string[] = [];

  for (const dataBinary of workbooksData) {
    const wb = XLSX.read(dataBinary, { type: typeof dataBinary === "string" ? "binary" : "array" });

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      // Convertir hoja a matriz 2D de celdas
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!rows || rows.length < 4) continue;

      // 1. Detectar encabezado de nivel/grado/sección en las primeras 4 filas
      let headerContextText = "";
      for (let r = 0; r < Math.min(4, rows.length); r++) {
        headerContextText += " " + rows[r].join(" ");
      }

      const { nivel, grado, seccion } = parseNivelGradoSeccion(headerContextText, sheetName);

      // 2. Localizar la fila donde inician los datos (buscar celda con 'DNI' o fila 5/6)
      let startRowIndex = -1;
      let colMap = {
        dniAlumno: 1,
        apPaternoAlumno: 2,
        apMaternoAlumno: 3,
        nombresAlumno: 4,
        padreNombre: 5,
        padreDni: 6,
        madreNombre: 7,
        madreDni: 8,
      };

      for (let r = 0; r < Math.min(7, rows.length); r++) {
        const rowStr = rows[r].map(c => String(c).toUpperCase());
        const dniIdx = rowStr.findIndex(c => c.includes("DNI"));
        if (dniIdx !== -1) {
          startRowIndex = r + 1;
          // Si hay subencabezado en la siguiente fila (como en la captura: fila 4 ITEM/PADRE/MADRE y fila 5 DNI...)
          if (startRowIndex < rows.length) {
            const nextRowStr = rows[startRowIndex].map(c => String(c).toUpperCase());
            if (nextRowStr.some(c => c.includes("DNI") || c.includes("APELLIDO") || c.includes("NOMBRE"))) {
              startRowIndex++;
            }
          }
          break;
        }
      }

      if (startRowIndex === -1) {
        startRowIndex = 5; // Por defecto fila 6 (índice 5)
      }

      processedSheets.push(sheetName);

      // 3. Iterar cada fila de la hoja
      for (let r = startRowIndex; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        // Alumno
        const dniAlumno = cleanDni(row[colMap.dniAlumno]);
        const apPaterno = String(row[colMap.apPaternoAlumno] || "").trim();
        const apMaterno = String(row[colMap.apMaternoAlumno] || "").trim();
        const nombresAlumno = String(row[colMap.nombresAlumno] || "").trim();

        // Padre
        const rawPadreNombre = String(row[colMap.padreNombre] || "").trim();
        const dniPadre = cleanDni(row[colMap.padreDni]);

        // Madre
        const rawMadreNombre = String(row[colMap.madreNombre] || "").trim();
        const dniMadre = cleanDni(row[colMap.madreDni]);

        // Si no hay ningún dato de padre ni madre ni alumno, saltar fila
        if (!dniPadre && !dniMadre && !dniAlumno && !rawPadreNombre && !rawMadreNombre) {
          continue;
        }

        // Nombre descriptivo del hijo para el padrón
        const alumnoFullName = `${apPaterno} ${apMaterno} ${nombresAlumno}`.trim() || `Alumno DNI ${dniAlumno || 'S/D'}`;
        const hijoResumen = `${alumnoFullName} (${grado} ${seccion} ${nivel})`.trim();

        // 4. Identificar o asignar Familia ID (unifica a padre y madre de los mismos hijos)
        let familiaId = "";
        if (dniPadre && dniToFamiliaIdMap.has(dniPadre)) {
          familiaId = dniToFamiliaIdMap.get(dniPadre)!;
        } else if (dniMadre && dniToFamiliaIdMap.has(dniMadre)) {
          familiaId = dniToFamiliaIdMap.get(dniMadre)!;
        }

        if (!familiaId) {
          familiaId = `FAM-${dniPadre || dniMadre || dniAlumno || Math.random().toString(36).substring(2, 9)}`;
        }

        // Mapear ambos DNIs a este familiaId
        if (dniPadre) dniToFamiliaIdMap.set(dniPadre, familiaId);
        if (dniMadre) dniToFamiliaIdMap.set(dniMadre, familiaId);

        // 5. Registrar / actualizar Padre
        if (dniPadre && rawPadreNombre) {
          const { apellidos, nombres } = splitFullName(rawPadreNombre);
          if (apoderadosMap.has(dniPadre)) {
            const existing = apoderadosMap.get(dniPadre)!;
            if (!existing.hijos.includes(alumnoFullName)) {
              existing.hijos = `${existing.hijos}; ${hijoResumen}`;
            }
          } else {
            apoderadosMap.set(dniPadre, {
              dni: dniPadre,
              nombres: nombres || rawPadreNombre,
              apellidos: apellidos || rawPadreNombre,
              parentesco: "PADRE",
              familia_id: familiaId,
              hijos: hijoResumen,
              nivel,
              grado,
              seccion,
              ya_voto: false,
            });
          }
        }

        // 6. Registrar / actualizar Madre
        if (dniMadre && rawMadreNombre) {
          const { apellidos, nombres } = splitFullName(rawMadreNombre);
          if (apoderadosMap.has(dniMadre)) {
            const existing = apoderadosMap.get(dniMadre)!;
            if (!existing.hijos.includes(alumnoFullName)) {
              existing.hijos = `${existing.hijos}; ${hijoResumen}`;
            }
          } else {
            apoderadosMap.set(dniMadre, {
              dni: dniMadre,
              nombres: nombres || rawMadreNombre,
              apellidos: apellidos || rawMadreNombre,
              parentesco: "MADRE",
              familia_id: familiaId,
              hijos: hijoResumen,
              nivel,
              grado,
              seccion,
              ya_voto: false,
            });
          }
        }
      }
    }
  }

  // Contar familias únicas
  const familiasUnicas = new Set(Array.from(apoderadosMap.values()).map(a => a.familia_id));

  return {
    apoderados: Array.from(apoderadosMap.values()),
    totalSheets: processedSheets.length,
    sheetNames: processedSheets,
    totalFamilias: familiasUnicas.size,
    totalApoderados: apoderadosMap.size,
    warnings,
  };
}

/**
 * Parsea un único libro Excel (compatibilidad directa)
 */
export function parseApafaWorkbook(dataBinary: string | ArrayBuffer): ParseApafaResult {
  return parseApafaWorkbooks([dataBinary]);
}
