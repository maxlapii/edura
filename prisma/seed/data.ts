/** Static demo data used by the seed script. */

export const DEMO_PASSWORD = "Password123!";
export const SCHOOL = { name: "Greenfield Secondary School", code: "GREENFIELD", address: "12 Orchard Lane, Greenfield", phone: "+1 555 0100", email: "office@greenfield.edu", timezone: "UTC" };

export const DEPARTMENTS = [
  { name: "Mathematics", code: "MATH" },
  { name: "Science", code: "SCI" },
  { name: "Languages", code: "LANG" },
  { name: "Humanities", code: "HUM" },
  { name: "Arts & Physical Education", code: "ARTS" },
];

export const SUBJECTS: Array<{ name: string; code: string; dept: string }> = [
  { name: "Mathematics", code: "MATH", dept: "MATH" },
  { name: "Statistics", code: "STAT", dept: "MATH" },
  { name: "Physics", code: "PHYS", dept: "SCI" },
  { name: "Chemistry", code: "CHEM", dept: "SCI" },
  { name: "Biology", code: "BIO", dept: "SCI" },
  { name: "Computer Science", code: "CS", dept: "SCI" },
  { name: "English", code: "ENG", dept: "LANG" },
  { name: "Spanish", code: "SPA", dept: "LANG" },
  { name: "French", code: "FRE", dept: "LANG" },
  { name: "History", code: "HIST", dept: "HUM" },
  { name: "Geography", code: "GEO", dept: "HUM" },
  { name: "Economics", code: "ECON", dept: "HUM" },
  { name: "Art", code: "ART", dept: "ARTS" },
  { name: "Music", code: "MUS", dept: "ARTS" },
  { name: "Physical Education", code: "PE", dept: "ARTS" },
];

/** 10 teachers. `subjects` are subject codes; first teacher is the Mathematics department head. */
export const TEACHERS = [
  { name: "Alice Morgan", email: "alice.morgan@edura.dev", dept: "MATH", subjects: ["MATH", "STAT"], position: "Head of Mathematics", employeeNumber: "T-001", hireDate: "2015-08-15" },
  { name: "Brian Chen", email: "brian.chen@edura.dev", dept: "MATH", subjects: ["MATH"], position: "Mathematics Teacher", employeeNumber: "T-002", hireDate: "2019-08-20" },
  { name: "Carla Diaz", email: "carla.diaz@edura.dev", dept: "SCI", subjects: ["PHYS", "CS"], position: "Science Teacher", employeeNumber: "T-003", hireDate: "2017-01-10" },
  { name: "David Okafor", email: "david.okafor@edura.dev", dept: "SCI", subjects: ["CHEM", "BIO"], position: "Science Teacher", employeeNumber: "T-004", hireDate: "2020-08-24" },
  { name: "Elena Petrova", email: "elena.petrova@edura.dev", dept: "LANG", subjects: ["ENG"], position: "English Teacher", employeeNumber: "T-005", hireDate: "2012-09-01" },
  { name: "Farid Haddad", email: "farid.haddad@edura.dev", dept: "LANG", subjects: ["SPA", "FRE"], position: "Languages Teacher", employeeNumber: "T-006", hireDate: "2021-08-23" },
  { name: "Grace Kim", email: "grace.kim@edura.dev", dept: "HUM", subjects: ["HIST", "GEO"], position: "Humanities Teacher", employeeNumber: "T-007", hireDate: "2016-08-22" },
  { name: "Hugo Martins", email: "hugo.martins@edura.dev", dept: "HUM", subjects: ["ECON", "GEO"], position: "Humanities Teacher", employeeNumber: "T-008", hireDate: "2018-08-27" },
  { name: "Isabel Rossi", email: "isabel.rossi@edura.dev", dept: "ARTS", subjects: ["ART", "MUS"], position: "Arts Teacher", employeeNumber: "T-009", hireDate: "2014-08-18" },
  { name: "Jamal Wright", email: "jamal.wright@edura.dev", dept: "ARTS", subjects: ["PE"], position: "PE Teacher", employeeNumber: "T-010", hireDate: "2022-08-22" },
];

export const STAFF = [
  { name: "Karen Walsh", email: "karen.walsh@edura.dev", staffType: "ADMINISTRATIVE", position: "Office Manager", employeeNumber: "S-001" },
  { name: "Liam O'Brien", email: "liam.obrien@edura.dev", staffType: "RECEPTION", position: "Receptionist", employeeNumber: "S-002" },
  { name: "Maya Singh", email: "maya.singh@edura.dev", staffType: "IT", position: "IT Support", employeeNumber: "S-003" },
  { name: "Noah Becker", email: "noah.becker@edura.dev", staffType: "MAINTENANCE", position: "Facilities Technician", employeeNumber: "S-004" },
  { name: "Olivia Park", email: "olivia.park@edura.dev", staffType: "LIBRARIAN", position: "Librarian", employeeNumber: "S-005" },
] as const;

export const ADMINS = [
  { name: "Patricia Lawson", email: "principal@edura.dev", role: "PRINCIPAL" as const },
  { name: "Quentin Adams", email: "admin@edura.dev", role: "SCHOOL_ADMIN" as const },
  { name: "Rosa Fernandez", email: "admin2@edura.dev", role: "SCHOOL_ADMIN" as const },
];

export const SUPER_ADMIN = { name: "Edura Super Admin", email: "superadmin@edura.dev" };

export const CLASSES = [
  { name: "7A", gradeLevel: 7 },
  { name: "7B", gradeLevel: 7 },
  { name: "8A", gradeLevel: 8 },
  { name: "8B", gradeLevel: 8 },
  { name: "9A", gradeLevel: 9 },
  { name: "9B", gradeLevel: 9 },
  { name: "10A", gradeLevel: 10 },
  { name: "10B", gradeLevel: 10 },
  { name: "11A", gradeLevel: 11 },
  { name: "12A", gradeLevel: 12 },
];

/** Subjects every class takes (6 per class → 60 courses). */
export const CLASS_SUBJECTS: Record<number, string[]> = {
  7: ["MATH", "ENG", "BIO", "HIST", "ART", "PE"],
  8: ["MATH", "ENG", "PHYS", "GEO", "MUS", "PE"],
  9: ["MATH", "ENG", "CHEM", "HIST", "SPA", "PE"],
  10: ["MATH", "ENG", "PHYS", "GEO", "FRE", "CS"],
  11: ["STAT", "ENG", "CHEM", "ECON", "SPA", "CS"],
  12: ["MATH", "ENG", "BIO", "ECON", "HIST", "ART"],
};

export const ROOMS = [
  ...Array.from({ length: 10 }, (_, i) => ({ name: `Room ${101 + i}`, code: `R${101 + i}`, type: "CLASSROOM" as const, capacity: 30, building: "Main" })),
  { name: "Science Lab 1", code: "LAB1", type: "LAB" as const, capacity: 24, building: "Science Block" },
  { name: "Science Lab 2", code: "LAB2", type: "LAB" as const, capacity: 24, building: "Science Block" },
  { name: "Computer Lab", code: "CLAB", type: "LAB" as const, capacity: 28, building: "Main" },
  { name: "Staff Meeting Room", code: "MR1", type: "MEETING" as const, capacity: 20, building: "Admin" },
  { name: "Library", code: "LIB", type: "LIBRARY" as const, capacity: 60, building: "Main" },
  { name: "Gymnasium", code: "GYM", type: "SPORTS" as const, capacity: 120, building: "Sports Hall" },
];

export const FIRST_NAMES = ["Aiden", "Bella", "Caleb", "Daisy", "Ethan", "Fiona", "Gavin", "Hannah", "Isaac", "Jade", "Kai", "Luna", "Mason", "Nora", "Owen", "Piper", "Quinn", "Ruby", "Sam", "Tessa", "Uma", "Victor", "Willow", "Xander", "Yara", "Zane", "Amir", "Chloe", "Dev", "Elsa", "Finn", "Gia", "Hiro", "Ivy", "Jonah", "Kira", "Leo", "Mia", "Nico", "Opal"];
export const LAST_NAMES = ["Anderson", "Baker", "Carter", "Dawson", "Ellis", "Foster", "Graham", "Hughes", "Ingram", "Jensen", "Khan", "Lopez", "Murphy", "Nakamura", "Owens", "Patel", "Quiroga", "Reed", "Silva", "Turner", "Underwood", "Vance", "Watson", "Xu", "Young", "Zimmerman"];

export const MESSAGE_TEMPLATES = [
  { name: "Absence follow-up", category: "ATTENDANCE", subject: "Absence of {{studentName}} on {{date}}", body: "Dear parent/guardian,\n\n{{studentName}} was absent from {{className}} on {{date}}. Please let us know the reason for the absence.\n\nKind regards,\n{{teacherName}}" },
  { name: "Missing homework", category: "ACADEMIC", subject: "Missing assignment – {{studentName}}", body: "Dear parent/guardian,\n\n{{studentName}} has not submitted a recent assignment. Please encourage them to complete it as soon as possible.\n\nKind regards,\n{{teacherName}}" },
  { name: "Positive feedback", category: "GENERAL", subject: "Great work from {{studentName}}", body: "Dear parent/guardian,\n\nI wanted to share that {{studentName}} has been doing excellent work in class recently. Keep it up!\n\nKind regards,\n{{teacherName}}" },
];
