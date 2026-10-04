import { createClient } from '@supabase/supabase-js';

const TABLES: Record<string, string> = {
  'production-rca1-pu-2101b': 'Production Data - RCA1 PU-2101B',
  'production-rca2-ko-3201': 'Production Data - RCA2 KO-3201',
  'production-rca3-pm-4405b': 'Production Data - RCA3 PM-4405B',
  'production-rca4-he-3301': 'Production Data - RCA4 HE-3301',
  'production-rca5-bl-5702': 'Production Data - RCA5 BL-5702',
  'equipment-performance-rca1-pu-2101b':
    'Equipment Performance - RCA1 PU-2101B',
  'equipment-performance-rca2-ko-3201': 'Equipment Performance - RCA2 KO-3201',
  'equipment-performance-rca3-pm-4405b':
    'Equipment Performance - RCA3 PM-4405B',
  'equipment-performance-rca4-he-3301': 'Equipment Performance - RCA4 HE-3301',
  'equipment-performance-rca5-bl-5702': 'Equipment Performance - RCA5 BL-5702',
  'production-tags-rca1-pu-2101b': 'Production Data - RCA1 PU-2101B - TAG',
  'production-tags-rca2-ko-3201': 'Production Data - RCA2 KO-3201 - TAG',
  'production-tags-rca3-pm-4405b': 'Production Data - RCA3 PM-4405B - TAG',
  'production-tags-rca4-he-3301': 'Production Data - RCA4 HE-3301 - TAG',
  'production-tags-rca5-bl-5702': 'Production Data - RCA5 BL-5702 - TAG',
  'equipment-summary-rca1-pu-2101b':
    'Equipment Performance - RCA1 PU-2101B - SUMMARY',
  'equipment-summary-rca2-ko-3201':
    'Equipment Performance - RCA2 KO-3201 -SUMMARY',
  'equipment-summary-rca3-pm-4405b':
    'Equipment Performance - RCA3 PM-4405B - SUMMARY',
  'equipment-summary-rca4-he-3301':
    'Equipment Performance - RCA4 HE-3301 - SUMMARY',
  'equipment-summary-rca5-bl-5702':
    'Equipment Performance - RCA5 BL-5702 - SUMMARY',
  'equipment-risk-incidents':
    'EQUIPMENT RELATED RISK — INCIDENT DATABASE (RCA & CAPA/PAA)',
  alerts: 'alerts',
  employees: 'employees',
  machines: 'machines',
  incidents: 'incidents',
  'summary-status': 'summary_status',
  'summary-discipline': 'summary_discipline',
  'summary-plant': 'summary_plant',
  'summary-equipment': 'summary_equipment',
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function getIntegerParam(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }

  return parsed;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table: tableKey } = await params;
  if (!Object.hasOwn(TABLES, tableKey)) {
    return json({ error: 'Unknown table.' }, 404);
  }

  const table = TABLES[tableKey];

  const url = new URL(request.url);

  // limit di atas MAX_LIMIT di-clamp, bukan ditolak
  const requestedLimit = getIntegerParam(
    url.searchParams.get('limit'),
    DEFAULT_LIMIT,
    1,
    Number.MAX_SAFE_INTEGER
  );
  const limit = requestedLimit === null ? null : Math.min(requestedLimit, MAX_LIMIT);

  const offset = getIntegerParam(
    url.searchParams.get('offset'),
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );

  if (
    limit === null ||
    offset === null ||
    offset > Number.MAX_SAFE_INTEGER - limit
  ) {
    return json(
      {
        error: `Invalid pagination. Use limit=1-${MAX_LIMIT} and a non-negative integer offset.`,
      },
      400
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      'Supabase table API is missing its public environment variables.'
    );
    return json({ error: 'Supabase is not configured on the server.' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  // Encode special characters so names with spaces, slashes, or Unicode remain one path segment.
  const columns =
    tableKey === 'employees' ? 'id,full_name,is_active' : '*';
  let query = supabase.from(encodeURIComponent(table)).select(columns);
  if (tableKey.startsWith('production-rca')) {
    // terbaru dulu -> limit 100 = 100 data terakhir
    query = query.order('Timestamp', { ascending: false });
  } else if (tableKey.startsWith('equipment-performance-')) {
    query = query.order('Date', { ascending: false });
  } else if (tableKey === 'alerts') {
    query = query.order('time_stamp', { ascending: false });
  }

  const t0 = performance.now();
  const { data, error } = await query.range(offset, offset + limit);
  console.log(
    `[tables/${tableKey}] query ${Math.round(performance.now() - t0)}ms, rows=${data?.length ?? 0}, error=${error?.message ?? 'none'}`
  );

  if (error) {
    console.error('Supabase table read failed.', {
      table,
      code: error.code,
      message: error.message,
    });
    return json({ error: 'Unable to read the requested table.' }, 502);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;

  return json({
    table,
    data: hasMore ? rows.slice(0, limit) : rows,
    pagination: { limit, offset, hasMore },
  });
}