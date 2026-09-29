# Edura — Lightweight School & Teacher Management Platform

Build **Edura**, a lightweight, practical school management platform focused primarily on:

1. Teacher management and productivity
2. School administration
3. Academic operations
4. Student management
5. Communication
6. Workflow automation
7. Practical AI assistance

The product should be easy for a small or medium-sized school to deploy, maintain, learn, and operate.

---

# 1. Product Philosophy

Edura follows this principle:

> **Enter information once → reuse it everywhere → automate repetitive work → give teachers and administrators useful tools.**

Prioritize operational simplicity over enterprise complexity.

The system should help answer everyday questions such as:

* Which teachers are teaching today?
* Which classes need attention?
* Which teachers are absent?
* Who is covering an absent teacher's class?
* Which teachers have pending grading?
* Which students have repeated absences?
* Which assignments are overdue?
* Which meetings and tasks are coming up?
* Which rooms are available?
* Which maintenance issues remain unresolved?
* Which teachers have excessive workload?
* Which school tasks require follow-up?

---

# 2. Lightweight Technical Stack

Avoid unnecessary infrastructure and microservices.

Use a **modular monolith**.

## Recommended stack

### Frontend

* Next.js
* TypeScript
* React
* Tailwind CSS
* Server-side rendering where useful
* Simple reusable component library

### Backend

Prefer a lightweight API architecture.

Use:

* Next.js API routes / Route Handlers
* TypeScript
* Zod for validation
* Prisma ORM

Do **not** introduce a separate NestJS service unless the application genuinely requires it.

### Database

* PostgreSQL
* Prisma

### Authentication

Use a simple, secure authentication solution compatible with Next.js.

Support:

* Email/password
* Session authentication
* Password reset
* Role-based permissions

Avoid building custom authentication infrastructure unnecessarily.

### Background Jobs

Start without Redis.

Use:

* Database-backed scheduled jobs
* Cron jobs
* Next.js/server scheduled tasks where available

Only introduce Redis/BullMQ when actual workload requires it.

### File Storage

Start with S3-compatible storage or a simple object-storage provider.

Do not build a custom file-storage service.

### Deployment

The initial application should be deployable with:

* Docker
* PostgreSQL
* One application server

Avoid Kubernetes and microservices for the initial version.

---

# 3. Architecture

Use a modular monolith.

Suggested structure:

```text
/app
  /(auth)
  /(dashboard)
  /api

/components
/lib
  /auth
  /db
  /permissions
  /notifications
  /workflows
  /ai
  /reports
  /validation

/modules
  /schools
  /users
  /teachers
  /students
  /classes
  /subjects
  /timetable
  /attendance
  /assignments
  /grades
  /leave
  /substitution
  /meetings
  /events
  /facilities
  /communication
  /workflows
  /reports

/prisma
  schema.prisma
  seed.ts

/tests
  /unit
  /integration
  /e2e

/docs
```

Keep business logic outside UI components.

---

# 4. Testing & Coverage

Testing is a first-class requirement.

Edura should have meaningful test coverage rather than simply having a few example tests.

## Testing stack

Use:

* Vitest for unit tests
* Playwright for end-to-end tests
* React Testing Library for important UI behavior

## Coverage targets

Target:

```text
Overall code coverage: >= 80%

Business logic:
>= 90%

Permission/security logic:
>= 95%

Workflow/automation logic:
>= 90%

Critical API endpoints:
>= 90%
```

Do not chase coverage by writing meaningless tests.

Coverage should focus on real business behavior.

---

# 5. Required Test Categories

## Unit Tests

Test:

* Validation
* Calculations
* Attendance calculations
* Grade calculations
* Teacher workload calculations
* Leave-date calculations
* Substitute eligibility
* Timetable conflict detection
* Permission rules
* Notification rules
* Workflow conditions

## Integration Tests

Test:

* API → database
* Authentication
* Authorization
* CRUD operations
* Workflow execution
* Notifications
* Teacher/student relationships

## End-to-End Tests

Critical user journeys should be tested through the actual UI.

Examples:

```text
Admin creates teacher
→ Assigns teacher to class
→ Teacher sees class
```

```text
Teacher records attendance
→ Attendance saved
→ Statistics updated
→ Notification generated
```

```text
Teacher requests leave
→ Admin approves
→ Substitute identified
→ Timetable updated
→ Notifications sent
```

```text
Teacher creates assignment
→ Student submits
→ Teacher grades
→ Grade appears in student record
```

```text
Admin publishes report card
→ Parent can view report card
```

## Security Tests

Explicitly test:

* Tenant isolation
* Role permissions
* Object-level authorization
* Sensitive student information
* Teacher access restrictions
* Parent access restrictions
* API authorization

CI should fail when coverage drops below configured thresholds.

---

# 6. User Roles

Support:

```text
SUPER_ADMIN
SCHOOL_ADMIN
PRINCIPAL
DEPARTMENT_HEAD
TEACHER
STUDENT
PARENT
STAFF
```

Keep permissions simple and understandable.

Use:

```text
Role
+
Permission
+
School scope
+
Optional department scope
```

---

# 7. Teacher Management — Major Focus

Teacher management should be one of the most important parts of Edura.

## Teacher Profile

Store:

* Name
* Contact information
* Employee number
* Employment type
* Hire date
* Department
* Position
* Subjects
* Qualifications
* Certifications
* Documents
* Emergency contact
* Availability
* Status

Teacher statuses:

```text
ACTIVE
ON_LEAVE
SUSPENDED
INACTIVE
```

---

# 8. Teacher Workload Management

Edura should automatically calculate teacher workload.

Track:

* Teaching periods
* Classes
* Subjects
* Preparation periods
* Homeroom responsibilities
* Meetings
* Duties
* Substitution periods
* Leave
* Extra assignments

Dashboard:

```text
Weekly teaching periods
Classes
Preparation periods
Substitution periods
Meetings
Other duties
Total workload
```

Allow administrators to identify:

* Overloaded teachers
* Underutilized teachers
* Teachers with many substitutions
* Uneven department workload

Do not automatically make employment/performance decisions based on AI-generated scores.

---

# 9. Teacher Availability

Allow teachers to maintain availability information.

Examples:

```text
Available
Unavailable
Preferred teaching time
Unavailable periods
Preferred substitution periods
```

Use this information when suggesting substitute teachers.

---

# 10. Teacher Leave Management

Teacher workflow:

```text
Teacher
→ Submit Leave Request
→ Admin Review
→ Check Timetable
→ Identify Affected Classes
→ Find Substitute
→ Approve
→ Notify
```

The system should automatically show:

* Affected classes
* Number of lessons affected
* Students affected
* Suggested substitutes
* Substitute conflicts
* Teacher workload impact

---

# 11. Substitute Teacher Management

Create a dedicated substitute workflow.

The system should find eligible substitutes based on:

1. Availability
2. Timetable conflict
3. Subject compatibility
4. Department
5. Current workload
6. School rules

Show administrators a transparent list of candidates.

Do not let AI secretly determine assignments.

---

# 12. Teacher Daily Dashboard

The teacher homepage should answer:

> **What do I need to do today?**

Show:

* Today's classes
* Next class
* Attendance to complete
* Assignments to grade
* Missing submissions
* Lesson plans
* Upcoming meetings
* School announcements
* Pending tasks
* Leave status
* Substitution assignments
* Important notifications

---

# 13. Teacher Schedule

Provide:

* Daily schedule
* Weekly schedule
* Monthly calendar
* Class details
* Room
* Subject
* Student count
* Substitute information

Allow teachers to quickly open a class from the timetable.

---

# 14. Teacher Class Management

For every class, provide:

* Student list
* Attendance
* Assignments
* Assessments
* Grades
* Lesson plans
* Curriculum progress
* Notes
* Communication history

Teacher should be able to move between these areas without repeatedly searching for the class.

---

# 15. Teacher Attendance

Make attendance extremely fast.

Ideal flow:

```text
Open Class
→ Attendance
→ Mark All Present
→ Change Exceptions
→ Save
```

Support:

* Present
* Absent
* Late
* Excused
* Notes

Also support:

* Bulk attendance
* Attendance history
* Student attendance percentage
* Repeated absence detection
* Late-arrival tracking

---

# 16. Teacher Lesson Planning

Teachers should be able to:

* Create lesson plan
* Copy previous lesson
* Reuse lesson plan
* Link curriculum topic
* Add learning objectives
* Add activities
* Add materials
* Add homework
* Record notes
* Mark lesson completed

AI can create a **draft** lesson plan.

Teacher must be able to edit before saving.

---

# 17. Teacher Assignments

Support:

* Assignment creation
* Due dates
* Attachments
* Rubrics
* Maximum score
* Student submissions
* Late submissions
* Missing submissions
* Feedback
* Grades

Provide quick filters:

```text
All
Missing
Submitted
Late
Graded
```

---

# 18. Teacher Grading

Make grading efficient.

Support:

* Grade entry
* Bulk grading
* Comments
* Rubrics
* Automatic calculations
* Grade validation
* Grade submission
* Grade locking
* Grade history

Provide:

```text
Pending grading
Completed grading
Missing grades
Submitted grades
```

---

# 19. Teacher Communication

Teachers should be able to communicate with:

* Students
* Parents
* Classes
* School administrators

Support:

* Announcements
* Direct messages
* Parent messages
* Class messages
* Templates

Provide reusable message templates.

AI may help draft messages but should not automatically send sensitive communications without appropriate approval.

---

# 20. Teacher Tasks

Teachers should have a personal task list.

Examples:

```text
Grade Grade 10 essays
Complete attendance
Submit report comments
Prepare lesson
Attend department meeting
Review student support case
Complete training
```

Tasks may originate from:

* Teacher
* Administrator
* Workflow
* Meeting
* Leave process
* Student support
* School event

---

# 21. Teacher Professional Development

Track:

* Training
* Workshops
* Certifications
* Certification expiry
* Professional goals
* Development plans
* Observation records
* Completed courses

Provide reminders for expiring certifications.

Avoid simplistic automated teacher-performance scoring.

---

# 22. School Administration

Edura should provide a practical administrative workspace.

Admin should be able to manage:

* Teachers
* Students
* Parents
* Classes
* Subjects
* Departments
* Timetable
* Attendance
* Leave
* Substitutions
* Events
* Meetings
* Rooms
* Facilities
* Communication
* Reports
* Tasks

---

# 23. School Staff Management

Support non-teaching staff such as:

* Administrative staff
* Reception
* IT
* Maintenance
* Librarians
* Coordinators
* Support staff

Track:

* Department
* Position
* Contact details
* Work schedule
* Leave
* Tasks
* Documents
* Status

---

# 24. Department Management

Each department should have:

* Department head
* Teachers
* Subjects
* Classes
* Curriculum
* Meetings
* Tasks
* Announcements
* Reports

Department dashboard:

```text
Teachers
Classes
Subjects
Workload
Pending grades
Curriculum progress
Upcoming meetings
Tasks
```

---

# 25. School Calendar

Create one unified calendar for:

* Classes
* Exams
* Assignments
* Meetings
* Events
* Teacher leave
* Substitutions
* School holidays
* Training
* Trips
* Important deadlines

Users should see only relevant calendar information according to their role.

---

# 26. Meetings & Staff Management

Support:

* Staff meetings
* Department meetings
* Parent meetings
* Teacher meetings
* Management meetings

Meeting workflow:

```text
Create meeting
→ Invite participants
→ Agenda
→ Meeting
→ Minutes
→ Decisions
→ Action items
→ Assigned tasks
→ Follow-up
```

AI can summarize meeting notes and create draft action items.

---

# 27. School Announcements

Administrators should be able to send announcements to:

* Entire school
* Teachers
* Departments
* Classes
* Students
* Parents
* Staff

Support:

* Scheduled announcements
* Expiry date
* Attachments
* Priority
* Read tracking

---

# 28. School Tasks & Approvals

Create a simple approval system for:

* Teacher leave
* Events
* Trips
* Resource requests
* Purchase/resource requests
* Report cards
* Special activities

Every approval should have:

```text
Requester
Approver
Status
Created date
Decision date
Comment
Audit history
```

---

# 29. Student Management

Keep student management focused on information useful to school operations.

Track:

* Student profile
* Class
* Guardians
* Attendance
* Grades
* Assignments
* Behavior
* Support cases
* Activities
* Documents
* Communication

Provide a unified student profile.

---

# 30. Student Support

Support structured cases for:

```text
ACADEMIC
ATTENDANCE
BEHAVIOR
WELLBEING
OTHER
```

Workflow:

```text
Case created
→ Assigned
→ Notes/actions
→ Follow-up
→ Resolved
```

Sensitive information must have additional permissions.

---

# 31. Discipline Management

Track:

* Incidents
* Category
* Date
* Severity
* Description
* Staff involved
* Actions
* Parent communication
* Follow-up

Keep records factual and auditable.

---

# 32. Timetable Management

Timetable tools should support:

* Teacher schedules
* Class schedules
* Room schedules
* Subject schedules
* Teacher conflicts
* Room conflicts
* Class conflicts

Provide clear conflict warnings.

---

# 33. Room & Resource Management

Track:

* Classrooms
* Labs
* Meeting rooms
* Library
* Sports facilities
* Equipment

Support:

* Availability
* Booking
* Capacity
* Maintenance
* Responsible staff

---

# 34. School Maintenance

Allow staff to report:

```text
Broken projector
Air conditioning issue
Computer problem
Furniture damage
Room issue
Cleaning issue
Other
```

Workflow:

```text
Report
→ Assign
→ In Progress
→ Resolve
→ Close
```

Dashboard should show:

* Open requests
* High-priority requests
* Assigned requests
* Overdue requests
* Recently resolved requests

---

# 35. Events & Activities

Support:

* School events
* Clubs
* Competitions
* Trips
* Sports
* Assemblies
* Parent events

Track:

* Organizer
* Participants
* Location
* Schedule
* Permissions
* Tasks
* Notifications

---

# 36. Communication Automation

Example:

```text
Student absent
→ Check absence rules
→ Generate notification
→ Send to parent
→ Update attendance statistics
```

Another example:

```text
Teacher certification expires in 30 days
→ Create reminder
→ Notify teacher
→ Notify administrator if configured
```

Another:

```text
Grade submission deadline approaching
→ Notify teacher
→ Create task
→ Escalate if overdue
```

---

# 37. Workflow Engine

Keep the workflow engine lightweight.

Use database-configured rules where practical.

Triggers:

```text
ATTENDANCE_RECORDED
ABSENCE_THRESHOLD_REACHED
GRADE_MISSING
ASSIGNMENT_OVERDUE
LEAVE_REQUESTED
LEAVE_APPROVED
CERTIFICATION_EXPIRING
TASK_OVERDUE
MEETING_COMPLETED
EVENT_CREATED
MAINTENANCE_CREATED
```

Actions:

```text
SEND_NOTIFICATION
SEND_EMAIL
CREATE_TASK
CREATE_ALERT
REQUEST_APPROVAL
```

Do not build a complex visual workflow designer for the MVP.

---

# 38. Reports

Provide practical reports rather than excessive BI functionality.

Teacher reports:

* Teaching workload
* Attendance
* Assignment completion
* Grading status
* Curriculum progress

School reports:

* Student attendance
* Teacher attendance
* Teacher workload
* Class performance
* Grade submission status
* Leave
* Substitution
* Maintenance
* Events
* Tasks

Export:

* CSV
* PDF where appropriate

---

# 39. AI Assistant

AI should remain an assistant layer, not the core system.

## Teacher AI

Examples:

```text
Create a lesson-plan draft.
Rewrite this parent message.
Summarize this student's progress.
Create quiz questions.
Suggest differentiated activities.
Summarize my pending tasks.
```

## Admin AI

Examples:

```text
Which teachers have not submitted grades?
Which teachers are absent today?
Which classes have repeated attendance problems?
Summarize teacher workload.
What maintenance requests are overdue?
Summarize today's school operations.
```

## AI Safety

AI must:

* Respect permissions
* Use approved tools
* Never execute arbitrary SQL
* Never silently change important records
* Require confirmation for consequential actions
* Clearly distinguish generated content from database facts

---

# 40. AI Tool Architecture

```text
User
 ↓
Edura AI
 ↓
Authentication
 ↓
Permission Check
 ↓
Intent Detection
 ↓
Approved Tool
 ↓
Edura Business Logic
 ↓
Database
 ↓
Result
 ↓
AI Response
```

Example tools:

```text
get_today_teacher_schedule()
get_teacher_workload()
get_pending_grades()
get_student_attendance()
get_class_attendance()
get_upcoming_meetings()
get_pending_tasks()
get_open_maintenance_requests()
search_school_documents()
```

---

# 41. Dashboards

## Teacher Dashboard

The most important information should be visible immediately:

```text
Today
Next Class
Attendance
Pending Grading
Assignments
Tasks
Meetings
Announcements
Leave
Substitutions
```

## School Admin Dashboard

```text
Today's Classes
Absent Teachers
Substitutions Needed
Attendance Alerts
Pending Approvals
Pending Grades
Teacher Workload
Upcoming Events
Open Maintenance
Outstanding Tasks
```

## Principal Dashboard

Provide high-level operational visibility:

```text
Attendance
Teacher Availability
Substitutions
Academic Progress
Teacher Workload
Pending Approvals
Student Support
Discipline
Events
School Tasks
```

Do not turn this into a complicated analytics platform.

---

# 42. Notifications

Support:

* In-app
* Email

Start with these two channels.

Notification examples:

* Teacher leave approved
* Substitute assigned
* Student absent
* Assignment overdue
* Grade submission reminder
* Meeting reminder
* Task overdue
* Certification expiring
* Maintenance request assigned

Avoid implementing SMS/push integrations until there is a real requirement.

---

# 43. Database Principles

Every table should use:

```text
id
created_at
updated_at
```

School-owned tables should contain:

```text
school_id
```

Use:

* Foreign keys
* Unique constraints
* Database indexes
* Soft deletion only where actually required
* Transactions for multi-step operations

Important indexes should exist on:

```text
school_id
teacher_id
student_id
class_id
course_id
academic_year_id
term_id
date
status
```

---

# 44. Critical Business Rules

Implement server-side rules for:

### Timetable

A teacher cannot have two classes at the same time.

### Rooms

A room cannot be booked for conflicting periods.

### Attendance

A student cannot have duplicate attendance records for the same session.

### Grades

Unauthorized users cannot modify grades.

### Leave

Approved leave should identify affected teaching periods.

### Substitution

A substitute cannot be assigned to a conflicting timetable slot.

### School Isolation

No user can access another school's data.

### Parent Access

A parent can access only linked children.

### Student Access

A student can access only their own records.

---

# 45. Performance Goals

Edura should remain lightweight.

Target:

* Fast dashboard loading
* Paginated large tables
* Server-side filtering
* Efficient database queries
* Minimal client-side JavaScript
* Lazy loading for large datasets
* Optimized images/documents

Avoid unnecessary real-time infrastructure.

Polling or refresh-based updates are acceptable for the MVP where real-time updates are not essential.

---

# 46. MVP Scope

The first MVP should focus on:

### Teacher

* Profile
* Schedule
* Classes
* Attendance
* Assignments
* Grades
* Lesson plans
* Tasks
* Leave
* Substitution
* Notifications

### School Admin

* Teachers
* Students
* Classes
* Subjects
* Timetable
* Attendance
* Leave
* Substitution
* Meetings
* Events
* Tasks
* Facilities
* Reports

### Student/Parent

* Schedule
* Attendance
* Assignments
* Grades
* Notifications
* Events

### Automation

* Attendance alerts
* Grade reminders
* Leave workflow
* Substitute workflow
* Task reminders

### AI

* Lesson-plan draft
* Parent-message draft
* Student-progress summary
* Admin school-data questions

---

# 47. Implementation Order

## Phase 1 — Lightweight Foundation

* Next.js
* TypeScript
* Tailwind
* Prisma
* PostgreSQL
* Authentication
* Roles
* Permissions
* Audit logs
* Testing infrastructure
* CI

## Phase 2 — People & School Structure

* Schools
* Users
* Teachers
* Staff
* Students
* Parents
* Departments
* Classes
* Subjects
* Academic years
* Terms

## Phase 3 — Teacher Operations

* Teacher dashboard
* Timetable
* Attendance
* Assignments
* Grades
* Lesson plans
* Tasks

## Phase 4 — School Operations

* Leave
* Substitution
* Meetings
* Events
* Announcements
* Rooms
* Resources
* Maintenance

## Phase 5 — Automation

* Notifications
* Workflow rules
* Approval workflows
* Scheduled jobs
* Reminders
* Escalations

## Phase 6 — Reports

* Teacher reports
* School reports
* Attendance
* Workload
* Academic reports
* Operational reports

## Phase 7 — AI

* Teacher assistant
* Admin assistant
* Lesson-plan generation
* Message generation
* Student summaries
* School-data Q&A
* Meeting summaries

---

# 48. Required End-to-End MVP Test

The following complete scenario must pass:

```text
Admin creates Edura school
        ↓
Creates academic year
        ↓
Creates teachers
        ↓
Creates students
        ↓
Creates classes
        ↓
Creates subjects
        ↓
Assigns teachers
        ↓
Creates timetable
        ↓
Teacher logs in
        ↓
Teacher sees today's schedule
        ↓
Teacher opens class
        ↓
Teacher records attendance
        ↓
Attendance statistics update
        ↓
Parent notification is generated
        ↓
Teacher creates assignment
        ↓
Student submits assignment
        ↓
Teacher grades assignment
        ↓
Grade appears in student record
        ↓
Teacher requests leave
        ↓
Admin approves leave
        ↓
Edura identifies affected classes
        ↓
Edura suggests available substitutes
        ↓
Admin assigns substitute
        ↓
Affected teacher/class notifications are generated
```

This flow must be covered by automated tests.

---

# 49. CI/CD Quality Gates

Every pull request should run:

```text
TypeScript type checking
Linting
Unit tests
Integration tests
Coverage
Build
Critical E2E tests
```

Recommended minimum gates:

```text
TypeScript: PASS
Lint: PASS
Unit tests: PASS
Integration tests: PASS
Coverage thresholds: PASS
Production build: PASS
Critical E2E tests: PASS
```

Do not allow merging when critical security or business-rule tests fail.

---

# 50. Seed Data

Create realistic development data:

```text
1 school
1 academic year
3 terms
1 principal
2 administrators
1 department head
10 teachers
5 staff members
100 students
20 parents/guardians
5 departments
10 classes
15 subjects
Courses
Timetable
Attendance
Assignments
Assessments
Grades
Leave requests
Substitute assignments
Meetings
Events
Maintenance requests
Tasks
Notifications
```

Provide demo accounts for every role.

---

# 51. Documentation

Create:

```text
README.md

/docs
  architecture.md
  database.md
  permissions.md
  workflows.md
  testing.md
  ai.md
  deployment.md
```

Documentation must explain:

* Local setup
* Environment variables
* Database setup
* Migrations
* Seed data
* Authentication
* Permissions
* Business rules
* Testing
* Coverage
* Deployment
* AI architecture

---

# 52. Final Product Requirement

Edura should **not** attempt to become an enormous enterprise school ERP in the first version.

The priority is:

> **A lightweight system that teachers actually enjoy using and administrators can operate without extensive training.**

Focus especially on:

```text
Teacher Management
        +
Teacher Daily Operations
        +
School Administration
        +
Academic Operations
        +
Automation
        +
Reliable Testing
        +
Practical AI
```

The final architecture should remain simple enough for a small engineering team to maintain while being structured enough to grow into a larger school-management platform later.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
