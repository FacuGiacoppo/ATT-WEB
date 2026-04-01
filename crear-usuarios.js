/**
 * Script para crear los usuarios del estudio en Firebase Auth + Firestore.
 *
 * INSTRUCCIONES:
 * 1. Descargá tu Service Account Key desde Firebase Console:
 *    → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
 *    → Guardala como "serviceAccountKey.json" en esta misma carpeta.
 *
 * 2. Instalá las dependencias (solo una vez):
 *    npm init -y && npm install firebase-admin
 *
 * 3. Ejecutá:
 *    node crear-usuarios.js
 *
 * NOTA: Facundo Giacoppo ya existe en Auth.
 * Para él solo se actualiza/crea el perfil en Firestore (no se toca su Auth account).
 * Los demás se crean en Auth con contraseña temporal y en Firestore con su rol.
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(readFileSync("./serviceAccountKey.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

// ─── Equipo del estudio ────────────────────────────────────────────────────────
const USUARIOS = [
  {
    email: "facundogiacoppo@outlook.com", // ← tu email real de Firebase
    name: "Facundo Giacoppo",
    role: "superadmin",
    soloFirestore: true, // ya existe en Auth, solo actualizamos Firestore
  },
  {
    email: "ramiro.joya@estudiott.com.ar", // ← cambiá por el email real
    name: "Ramiro Joya",
    role: "admin",
    soloFirestore: false,
  },
  {
    email: "rosa.herrera@estudiott.com.ar", // ← cambiá por el email real
    name: "Rosa Herrera",
    role: "admin",
    soloFirestore: false,
  },
  {
    email: "marcos.hinojosa@estudiott.com.ar", // ← cambiá por el email real
    name: "Marcos Hinojosa",
    role: "colaborador",
    soloFirestore: false,
  },
  {
    email: "jose.garzon@estudiott.com.ar", // ← cambiá por el email real
    name: "Jose Garzon",
    role: "colaborador",
    soloFirestore: false,
  },
];

const CONTRASENA_TEMPORAL = "EstudioATT2026!"; // cada usuario deberá cambiarla

async function crearUsuario(u) {
  let uid;

  if (u.soloFirestore) {
    // Buscar UID existente por email
    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      console.log(`✅ [Auth] ${u.name} ya existe → uid: ${uid}`);
    } catch {
      console.error(`❌ No se encontró el usuario Auth con email: ${u.email}`);
      return;
    }
  } else {
    // Crear en Firebase Auth
    try {
      const newUser = await auth.createUser({
        email: u.email,
        password: CONTRASENA_TEMPORAL,
        displayName: u.name,
      });
      uid = newUser.uid;
      console.log(`✅ [Auth] ${u.name} creado → uid: ${uid}`);
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        const existing = await auth.getUserByEmail(u.email);
        uid = existing.uid;
        console.log(`⚠️  [Auth] ${u.name} ya existía → uid: ${uid}`);
      } else {
        console.error(`❌ [Auth] Error con ${u.name}:`, err.message);
        return;
      }
    }
  }

  // Crear / actualizar perfil en Firestore
  await db.collection("users").doc(uid).set(
    {
      name: u.name,
      email: u.email,
      role: u.role,
      active: true,
      mustChangePassword: !u.soloFirestore,
    },
    { merge: true }
  );

  console.log(`✅ [Firestore] Perfil de ${u.name} guardado con rol: ${u.role}`);
}

async function main() {
  console.log("\n🚀 Creando usuarios del estudio...\n");
  for (const u of USUARIOS) {
    await crearUsuario(u);
  }
  console.log(`\n🎉 Listo. Contraseña temporal: "${CONTRASENA_TEMPORAL}"`);
  console.log("   Cada integrante debe cambiarla en el primer acceso.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error general:", err);
  process.exit(1);
});
