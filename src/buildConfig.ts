import { getCollection } from 'astro:content';

/**
 * Limit the number of bills built per bill type during static generation.
 * Controlled by the BILLS_PER_TYPE_LIMIT environment variable.
 * When unset or 0, all bills are built (full production build).
 */
export const BILLS_PER_TYPE_LIMIT: number | undefined =
  process.env.BILLS_PER_TYPE_LIMIT ? Number(process.env.BILLS_PER_TYPE_LIMIT) : undefined;

/**
 * Limit the total number of individual legislator pages built.
 * Controlled by the LEGISLATORS_LIMIT environment variable.
 * When unset or 0, all legislators are built (full production build).
 */
export const LEGISLATORS_LIMIT: number | undefined =
  process.env.LEGISLATORS_LIMIT ? Number(process.env.LEGISLATORS_LIMIT) : undefined;

/**
 * Returns at most BILLS_PER_TYPE_LIMIT bills per bill type.
 * When the limit is 0 or undefined, all bills are returned unchanged.
 */
export function applyBillsPerTypeLimit<T extends { data: { type?: string } }>(bills: T[]): T[] {
  if (!BILLS_PER_TYPE_LIMIT) return bills;
  const countByType = new Map<string, number>();
  return bills.filter(bill => {
    const type = bill.data.type?.toLowerCase() ?? 'unknown';
    const count = countByType.get(type) ?? 0;
    if (count >= BILLS_PER_TYPE_LIMIT!) return false;
    countByType.set(type, count + 1);
    return true;
  });
}

/**
 * Returns the IDs of the limited bill set.
 * Use this to filter downstream collections (recordedVotes, etc.) to only
 * those that belong to the limited bills.
 */
export async function getLimitedBillIds(): Promise<Set<string>> {
  const allBills = await getCollection('bills');
  return new Set(applyBillsPerTypeLimit(allBills).map(b => b.id));
}
