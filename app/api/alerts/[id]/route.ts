import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const alertIdSchema = z.string().uuid();
const updateSchema = z
  .object({
    recommended_action: z.string().trim().max(2000),
    assign_staf: z.string().trim().min(1).max(200),
    status: z.enum(['unsolved', 'in_progress', 'solved']),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one alert field must be provided.',
  });

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function parseJson(request: Request): Promise<
  | { success: true; data: unknown }
  | { success: false; response: Response }
> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return {
      success: false,
      response: json({ error: 'Request body is too large.' }, 413),
    };
  }

  try {
    return { success: true, data: await request.json() };
  } catch {
    return {
      success: false,
      response: json({ error: 'Request body must be valid JSON.' }, 400),
    };
  }
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return url && key ? createClient(url, key) : null;
}

function databaseError(message: string, code?: string) {
  console.error(message, { code });
  return json(
    {
      error:
        code === '42501' || code === 'PGRST301'
          ? 'Supabase denied this alert change. Check UPDATE/DELETE grants and Row Level Security policies.'
          : 'Unable to update the alert. Check the alerts table schema and database logs.',
    },
    502,
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!alertIdSchema.safeParse(id).success) {
    return json({ error: 'Invalid alert ID.' }, 400);
  }

  const parsedBody = await parseJson(request);
  if (!parsedBody.success) return parsedBody.response;

  const parsed = updateSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return json(
      {
        error: 'Invalid alert update.',
        details: parsed.error.issues.map(({ path, message }) => ({
          field: path.join('.'),
          message,
        })),
      },
      400,
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Alerts API is missing its public Supabase environment variables.');
    return json({ error: 'Alerts are not configured on the server.' }, 500);
  }

  if (
    parsed.data.assign_staf !== undefined &&
    parsed.data.assign_staf !== 'Unassigned'
  ) {
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id')
      .eq('full_name', parsed.data.assign_staf)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (employeeError) {
      return databaseError('Unable to verify alert owner.', employeeError.code);
    }
    if (!employee) {
      return json({ error: 'Selected owner is not an active employee.' }, 400);
    }
  }

  const { data, error } = await supabase
    .from('alerts')
    .update(parsed.data)
    .eq('id', id)
    .select('id, recommended_action, assign_staf, status')
    .maybeSingle();

  if (error) return databaseError('Unable to update alert.', error.code);
  if (!data) {
    return json(
      { error: 'Alert was not found or cannot be updated with current database permissions.' },
      404,
    );
  }

  return json({ success: true, alert: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!alertIdSchema.safeParse(id).success) {
    return json({ error: 'Invalid alert ID.' }, 400);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Alerts API is missing its public Supabase environment variables.');
    return json({ error: 'Alerts are not configured on the server.' }, 500);
  }

  const { data, error } = await supabase
    .from('alerts')
    .delete()
    .eq('id', id)
    .eq('status', 'solved')
    .select('id')
    .maybeSingle();

  if (error) return databaseError('Unable to delete solved alert.', error.code);
  if (!data) {
    return json(
      { error: 'Alert was not found, is not solved, or cannot be deleted with current database permissions.' },
      404,
    );
  }

  return json({ success: true, deleted: 1 });
}
