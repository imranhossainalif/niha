// Businesses and how a document maps to one. Mirrors BIZ in legacy/business-os.html.
export const BIZ = [
  { id: 'kidscare', name: 'Kids Care BD', color: '#C9661C' },
  { id: 'insafia', name: 'Insafia', color: '#A34B3B' },
  { id: 'lrf', name: 'Local Revenue Flow', color: '#13896F' },
  { id: 'itevs', name: 'Itevs Digital', color: '#1F6FB8' },
  { id: 'hajj', name: 'Hajj/Umrah + Real Estate', color: '#7C3AED' },
  { id: 'others', name: 'Onnanno', color: '#5F7A74' },
  { id: 'personal', name: 'Personal', color: '#6A4FC4' },
] as const;
export const BIZ_IDS: string[] = BIZ.map((b) => b.id);
export const bizName = (id: string) => BIZ.find((b) => b.id === id)?.name ?? id;

// Every collection the legacy UI subscribes to (COLS in the legacy file).
export const LEGACY_COLS = ['accounts', 'transactions', 'loans', 'dues', 'upcoming', 'tasks', 'ideas', 'issues', 'reviews', 'budgets', 'settings', 'sales_daily', 'snapshots', 'team', 'sales_team', 'calls_daily', 'outreach_daily', 'posts', 'leads', 'clients', 'ctasks', 'client_payments', 'feedback', 'proposals', 'client_metrics', 'meetings', 'lead_lists', 'packages', 'templates', 'sops', 'proofs', 'learning', 'books', 'loan_payments', 'r90_days', 'r90_log', 'pl_kidscare', 'fixed_costs', 'spend_import', 'daily_spend', 'product_costing', 'kc_packing', 'pc_items', 'goals', 'funnel_steps', 'comp_watch', 'comp_weekly', 'kb_docs', 'kb_notes', 'ai_chat', 'playbooks', 'ib_products', 'ib_offers', 'ib_couriers', 'ib_kb', 'ib_broadcasts'];

// Collections whose docs all belong to one business even without a `business` field.
const FIXED_BUSINESS: Record<string, string> = {
  pl_kidscare: 'kidscare', kc_packing: 'kidscare', calls_daily: 'kidscare', sales_team: 'kidscare',
  spend_import: 'kidscare', snapshots: 'kidscare', inbox_messages: 'kidscare', nuport_orders: 'kidscare', web_traffic: 'kidscare',
};
// The legacy code treats a missing business as Kids Care in these collections.
const DEFAULT_KIDSCARE = new Set(['fixed_costs', 'daily_spend', 'pc_items']);
// Collections keyed by business id.
const KEYED_BY_BUSINESS = new Set(['ai_chat', 'playbooks', 'product_costing', 'inbox_config']);

/** Business a document belongs to, or null for global/owner-level docs. */
export function docBusiness(collection: string, id: string, data: Record<string, unknown> | null | undefined): string | null {
  const b = data && typeof data.business === 'string' ? data.business : '';
  if (b && BIZ_IDS.includes(b)) return b;
  if (FIXED_BUSINESS[collection]) return FIXED_BUSINESS[collection];
  if (KEYED_BY_BUSINESS.has(collection) && BIZ_IDS.includes(id)) return id;
  if (collection === 'settings') {
    const hit = BIZ_IDS.find((x) => id === x || id.endsWith('_' + x) || id.startsWith(x + '_'));
    if (hit) return hit;
  }
  if (DEFAULT_KIDSCARE.has(collection) && !b) return 'kidscare';
  return null;
}
