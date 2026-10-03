import { google } from '@ai-sdk/google';
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const maxDuration = 30;

// Initialize Supabase client - use the publishable key (equivalent to anon key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  const {
    messages,
    machineId,
    machineName,
  }: { messages: UIMessage[]; machineId?: string; machineName?: string } =
    await req.json();

  const machineContext =
    machineId && machineName
      ? `The user is currently viewing equipment: ${machineName} (ID: ${machineId}).`
      : 'No specific equipment selected.';

  const result = streamText({
    model: google('gemini-3.8-flash'),
    system: `You are a helpful AI assistant for an industrial equipment monitoring dashboard. 
${machineContext}
Answer questions about equipment health, signals, incidents, and recommended actions. 
Use the provided tools to query the database for real incident data when relevant.
Be concise and actionable in your responses.`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getIncidents: tool({
        description:
          'Get equipment-related risk incidents from the database. Can filter by tag number (machine ID).',
        inputSchema: z.object({
          limit: z
            .number()
            .optional()
            .describe('Number of incidents to fetch. Default is 5.'),
          tagNumber: z
            .string()
            .optional()
            .describe('Equipment tag number to filter by, e.g. BL-5702'),
        }),
        execute: async ({ limit, tagNumber }) => {
          // Use rpc() to avoid URL encoding issues with the em-dash in the table name
          const { data, error } = await supabase.rpc('get_incidents', {
            p_limit: limit || 5,
            p_tag: tagNumber || null,
          });

          if (error) {
            return { error: `Database error: ${error.message}` };
          }
          if (!data || data.length === 0) {
            return { message: 'No incidents found for the specified criteria.' };
          }
          return { incidents: data, count: data.length };
        },
      }),
      getEquipmentPerformance: tool({
        description:
          'Get weekly performance data for a specific equipment (last 4 weeks).',
        inputSchema: z.object({
          machineId: z
            .string()
            .describe(
              'The machine ID, e.g. BL-5702, HE-3301, PM-4405B, KO-3201, PU-2101B'
            ),
        }),
        execute: async ({ machineId }) => {
          const { data, error } = await supabase.rpc('get_equipment_performance', {
            p_machine_id: machineId,
            p_limit: 4,
          });

          if (error) {
            return { error: `Database error: ${error.message}` };
          }
          return { performance: data, machine: machineId };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}