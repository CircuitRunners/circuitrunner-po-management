import type { LineItem } from '../types';

export function formatTeamSubcategory(value?: LineItem['teamSubcategory']): string {
  const v = value || 'mechanical';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function formatItemCategory(value?: LineItem['itemCategory']): string {
  const v = value || 'miscellaneous';
  return v.charAt(0).toUpperCase() + v.slice(1);
}
