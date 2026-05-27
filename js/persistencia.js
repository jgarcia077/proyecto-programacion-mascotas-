/**
 * PERSISTENCIA.JS — AdoptaMascotasApp v1.1
 *
 * Responsabilidades de este módulo:
 *   1. Guardar y restaurar los arrays globales (clientes, mascotas,
 *      adopciones, mascotasAdoptadas) en localStorage al cerrar o
 *      recargar la página.
 *   2. Gestionar archivos TXT adjuntos: almacenarlos en localStorage
 *      asociados a un cliente (idCliente) o a una adopción (idAdopcion).
 *   3. Inyectar en los modales de "Crear Cliente" y "Crear Adopción"
 *      un campo para subir archivos TXT.
 *   4. Mostrar los archivos adjuntos en los listados correspondientes.
 *
 * Convenciones:
 *   - No se usa innerHTML con datos del usuario (prevención XSS).
 *   - Los archivos TXT se guardan como texto plano (FileReader.readAsText).
 *   - Claves de localStorage con prefijo "adoptaApp_" para evitar colisiones.
 *
 * Seguridad adicional:
 *   - Solo se aceptan archivos con extensión .txt y tipo text/plain.
 *   - El contenido se almacena como string, nunca se evalúa.
 */

"use strict";

/* ============================================================
   CLAVES DE ALMACENAMIENTO (localStorage)
   ============================================================ */

/** Prefijo único para evitar colisiones con otras apps en el mismo origen */
const LS_PREFIX = "adoptaApp_";

const LS_KEY_CLIENTES          = `${LS_PREFIX}clientes`;
const LS_KEY_MASCOTAS          = `${LS_PREFIX}mascotas`;
const LS_KEY_ADOPCIONES        = `${LS_PREFIX}adopciones`;
const LS_KEY_MASCOTAS_ADOPTADAS = `${LS_PREFIX}mascotasAdoptadas`;

/**
 * Clave donde se guarda el mapa de archivos adjuntos.
 * Estructura guardada:
 *   {
 *     clientes:   { "<idCliente>": [{ nombre, contenido, fechaSubida }] },
 *     adopciones: { "<idAdopcion>": [{ nombre, contenido, fechaSubida }] }
 *   }
 */
const LS_KEY_ADJUNTOS = `${LS_PREFIX}adjuntos`;

/* ============================================================
   MAPA EN MEMORIA DE ARCHIVOS ADJUNTOS
   Se carga desde localStorage al iniciar y se mantiene sincronizado.
   ============================================================ */

/**
 * adjuntosMap — mapa en memoria de los archivos TXT adjuntos.
 * Se sincroniza con localStorage cada vez que se modifica.
 * @type {{ clientes: Object, adopciones: Object }}
 */
let adjuntosMap = { clientes: {}, adopciones: {} };

/* ============================================================
   GUARDAR DATOS EN localStorage
   ============================================================ */

/**
 * Serializa y guarda todos los arrays globales del proyecto en localStorage.
 * Se llama automáticamente al confirmar logout y también en el evento
 * beforeunload (cierre/recarga de la pestaña).
 *
 * Manejo de errores: si localStorage está lleno o desactivado,
 * se captura la excepción silenciosamente para no interrumpir la UX.
 */
function guardarDatosEnLocalStorage() {
  try {
    localStorage.setItem(LS_KEY_CLIENTES,           JSON.stringify(clientes));
    localStorage.setItem(LS_KEY_MASCOTAS,           JSON.stringify(mascotas));
    localStorage.setItem(LS_KEY_ADOPCIONES,         JSON.stringify(adopciones));
    localStorage.setItem(LS_KEY_MASCOTAS_ADOPTADAS, JSON.stringify(mascotasAdoptadas));
    localStorage.setItem(LS_KEY_ADJUNTOS,           JSON.stringify(adjuntosMap));
  } catch (errorGuardado) {
    /* localStorage puede fallar si está lleno o bloqueado (modo privado estricto) */
    console.warn("AdoptaMascotasApp: no se pudo guardar en localStorage.", errorGuardado);
  }
}

/* ============================================================
   CARGAR DATOS DESDE localStorage
   ============================================================ */

/**
 * Lee los datos persistidos desde localStorage y los fusiona
 * con los arrays globales definidos en ENV.js.
 *
 * Estrategia de fusión:
 *   - Si localStorage tiene datos, REEMPLAZA el contenido del array global.
 *   - Si localStorage no tiene datos (primera ejecución), se conservan
 *     los datos semilla de ENV.js.
 *
 * Se ejecuta una sola vez al cargar la página, antes de inicializar los módulos.
 */
function cargarDatosDesdeLocalStorage() {
  try {
    const clientesGuardados = localStorage.getItem(LS_KEY_CLIENTES);
    if (clientesGuardados) {
      const parsed = JSON.parse(clientesGuardados);
      if (Array.isArray(parsed)) {
        clientes.length = 0;
        parsed.forEach((registro) => clientes.push(registro));
      }
    }

    const mascotasGuardadas = localStorage.getItem(LS_KEY_MASCOTAS);
    if (mascotasGuardadas) {
      const parsed = JSON.parse(mascotasGuardadas);
      if (Array.isArray(parsed)) {
        mascotas.length = 0;
        parsed.forEach((registro) => mascotas.push(registro));
      }
    }

    const adopcionesGuardadas = localStorage.getItem(LS_KEY_ADOPCIONES);
    if (adopcionesGuardadas) {
      const parsed = JSON.parse(adopcionesGuardadas);
      if (Array.isArray(parsed)) {
        adopciones.length = 0;
        parsed.forEach((registro) => adopciones.push(registro));
      }
    }

    const mascotasAdoptadasGuardadas = localStorage.getItem(LS_KEY_MASCOTAS_ADOPTADAS);
    if (mascotasAdoptadasGuardadas) {
      const parsed = JSON.parse(mascotasAdoptadasGuardadas);
      if (Array.isArray(parsed)) {
        mascotasAdoptadas.length = 0;
        parsed.forEach((registro) => mascotasAdoptadas.push(registro));
      }
    }

    const adjuntosGuardados = localStorage.getItem(LS_KEY_ADJUNTOS);
    if (adjuntosGuardados) {
      const parsed = JSON.parse(adjuntosGuardados);
      if (parsed && typeof parsed === "object") {
        adjuntosMap = {
          clientes:   parsed.clientes   && typeof parsed.clientes   === "object" ? parsed.clientes   : {},
          adopciones: parsed.adopciones && typeof parsed.adopciones === "object" ? parsed.adopciones : {},
        };
      }
    }
  } catch (errorCarga) {
    console.warn("AdoptaMascotasApp: error al cargar desde localStorage.", errorCarga);
  }
}

/* ============================================================
   GESTIÓN DE ARCHIVOS TXT ADJUNTOS
   ============================================================ */

/**
 * Lee un archivo TXT seleccionado por el usuario y lo guarda en adjuntosMap.
 *
 * @param {File}   archivo    - Objeto File del input[type=file]
 * @param {string} tipo       - "clientes" o "adopciones"
 * @param {number} idEntidad  - idCliente o idAdopcion al que se adjunta
 * @param {Function} callbackExito - Se llama con el nombre del archivo al terminar
 */
function adjuntarArchivoTxt(archivo, tipo, idEntidad, callbackExito) {
  /* Validar que sea .txt */
  const nombreArchivo = typeof archivo?.name === "string" ? archivo.name : "";
  const esTxt = nombreArchivo.toLowerCase().endsWith(".txt");
  if (!esTxt) {
    showToast({
      toastNode: document.getElementById("toast"),
      message: "⚠️ Solo se permiten archivos .txt",
    });
    return;
  }

  const lector = new FileReader();

  lector.onload = function (eventoLectura) {
    const contenido = typeof eventoLectura.target?.result === "string"
      ? eventoLectura.target.result
      : "";

    const claveId = String(idEntidad);

    /* Inicializar array si no existe */
    if (!Array.isArray(adjuntosMap[tipo][claveId])) {
      adjuntosMap[tipo][claveId] = [];
    }

    /* Evitar duplicados por nombre en la misma entidad */
    const yaExiste = adjuntosMap[tipo][claveId].some(
      (adj) => adj.nombre === nombreArchivo
    );

    if (yaExiste) {
      showToast({
        toastNode: document.getElementById("toast"),
        message: `⚠️ Ya existe un archivo llamado "${nombreArchivo}" en este registro.`,
      });
      return;
    }

    adjuntosMap[tipo][claveId].push({
      nombre:       nombreArchivo,
      contenido:    contenido,
      fechaSubida:  new Date().toISOString().slice(0, 10),
    });

    /* Persistir inmediatamente */
    guardarDatosEnLocalStorage();

    if (typeof callbackExito === "function") {
      callbackExito(nombreArchivo);
    }
  };

  lector.onerror = function () {
    showToast({
      toastNode: document.getElementById("toast"),
      message: "❌ Error al leer el archivo. Intente de nuevo.",
    });
  };

  lector.readAsText(archivo, "UTF-8");
}

/**
 * Devuelve los archivos adjuntos de una entidad.
 *
 * @param {string} tipo      - "clientes" o "adopciones"
 * @param {number} idEntidad
 * @returns {Array<{nombre: string, contenido: string, fechaSubida: string}>}
 */
function getAdjuntosPorEntidad(tipo, idEntidad) {
  const claveId = String(idEntidad);
  return Array.isArray(adjuntosMap[tipo]?.[claveId])
    ? adjuntosMap[tipo][claveId]
    : [];
}

/**
 * Elimina un archivo adjunto específico de una entidad.
 *
 * @param {string} tipo
 * @param {number} idEntidad
 * @param {string} nombreArchivo
 */
function eliminarAdjunto(tipo, idEntidad, nombreArchivo) {
  const claveId = String(idEntidad);
  if (!Array.isArray(adjuntosMap[tipo]?.[claveId])) return;
  adjuntosMap[tipo][claveId] = adjuntosMap[tipo][claveId].filter(
    (adj) => adj.nombre !== nombreArchivo
  );
  guardarDatosEnLocalStorage();
}

/**
 * Descarga un archivo adjunto como un .txt en el equipo del usuario.
 *
 * @param {string} nombreArchivo
 * @param {string} contenido
 */
function descargarAdjunto(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href     = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   HELPER: ZONA DE UPLOAD PERSONALIZADA
   ============================================================ */

/**
 * Crea un input[type=file] oculto + botón visible estilizado + label de nombre.
 * Al seleccionar archivo ejecuta el callback onChange(file).
 *
 * Reemplaza el input nativo que es poco visible y difiere entre navegadores.
 *
 * @param {Function} onChange - recibe el objeto File seleccionado
 * @returns {{ wrapper: HTMLElement, resetInput: Function }}
 */
function crearZonaUpload(onChange) {
  /* Contenedor principal */
  const wrapper = document.createElement("div");
  wrapper.className = "adjunto-zona-upload";

  /* Input real oculto */
  const inputOculto = document.createElement("input");
  inputOculto.type   = "file";
  inputOculto.accept = ".txt,text/plain";
  inputOculto.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";

  /* Botón visible */
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.className = "button";
  btn.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "font-size:0.8rem",
    "padding:6px 14px",
    "flex-shrink:0",
    "white-space:nowrap",
  ].join(";");
  btn.innerHTML = "&#128206; Subir .txt";
  btn.addEventListener("click", () => inputOculto.click());

  /* Nombre del archivo seleccionado */
  const labelNombre = document.createElement("span");
  labelNombre.style.cssText = [
    "font-size:0.78rem",
    "color:var(--text-muted)",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "flex:1",
  ].join(";");
  labelNombre.textContent = "Ningún archivo seleccionado";

  inputOculto.addEventListener("change", () => {
    const archivo = inputOculto.files?.[0];
    if (!archivo) return;
    labelNombre.textContent = archivo.name;
    labelNombre.style.color = "var(--text)";
    onChange(archivo);
  });

  wrapper.appendChild(inputOculto);
  wrapper.appendChild(btn);
  wrapper.appendChild(labelNombre);

  /* resetInput: limpia el input y restaura el label */
  function resetInput() {
    inputOculto.value       = "";
    labelNombre.textContent = "Ningún archivo seleccionado";
    labelNombre.style.color = "var(--text-muted)";
  }

  return { wrapper, resetInput };
}

/* ============================================================
   INYECCIÓN DE CONTROLES DE ADJUNTO EN FORMULARIOS
   ============================================================ */

/**
 * Construye y devuelve el bloque HTML (nodos DOM) para subir un TXT.
 * Usa createElement + textContent para evitar XSS.
 *
 * @param {string} idInput    - id del <input type="file">
 * @param {string} idListado  - id del <div> donde se listan los adjuntos
 * @param {string} labelText  - Etiqueta visible del campo
 * @returns {HTMLElement}     - Contenedor formField listo para insertar
 */
function crearBloqueAdjunto(idInput, idListado, labelText) {
  const formField = document.createElement("div");
  formField.className = "formField formField--full";

  const label = document.createElement("label");
  label.className = "formLabel";
  label.htmlFor   = idInput;
  label.textContent = labelText;

  const inputFile = document.createElement("input");
  inputFile.type      = "file";
  inputFile.accept    = ".txt,text/plain";
  inputFile.id        = idInput;
  inputFile.className = "formControl";
  inputFile.style.padding = "6px";

  const listadoDiv = document.createElement("div");
  listadoDiv.id        = idListado;
  listadoDiv.className = "adjuntos-listado";
  listadoDiv.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:4px;";

  formField.appendChild(label);
  formField.appendChild(inputFile);
  formField.appendChild(listadoDiv);

  return formField;
}

/**
 * Renderiza la lista de archivos adjuntos dentro de un contenedor.
 * Cada tarjeta muestra: icono, nombre, fecha, botones Ver / Descargar / Eliminar.
 *
 * @param {string}      tipo           - "clientes" o "adopciones"
 * @param {number}      idEntidad
 * @param {HTMLElement} contenedorNode - nodo donde se renderizan las tarjetas
 * @param {Function}    [onEliminar]   - callback opcional tras eliminar un archivo
 */
function renderizarAdjuntos(tipo, idEntidad, contenedorNode, onEliminar) {
  if (!contenedorNode) return;
  contenedorNode.textContent = "";

  const adjuntos = getAdjuntosPorEntidad(tipo, idEntidad);

  if (adjuntos.length === 0) {
    const vacio = document.createElement("div");
    vacio.className = "adjunto-vacio";
    const vaciIcon = document.createElement("span");
    vaciIcon.style.cssText = "font-size:2rem;opacity:0.5;";
    vaciIcon.textContent = "📂";
    const vaciText = document.createElement("span");
    vaciText.textContent = "Sin archivos adjuntos";
    vacio.appendChild(vaciIcon);
    vacio.appendChild(vaciText);
    contenedorNode.appendChild(vacio);
    return;
  }

  adjuntos.forEach((adj) => {
    const card = document.createElement("div");
    card.className = "adjunto-card";

    /* Icono */
    const icono = document.createElement("span");
    icono.textContent = "📄";
    icono.style.fontSize = "1.4rem";

    /* Info: nombre + fecha */
    const info = document.createElement("div");
    info.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;";

    const nombre = document.createElement("span");
    nombre.className = "adjunto-card__nombre";
    nombre.textContent = adj.nombre;

    const fecha = document.createElement("span");
    fecha.className = "adjunto-card__fecha";
    fecha.textContent = `Subido: ${adj.fechaSubida}`;

    info.appendChild(nombre);
    info.appendChild(fecha);

    /* Acciones */
    const acciones = document.createElement("div");
    acciones.className = "adjunto-card__acciones";

    const btnVer = document.createElement("button");
    btnVer.className = "button";
    btnVer.type = "button";
    btnVer.title = "Ver contenido";
    btnVer.style.cssText = "font-size:0.75rem;padding:4px 10px;width:auto;";
    btnVer.textContent = "👁 Ver";
    btnVer.addEventListener("click", () => mostrarModalVistaPrevia(adj.nombre, adj.contenido));

    const btnDesc = document.createElement("button");
    btnDesc.className = "button";
    btnDesc.type = "button";
    btnDesc.title = "Descargar";
    btnDesc.style.cssText = "font-size:0.75rem;padding:4px 10px;width:auto;";
    btnDesc.textContent = "⬇";
    btnDesc.addEventListener("click", () => descargarAdjunto(adj.nombre, adj.contenido));

    const btnDel = document.createElement("button");
    btnDel.className = "button button--danger";
    btnDel.type = "button";
    btnDel.title = "Eliminar adjunto";
    btnDel.style.cssText = "font-size:0.75rem;padding:4px 8px;width:auto;";
    btnDel.textContent = "✕";
    btnDel.addEventListener("click", () => {
      eliminarAdjunto(tipo, idEntidad, adj.nombre);
      renderizarAdjuntos(tipo, idEntidad, contenedorNode, onEliminar);
      if (typeof onEliminar === "function") onEliminar();
      showToast({ toastNode: document.getElementById("toast"), message: `🗑 "${adj.nombre}" eliminado.` });
    });

    acciones.appendChild(btnVer);
    acciones.appendChild(btnDesc);
    acciones.appendChild(btnDel);

    card.appendChild(icono);
    card.appendChild(info);
    card.appendChild(acciones);
    contenedorNode.appendChild(card);
  });
}

/* ============================================================
   MODAL DE VISTA PREVIA DE ARCHIVOS TXT
   ============================================================ */

/**
 * Crea (una sola vez) e inyecta el modal de vista previa en el DOM.
 * Reutilizado en cada apertura actualizando su contenido.
 */
function asegurarModalVistaPrevia() {
  if (document.getElementById("adjuntoVistaPreviaModal")) return;

  /*
   * Usa .modalOverlay sin --main para que el fondo oscuro cubra TODA
   * la pantalla (sidebar + topbar) y el dialog quede centrado.
   * z-index:200 garantiza que esté por encima de los otros modales (z-index:80).
   */
  const overlay = document.createElement("div");
  overlay.id        = "adjuntoVistaPreviaModal";
  overlay.className = "modalOverlay";
  overlay.hidden    = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("aria-label",  "Vista previa de archivo adjunto");
  overlay.style.zIndex = "200";

  const dialog = document.createElement("div");
  dialog.className = "modalDialog";
  dialog.setAttribute("role",       "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "adjuntoVistaPreviaTitulo");
  dialog.style.cssText = "width:min(680px,calc(100vw - 48px));max-height:85vh;display:flex;flex-direction:column;";

  /* Título */
  const titleRow = document.createElement("div");
  titleRow.className        = "modalDialog__titleRow";
  titleRow.style.flexShrink = "0";

  const title = document.createElement("h2");
  title.className   = "modalDialog__title";
  title.id          = "adjuntoVistaPreviaTitulo";
  title.textContent = "📄 Vista previa";

  titleRow.appendChild(title);
  dialog.appendChild(titleRow);

  /* Área de texto con scroll interno */
  const pre = document.createElement("pre");
  pre.id = "adjuntoVistaPreviaContenido";
  pre.style.cssText = [
    "flex:1",
    "overflow:auto",
    "background:var(--control)",
    "border:1px solid var(--border)",
    "border-radius:8px",
    "padding:16px",
    "margin:var(--space-3) 0 0",
    "font-size:0.82rem",
    "font-family:monospace",
    "color:var(--text)",
    "white-space:pre-wrap",
    "word-break:break-word",
    "line-height:1.6",
    "min-height:80px",
    "max-height:60vh",
  ].join(";");
  dialog.appendChild(pre);

  /* Botón cerrar */
  const footer = document.createElement("div");
  footer.className     = "formActions";
  footer.style.cssText = "margin-top:var(--space-3);flex-shrink:0;";

  const btnCerrar = document.createElement("button");
  btnCerrar.className   = "button button--success";
  btnCerrar.type        = "button";
  btnCerrar.textContent = "Cerrar";
  btnCerrar.addEventListener("click", cerrarModalVistaPrevia);

  footer.appendChild(btnCerrar);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);

  /* Cerrar al hacer clic fuera del dialog */
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) cerrarModalVistaPrevia();
  });

  /* Cerrar con Escape */
  overlay.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") cerrarModalVistaPrevia();
  });

  document.body.appendChild(overlay);
}

/**
 * Abre el modal de vista previa con el nombre y contenido del archivo.
 *
 * @param {string} nombreArchivo
 * @param {string} contenido
 */
function mostrarModalVistaPrevia(nombreArchivo, contenido) {
  asegurarModalVistaPrevia();

  const titulo    = document.getElementById("adjuntoVistaPreviaTitulo");
  const pre       = document.getElementById("adjuntoVistaPreviaContenido");
  const modalNode = document.getElementById("adjuntoVistaPreviaModal");

  if (titulo) titulo.textContent = `📄 ${nombreArchivo}`;
  if (pre)    pre.textContent    = contenido;

  openModal(modalNode, document.querySelector("#adjuntoVistaPreviaModal .button--success"));
}

/** Cierra el modal de vista previa. */
function cerrarModalVistaPrevia() {
  const modalNode = document.getElementById("adjuntoVistaPreviaModal");
  if (modalNode) closeModal(modalNode, null);
}

/* ============================================================
   MODAL DE GESTIÓN DE ADJUNTOS (reutilizable para clientes y adopciones)
   ============================================================ */

/**
 * Crea (una sola vez) el modal de gestión de adjuntos en el DOM.
 * Se reutiliza en cada apertura actualizando su título y contenido.
 */
function asegurarModalAdjuntos() {
  if (document.getElementById("adjuntosGestionModal")) return;

  const overlay = document.createElement("div");
  overlay.id        = "adjuntosGestionModal";
  overlay.className = "modalOverlay";
  overlay.hidden    = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.zIndex = "200";

  const dialog = document.createElement("div");
  dialog.className = "modalDialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "adjuntosGestionTitulo");
  dialog.style.cssText = "width:min(560px,calc(100vw - 48px));max-height:85vh;display:flex;flex-direction:column;gap:0;";

  /* Título */
  const titleRow = document.createElement("div");
  titleRow.className        = "modalDialog__titleRow";
  titleRow.style.flexShrink = "0";

  const titleEl = document.createElement("h2");
  titleEl.id          = "adjuntosGestionTitulo";
  titleEl.className   = "modalDialog__title";
  titleEl.textContent = "📎 Archivos adjuntos";
  titleRow.appendChild(titleEl);
  dialog.appendChild(titleRow);

  /* Descripción del registro */
  const subtituloEl = document.createElement("p");
  subtituloEl.id            = "adjuntosGestionSubtitulo";
  subtituloEl.className     = "formHelp";
  subtituloEl.style.cssText = "margin:8px 0 0;font-size:0.82rem;flex-shrink:0;";
  dialog.appendChild(subtituloEl);

  /* Separador */
  const sep = document.createElement("div");
  sep.style.cssText = "height:1px;background:var(--border);margin:12px 0;flex-shrink:0;";
  dialog.appendChild(sep);

  /* Listado de adjuntos con scroll */
  const listadoEl = document.createElement("div");
  listadoEl.id          = "adjuntosGestionListado";
  listadoEl.style.cssText = "flex:1;overflow-y:auto;min-height:60px;max-height:42vh;padding-right:4px;";
  dialog.appendChild(listadoEl);

  /* Zona de upload */
  const sepUpload = document.createElement("div");
  sepUpload.style.cssText = "height:1px;background:var(--border);margin:12px 0;flex-shrink:0;";
  dialog.appendChild(sepUpload);

  const uploadLabel = document.createElement("p");
  uploadLabel.className     = "formLabel";
  uploadLabel.style.cssText = "margin-bottom:6px;flex-shrink:0;";
  uploadLabel.textContent   = "Adjuntar nuevo archivo (.txt)";
  dialog.appendChild(uploadLabel);

  const uploadZoneEl = document.createElement("div");
  uploadZoneEl.id           = "adjuntosGestionUpload";
  uploadZoneEl.style.flexShrink = "0";
  dialog.appendChild(uploadZoneEl);

  /* Footer con botón cerrar */
  const footer = document.createElement("div");
  footer.className     = "formActions";
  footer.style.cssText = "margin-top:16px;flex-shrink:0;";

  const btnCerrar = document.createElement("button");
  btnCerrar.className   = "button button--success";
  btnCerrar.type        = "button";
  btnCerrar.textContent = "Cerrar";
  btnCerrar.addEventListener("click", () => {
    closeModal(overlay, null);
  });

  footer.appendChild(btnCerrar);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeModal(overlay, null);
  });
  overlay.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal(overlay, null);
  });

  document.body.appendChild(overlay);
}

/**
 * Abre el modal de gestión de adjuntos para una entidad concreta.
 *
 * @param {string}   tipo         - "clientes" o "adopciones"
 * @param {number}   idEntidad    - id del cliente o adopción
 * @param {string}   subtitulo    - texto descriptivo (ej: nombre del cliente)
 * @param {Function} onCambio     - callback para actualizar el badge del botón 📎
 */
function abrirModalAdjuntos(tipo, idEntidad, subtitulo, onCambio) {
  asegurarModalAdjuntos();

  const modalNode   = document.getElementById("adjuntosGestionModal");
  const subtituloEl = document.getElementById("adjuntosGestionSubtitulo");
  const listadoEl   = document.getElementById("adjuntosGestionListado");
  const uploadZone  = document.getElementById("adjuntosGestionUpload");

  /* Actualizar subtítulo */
  subtituloEl.textContent = subtitulo;

  /* Renderizar listado actual */
  renderizarAdjuntos(tipo, idEntidad, listadoEl, () => {
    if (typeof onCambio === "function") onCambio();
  });

  /* Zona de upload: re-crear cada vez para limpiar estado anterior */
  uploadZone.textContent = "";
  const { wrapper, resetInput } = crearZonaUpload((archivo) => {
    adjuntarArchivoTxt(archivo, tipo, idEntidad, (nombre) => {
      resetInput();
      renderizarAdjuntos(tipo, idEntidad, listadoEl, () => {
        if (typeof onCambio === "function") onCambio();
      });
      if (typeof onCambio === "function") onCambio();
      showToast({
        toastNode: document.getElementById("toast"),
        message: `📎 "${nombre}" adjuntado correctamente.`,
      });
    });
  });
  uploadZone.appendChild(wrapper);

  openModal(modalNode, modalNode.querySelector(".button--success"));
}

/* ============================================================
   EXTENSIÓN: LISTAR CLIENTES — añade adjuntos por fila
   ============================================================ */

/**
 * Versión extendida del renderListClients original.
 * Agrega en cada fila del listado un botón "📎 Adjuntos" que
 * despliega/oculta los archivos TXT del cliente.
 *
 * NOTA: esta función reemplaza renderListClients en el scope global
 * al final de este archivo (después de que librerias.js la define).
 */
function renderListClientsConAdjuntos() {
  if (!listClientsUiContext) return;

  const sortKey       = listClientsUiContext.sortSelect?.value ?? "identificacion";
  const rawSearch     = listClientsUiContext.searchInput?.value ?? "";
  const sanitized     = sanitizeGeneralText(rawSearch, 80);
  const searchUpper   = sanitized.toLocaleUpperCase("es-CO");
  const searchDigits  = sanitizeDigitsOnly(sanitized, 20);

  const filteredClientes = clientes.filter((c) => {
    if (!sanitized) return true;
    const idStr    = String(c?.identificacion ?? "");
    const nomStr   = String(c?.nombres ?? "");
    return (searchDigits && idStr.includes(searchDigits))
        || (searchUpper  && nomStr.toLocaleUpperCase("es-CO").includes(searchUpper));
  });

  const sortedClientes = filteredClientes.slice().sort((a, b) => {
    if (sortKey === "identificacion") return (Number(a.identificacion) || 0) - (Number(b.identificacion) || 0);
    if (sortKey === "email")          return String(a.email ?? "").localeCompare(String(b.email ?? ""), "es");
    return String(a.nombres ?? "").localeCompare(String(b.nombres ?? ""), "es", { sensitivity: "base" });
  });

  const listNode = listClientsUiContext.listNode;
  if (!listNode) return;
  listNode.textContent = "";

  if (sortedClientes.length === 0) {
    const emptyItem = document.createElement("div");
    emptyItem.className   = "clientsTable__empty";
    emptyItem.textContent = "No hay clientes registrados o no hay coincidencias.";
    listNode.appendChild(emptyItem);
    return;
  }

  /* Cabecera */
  const headerRow = document.createElement("div");
  headerRow.className = "clientsTable__header";
  headerRow.setAttribute("role", "row");
  ["ID", "Identificación", "Nombres", "Email", "Depto.", "Municipio", "Barrio", "Dirección", "WhatsApp", "Teléfono"].forEach((txt) => {
    const cell = document.createElement("div");
    cell.className = "clientsTable__cell";
    cell.setAttribute("role", "columnheader");
    cell.textContent = txt;
    headerRow.appendChild(cell);
  });
  listNode.appendChild(headerRow);

  sortedClientes.forEach((c) => {
    /* Fila de datos */
    const rowNode = document.createElement("div");
    rowNode.className = "clientsTable__row";
    rowNode.setAttribute("role", "row");

    /* Primera celda: ID + botón adjuntos */
    const idCell = document.createElement("div");
    idCell.className = "clientsTable__cell";
    idCell.setAttribute("role", "cell");
    idCell.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:4px;overflow:visible;";

    const idSpan = document.createElement("span");
    idSpan.textContent = String(c?.idCliente ?? "");
    idSpan.style.fontWeight = "700";

    const btnAdj = document.createElement("button");
    btnAdj.type      = "button";
    btnAdj.className = "adjunto-pill";

    function actualizarBadgeCliente() {
      const n = getAdjuntosPorEntidad("clientes", c.idCliente).length;
      btnAdj.textContent = "";
      btnAdj.appendChild(document.createTextNode(n > 0 ? `📎 ${n}` : "📎 adjuntar"));
      btnAdj.classList.toggle("adjunto-pill--active", n > 0);
    }
    actualizarBadgeCliente();

    btnAdj.addEventListener("click", () => {
      abrirModalAdjuntos(
        "clientes",
        c.idCliente,
        `${c.nombres}  ·  ID ${c.identificacion}`,
        actualizarBadgeCliente
      );
    });

    idCell.appendChild(idSpan);
    idCell.appendChild(btnAdj);
    rowNode.appendChild(idCell);

    /* Resto de columnas */
    [
      String(c?.identificacion  ?? ""),
      String(c?.nombres         ?? ""),
      String(c?.email           ?? ""),
      getDepartamentoNombreById(c?.idDepartamento),
      getMunicipioNombreById(c?.idMunicipio),
      getBarrioNombreById(c?.idBarrio),
      String(c?.direccion       ?? ""),
      String(c?.whatsapp        ?? ""),
      c?.telefono ? String(c.telefono) : "",
    ].forEach((val) => {
      const cell = document.createElement("div");
      cell.className = "clientsTable__cell";
      cell.setAttribute("role", "cell");
      cell.textContent = val;
      rowNode.appendChild(cell);
    });

    listNode.appendChild(rowNode);
  });
}

/* ============================================================
   EXTENSIÓN: LISTAR ADOPCIONES — añade adjuntos por fila
   ============================================================ */

/**
 * Versión extendida de renderListAdopciones.
 * Agrega columna de archivos adjuntos en el listado de adopciones.
 */
function renderListAdopcionesConAdjuntos() {
  if (!listAdopcionesUiContext) return;

  const sortBy     = listAdopcionesUiContext.sortSelect.value;
  const searchTerm = listAdopcionesUiContext.searchInput.value.trim().toLowerCase();
  const listNode   = listAdopcionesUiContext.listNode;

  let rows = adopciones.map((a) => {
    const ma       = mascotasAdoptadas.find((m) => m.idAdopcion === a.idAdopcion);
    const mascota  = ma ? mascotas.find((m) => m.idMascota === ma.idMascota) : null;
    const cliente  = clientes.find((c) => c.idCliente === a.idCliente);
    return {
      ...a,
      clienteNombre: cliente  ? (cliente.nombres || cliente.nombre || "—") : "—",
      mascotaNombre: mascota  ? mascota.nombre   : "—",
      idMascota:     ma       ? ma.idMascota      : null,
    };
  });

  if (searchTerm) {
    rows = rows.filter((r) =>
      r.clienteNombre.toLowerCase().includes(searchTerm) ||
      r.mascotaNombre.toLowerCase().includes(searchTerm)
    );
  }

  rows.sort((a, b) => {
    if (sortBy === "fecha")   return b.fechaAdopcion.localeCompare(a.fechaAdopcion);
    if (sortBy === "cliente") return a.clienteNombre.localeCompare(b.clienteNombre, "es-CO");
    if (sortBy === "mascota") return a.mascotaNombre.localeCompare(b.mascotaNombre, "es-CO");
    return 0;
  });

  listNode.textContent = "";

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className    = "formHelp";
    empty.style.padding = "16px";
    setSafeText(empty, "No se encontraron adopciones.");
    listNode.appendChild(empty);
    setSafeText(listAdopcionesUiContext.countBadge, "#Adopciones 0000");
    return;
  }

  /* Cabecera: sin columna extra, el botón va dentro de la celda ID */
  const headerRow = document.createElement("div");
  headerRow.className   = "adopcion-row";
  headerRow.setAttribute("role", "row");
  headerRow.style.cssText = "font-weight:700;border-bottom:2px solid var(--primary);";

  ["ID", "Cliente", "Mascota", "Fecha"].forEach((lbl) => {
    const cell = document.createElement("div");
    cell.setAttribute("role", "columnheader");
    cell.textContent = lbl;
    headerRow.appendChild(cell);
  });
  listNode.appendChild(headerRow);

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className   = "adopcion-row";
    row.setAttribute("role", "row");

    /* Celda ID + botón adjuntos integrado */
    const idCell = document.createElement("div");
    idCell.className = "adopcion-row__id";
    idCell.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:4px;overflow:visible;";

    const idSpan = document.createElement("span");
    setSafeText(idSpan, `#${String(r.idAdopcion).padStart(4, "0")}`);

    const btnAdj = document.createElement("button");
    btnAdj.type = "button";
    btnAdj.className = "adjunto-pill";

    function actualizarBadgeAdopcion() {
      const n = getAdjuntosPorEntidad("adopciones", r.idAdopcion).length;
      btnAdj.textContent = "";
      btnAdj.appendChild(document.createTextNode(n > 0 ? `📎 ${n}` : "📎 adjuntar"));
      btnAdj.classList.toggle("adjunto-pill--active", n > 0);
    }
    actualizarBadgeAdopcion();

    btnAdj.addEventListener("click", () => {
      abrirModalAdjuntos(
        "adopciones",
        r.idAdopcion,
        `Adopción #${String(r.idAdopcion).padStart(4,"0")}  ·  ${r.clienteNombre} → ${r.mascotaNombre}`,
        actualizarBadgeAdopcion
      );
    });

    idCell.appendChild(idSpan);
    idCell.appendChild(btnAdj);

    const clienteCell = document.createElement("div");
    setSafeText(clienteCell, r.clienteNombre);

    const mascotaCell = document.createElement("div");
    setSafeText(mascotaCell, r.mascotaNombre);

    const fechaCell = document.createElement("div");
    setSafeText(fechaCell, r.fechaAdopcion);

    row.appendChild(idCell);
    row.appendChild(clienteCell);
    row.appendChild(mascotaCell);
    row.appendChild(fechaCell);
    listNode.appendChild(row);
  });

  setSafeText(listAdopcionesUiContext.countBadge, `#Adopciones ${String(rows.length).padStart(4, "0")}`);
}

/* ============================================================
   INICIALIZACIÓN Y HOOKS
   ============================================================ */

/**
 * Inicializa el módulo de persistencia.
 *
 * Debe llamarse UNA SOLA VEZ, al final de app.js (o desde un
 * DOMContentLoaded), DESPUÉS de que todos los módulos ya hayan
 * sido inicializados.
 *
 * Pasos:
 *   1. Carga datos guardados desde localStorage.
 *   2. Registra el hook beforeunload para guardar al cerrar/recargar.
 *   3. Parchea confirmLogout para guardar antes de cerrar sesión.
 *   4. Parchea renderListClients y renderListAdopciones con las
 *      versiones que incluyen adjuntos.
 */
function inicializarPersistencia() {
  /* NOTA: cargarDatosDesdeLocalStorage() ya se llamó al inicio de app.js,
     antes de inicializar los módulos. Aquí solo se registran los hooks
     de guardado y se parchean los renderizadores. */

  /* 2. Guardar automáticamente al cerrar o recargar la pestaña */
  window.addEventListener("beforeunload", guardarDatosEnLocalStorage);

  /* 3. Parche de confirmLogout: guardar antes de limpiar la página */
  const confirmLogoutOriginal = typeof confirmLogout === "function" ? confirmLogout : null;
  if (confirmLogoutOriginal) {
    window.confirmLogout = function () {
      guardarDatosEnLocalStorage();
      confirmLogoutOriginal();
    };
  }

  /* 4. Reemplazar renderizadores con versiones que incluyen adjuntos */
  window.renderListClients    = renderListClientsConAdjuntos;
  window.renderListAdopciones = renderListAdopcionesConAdjuntos;

  console.info("AdoptaMascotasApp: persistencia inicializada ✅");
}
