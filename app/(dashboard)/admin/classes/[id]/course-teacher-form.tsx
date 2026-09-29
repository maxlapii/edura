"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Select } from "@/components/ui";

export function CourseTeacherForm({ courseId, teacherId, teachers }: { courseId: string; teacherId: string; teachers: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const [value, setValue] = useState(teacherId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (value === teacherId) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/courses/${courseId}`, { method: "PATCH", json: { teacherId: value } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="course-teacher-form" className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <Select name="teacherId" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-56 py-0 text-xs" aria-label="Teacher">
          {teachers.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="outline" disabled={loading || value === teacherId} data-testid="submit">
          Change
        </Button>
      </span>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
