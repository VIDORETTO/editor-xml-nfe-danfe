type RecordValue = Record<string, unknown>;

export interface RecalculatedInvoiceTotals {
  vProd: string;
  vBC: string;
  vICMS: string;
  vIPI: string;
  vPIS: string;
  vCOFINS: string;
  vNF: string;
  paymentValue?: string;
}

export type RecalculationResult =
  | { ok: true; totals: RecalculatedInvoiceTotals }
  | { ok: false; message: string };

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function parseCents(value: unknown, path: string): { ok: true; value: bigint } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: 0n };

  const raw = String(value).trim();
  if (!raw) return { ok: true, value: 0n };

  const match = raw.match(/^([+-]?)(\d*)(?:\.(\d{0,2}))?$/);
  if (!match || (!match[2] && !match[3])) {
    return {
      ok: false,
      message: `${path} precisa ser um valor decimal com no máximo duas casas. Nenhum total foi alterado.`,
    };
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] || '0');
  const fraction = BigInt((match[3] || '').padEnd(2, '0') || '0');
  return { ok: true, value: sign * (whole * 100n + fraction) };
}

function formatCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function firstVariantValue(group: unknown, field: string): unknown {
  const variants = asRecord(group);
  if (!variants) return undefined;

  for (const variant of Object.values(variants)) {
    const values = asRecord(variant);
    if (values && field in values) return values[field];
  }

  return undefined;
}

function sumValues(values: Array<{ path: string; value: unknown }>): { ok: true; value: bigint } | { ok: false; message: string } {
  let total = 0n;

  for (const entry of values) {
    const parsed = parseCents(entry.value, entry.path);
    if (!parsed.ok) return parsed;
    total += parsed.value;
  }

  return { ok: true, value: total };
}

function itemValues(items: unknown[], selector: (item: RecordValue) => unknown, path: string) {
  return items.map((value, index) => ({
    path: `det[${index + 1}].${path}`,
    value: selector(asRecord(value) ?? {}),
  }));
}

export function calculateNfeTotals(invoice: unknown): RecalculationResult {
  const infNFe = asRecord(invoice);
  const total = asRecord(asRecord(infNFe?.total)?.ICMSTot);
  if (!infNFe || !total) {
    return { ok: false, message: 'O XML não contém os totais esperados da NF-e. Nenhum total foi alterado.' };
  }

  const rawItems = infNFe.det;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const itemTotal = (path: string, selector: (item: RecordValue) => unknown) => sumValues(itemValues(items, selector, path));

  const totalItems = items.filter(value => asRecord(asRecord(value)?.prod)?.indTot !== '0');
  const vProd = sumValues(itemValues(totalItems, item => asRecord(item.prod)?.vProd, 'prod.vProd'));
  const vBC = itemTotal('imposto.ICMS.vBC', item => firstVariantValue(asRecord(item.imposto)?.ICMS, 'vBC'));
  const vICMS = itemTotal('imposto.ICMS.vICMS', item => firstVariantValue(asRecord(item.imposto)?.ICMS, 'vICMS'));
  const vIPI = itemTotal('imposto.IPI.vIPI', item => firstVariantValue(asRecord(item.imposto)?.IPI, 'vIPI'));
  const vPIS = itemTotal('imposto.PIS.vPIS', item => firstVariantValue(asRecord(item.imposto)?.PIS, 'vPIS'));
  const vCOFINS = itemTotal('imposto.COFINS.vCOFINS', item => firstVariantValue(asRecord(item.imposto)?.COFINS, 'vCOFINS'));

  for (const result of [vProd, vBC, vICMS, vIPI, vPIS, vCOFINS]) {
    if (result.ok === false) return { ok: false, message: result.message };
  }

  if (vProd.ok === false) return { ok: false, message: vProd.message };
  if (vBC.ok === false) return { ok: false, message: vBC.message };
  if (vICMS.ok === false) return { ok: false, message: vICMS.message };
  if (vIPI.ok === false) return { ok: false, message: vIPI.message };
  if (vPIS.ok === false) return { ok: false, message: vPIS.message };
  if (vCOFINS.ok === false) return { ok: false, message: vCOFINS.message };

  const additions = sumValues([
    { path: 'total.vST', value: total.vST },
    { path: 'total.vFCPST', value: total.vFCPST },
    { path: 'total.vFrete', value: total.vFrete },
    { path: 'total.vSeg', value: total.vSeg },
    { path: 'total.vOutro', value: total.vOutro },
    { path: 'total.vII', value: total.vII },
    { path: 'total.vIPIDevol', value: total.vIPIDevol },
    { path: 'total.vServ', value: total.vServ },
  ]);
  if (additions.ok === false) return { ok: false, message: additions.message };
  const discount = parseCents(total.vDesc, 'total.vDesc');
  if (discount.ok === false) return { ok: false, message: discount.message };
  const icmsDeson = parseCents(total.vICMSDeson, 'total.vICMSDeson');
  if (icmsDeson.ok === false) return { ok: false, message: icmsDeson.message };

  // MOC validation W16 does not add ICMS, PIS, or COFINS again: those values
  // are already represented in the product value. It does include these total
  // fields and subtracts discounts and ICMS desoneration.
  const vNF = vProd.value + vIPI.value + additions.value - discount.value - icmsDeson.value;
  const payments = asRecord(infNFe.pag)?.detPag;
  const paymentEntries = Array.isArray(payments) ? payments : payments ? [payments] : [];

  return {
    ok: true,
    totals: {
      vProd: formatCents(vProd.value),
      vBC: formatCents(vBC.value),
      vICMS: formatCents(vICMS.value),
      vIPI: formatCents(vIPI.value),
      vPIS: formatCents(vPIS.value),
      vCOFINS: formatCents(vCOFINS.value),
      vNF: formatCents(vNF),
      ...(paymentEntries.length === 1 ? { paymentValue: formatCents(vNF) } : {}),
    },
  };
}
