import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { loadEnv } from '../config/env';
import { McpSession, McpUnavailableError, type DiscoveredTool } from '../adapters/inventory/mcp/session';
import { buildToolCatalog } from '../adapters/inventory/mcp/tool-catalog';

loadDotenv({ path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../.env') });

/**
 * Discovery spike для Tutu MCP.
 *
 * Команда обязана завершаться ненулевым кодом, если соединение не установилось:
 * успешный exit без snapshot'а выглядел бы как «всё в порядке», хотя схемы так и не
 * подтверждены. Snapshot пишется только после успешного `tools/list` и не содержит
 * секретов, cookies и персональных данных (§3.3 системного дизайна).
 */

const SNAPSHOT_PATH = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../docs/mcp-tools.snapshot.json',
);

async function main(): Promise<number> {
  const env = loadEnv();
  const session = new McpSession({
    url: env.TUTU_MCP_URL,
    timeoutMs: env.MCP_CALL_TIMEOUT_MS,
    clientName: 'tutu-plan-b-inspect',
    clientVersion: '0.1.0',
    ...(env.TUTU_MCP_AUTH_TOKEN === undefined ? {} : { authToken: env.TUTU_MCP_AUTH_TOKEN }),
  });

  console.log(`MCP inspect → ${env.TUTU_MCP_URL}`);

  try {
    const tools = await session.connect();
    const catalog = buildToolCatalog(tools);
    const snapshot = sanitizeSnapshot(env.TUTU_MCP_URL, tools, catalog);

    await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
    await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    console.log(`Найдено tool'ов: ${tools.length}`);
    console.log(`Сопоставлено категорий: ${[...catalog.bindings.keys()].join(', ') || 'нет'}`);
    if (catalog.unmatched.length > 0) console.log(`Не сопоставлено: ${catalog.unmatched.join(', ')}`);
    if (catalog.forbidden.length > 0) console.log(`Отклонено deny-list'ом: ${catalog.forbidden.join(', ')}`);
    console.log(`Snapshot: ${SNAPSHOT_PATH}`);
    return 0;
  } catch (error) {
    const message = error instanceof McpUnavailableError ? error.message : describe(error);
    console.error(`MCP inspect не удался: ${message}`);
    if (error instanceof McpUnavailableError && error.detail !== undefined) {
      console.error(describe(error.detail));
    }
    return 1;
  } finally {
    await session.close();
  }
}

interface Snapshot {
  readonly inspectedAt: string;
  readonly urlHost: string;
  readonly toolCount: number;
  readonly bindings: Readonly<Record<string, string>>;
  readonly unmatched: readonly string[];
  readonly forbidden: readonly string[];
  readonly tools: readonly SanitizedTool[];
}

interface SanitizedTool {
  readonly name: string;
  readonly description: string;
  readonly required: readonly string[];
  readonly properties: readonly SanitizedProperty[];
}

interface SanitizedProperty {
  readonly name: string;
  readonly type: string | undefined;
  readonly format: string | undefined;
  readonly hasDefault: boolean;
  readonly enumCount: number;
}

function sanitizeSnapshot(
  url: string,
  tools: readonly DiscoveredTool[],
  catalog: ReturnType<typeof buildToolCatalog>,
): Snapshot {
  const bindings: Record<string, string> = {};
  for (const [capability, tool] of catalog.bindings) bindings[capability] = tool.name;

  return {
    inspectedAt: new Date().toISOString(),
    urlHost: new URL(url).host,
    toolCount: tools.length,
    bindings,
    unmatched: catalog.unmatched,
    forbidden: catalog.forbidden,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: redact(tool.description),
      required: tool.inputSchema.required,
      properties: Object.entries(tool.inputSchema.properties).map(([name, property]) => ({
        name,
        type: property.type,
        format: property.format,
        hasDefault: property.hasDefault,
        // Значения enum не пишем: среди них могут оказаться внутренние идентификаторы.
        enumCount: property.enumValues?.length ?? 0,
      })),
    })),
  };
}

const SECRET_PATTERN = /(api[_-]?key|token|secret|password|authorization|cookie|bearer)/giu;

function redact(text: string): string {
  return text.replace(SECRET_PATTERN, '[redacted]');
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const code = await main();
process.exitCode = code;
