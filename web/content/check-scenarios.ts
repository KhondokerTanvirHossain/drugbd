/** §6.7.1 "Start from a scenario": Board P's four pilot scenarios. A scenario renders only when all of its products exist. */
export type Scenario = { label: string; ids: string[] };
export const SCENARIOS: Scenario[] = [
  { label: "G Warfarin + Aspirin + Domperidone", ids: ["185-0138-012--g-warfarin", "076-0028-006--aspirin", "127-0263-018--domperidone"] },
  { label: "Clarith + Simvastatin", ids: ["239-0407-023--clarith", "096-0265-061--simvastatin"] },
  { label: "Simvastatin + Amlodipine-5", ids: ["096-0265-061--simvastatin", "071-0098-022--amlodipine-5"] },
  { label: "Napa + G Warfarin", ids: ["186-0030-006--napa", "185-0138-012--g-warfarin"] },
];
/** Board P's partner code sample uses the first scenario's three products. */
export const PARTNER_SAMPLE = SCENARIOS[0];
