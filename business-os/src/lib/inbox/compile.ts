// Port of ibCompile / ibRulesCompile from legacy/business-os.html: everything the inbox AI reads.
import { bdToday } from '../time';

type R = Record<string, any>;
export type KnowledgeInput = { products: R[]; offers: R[]; couriers: R[]; kb: R[]; settings: R };

// Form selects store 'true'/'false' strings; missing = on.
export const ibBool = (x: unknown) => !(x === false || x === 'false');

export const IB_RULES_DEFAULT = 'Bangla/Banglish/English — customer je bhashay likhe sei bhashay, chhoto kore, bhadro bhabe ("apu/bhaiya"). Shudhu knowledge e deya dam/offer bolbe, nijer theke dam ba discount banabe na. Stock er sonkhya bolbe na. Kono rog sarano, ojon barano ba daktari claim korbe na. Order hole nam, phone, thikana, product, poriman, babyr boyosh niye nibe. Customer raag korle, complaint korle, refund chaile ba "manush er sathe kotha bolbo" bolle needs_human = true. Lottery/draw er kotha bolbe na.';

export function ibCompile(k: KnowledgeInput, today = bdToday()): string {
  const P = k.products.filter((p) => ibBool(p.active));
  const O = k.offers.filter((o) => ibBool(o.active) && (!o.until || o.until >= today));
  const Cr = k.couriers;
  const K = k.kb.filter((x) => ibBool(x.use));
  const st = k.settings;
  const out = ['KIDS CARE BD — ghore toiri certified baby food.'];
  if (P.length) out.push('\n=== PRODUCT O DAM (shudhu ei dam bolbe) ===\n' + P.map((p) => '- ' + p.name + (p.price ? ' | dam: ' + p.price : '') + (p.age ? ' | boyosh: ' + p.age : '') + (p.ingredients ? ' | upadan: ' + p.ingredients : '') + (p.howto ? ' | banano: ' + p.howto : '') + (p.notes ? ' | ' + p.notes : '')).join('\n'));
  if (O.length) out.push('\n=== CHOLTI OFFER ===\n' + O.map((o) => '- ' + o.title + (o.price ? ' — ' + o.price : '') + (o.details ? ': ' + o.details : '') + (o.until ? ' (meyad ' + o.until + ' porjonto)' : '')).join('\n'));
  else out.push('\n=== CHOLTI OFFER ===\n- Ekhon kono offer nai. Offer chaile bolo ekhon nai.');
  if (Cr.length) out.push('\n=== DELIVERY ===\n' + Cr.map((c) => '- ' + c.area + ': ৳' + c.charge + ', ' + c.days + (c.name ? ' (' + c.name + ')' : '')).join('\n') + '\nPayment: ' + (st.payment || 'Cash on delivery'));
  if (K.length) out.push('\n=== AROO TOTTHO / FAQ ===\n' + K.map((x) => '# ' + x.title + '\n' + String(x.text || '').slice(0, 4000)).join('\n\n'));
  return out.join('\n').slice(0, 30000);
}

export function ibRulesCompile(st: R): string {
  return [st.rules || IB_RULES_DEFAULT, st.greeting ? 'Prothom message er shuru: ' + st.greeting : '', st.tone ? 'Tone: ' + st.tone : '', st.samples ? 'AMADER UTTOR DEYAR DHORON (ei style copy korbe):\n' + st.samples : ''].filter(Boolean).join('\n\n').slice(0, 12000);
}
