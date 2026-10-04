import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const machineIds = [
  'BL-5702',
  'HE-3301',
  'PM-4405B',
  'KO-3201',
  'PU-2101B',
] as const;

const alertRequestSchema = z
  .object({
    machineId: z.enum(machineIds),
    riskLevel: z.enum(['high', 'medium', 'low']),
    title: z.string().trim().min(1).max(200),
    evidence: z.string().trim().min(1).max(1500),
    action: z.string().trim().min(1).max(2000),
  })
  .strict();

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Alerts API is missing its public Supabase environment variables.');
    return json({ error: 'Alerts are not configured on the server.' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('Unable to count alerts.', {
      code: error.code,
      message: error.message,
    });
    return json({ error: 'Unable to count alerts.' }, 502);
  }

  return json({ count: count ?? 0 });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return json({ error: 'Request body is too large.' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = alertRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: 'Invalid alert details.',
        details: parsed.error.issues.map(({ path, message }) => ({
          field: path.join('.'),
          message,
        })),
      },
      400,
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Alerts API is missing its public Supabase environment variables.');
    return json({ error: 'Alerts are not configured on the server.' }, 500);
  }

  const alertStatus = {
    high: 'high risk',
    medium: 'medium risk',
    low: 'low risk',
  }[parsed.data.riskLevel];
  const cause = `${parsed.data.title}\n\nEvidence: ${parsed.data.evidence}`;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.from('alerts').insert({
    mesin: parsed.data.machineId,
    penyebab: cause,
    alert_status: alertStatus,
    recommended_action: parsed.data.action,
    assign_staf: 'Unassigned',
    status: 'unsolved',
  });

  if (error) {
    console.error('Unable to create alert from root-cause insight.', {
      code: error.code,
      message: error.message,
    });
    return json(
      {
        error:
          error.code === '42501' || error.code === 'PGRST301'
            ? 'Supabase denied alert creation. Check INSERT grants and Row Level Security policies for alerts.'
            : 'Unable to save the alert. Check the alerts table schema and database logs.',
      },
      502,
    );
  }

  return json(
    {
      success: true,
      alert: {
        mesin: parsed.data.machineId,
        penyebab: cause,
        alert_status: alertStatus,
        recommended_action: parsed.data.action,
        assign_staf: 'Unassigned',
        status: 'unsolved',
      },
    },
    201,
  );
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = z.object({ confirm: z.literal(true) }).safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Explicit confirmation is required to delete solved alerts.' }, 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Alerts API is missing its public Supabase environment variables.');
    return json({ error: 'Alerts are not configured on the server.' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('alerts')
    .delete()
    .eq('status', 'solved')
    .select('id');

  if (error) {
    console.error('Unable to delete all solved alerts.', {
      code: error.code,
      message: error.message,
    });
    return json(
      {
        error:
          error.code === '42501' || error.code === 'PGRST301'
            ? 'Supabase denied deletion. Check DELETE grants and Row Level Security policies for alerts.'
            : 'Unable to delete solved alerts. Check the alerts table schema and database logs.',
      },
      502,
    );
  }

  return json({ success: true, deleted: data?.length ?? 0 });
}
