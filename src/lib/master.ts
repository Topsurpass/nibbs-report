// Master reference data: the bank list plus each bank's posted Collateral.
// Seeded from NIBBS_CHECKER.xlsx Sheet1 (A3:C26 — Bank code, Bank name, Collateral).
//
// This data is NOT carried by the uploaded HTML/TXT files, so it is maintained
// separately. It now lives in Neon Postgres (table `nibbs_banks`, see
// src/services/banks/repository.ts); the list below is the seed/default used to
// initialize a fresh database and to power "Reset to defaults".

export interface MasterBank {
  /** 10-digit NIBBS bank/settlement code — the join key across all files. */
  code: string;
  /** Friendly bank name (without the trailing " - <code>"). */
  name: string;
  /** Posted collateral in Naira. */
  collateral: number;
}

export const DEFAULT_MASTER: MasterBank[] = [
  { code: "4000470158", name: "Access Bank plc", collateral: 11_950_000_000 },
  { code: "4000460155", name: "ECOBANK", collateral: 1_000_000_000 },
  { code: "4010160155", name: "Fidelity Bank", collateral: 1_200_000_000 },
  { code: "4010100137", name: "First City Monument Bank Plc", collateral: 1_220_000_000 },
  { code: "4000070135", name: "FIRSTBANK", collateral: 2_000_000_000 },
  { code: "4000015103", name: "GLOBUS BANK LIMITED", collateral: 0 },
  { code: "4000560185", name: "Guaranty Trust Bank PLC", collateral: 0 },
  { code: "4000015301", name: "Jaiz Bank", collateral: 600_000_000 },
  { code: "4010270188", name: "Keystone Bank", collateral: 0 },
  { code: "4000015804", name: "MoMo PSB", collateral: 1_000_000_000 },
  { code: "4000015104", name: "Parallex Bank Limited", collateral: 0 },
  { code: "4010350115", name: "POLARIS BANK LIMITED", collateral: 5_001_000_000 },
  { code: "4000015105", name: "Premium Trust Bank Ltd", collateral: 0 },
  { code: "4000015101", name: "PROVIDUS Bank", collateral: 1_500_000_000 },
  { code: "4000008106", name: "Signature Bank Limited", collateral: 0 },
  { code: "4010250182", name: "STANBIC IBTC Bank", collateral: 94_000_000 },
  { code: "4010030116", name: "Sterling Bank", collateral: 0 },
  { code: "4000015100", name: "SUNTRUST BANK NIGERIA LIMITED", collateral: 0 },
  { code: "4000008302", name: "TAJ BANK LIMITED", collateral: 0 },
  { code: "4000090141", name: "Union Bank of Nigeria", collateral: 0 },
  { code: "4000120150", name: "United Bank for Africa", collateral: 1_000_000_000 },
  { code: "4000410140", name: "Unity Bank PLC", collateral: 3_000_000_000 },
  { code: "4000020120", name: "WEMA", collateral: 25_000_000 },
  { code: "4000540179", name: "Zenith Bank Plc.", collateral: 50_000_000 },
];

/** The "<Name> - <code>" string, matching the HTML bank cell / Sheet1 column B. */
export function bankLabel(b: Pick<MasterBank, "name" | "code">): string {
  return `${b.name} - ${b.code}`;
}
