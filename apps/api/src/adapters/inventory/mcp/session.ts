import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Транспортный слой Tutu MCP.
 *
 * Здесь заканчивается всё, что знает о протоколе: наружу отдаётся только `unknown`
 * (§4.1 spec). Причина не стилистическая — схемы tool'ов не подтверждены (см.
 * `docs/MCP_SPIKE_REPORT.md`), и любой типизированный контракт на этом уровне был бы
 * догадкой, выдающей себя за факт.
 */

export interface McpSessionOptions {
  readonly url: string;
  readonly authToken?: string | undefined;
  /** Тайм-аут одного tool call. Общий бюджет плана считает оркестратор. */
  readonly timeoutMs: number;
  readonly clientName: string;
  readonly clientVersion: string;
}

/** Описание tool'а из `tools/list`, приведённое к минимуму, который нам нужен. */
export interface DiscoveredTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchemaObject;
}

export interface JsonSchemaObject {
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required: readonly string[];
}

export interface JsonSchemaProperty {
  readonly type: string | undefined;
  readonly description: string | undefined;
  readonly format: string | undefined;
  readonly enumValues: readonly string[] | undefined;
  readonly hasDefault: boolean;
}

export class McpUnavailableError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'McpUnavailableError';
  }
}

export class McpSession {
  private client: Client | undefined;
  private transport: StreamableHTTPClientTransport | undefined;

  constructor(private readonly options: McpSessionOptions) {}

  /**
   * Устанавливает соединение и возвращает каталог tool'ов.
   *
   * Discovery выполняется в рантайме и не кэшируется на диске: имена tool'ов —
   * собственность сервера, а не наша константа (§11.1 системного дизайна).
   */
  async connect(): Promise<readonly DiscoveredTool[]> {
    const headers: Record<string, string> = {};
    if (this.options.authToken !== undefined) {
      headers['authorization'] = `Bearer ${this.options.authToken}`;
    }

    const transport = new StreamableHTTPClientTransport(new URL(this.options.url), {
      requestInit: { headers },
    });

    const client = new Client(
      { name: this.options.clientName, version: this.options.clientVersion },
      { capabilities: {} },
    );

    try {
      // SDK объявляет sessionId как обязательный string, реализация — как string | undefined.
      // Соединение валидно; это расхождение типов, а не отсутствие транспорта.
      await client.connect(transport as unknown as Parameters<Client['connect']>[0], {
        timeout: this.options.timeoutMs,
      });
    } catch (error) {
      await transport.close().catch(() => undefined);
      throw new McpUnavailableError(`Не удалось подключиться к MCP ${this.options.url}`, error);
    }

    this.client = client;
    this.transport = transport;

    try {
      const listed = await client.listTools({}, { timeout: this.options.timeoutMs });
      return listed.tools.map((tool) =>
        toDiscoveredTool(tool.name, tool.description, tool.inputSchema),
      );
    } catch (error) {
      await this.close();
      throw new McpUnavailableError('MCP подключился, но не отдал список tool\'ов', error);
    }
  }

  /**
   * Вызывает tool и возвращает распакованный JSON.
   *
   * Ошибка tool'а не выбрасывается наверх как исключение: отказ одной категории не
   * должен ронять остальные (§7.2), поэтому вызывающий получает `ok: false` и решает
   * сам, что показать пользователю.
   */
  async callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<McpCallResult> {
    const client = this.client;
    if (client === undefined) throw new McpUnavailableError('MCP-сессия не установлена');

    try {
      const result = await client.callTool(
        { name, arguments: { ...args } },
        undefined,
        { timeout: this.options.timeoutMs },
      );

      if (isRecord(result) && result['isError'] === true) {
        return { ok: false, message: extractText(result['content']) ?? 'MCP вернул ошибку tool\'а' };
      }

      return { ok: true, payload: extractPayload(result) };
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }
  }

  async close(): Promise<void> {
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    if (transport !== undefined) await transport.close().catch(() => undefined);
  }
}

export type McpCallResult =
  | { readonly ok: true; readonly payload: unknown }
  | { readonly ok: false; readonly message: string };

function toDiscoveredTool(
  name: string,
  description: string | undefined,
  inputSchema: unknown,
): DiscoveredTool {
  return {
    name,
    description: description ?? '',
    inputSchema: readSchemaObject(inputSchema),
  };
}

function readSchemaObject(value: unknown): JsonSchemaObject {
  if (!isRecord(value)) return { properties: {}, required: [] };

  const rawProperties = isRecord(value['properties']) ? value['properties'] : {};
  const properties: Record<string, JsonSchemaProperty> = {};

  for (const [key, raw] of Object.entries(rawProperties)) {
    properties[key] = readSchemaProperty(raw);
  }

  const rawRequired = value['required'];
  const required = Array.isArray(rawRequired)
    ? rawRequired.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return { properties, required };
}

function readSchemaProperty(value: unknown): JsonSchemaProperty {
  if (!isRecord(value)) {
    return {
      type: undefined,
      description: undefined,
      format: undefined,
      enumValues: undefined,
      hasDefault: false,
    };
  }

  const rawType = value['type'];
  const rawEnum = value['enum'];

  return {
    type: typeof rawType === 'string' ? rawType : undefined,
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    format: typeof value['format'] === 'string' ? value['format'] : undefined,
    enumValues: Array.isArray(rawEnum)
      ? rawEnum.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    hasDefault: 'default' in value,
  };
}

/**
 * `structuredContent` предпочтительнее текста: это уже разобранный сервером JSON.
 * Текстовый блок парсится только как запасной путь — многие серверы кладут JSON строкой.
 */
function extractPayload(result: unknown): unknown {
  if (!isRecord(result)) return undefined;
  if (result['structuredContent'] !== undefined) return result['structuredContent'];

  const text = extractText(result['content']);
  if (text === undefined) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;

  const parts = content
    .filter(isRecord)
    .filter((item) => item['type'] === 'text')
    .map((item) => item['text'])
    .filter((text): text is string => typeof text === 'string');

  return parts.length === 0 ? undefined : parts.join('\n');
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка MCP';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
