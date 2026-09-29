import type { WorkflowTrigger } from "@/generated/prisma/enums";
import type { Action, Conditions } from "./rules";

export interface DefaultRule {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  conditions: Conditions;
  actions: Action[];
}

/** Rules installed for every new school. Administrators can edit or disable them. */
export const DEFAULT_WORKFLOW_RULES: DefaultRule[] = [
  {
    name: "Notify parents when a student is absent",
    description: "Sends an in-app + email notification to the student's guardians when marked ABSENT.",
    trigger: "ATTENDANCE_RECORDED",
    conditions: { all: [{ field: "status", op: "eq", value: "ABSENT" }] },
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "payload.guardianUserIds",
          type: "STUDENT_ABSENT",
          title: "{{studentName}} was absent from {{courseName}}",
          body: "{{studentName}} was marked absent on {{date}} in {{courseName}}.",
          link: "/students/{{studentId}}",
          email: true,
        },
      },
    ],
  },
  {
    name: "Alert on repeated absences",
    description: "Alerts administrators and the homeroom teacher when a student reaches the absence threshold.",
    trigger: "ABSENCE_THRESHOLD_REACHED",
    conditions: {},
    actions: [
      {
        type: "CREATE_ALERT",
        params: {
          to: ["admins", "payload.homeroomTeacherUserId"],
          type: "ABSENCE_THRESHOLD",
          title: "Repeated absences: {{studentName}}",
          body: "{{studentName}} has {{absenceCount}} absences in the last {{windowDays}} days.",
          link: "/students/{{studentId}}",
        },
      },
      {
        type: "CREATE_TASK",
        params: {
          assignee: "payload.homeroomTeacherUserId",
          title: "Follow up on absences: {{studentName}}",
          dueInDays: 3,
          priority: "HIGH",
        },
      },
    ],
  },
  {
    name: "Notify administrators of leave requests",
    description: "Administrators are notified when a teacher submits a leave request.",
    trigger: "LEAVE_REQUESTED",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "admins",
          type: "LEAVE_REQUESTED",
          title: "Leave request from {{requesterName}}",
          body: "{{requesterName}} requested {{leaveType}} leave from {{startDate}} to {{endDate}}.",
          link: "/admin/leave/{{leaveRequestId}}",
        },
      },
    ],
  },
  {
    name: "Notify teacher when leave is approved",
    description: "The requester is notified with the decision.",
    trigger: "LEAVE_APPROVED",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "payload.requesterUserId",
          type: "LEAVE_APPROVED",
          title: "Your leave request was approved",
          body: "Leave from {{startDate}} to {{endDate}} was approved. {{affectedLessons}} lesson(s) need cover.",
          link: "/leave/{{leaveRequestId}}",
          email: true,
        },
      },
    ],
  },
  {
    name: "Remind teachers of expiring certifications",
    description: "Creates a reminder task and notifies the teacher and administrators 30 days before expiry.",
    trigger: "CERTIFICATION_EXPIRING",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: ["payload.teacherUserId", "admins"],
          type: "CERTIFICATION_EXPIRING",
          title: "Certification expiring: {{certificationName}}",
          body: "{{certificationName}} for {{teacherName}} expires on {{expiresAt}}.",
          link: "/teachers/{{teacherId}}",
          email: true,
        },
      },
      {
        type: "CREATE_TASK",
        params: {
          assignee: "payload.teacherUserId",
          title: "Renew certification: {{certificationName}}",
          dueInDays: 14,
          priority: "HIGH",
        },
      },
    ],
  },
  {
    name: "Grade submission reminder",
    description: "Notifies the teacher and creates a task when grades are missing near a deadline.",
    trigger: "GRADE_MISSING",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "payload.teacherUserId",
          type: "GRADE_REMINDER",
          title: "Grades pending: {{courseName}}",
          body: "{{pendingCount}} submission(s) in {{courseName}} are waiting to be graded.",
          link: "/assignments/{{assignmentId}}",
        },
      },
      {
        type: "CREATE_TASK",
        params: {
          assignee: "payload.teacherUserId",
          title: "Grade {{courseName}}: {{assignmentTitle}}",
          dueInDays: 2,
          priority: "MEDIUM",
        },
      },
    ],
  },
  {
    name: "Overdue assignment notice",
    description: "Notifies students and guardians about assignments not submitted by the due date.",
    trigger: "ASSIGNMENT_OVERDUE",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: ["payload.studentUserId", "payload.guardianUserIds"],
          type: "ASSIGNMENT_OVERDUE",
          title: "Overdue: {{assignmentTitle}}",
          body: "{{studentName}} has not submitted {{assignmentTitle}} ({{courseName}}), due {{dueDate}}.",
          link: "/assignments/{{assignmentId}}",
        },
      },
    ],
  },
  {
    name: "Overdue task reminder",
    description: "Reminds the assignee about overdue tasks and escalates to administrators after 3 days.",
    trigger: "TASK_OVERDUE",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "payload.assigneeUserId",
          type: "TASK_OVERDUE",
          title: "Overdue task: {{taskTitle}}",
          body: "The task \"{{taskTitle}}\" was due on {{dueDate}}.",
          link: "/tasks",
        },
      },
    ],
  },
  {
    name: "Escalate long-overdue tasks",
    description: "Administrators are alerted when a task is more than 3 days overdue.",
    trigger: "TASK_OVERDUE",
    conditions: { all: [{ field: "daysOverdue", op: "gte", value: 3 }] },
    actions: [
      {
        type: "CREATE_ALERT",
        params: {
          to: "admins",
          type: "TASK_OVERDUE",
          title: "Escalation: {{taskTitle}} ({{daysOverdue}} days overdue)",
          body: "Assigned to {{assigneeName}}.",
          link: "/admin/tasks",
        },
      },
    ],
  },
  {
    name: "Notify participants when meeting minutes are published",
    description: "Participants receive the minutes and any action items assigned to them.",
    trigger: "MEETING_COMPLETED",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "payload.participantUserIds",
          type: "MEETING_REMINDER",
          title: "Minutes available: {{meetingTitle}}",
          link: "/meetings/{{meetingId}}",
        },
      },
    ],
  },
  {
    name: "Notify maintenance staff of new requests",
    description: "Maintenance staff and administrators are notified when a request is created.",
    trigger: "MAINTENANCE_CREATED",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: ["payload.maintenanceStaffUserIds", "admins"],
          type: "MAINTENANCE_CREATED",
          title: "New maintenance request: {{title}}",
          body: "{{category}} – priority {{priority}}",
          link: "/maintenance/{{maintenanceRequestId}}",
        },
      },
    ],
  },
  {
    name: "Notify administrators of new events",
    description: "Administrators are notified when a new event is created.",
    trigger: "EVENT_CREATED",
    conditions: {},
    actions: [
      {
        type: "SEND_NOTIFICATION",
        params: {
          to: "admins",
          type: "EVENT_CREATED",
          title: "New event: {{title}}",
          body: "{{type}} on {{startsAt}} organised by {{organizerName}}.",
          link: "/events/{{eventId}}",
        },
      },
    ],
  },
];
