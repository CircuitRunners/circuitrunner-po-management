import { format } from 'date-fns';
import type { PurchaseOrder } from '../types';
import { formatItemCategory, formatTeamSubcategory } from './poLineItemDisplay';

/** Firestore `Timestamp`-like or `Date` (runtime vs declared types differ). */
export function firestoreDateSeconds(ts: unknown): number | null {
  if (
    ts != null &&
    typeof ts === 'object' &&
    'seconds' in ts &&
    typeof (ts as { seconds: number }).seconds === 'number'
  ) {
    return (ts as { seconds: number }).seconds;
  }
  if (ts instanceof Date && !isNaN(ts.getTime())) {
    return Math.floor(ts.getTime() / 1000);
  }
  return null;
}

export function formatPoDay(ts: unknown): string {
  const s = firestoreDateSeconds(ts);
  if (s == null) return 'N/A';
  return format(new Date(s * 1000), 'MMM dd, yyyy');
}

export function poMatchesLineSubcategory(
  po: PurchaseOrder,
  sub: 'mechanical' | 'electrical'
): boolean {
  return po.lineItems.some(li => (li.teamSubcategory || 'mechanical') === sub);
}

export function poMatchesLineItemCategory(
  po: PurchaseOrder,
  cat: 'consumable' | 'part' | 'miscellaneous'
): boolean {
  return po.lineItems.some(li => (li.itemCategory || 'miscellaneous') === cat);
}

export function lineItemsSearchHaystack(po: PurchaseOrder): string {
  return po.lineItems
    .map(item =>
      [
        item.vendor,
        item.itemName,
        item.sku,
        item.notes,
        item.teamSubcategory,
        item.itemCategory,
        formatTeamSubcategory(item.teamSubcategory),
        formatItemCategory(item.itemCategory),
      ]
        .filter(Boolean)
        .join(' ')
    )
    .join(' ')
    .toLowerCase();
}

export function poTimestampSeconds(po: PurchaseOrder): number {
  return (
    firestoreDateSeconds(po.updatedAt) ??
    firestoreDateSeconds(po.createdAt) ??
    0
  );
}
