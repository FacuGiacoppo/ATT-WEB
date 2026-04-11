/**
 * Servicio de cumplimentación de obligaciones/tareas.
 * Guarda trazabilidad en la colección `cumplimientos` y actualiza el estado
 * de la operación en Firestore.
 */
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from "../../config/firebase.js";
import { updateOperacion } from "./operaciones.service.js";

const CUMPLIMIENTOS_COL = "cumplimientos";

/**
 * Registra el cumplimiento de una operación.
 *
 * @param {string} operacionId
 * @param {object} data
 * @param {string} data.clienteId
 * @param {string} data.clienteNombre
 * @param {string} data.obligacion
 * @param {string} data.periodo
 * @param {string} data.fechaCumplimiento   YYYY-MM-DD
 * @param {string} data.comentarioInterno
 * @param {boolean} data.requiereEnvio
 * @param {Array}  data.destinatarios       [{ contactoId, nombre, email }]
 * @param {string} data.asunto
 * @param {string} data.cuerpo
 * @param {string} data.cumplidoPor         nombre o email del usuario
 * @param {string} nuevoEstado              Estado a asignar a la operacion (también se guarda en el doc. de cumplimiento como estadoOperacion)
 */
export async function saveCumplimiento(operacionId, data, nuevoEstado) {
  // 1. Guardar registro de trazabilidad
  await addDoc(collection(db, CUMPLIMIENTOS_COL), {
    operacionId,
    clienteId:         data.clienteId      ?? "",
    clienteNombre:     data.clienteNombre  ?? "",
    obligacion:        data.obligacion     ?? "",
    periodo:           data.periodo        ?? "",
    fechaCumplimiento: data.fechaCumplimiento,
    estadoOperacion:   nuevoEstado ?? "",
    comentarioInterno: data.comentarioInterno ?? "",
    requiereEnvio:     data.requiereEnvio  ?? false,
    destinatarios:     data.destinatarios  ?? [],
    asunto:            data.asunto         ?? "",
    cuerpo:            data.cuerpo         ?? "",
    cumplidoPor:       data.cumplidoPor    ?? "",
    createdAt:         serverTimestamp()
  });

  // 2. Actualizar estado de la operacion
  await updateOperacion(operacionId, {
    estado:            nuevoEstado,
    fechaCumplimiento: data.fechaCumplimiento,
    comentarioInterno: data.comentarioInterno ?? "",
    requiereEnvio:     data.requiereEnvio ?? false
  });
}
