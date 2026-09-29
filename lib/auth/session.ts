import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./index";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/utils/errors";
import type { AuthUser } from "./types";

/** Loads the full AuthUser (role-specific profile ids included) for a user id. */
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teacher: { select: { id: true, departmentId: true, headOfDepartment: { select: { id: true } } } },
      staff: { select: { id: true, departmentId: true } },
      student: { select: { id: true } },
      guardian: { select: { id: true } },
    },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    schoolId: user.schoolId,
    isActive: user.isActive,
    teacherId: user.teacher?.id ?? null,
    staffId: user.staff?.id ?? null,
    studentId: user.student?.id ?? null,
    guardianId: user.guardian?.id ?? null,
    departmentId: user.teacher?.headOfDepartment?.id ?? user.teacher?.departmentId ?? user.staff?.departmentId ?? null,
  };
}

/** Resolves the current session's user from request headers (Route Handlers). */
export async function getAuthUserFromHeaders(h: Headers): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) return null;
  return loadAuthUser(session.user.id);
}

/** Cached per-request accessor for Server Components. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  return getAuthUserFromHeaders(await headers());
});

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw AppError.unauthorized();
  return user;
}
