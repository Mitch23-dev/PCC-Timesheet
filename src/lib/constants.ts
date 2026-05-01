export const EMPLOYEES = [
  "Darren",
  "Dave",
  "Bryce",
  "Willie",
  "Robert",
  "Stephen",
  "Shawn",
  "Mitchell",
  "Nelson",
  "Other",
] as const;

// Job Type is shared across all pages (Employee entry, My Timesheets, Admin edit modal).
// Keep this list small + consistent so reporting/filters/PDFs stay clean.
export const JOB_TYPES = ["Commercial", "Residential", "Maintenance"] as const;

export const EQUIPMENT = [
  "Dump Truck",
  "Komatsu 210 (New)",
  "Komatsu 210 (Old)",
  "Komatsu 138 (New)",
  "Komatsu 138 (Old)",
  "John Deere 135",
  "Kubota 8 Ton",
  "Kubota Mini",
  "John Deere Mini",
  "Kubota Skid Steer",
  "John Deere Skid Steer",
  "Large Roller",
  "Small Roller",
  "Paver",
] as const;

export const EXCAVATORS = new Set<string>([
  "Komatsu 210 (New)",
  "Komatsu 210 (Old)",
  "Komatsu 138 (New)",
  "Komatsu 138 (Old)",
  "John Deere 135",
  "Kubota 8 Ton",
  "Kubota Mini",
  "John Deere Mini",
]);

export const ATTACHMENTS = ["None", "Breaker", "Chipper"] as const;

export const DUMP_TRUCK_ATTACHMENTS = ["None", "Pup Trailer", "Float"] as const;

// Skid steer specific attachments (kept separate so we can show a cleaner list)
export const SKID_STEER_ATTACHMENTS = [
  "None",
  "Bucket",
  "Forks",
  "Grapple",
  "Auger",
  "Broom",
  "Breaker",
] as const;

export const MATERIALS = [
  `Conrads - 1/2" Clear Stone`,
  `Conrads - 3/4" Clear Stone`,
  `Conrads - 1" Clear Stone`,
  `Conrads - 2" Clear Stone`,
  `Conrads - 3" Clear Stone`,
  `Conrads - 4-6" Clear Stone`,
  "Rip Rap",
  "Class A/ Type 1S",
  "Class B/ Type 1",
  "Class C/ Type 2",
  "Class D",
  "Class E",
  `Surge (6" Minus)`,
  "Crusher Dust - MRT",
  "Crusher Dust",
  "Topsoil",
  "Clay Fill",
  "Hardpan",
  "Septic Sand",
  "Granite Rock",
  "Screened Fill",
  "Other",
] as const;
