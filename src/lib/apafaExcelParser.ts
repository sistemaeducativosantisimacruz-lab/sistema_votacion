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

// Detecta dinámicamente las columnas de Alumno, Padre y Madre en cualquier estructura de Excel
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

  const startDataRow = headerRowIndices.length > 0 ? Math.max(...headerRowIndices) + 1 : 5;
  const maxCols = Math.max(...rows.slice(0, startDataRow).map(r => r.length), 10);
  const colHeaders: string[] = [];

  for (let c = 0; c < maxCols; c++) {
    const texts: string[] = [];
    for (const r of headerRowIndices) {
      const cellVal = String(rows[r]?.[c] || "").trim();
      if (cellVal) texts.push(cellVal.toUpperCase());
    }
    const fullText = texts.join(" ");
    const cleaned = fullText.replace(/PADR[OÓ]N\s+(?:DE\s+)?PADRES\s+(?:DE\s+FAMILIA)?/gi, " ").trim();
    colHeaders.push(cleaned);
  }

  let padreStartCol = -1;
  let madreStartCol = -1;
  for (let c = 0; c < colHeaders.length; c++) {
    const h = colHeaders[c];
    if (h.includes("PADRE") || h.includes("PAPA") || h.includes("PAPÁ")) {
      if (padreStartCol === -1) padreStartCol = c;
    }
    if (h.includes("MADRE") || h.includes("MAMA") || h.includes("MAMÁ")) {
      if (madreStartCol === -1) madreStartCol = c;
    }
  }

  if (padreStartCol === -1) padreStartCol = 5;
  if (madreStartCol === -1) madreStartCol = 7;

  let padreNameCol = -1;
  let padreDniCol = -1;
  let madreNameCol = -1;
  let madreDniCol = -1;

  for (let c = padreStartCol; c < (madreStartCol !== -1 ? madreStartCol : padreStartCol + 2); c++) {
    const h = colHeaders[c] || "";
    if (h.includes("DNI") || h.includes("DOC")) padreDniCol = c;
    else if (h.includes("NOMBRE") || h.includes("APELLIDO") || h.includes("PADRE")) padreNameCol = c;
  }

  const madreEndCol = colHeaders.length;
  for (let c = madreStartCol; c < Math.min(madreStartCol + 3, madreEndCol); c++) {
    const h = colHeaders[c] || "";
    if (h.includes("DNI") || h.includes("DOC")) madreDniCol = c;
    else if (h.includes("NOMBRE") || h.includes("APELLIDO") || h.includes("MADRE")) madreNameCol = c;
  }

  const sampleDataRows = rows.slice(startDataRow, startDataRow + 5).filter(r => r && r.length > 0);

  // Verificación con datos reales de filas si el encabezado no fue concluyente
  if (padreNameCol === -1 || padreDniCol === -1 || padreNameCol === padreDniCol) {
    const c1 = padreStartCol;
    const c2 = padreStartCol + 1;
    let c1Digits = 0;
    let c2Digits = 0;
    for (const r of sampleDataRows) {
      if (/^\d{7,9}$/.test(String(r[c1] || "").replace(/\D/g, ""))) c1Digits++;
      if (/^\d{7,9}$/.test(String(r[c2] || "").replace(/\D/g, ""))) c2Digits++;
    }
    if (c2Digits >= c1Digits) {
      padreDniCol = c2;
      padreNameCol = c1;
    } else {
      padreDniCol = c1;
      padreNameCol = c2;
    }
  }

  if (madreNameCol === -1 || madreDniCol === -1 || madreNameCol === madreDniCol) {
    const c1 = madreStartCol;
    const c2 = madreStartCol + 1;
    let c1Digits = 0;
    let c2Digits = 0;
    for (const r of sampleDataRows) {
      if (/^\d{7,9}$/.test(String(r[c1] || "").replace(/\D/g, ""))) c1Digits++;
      if (/^\d{7,9}$/.test(String(r[c2] || "").replace(/\D/g, ""))) c2Digits++;
    }
    if (c2Digits >= c1Digits) {
      madreDniCol = c2;
      madreNameCol = c1;
    } else {
      madreDniCol = c1;
      madreNameCol = c2;
    }
  }

  // Detección de columnas de alumno (anteriores a la columna del padre)
  let alumnoDniCol = -1;
  const alumnoNameCols: number[] = [];
  for (let c = 0; c < padreStartCol; c++) {
    const h = colHeaders[c] || "";
    if (h.includes("DNI") && alumnoDniCol === -1) {
      alumnoDniCol = c;
    } else if (h.includes("APELLIDO") || h.includes("NOMBRE") || h.includes("ALUMNO") || h.includes("ESTUDIANTE")) {
      alumnoNameCols.push(c);
    }
  }

  if (alumnoDniCol === -1) {
    for (let c = 0; c < padreStartCol; c++) {
      let digitsCount = 0;
      for (const r of sampleDataRows) {
        if (/^\d{7,9}$/.test(String(r[c] || "").replace(/\D/g, ""))) digitsCount++;
      }
      if (digitsCount > 0) {
        alumnoDniCol = c;
        break;
      }
    }
  }

  if (alumnoNameCols.length === 0) {
    for (let c = 0; c < padreStartCol; c++) {
      if (c !== alumnoDniCol && c !== 0) {
        alumnoNameCols.push(c);
      }
    }
  }

  return {
    startDataRow,
    alumnoDniCol: alumnoDniCol !== -1 ? alumnoDniCol : 1,
    alumnoNameCols: alumnoNameCols.length > 0 ? alumnoNameCols : [2, 3, 4],
    padreNameCol,
    padreDniCol,
    madreNameCol,
    madreDniCol,
  };
}

// Estructura Union-Find para unificar familias sin importar el orden de hojas
class DisjointSet {
  private parent: Map<string, string> = new Map();

  find(item: string): string {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
      return item;
    }
    const p = this.parent.get(item)!;
    if (p === item) return item;
    const root = this.find(p);
    this.parent.set(item, root);
    return root;
  }

  union(a: string, b: string): string {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
    return rootA;
  }
}

interface RawParentEntry {
  dni: string;
  nombres: string;
  apellidos: string;
  parentesco: "PADRE" | "MADRE" | "APODERADO";
  hijos: Set<string>;
  grados: Set<string>;
  secciones: Set<string>;
  niveles: Set<string>;
}

export type WorkbookInput = string | ArrayBuffer | { name?: string; data: string | ArrayBuffer };

/**
 * Parsea múltiples libros Excel (ej. Primaria y Secundaria) verificando en qué listas aparece cada padre/madre
 * y acumulando con precisión sus grados, secciones e hijos a cargo.
 */
export function parseApafaWorkbooks(workbooksData: WorkbookInput[]): ParseApafaResult {
  const warnings: string[] = [];
  const processedSheets: string[] = [];
  const dsu = new DisjointSet();
  const rawParentsMap = new Map<string, RawParentEntry>();

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

      // 2. Iterar las filas de estudiantes de esta hoja
      for (let r = cols.startDataRow; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const dniAlumno = cleanDni(row[cols.alumnoDniCol]);
        const alumnoNames = cols.alumnoNameCols.map(c => String(row[c] || "").trim()).filter(Boolean).join(" ");
        const alumnoFullName = alumnoNames || (dniAlumno ? `Alumno DNI ${dniAlumno}` : "");

        const rawPadreNombre = String(row[cols.padreNameCol] || "").trim();
        const dniPadre = cleanDni(row[cols.padreDniCol]);

        const rawMadreNombre = String(row[cols.madreNameCol] || "").trim();
        const dniMadre = cleanDni(row[cols.madreDniCol]);

        // Si la fila está totalmente vacía de padres y alumnos, omitir
        if (!dniPadre && !dniMadre && !rawPadreNombre && !rawMadreNombre) {
          continue;
        }

        sheetRowsCount++;

        // Unificar padre y madre en el mismo grupo familiar si ambos tienen DNI
        if (dniPadre && dniMadre) {
          dsu.union(dniPadre, dniMadre);
        } else if (dniPadre) {
          dsu.find(dniPadre);
        } else if (dniMadre) {
          dsu.find(dniMadre);
        }

        const hijoResumen = `${alumnoFullName} (${grado} "${seccion}" ${nivel})`.trim();

        // Registrar / actualizar datos de aparición del PADRE
        if (dniPadre && rawPadreNombre) {
          if (!rawParentsMap.has(dniPadre)) {
            const { apellidos, nombres } = splitFullName(rawPadreNombre);
            rawParentsMap.set(dniPadre, {
              dni: dniPadre,
              nombres: nombres || rawPadreNombre,
              apellidos: apellidos || rawPadreNombre,
              parentesco: "PADRE",
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
        }

        // Registrar / actualizar datos de aparición de la MADRE
        if (dniMadre && rawMadreNombre) {
          if (!rawParentsMap.has(dniMadre)) {
            const { apellidos, nombres } = splitFullName(rawMadreNombre);
            rawParentsMap.set(dniMadre, {
              dni: dniMadre,
              nombres: nombres || rawMadreNombre,
              apellidos: apellidos || rawMadreNombre,
              parentesco: "MADRE",
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
        }
      }

      if (sheetRowsCount > 0) {
        processedSheets.push(sheetName);
      }
    }
  }

  // 3. Fusión final por Grupo Familiar (unifica hijos, grados y secciones de padre y madre en todas las listas)
  const familyToMembersMap = new Map<string, RawParentEntry[]>();

  for (const [dni, parent] of rawParentsMap.entries()) {
    const rootDni = dsu.find(dni);
    const familiaId = `FAM-${rootDni}`;
    if (!familyToMembersMap.has(familiaId)) {
      familyToMembersMap.set(familiaId, []);
    }
    familyToMembersMap.get(familiaId)!.push(parent);
  }

  const finalApoderadosList: ApoderadoParsed[] = [];

  for (const [familiaId, members] of familyToMembersMap.entries()) {
    const combinedHijos = new Set<string>();
    const combinedGrados = new Set<string>();
    const combinedSecciones = new Set<string>();
    const combinedNiveles = new Set<string>();

    for (const m of members) {
      m.hijos.forEach(h => combinedHijos.add(h));
      m.grados.forEach(g => combinedGrados.add(g));
      m.secciones.forEach(s => combinedSecciones.add(s));
      m.niveles.forEach(n => combinedNiveles.add(n));
    }

    // Ordenar numéricamente los grados: 1°, 2°, 3°, etc.
    const sortedGrados = Array.from(combinedGrados).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    const sortedSecs = Array.from(combinedSecciones).sort();

    let finalNivel = "primaria";
    if (combinedNiveles.has("secundaria") && combinedNiveles.has("primaria")) {
      finalNivel = "mixto";
    } else if (combinedNiveles.has("secundaria")) {
      finalNivel = "secundaria";
    } else if (combinedNiveles.has("inicial")) {
      finalNivel = "inicial";
    }

    const finalGrado = sortedGrados.join(", ");
    const finalSeccion = sortedSecs.join(", ");
    const finalHijos = Array.from(combinedHijos).join("; ");

    for (const m of members) {
      finalApoderadosList.push({
        dni: m.dni,
        nombres: m.nombres,
        apellidos: m.apellidos,
        parentesco: m.parentesco,
        familia_id: familiaId,
        hijos: finalHijos,
        nivel: finalNivel,
        grado: finalGrado,
        seccion: finalSeccion,
        ya_voto: false,
      });
    }
  }

  return {
    apoderados: finalApoderadosList,
    totalSheets: processedSheets.length,
    sheetNames: processedSheets,
    totalFamilias: familyToMembersMap.size,
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
