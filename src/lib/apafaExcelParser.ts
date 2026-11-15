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

// Limpia y normaliza DNI a 8 dígitos (agrega ceros a la izquierda si tiene 7, maneja saltos de línea de Excel)
export function cleanDni(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;

  // Si hay saltos de línea dentro de la celda de Excel (ej: "13935678\n0")
  const lines = str.split(/[\r\n]+/);
  for (const line of lines) {
    const digits = line.replace(/\D/g, "").trim();
    if (digits.length >= 7 && digits.length <= 8) {
      return digits.padStart(8, "0");
    }
  }

  // Buscar coincidencia exacta de 7 u 8 dígitos rodeada de límites
  const match = str.match(/\b\d{7,8}\b/);
  if (match) return match[0].padStart(8, "0");

  const allDigits = str.replace(/\D/g, "");
  if (allDigits.length >= 7 && allDigits.length <= 8) {
    return allDigits.padStart(8, "0");
  }
  if (allDigits.length === 9) {
    return allDigits;
  }

  return null;
}

// Separa nombre completo en apellidos y nombres de forma inteligente
export function splitFullName(fullName: string): { apellidos: string; nombres: string } {
  const clean = String(fullName || "").replace(/\s+/g, " ").trim();
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

  // En Perú generalmente los 2 primeros corresponden a Apellido Paterno y Materno
  return {
    apellidos: `${words[0]} ${words[1]}`,
    nombres: words.slice(2).join(" "),
  };
}

// Extrae Nivel, Grado y Sección a partir del nombre de hoja, encabezado o nombre de archivo
export function parseNivelGradoSeccion(headerText: string, sheetName: string, fileName: string = ""): {
  nivel: string;
  grado: string;
  seccion: string;
} {
  let nivel = "";
  let grado = "";
  let seccion = "";

  // 1. Limpiar años de 4 dígitos (ej: 2024, 2025, 2026, 2027) para que "2026" NUNCA se confunda con 2° grado
  const cleanHeader = (headerText || "")
    .replace(/\b20\d\d\b/g, " ")
    .replace(/PADR[OÓ]N\s+(?:DE\s+)?PADRES\s+(?:DE\s+FAMILIA)?/gi, " ")
    .replace(/\s+/g, " ");

  const cleanSheet = (sheetName || "").trim();
  const cleanFile = (fileName || "").trim();
  const combined = `${cleanFile} ${cleanSheet} ${cleanHeader}`.toUpperCase();

  // Nivel
  if (combined.includes("SEC")) {
    nivel = "secundaria";
  } else if (combined.includes("PRIM")) {
    nivel = "primaria";
  } else if (combined.includes("INIC")) {
    nivel = "inicial";
  }

  // Priorizar el nombre de la pestaña si no es un nombre genérico tipo "Hoja1" o "Sheet1"
  const isGenericTab = /^(hoja|sheet|tabla|padron|lista)\s*\d*$/i.test(cleanSheet);

  if (!isGenericTab) {
    // Ej: "1° - A", "4°B SEC.", "5C SEC", "1A", "3RO B", "5° D SEC", "2° B"
    const tabMatch = cleanSheet.toUpperCase().match(/\b([1-6])\s*(?:°|º|RO|DO|ER|TO)?\s*[-–_ ]*\s*([A-Z])\b/);
    if (tabMatch) {
      grado = `${tabMatch[1]}°`;
      seccion = tabMatch[2].toUpperCase();
    } else {
      const tabGradoOnly = cleanSheet.toUpperCase().match(/\b([1-6])\s*(?:°|º|RO|DO|ER|TO)\b/);
      if (tabGradoOnly) grado = `${tabGradoOnly[1]}°`;
      const tabSecOnly = cleanSheet.toUpperCase().match(/(?:SECCI[OÓ]N|SEC|[-–_ ])\s*([A-F])\b/);
      if (tabSecOnly) seccion = tabSecOnly[1].toUpperCase();
    }
  }

  // Si aún falta grado o sección, buscar en el encabezado (limpio de años)
  if (!grado || !seccion) {
    const headMatch = cleanHeader.toUpperCase().match(/\b([1-6])\s*(?:°|º|RO|DO|ER|TO)?\s*[-–_ ]*\s*(?:SECCI[OÓ]N\s*|SEC\s*)?([A-F])\b/);
    if (headMatch) {
      if (!grado) grado = `${headMatch[1]}°`;
      if (!seccion) seccion = headMatch[2].toUpperCase();
    }
  }

  if (!grado) {
    const gradoMatch = cleanHeader.toUpperCase().match(/\b([1-6])\s*(?:°|º|RO|DO|ER|TO)\b/);
    if (gradoMatch) grado = `${gradoMatch[1]}°`;
  }

  if (!seccion) {
    const seccionMatch = cleanHeader.toUpperCase().match(/(?:SECCI[OÓ]N|SEC)[.:\s]*([A-F])\b/);
    if (seccionMatch) seccion = seccionMatch[1].toUpperCase();
  }

  return {
    nivel: nivel || (grado === "6°" ? "primaria" : "primaria"),
    grado: grado || "1°",
    seccion: seccion || "A",
  };
}

// Localiza el inicio de los datos y las columnas exactas
function detectColumns(rows: any[][]) {
  const headerRowIndices: number[] = [];
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const rowStr = (rows[r] || []).map(c => String(c).toUpperCase()).join(" ");
    if (
      rowStr.includes("DNI") ||
      rowStr.includes("PADRE") ||
      rowStr.includes("MADRE") ||
      rowStr.includes("APELLIDO") ||
      rowStr.includes("ALUMNO") ||
      rowStr.includes("ESTUDIANTE")
    ) {
      headerRowIndices.push(r);
    }
  }

  // La fila donde inician los datos es inmediatamente posterior a los encabezados
  let startDataRow = headerRowIndices.length > 0 ? Math.max(...headerRowIndices) + 1 : 4;
  while (startDataRow < rows.length && (!rows[startDataRow] || rows[startDataRow].length === 0 || rows[startDataRow].every((c: any) => !String(c).trim()))) {
    startDataRow++;
  }

  let offset = 1;
  const sampleRow = rows[startDataRow] || [];
  const col0Dni = cleanDni(sampleRow[0]);
  const col1Dni = cleanDni(sampleRow[1]);
  if (col0Dni && col0Dni.length === 8 && (!col1Dni || col1Dni.length !== 8)) {
    offset = 0;
  }

  // En el formato oficial de padrones del colegio (con columna ITEM en A):
  // Col 0: ITEM (A)
  // Col 1: DNI Alumno (B)
  // Col 2: Apellido Paterno Alumno (C)
  // Col 3: Apellido Materno Alumno (D)
  // Col 4: Nombres Alumno (E)
  // Col 5: Apellidos y Nombres Padre (F)
  // Col 6: DNI Padre (G)
  // Col 7: Apellidos y Nombres Madre (H)
  // Col 8: DNI Madre (I)
  return {
    startDataRow,
    dniAlumno: offset,
    apPaterno: offset + 1,
    apMaterno: offset + 2,
    nombres: offset + 3,
    padreNombre: offset + 4,
    padreDni: offset + 5,
    madreNombre: offset + 6,
    madreDni: offset + 7,
  };
}

interface RawParentEntry {
  dni: string;
  nombres: string;
  apellidos: string;
  parentesco: "PADRE" | "MADRE" | "APODERADO";
  familia_id: string;
  hijos: Set<string>;
  grados: Set<string>;
  secciones: Set<string>;
  niveles: Set<string>;
}

export type WorkbookInput = string | ArrayBuffer | { name?: string; data: string | ArrayBuffer };

/**
 * Parsea múltiples libros Excel (ej. Primaria y Secundaria) leyendo fila por fila.
 * Cada fila corresponde exactamente a un estudiante y sus respectivos padres.
 * Si la misma pareja de padres aparece en varias listas (por tener varios hijos),
 * se conforma su familia unificada con todos sus hijos a cargo (1 solo voto por familia).
 * Si un padre o madre tiene hijos con parejas diferentes, cada pareja conforma su propia familia
 * independiente sin mezclar indebidamente a las madres ni a los padres.
 */
export function parseApafaWorkbooks(workbooksData: WorkbookInput[]): ParseApafaResult {
  const warnings: string[] = [];
  const processedSheets: string[] = [];
  const rawParentsMap = new Map<string, RawParentEntry>();
  const distinctFamilies = new Set<string>();

  for (const item of workbooksData) {
    const rawData = (typeof item === "object" && item !== null && "data" in item) ? item.data : item;
    const fileName = (typeof item === "object" && item !== null && "name" in item) ? (item.name || "") : "";

    const wb = XLSX.read(rawData, { type: typeof rawData === "string" ? "binary" : "array" });

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      // Omitir hojas no pertinentes como estadísticas o notas
      const lowerSheet = sheetName.toLowerCase();
      if (lowerSheet.includes("resumen") || lowerSheet.includes("estadistica") || lowerSheet.includes("grafic")) {
        continue;
      }

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!rows || rows.length < 3) continue;

      // 1. Detectar Nivel, Grado y Sección de esta lista/hoja del libro
      let headerContextText = "";
      for (let r = 0; r < Math.min(4, rows.length); r++) {
        headerContextText += " " + (rows[r] || []).join(" ");
      }

      const { nivel, grado, seccion } = parseNivelGradoSeccion(headerContextText, sheetName, fileName);
      const cols = detectColumns(rows);

      let sheetRowsCount = 0;

      // 2. Iterar fila por fila: cada fila contiene al estudiante y sus respectivos padres
      for (let r = cols.startDataRow; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        // Estudiante de la fila
        const dniAlumno = cleanDni(row[cols.dniAlumno]);
        const apPaterno = String(row[cols.apPaterno] || "").trim();
        const apMaterno = String(row[cols.apMaterno] || "").trim();
        const nombresAlumno = String(row[cols.nombres] || "").trim();
        const alumnoFullName = `${apPaterno} ${apMaterno} ${nombresAlumno}`.trim() || (dniAlumno ? `Alumno DNI ${dniAlumno}` : "");

        // Padre de la fila
        let rawPadreNombre = String(row[cols.padreNombre] || "").trim();
        let dniPadre = cleanDni(row[cols.padreDni]);

        // Madre de la fila
        let rawMadreNombre = String(row[cols.madreNombre] || "").trim();
        let dniMadre = cleanDni(row[cols.madreDni]);

        // Autocorrección si en alguna fila se invirtieron columnas de DNI y Nombre
        if (!dniPadre && cleanDni(rawPadreNombre)) {
          dniPadre = cleanDni(rawPadreNombre);
          rawPadreNombre = String(row[cols.padreDni] || "").trim();
        }
        if (!dniMadre && cleanDni(rawMadreNombre)) {
          dniMadre = cleanDni(rawMadreNombre);
          rawMadreNombre = String(row[cols.madreDni] || "").trim();
        }

        // Si la fila está totalmente vacía de padres y alumnos, omitir
        if (!dniPadre && !dniMadre && !rawPadreNombre && !rawMadreNombre) {
          continue;
        }

        sheetRowsCount++;

        // IDENTIFICADOR DE FAMILIA POR PAREJA EXACTA DE LA FILA:
        // Evita mezclar a madres o padres de familias distintas
        let familyId = "";
        if (dniPadre && dniMadre) {
          familyId = `FAM-${[dniPadre, dniMadre].sort().join("_")}`;
        } else if (dniPadre) {
          familyId = `FAM-${dniPadre}`;
        } else if (dniMadre) {
          familyId = `FAM-${dniMadre}`;
        }

        if (familyId) {
          distinctFamilies.add(familyId);
        }

        const dniPrefix = dniAlumno ? `${dniAlumno} - ` : "";
        const hijoResumen = `${dniPrefix}${alumnoFullName} (${grado} "${seccion}" ${nivel})`.trim();

        // 3. Registrar / actualizar al PADRE de esta fila
        if (dniPadre && rawPadreNombre) {
          if (!rawParentsMap.has(dniPadre)) {
            const { apellidos, nombres } = splitFullName(rawPadreNombre);
            rawParentsMap.set(dniPadre, {
              dni: dniPadre,
              nombres: nombres || rawPadreNombre,
              apellidos: apellidos || rawPadreNombre,
              parentesco: "PADRE",
              familia_id: familyId,
              hijos: new Set<string>(),
              grados: new Set<string>(),
              secciones: new Set<string>(),
              niveles: new Set<string>(),
            });
          }
          const p = rawParentsMap.get(dniPadre)!;
          if (hijoResumen) p.hijos.add(hijoResumen);
          if (grado) p.grados.add(grado);
          if (seccion) p.secciones.add(seccion);
          if (nivel) p.niveles.add(nivel);
          // Si tiene pareja en esta fila, fijar familia_id de la pareja
          if (dniMadre) {
            p.familia_id = familyId;
          }
        }

        // 4. Registrar / actualizar a la MADRE de esta fila
        if (dniMadre && rawMadreNombre) {
          if (!rawParentsMap.has(dniMadre)) {
            const { apellidos, nombres } = splitFullName(rawMadreNombre);
            rawParentsMap.set(dniMadre, {
              dni: dniMadre,
              nombres: nombres || rawMadreNombre,
              apellidos: apellidos || rawMadreNombre,
              parentesco: "MADRE",
              familia_id: familyId,
              hijos: new Set<string>(),
              grados: new Set<string>(),
              secciones: new Set<string>(),
              niveles: new Set<string>(),
            });
          }
          const m = rawParentsMap.get(dniMadre)!;
          if (hijoResumen) m.hijos.add(hijoResumen);
          if (grado) m.grados.add(grado);
          if (seccion) m.secciones.add(seccion);
          if (nivel) m.niveles.add(nivel);
          // Si tiene pareja en esta fila, fijar familia_id de la pareja
          if (dniPadre) {
            m.familia_id = familyId;
          }
        }
      }

      if (sheetRowsCount > 0) {
        processedSheets.push(sheetName);
      }
    }
  }

  // 5. Unificar los hijos, grados, secciones y niveles para los miembros que comparten la misma familia_id
  const familyAggregates = new Map<string, {
    hijos: Set<string>;
    grados: Set<string>;
    secciones: Set<string>;
    niveles: Set<string>;
  }>();

  for (const parent of rawParentsMap.values()) {
    if (!familyAggregates.has(parent.familia_id)) {
      familyAggregates.set(parent.familia_id, {
        hijos: new Set<string>(),
        grados: new Set<string>(),
        secciones: new Set<string>(),
        niveles: new Set<string>(),
      });
    }
    const agg = familyAggregates.get(parent.familia_id)!;
    parent.hijos.forEach(h => agg.hijos.add(h));
    parent.grados.forEach(g => agg.grados.add(g));
    parent.secciones.forEach(s => agg.secciones.add(s));
    parent.niveles.forEach(n => agg.niveles.add(n));
  }

  // 6. Construcción de la lista final de apoderados con sus datos acumulados
  const finalApoderadosList: ApoderadoParsed[] = [];

  for (const parent of rawParentsMap.values()) {
    const agg = familyAggregates.get(parent.familia_id) || {
      hijos: parent.hijos,
      grados: parent.grados,
      secciones: parent.secciones,
      niveles: parent.niveles,
    };

    const sortedGrados = Array.from(agg.grados).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    const sortedSecs = Array.from(agg.secciones).sort();

    let finalNivel = "primaria";
    if (agg.niveles.has("secundaria") && agg.niveles.has("primaria")) {
      finalNivel = "mixto";
    } else if (agg.niveles.has("secundaria")) {
      finalNivel = "secundaria";
    } else if (agg.niveles.has("inicial")) {
      finalNivel = "inicial";
    }

    const finalGrado = sortedGrados.join(", ");
    const finalSeccion = sortedSecs.join(", ");
    const finalHijos = Array.from(agg.hijos).join("; ");

    finalApoderadosList.push({
      dni: parent.dni,
      nombres: parent.nombres,
      apellidos: parent.apellidos,
      parentesco: parent.parentesco,
      familia_id: parent.familia_id,
      hijos: finalHijos,
      nivel: finalNivel,
      grado: finalGrado,
      seccion: finalSeccion,
      ya_voto: false,
    });
  }

  return {
    apoderados: finalApoderadosList,
    totalSheets: processedSheets.length,
    sheetNames: processedSheets,
    totalFamilias: distinctFamilies.size,
    totalApoderados: finalApoderadosList.length,
    warnings,
  };
}

/**
 * Parsea un único libro Excel (compatibilidad directa)
 */
export function parseApafaWorkbook(dataBinary: string | ArrayBuffer): ParseApafaResult {
  return parseApafaWorkbooks([dataBinary]);
}
