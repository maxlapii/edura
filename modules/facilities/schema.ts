import { z } from "zod";
import { dateOnlySchema, timeSchema } from "@/lib/validation";

// ───────────── Rooms ─────────────

export const roomTypeSchema = z.enum(["CLASSROOM", "LAB", "MEETING", "LIBRARY", "SPORTS", "OFFICE", "OTHER"]);

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30),
  type: roomTypeSchema.default("CLASSROOM"),
  capacity: z.coerce.number().int().min(0).max(10000).optional().nullable(),
  building: z.string().trim().max(120).optional().nullable(),
  responsibleUserId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  schoolId: z.string().optional(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = createRoomSchema.omit({ schoolId: true }).partial();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const listRoomsSchema = z.object({
  type: roomTypeSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
  schoolId: z.string().optional(),
});
export type ListRoomsQuery = z.infer<typeof listRoomsSchema>;

export const roomAvailabilitySchema = z.object({
  date: dateOnlySchema.optional(),
});
export type RoomAvailabilityQuery = z.infer<typeof roomAvailabilitySchema>;

// ───────────── Bookings ─────────────

export const createBookingSchema = z
  .object({
    roomId: z.string().min(1),
    date: dateOnlySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    purpose: z.string().trim().max(500).optional().nullable(),
  })
  .refine((b) => b.startTime < b.endTime, { message: "startTime must be before endTime", path: ["endTime"] });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const listBookingsSchema = z.object({
  roomId: z.string().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: z.enum(["CONFIRMED", "CANCELLED"]).optional(),
});
export type ListBookingsQuery = z.infer<typeof listBookingsSchema>;

// ───────────── Equipment ─────────────

export const createEquipmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  roomId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0).max(100000).default(1),
  status: z.string().trim().min(1).max(40).default("OK"),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = createEquipmentSchema.partial();
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

export const listEquipmentSchema = z.object({
  roomId: z.string().optional(),
  status: z.string().trim().max(40).optional(),
});
export type ListEquipmentQuery = z.infer<typeof listEquipmentSchema>;

// ───────────── Maintenance ─────────────

export const maintenanceCategorySchema = z.enum(["PROJECTOR", "AIR_CONDITIONING", "COMPUTER", "FURNITURE", "ROOM", "CLEANING", "OTHER"]);
export const maintenancePrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export const maintenanceStatusSchema = z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

export const createMaintenanceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: maintenanceCategorySchema.default("OTHER"),
  description: z.string().trim().max(5000).optional().nullable(),
  roomId: z.string().optional().nullable(),
  priority: maintenancePrioritySchema.default("NORMAL"),
  dueDate: z.coerce.date().optional().nullable(),
});
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;

export const updateMaintenanceSchema = createMaintenanceSchema.partial();
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;

export const assignMaintenanceSchema = z.object({
  assignedToUserId: z.string().min(1),
});
export type AssignMaintenanceInput = z.infer<typeof assignMaintenanceSchema>;

export const maintenanceStatusChangeSchema = z.object({
  status: maintenanceStatusSchema,
  resolutionNote: z.string().trim().max(5000).optional().nullable(),
});
export type MaintenanceStatusChangeInput = z.infer<typeof maintenanceStatusChangeSchema>;

export const listMaintenanceSchema = z.object({
  status: maintenanceStatusSchema.optional(),
  priority: maintenancePrioritySchema.optional(),
  assignedToUserId: z.string().optional(),
  mine: z.enum(["true", "false"]).optional(),
});
export type ListMaintenanceQuery = z.infer<typeof listMaintenanceSchema>;
