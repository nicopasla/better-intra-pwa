/** Network capability helpers (feature-detected; safe on any browser). */

interface NetworkInformationLike {
  saveData?: boolean;
}

const connection: NetworkInformationLike | undefined =
  typeof navigator !== "undefined"
    ? (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    : undefined;

export const saveData: boolean = Boolean(connection?.saveData);