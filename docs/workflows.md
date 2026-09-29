# Workflows & automation

## Engine

`lib/workflows/engine.ts` — `dispatch(trigger, schoolId, payload)`:

1. load active `WorkflowRule`s for the school + trigger,
2. evaluate `conditions` (`{ all?: Condition[], any?: Condition[] }`, ops `eq neq gt gte lt lte in nin contains exists truthy`
   on dotted payload paths),
3. execute `actions` in order,
4. record a `WorkflowRun` (SUCCESS / SKIPPED / FAILED) with the payload and results.

Templates in action params use `{{dotted.path}}` placeholders from the payload.

### Triggers

`ATTENDANCE_RECORDED` (per absent student), `ABSENCE_THRESHOLD_REACHED`, `GRADE_MISSING`, `ASSIGNMENT_OVERDUE`,
`LEAVE_REQUESTED`, `LEAVE_APPROVED`, `CERTIFICATION_EXPIRING`, `TASK_OVERDUE`, `MEETING_COMPLETED`,
`EVENT_CREATED`, `MAINTENANCE_CREATED`.

### Actions

| Action              | Params                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| `SEND_NOTIFICATION` | `to` (recipients), `type`, `title`, `body`, `link`, `email: true` to also mail |
| `SEND_EMAIL`        | `to`, `subject`, `body`                                                       |
| `CREATE_TASK`       | `assignee`, `title`, `description`, `dueInDays`, `priority`                   |
| `CREATE_ALERT`      | like `SEND_NOTIFICATION` with type ALERT (dashboards surface these)          |
| `REQUEST_APPROVAL`  | `approvalType`, `entityType`, `title`, `requester`                            |

Recipients: `"admins"`, `"payload.<field>"` (a user id or array), `"user:<id>"`, or an array of these.

### Default rules

Installed for every new school (`lib/workflows/defaults.ts`, editable under Admin → Automation rules):
absence → notify guardians (email); repeated absence → alert admins + homeroom task; leave requested → notify
admins; leave approved → notify requester; certification expiring → notify + task; grade missing → reminder +
task; assignment overdue → notify student/guardians; task overdue → reminder and escalation after 3 days;
meeting completed → minutes notification; maintenance created → notify maintenance staff; event created → notify
admins.

## Approvals

`Approval` rows (`LEAVE`, `EVENT`, `TRIP`, `RESOURCE_REQUEST`, `PURCHASE_REQUEST`, `REPORT_CARD`,
`SPECIAL_ACTIVITY`) carry requester, approver, status, decision date and comment; `decideApproval` routes the
decision to the owning module (leave review, event scheduling) and the audit log keeps the history.

## Scheduled jobs

`lib/jobs/index.ts` — idempotent daily jobs recorded in `JobRun`: `overdue-assignments`, `overdue-tasks`,
`certification-expiry`, `grade-reminders`, `leave-status-sync`, `meeting-reminders`, `substitution-completion`.

Run them with `pnpm jobs:run [name]` from cron, or `POST /api/jobs?job=<name>` with
`Authorization: Bearer $CRON_SECRET` (or as an authenticated administrator). Example crontab:

```
0 6 * * * cd /srv/edura && pnpm jobs:run >> /var/log/edura-jobs.log 2>&1
```
