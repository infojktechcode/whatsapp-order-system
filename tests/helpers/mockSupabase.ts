// Minimal chainable Supabase client stub for offline unit tests.
// Services in src/ are written against `supabase.from(...).select()...`,
// so each chain method records what was requested and the awaited result
// comes from a per-table handler registered with mockTable().

export interface QueryState {
  mutation: string | null
  args: Record<string, unknown>
}

export interface MockResult {
  data: unknown
  error: { message: string } | null
}

export type TableHandler = (state: QueryState) => MockResult

const MUTATIONS = ['insert', 'update', 'upsert', 'delete']

const handlers: Record<string, TableHandler> = {}
const calls: Array<{ table: string; state: QueryState }> = []

function createChain(table: string) {
  const state: QueryState = { mutation: null, args: {} }
  calls.push({ table, state })

  const record =
    (name: string) =>
    (...args: unknown[]): unknown => {
      if (MUTATIONS.includes(name)) {
        state.mutation = name
        // Mutations expose their body as `payload`, mirroring supabase-js.
        state.args.payload = args[0]
      }
      state.args[name] = args[0]
      return chain
    }

  const chain: Record<string, unknown> = {
    select: record('select'),
    insert: record('insert'),
    update: record('update'),
    upsert: record('upsert'),
    delete: record('delete'),
    eq: record('eq'),
    neq: record('neq'),
    in: record('in'),
    is: record('is'),
    gte: record('gte'),
    lte: record('lte'),
    ilike: record('ilike'),
    order: record('order'),
    limit: record('limit'),
    range: record('range'),
    single: record('single'),
    maybeSingle: record('maybeSingle'),
    then: (
      onFulfilled?: (value: MockResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ): Promise<unknown> => {
      const handler = handlers[table]
      const result: MockResult = handler
        ? handler(state)
        : { data: null, error: { message: `No mock handler registered for table "${table}"` } }
      return Promise.resolve(result).then(onFulfilled, onRejected)
    },
  }

  return chain
}

// --- functions.invoke support -------------------------------------------------
// Services call supabase.functions.invoke(name, { body }) to reach the Edge
// Functions. Tests register a handler per function name; every call is recorded
// so tests can assert exactly what the browser sends (e.g. "no price fields").

export interface InvokeCall {
  name: string
  body: unknown
}

export interface InvokeResult {
  data: unknown
  error: { message: string; context?: unknown } | null
}

export type InvokeHandler = (body: unknown) => InvokeResult | Promise<InvokeResult>

const invokeHandlers: Record<string, InvokeHandler> = {}
const invokeCalls: InvokeCall[] = []

// --- auth support -------------------------------------------------------------
// Admin sign-in goes through supabase.auth; tests can stub the result and
// inspect what credentials were sent.

export interface AuthCall {
  fn: string
  args: unknown
}

export type AuthHandler = (args: unknown) => { data: unknown; error: { message: string } | null }

const authHandlers: Record<string, AuthHandler> = {}
const authCalls: AuthCall[] = []

export const mockSupabase = {
  from: (table: string) => createChain(table),
  auth: {
    signInWithPassword: (args: unknown): Promise<{ data: unknown; error: { message: string } | null }> => {
      authCalls.push({ fn: 'signInWithPassword', args })
      const handler = authHandlers.signInWithPassword
      return Promise.resolve(
        handler ? handler(args) : { data: null, error: { message: 'No auth mock registered' } }
      )
    },
    signOut: (): Promise<{ error: { message: string } | null }> => {
      authCalls.push({ fn: 'signOut', args: null })
      const handler = authHandlers.signOut
      return Promise.resolve(handler ? handler(null) : { data: null, error: null })
    },
  },
  functions: {
    invoke: (name: string, options?: { body?: unknown }): Promise<InvokeResult> => {
      invokeCalls.push({ name, body: options?.body ?? null })
      const handler = invokeHandlers[name]
      if (!handler) {
        return Promise.resolve({
          data: null,
          error: { message: `No invoke handler registered for function "${name}"` },
        })
      }
      // Handler errors become rejections, mirroring a network failure.
      return Promise.resolve().then(() => handler(options?.body ?? null))
    },
  },
}

/** Register (or replace) the handler for an auth method. */
export function mockAuth(fn: 'signInWithPassword' | 'signOut', handler: AuthHandler): void {
  authHandlers[fn] = handler
}

/** Every auth call made since the last reset. */
export function mockAuthCalls(): AuthCall[] {
  return authCalls
}

/** Register (or replace) the handler for a table. */
export function mockTable(table: string, handler: TableHandler): void {
  handlers[table] = handler
}

/** Register (or replace) the handler for an Edge Function. */
export function mockInvoke(name: string, handler: InvokeHandler): void {
  invokeHandlers[name] = handler
}

/** Every `functions.invoke(...)` call since the last reset (optionally by name). */
export function mockInvokeCalls(name?: string): InvokeCall[] {
  return name ? invokeCalls.filter((c) => c.name === name) : invokeCalls
}

/** Every `supabase.from(...)` call made since the last reset. */
export function mockCalls(table?: string): Array<{ table: string; state: QueryState }> {
  return table ? calls.filter((c) => c.table === table) : calls
}

export function resetMocks(): void {
  for (const key of Object.keys(handlers)) delete handlers[key]
  for (const key of Object.keys(invokeHandlers)) delete invokeHandlers[key]
  for (const key of Object.keys(authHandlers)) delete authHandlers[key]
  calls.length = 0
  invokeCalls.length = 0
  authCalls.length = 0
}

/** Convenience for the very common "one row" case. */
export function oneRow(data: unknown): MockResult {
  return { data, error: null }
}

/** Convenience for the very common "no rows" case. */
export function noRows(message = 'No rows found'): MockResult {
  return { data: null, error: { message } }
}

export function okInsert(data: unknown = null): MockResult {
  return { data, error: null }
}
