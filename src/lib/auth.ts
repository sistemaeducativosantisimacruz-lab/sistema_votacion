import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const secretKey = process.env.JWT_SECRET;
if (!secretKey) {
  throw new Error("Missing JWT_SECRET environment variable");
}
const key = new TextEncoder().encode(secretKey);

export type UserSession = {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  grado: string;
  seccion: string;
  nivel: string;
  rol?: string; // admin roles
  cargo?: string;
};

export async function signToken(payload: any, expiresIn: string = "24h") {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    return payload as UserSession;
  } catch (error) {
    return null;
  }
}

export async function setVoterSession(user: UserSession) {
  const token = await signToken(user, "2h"); // Votante sesion expira pronto
  const cookieStore = await cookies();
  cookieStore.set("voter_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 horas
  });
}

export async function setAdminSession(user: UserSession) {
  const token = await signToken(user, "24h");
  const cookieStore = await cookies();
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 horas
  });
}

export async function clearVoterSession() {
  const cookieStore = await cookies();
  cookieStore.delete("voter_session");
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
}

export async function getVoterSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("voter_session")?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) return null;
  const session = await verifyToken(token);
  if (!session?.rol) return null; // Debe tener un rol de admin
  return session;
}
