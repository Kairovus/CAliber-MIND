import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const maxDuration = 60;

const machines = [
  {
    id: 'BL-5702',
    name: 'Product Blower',
    prefix: 'BL5702',
    production: 'Production Data - RCA5 BL-5702',
    performance: 'Equipment Performance - RCA5 BL-5702',
    tags: 'Production Data - RCA5 BL-5702 - TAG',
  },
  {
    id: 'HE-3301',
    name: 'Feed/Effluent Heat Exchanger',
    prefix: 'HE3301',
    production: 'Production Data - RCA4 HE-3301',
    performance: 'Equipment Performance - RCA4 HE-3301',
    tags: 'Production Data - RCA4 HE-3301 - TAG',
  },
  {
    id: 'PM-4405B',
    name: 'Cooling Water Pump',
    prefix: 'PM4405B',
    production: 'Production Data - RCA3 PM-4405B',
    performance: 'Equipment Performance - RCA3 PM-4405B',
    tags: 'Production Data - RCA3 PM-4405B - TAG',
  },
  {
    id: 'KO-3201',
    name: 'Cracked Gas Compressor',
    prefix: 'KO3201',
    production: 'Production Data - RCA2 KO-3201',
    performance: 'Equipment Performance - RCA2 KO-3201',
    tags: 'Production Data - RCA2 KO-3201 - TAG',
  },
  {
    id: 'PU-2101B',
    name: 'Feed Charge Pump',
    prefix: 'PU2101B',
    production: 'Production Data - RCA1 PU-2101B',
    performance: 'Equipment Performance - RCA1 PU-2101B',
    tags: 'Production Data - RCA1 PU-2101B - TAG',
  },
] as const;

const insightSchema = z.object({
  highRisk: z.array(
    z.object({
      machineId: z.string(),
      title: z.string(),
      evidence: z.string(),
      action: z.string(),
    }),
  ).max(10),
  lowRisk: z.array(
    z.object({
      machineId: z.string(),
      title: z.string(),
      evidence: z.string(),
      action: z.string(),
    }),
  ).max(10),
  recommendedActions: z.array(
    z.object({
      machineId: z.string(),
      title: z.string(),
      reason: z.string(),
      action: z.string(),
    }),
  ).max(10),
});

type Row = Record<string, unknown>;
type InsightPayload = {
  generatedAt: string;
  window: string;
  thresholds: string;
  insights: z.infer<typeof insightSchema>;
};

let cachedInsights: { expiresAt: number; payload: InsightPayload } | null = null;
let insightGeneration: Promise<z.infer<typeof insightSchema>> | null = null;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function findAbnormalities(
  prefix: string,
  production: Row[],
  performance: Row[],
  tags: Row[],
) {
  const baselines = new Map<string, number>();
  for (const tag of tags) {
    if (
      typeof tag.Name === 'string' &&
      tag.Name.startsWith(`${prefix}_`) &&
      typeof tag.typicalvalue === 'number' &&
      Number.isFinite(tag.typicalvalue)
    ) {
      baselines.set(tag.Name.slice(prefix.length + 1), tag.typicalvalue);
    }
  }

  const abnormalities: Array<Record<string, unknown>> = [];
  for (const productionRow of production) {
    if (
      typeof productionRow.RUN_STATUS === 'string' &&
      productionRow.RUN_STATUS.trim().toLowerCase() === 'off'
    ) {
      continue;
    }
    for (const suffix of ['FEED', 'DISP', 'VIB', 'TEMP', 'AMP']) {
      const reading = productionRow[`${prefix}_${suffix}`];
      const typical = baselines.get(suffix);
      if (
        typeof reading !== 'number' ||
        !Number.isFinite(reading) ||
        typical === undefined ||
        typical === 0
      ) {
        continue;
      }
      const deviation = Math.abs(reading - typical) / Math.abs(typical);
      if (deviation >= 0.1) {
        abnormalities.push({
          source: 'production',
          metric: `${prefix}_${suffix}`,
          timestamp: productionRow.Timestamp,
          reading,
          typicalValue: typical,
          deviationPercent: Number((deviation * 100).toFixed(1)),
          level: deviation >= 0.25 ? 'high' : 'low',
          rule: 'absolute deviation from typicalvalue; heuristic thresholds 10% warning and 25% high risk',
        });
      }
    }
  }

  const latestPerformance = performance[0];
  if (latestPerformance && performance.length > 3) {
    for (const [column, value] of Object.entries(latestPerformance)) {
      if (
        ['Week', 'Date', 'Health Status', 'Remark'].includes(column) ||
        typeof value !== 'number' ||
        !Number.isFinite(value)
      ) {
        continue;
      }
      const previous = performance
        .slice(1)
        .map((row) => row[column])
        .filter((reading): reading is number => typeof reading === 'number' && Number.isFinite(reading));
      if (previous.length < 3) continue;
      const center = median(previous);
      if (center === 0) continue;
      const deviation = Math.abs(value - center) / Math.abs(center);
      if (deviation >= 0.1) {
        abnormalities.push({
          source: 'equipment performance',
          metric: column.replace(/\s+/g, ' ').trim(),
          date: latestPerformance.Date,
          latestReading: value,
          previousReadingsMedian: Number(center.toFixed(4)),
          deviationPercent: Number((deviation * 100).toFixed(1)),
          level: deviation >= 0.25 ? 'high' : 'low',
          rule: `latest value compared with median of previous ${previous.length} performance records; heuristic thresholds 10% warning and 25% high risk`,
        });
      }
    }
  }

  return abnormalities;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST() {
  if (cachedInsights && cachedInsights.expiresAt > Date.now()) {
    return json(cachedInsights.payload);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Root-cause insights API is missing its public Supabase environment variables.');
    return json({ error: 'Supabase is not configured on the server.' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let machineData: Array<{
    id: string;
    name: string;
    prefix: string;
    productionRows: Row[];
    performanceRows: Row[];
    tagRows: Row[];
  }>;
  try {
    machineData = await Promise.all(
      machines.map(async (machine) => {
        const [productionResult, performanceResult, tagResult] =
          await Promise.all([
            supabase
              .from(encodeURIComponent(machine.production))
              .select('*')
              .order('Timestamp', { ascending: false })
              .limit(10),
            supabase
              .from(encodeURIComponent(machine.performance))
              .select('*')
              .order('Date', { ascending: false })
              .limit(10),
            supabase.from(encodeURIComponent(machine.tags)).select('*'),
          ]);

        const errors = [
          productionResult.error,
          performanceResult.error,
          tagResult.error,
        ].filter((error) => error !== null);
        if (errors.length > 0) {
          console.error('Unable to load root-cause source data.', {
            machineId: machine.id,
            errors: errors.map(({ code, message }) => ({ code, message })),
          });
          throw new Error(`Unable to read source data for ${machine.id}.`);
        }

        return {
          ...machine,
          productionRows: productionResult.data ?? [],
          performanceRows: performanceResult.data ?? [],
          tagRows: tagResult.data ?? [],
        };
      }),
    );
  } catch (error) {
    console.error('Root-cause source data loading failed.', error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to read machine source data.',
      },
      502,
    );
  }

  const evidence = machineData.map((machine) => ({
    machineId: machine.id,
    machineName: machine.name,
    productionRows: machine.productionRows,
    typicalValues: Object.fromEntries(
      machine.tagRows.flatMap((tag) => {
        if (
          typeof tag.Name !== 'string' ||
          !tag.Name.startsWith(`${machine.prefix}_`) ||
          typeof tag.typicalvalue !== 'number'
        ) {
          return [];
        }
        return [[tag.Name.slice(machine.prefix.length + 1), tag.typicalvalue]];
      }),
    ),
    equipmentPerformanceRows: machine.performanceRows,
    detectedAbnormalities: findAbnormalities(
      machine.prefix,
      machine.productionRows,
      machine.performanceRows,
      machine.tagRows,
    ),
  }));

  try {
    if (!insightGeneration) {
      insightGeneration = generateText({
        model: google('gemini-3.8-flash'),
        maxRetries: 0,
        output: Output.object({ schema: insightSchema }),
        system: `You are an industrial equipment condition analyst producing cautious root-cause investigation suggestions for a university project. Analyze all five machines and all supplied production readings, tag typical values, and equipment-performance records. The detectedAbnormalities are simple screening flags only: typicalvalue deviation uses 10% for low risk and 25% for high risk; performance values compare the latest row to the median of previous rows using the same percentages. These are project heuristics, not engineering alarm limits. Do not describe a heuristic as a validated safety limit.

Return concise plain-language findings in three groups. highRisk must only contain evidence flagged high; lowRisk must only contain evidence flagged low. recommendedActions may propose follow-up checks based on those findings, or recommend continued monitoring when no abnormalities are detected. Every finding must cite its machine and actual supplied metric/value/date; never invent observations, causes, limits, or data. If values are normal or data is missing, say so and do not fabricate a fault. Do not assume repairs, overhauls, cleaning, seal failures, or any maintenance history unless explicitly present in the supplied rows. Phrase suspected causes as items to inspect, not confirmed diagnoses. Recommendations are for human review and must never instruct automatic control changes, shutdowns, or bypassing safety systems. If RUN_STATUS is off, describe the machine as idle and not currently assessed.`,
        prompt: `Review all machine data below and return evidence-based root-cause leads, grouped into highRisk, lowRisk, and recommendedActions. Do not force every group to have entries. If no data is abnormal, provide a recommended action to continue monitoring and say no abnormality was detected in the available window.\n\n${JSON.stringify(evidence)}`,
      }).then(({ output }) => {
        if (!output) throw new Error('AI did not return structured root-cause insights.');
        return output;
      });
    }

    const insights = await insightGeneration;
    const payload: InsightPayload = {
      generatedAt: new Date().toISOString(),
      window: 'Latest 10 production readings and latest 10 weekly performance records per machine',
      thresholds: 'Project heuristic only: 10% low-risk deviation, 25% high-risk deviation',
      insights,
    };
    cachedInsights = { expiresAt: Date.now() + 10 * 60 * 1000, payload };
    return json(payload);
  } catch (error) {
    console.error('Root-cause insight generation failed.', error);
    insightGeneration = null;
    const message =
      error instanceof Error && /quota|rate.?limit|429/i.test(error.message)
        ? 'Google AI usage quota is exhausted. Wait for the quota to reset or enable billing, then refresh.'
        : error instanceof Error && error.message.includes('structured root-cause insights')
          ? error.message
          : 'Unable to generate AI root-cause insights. Please try again later.';
    return json({ error: message }, 502);
  } finally {
    insightGeneration = null;
  }
}
