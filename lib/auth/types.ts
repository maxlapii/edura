import type { Role } from "@/generated/prisma/enums";

/** The authenticated principal used across services and API handlers. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  schoolId: string | null;
  isActive: boolean;
  /** Profile ids resolved from the role-specific tables. */
  teacherId?: string | null;
  staffId?: string | null;
  studentId?: string | null;
  guardianId?: string | null;
  /** Department scope for DEPARTMENT_HEAD (and teachers). */
  departmentId?: string | null;
}
