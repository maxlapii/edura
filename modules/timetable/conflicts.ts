/**
 * Pure timetable conflict detection. A slot is (dayOfWeek, periodId) plus the
 * teacher / class / room it occupies.
 */
export interface SlotLike {
  id?: string;
  teacherId: string;
  classId: string;
  roomId?: string | null;
  dayOfWeek: number;
  periodId: string;
}

export type ConflictType = "TEACHER" | "CLASS" | "ROOM";

export interface Conflict {
  type: ConflictType;
  slotId?: string;
  message: string;
}

export function sameTime(a: Pick<SlotLike, "dayOfWeek" | "periodId">, b: Pick<SlotLike, "dayOfWeek" | "periodId">): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.periodId === b.periodId;
}

/** Returns every conflict `candidate` would create against `existing` (excluding itself by id). */
export function findConflicts(existing: SlotLike[], candidate: SlotLike): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const slot of existing) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (!sameTime(slot, candidate)) continue;
    if (slot.teacherId === candidate.teacherId) {
      conflicts.push({ type: "TEACHER", slotId: slot.id, message: "Teacher already has a lesson at this time" });
    }
    if (slot.classId === candidate.classId) {
      conflicts.push({ type: "CLASS", slotId: slot.id, message: "Class already has a lesson at this time" });
    }
    if (candidate.roomId && slot.roomId && slot.roomId === candidate.roomId) {
      conflicts.push({ type: "ROOM", slotId: slot.id, message: "Room is already booked at this time" });
    }
  }
  return conflicts;
}

/** Validates a whole set of slots (e.g. a bulk import) and returns conflicts by index. */
export function findConflictsInSet(slots: SlotLike[]): Array<{ index: number; conflicts: Conflict[] }> {
  const out: Array<{ index: number; conflicts: Conflict[] }> = [];
  slots.forEach((slot, index) => {
    const others = slots.filter((_, i) => i < index);
    const conflicts = findConflicts(others, slot);
    if (conflicts.length) out.push({ index, conflicts });
  });
  return out;
}
