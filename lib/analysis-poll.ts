import { callFunction, FunctionCallError } from './functions'
import type { CelebrityResult } from './types'
import { formatAnalyzeError, isRetryableAnalysisPollError } from './kie-errors'

export const ANALYSIS_POLL_INTERVAL_MS = 2_500
export const ANALYSIS_POLL_TIMEOUT_MS = 300_000

export interface AnalysisStartResponse {
  status?: 'pending' | 'success'
  pollJobId?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
  error?: string
  analysisId?: string
  name?: string
  score?: number
}

export interface AnalysisPollResponse extends Partial<CelebrityResult> {
  status?: 'pending' | 'success' | 'failed'
  pollJobId?: string
  analysisId?: string
  error?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryablePollTransport(err: unknown): boolean {
  return err instanceof FunctionCallError && isRetryableAnalysisPollError(err.status, err.message)
}

/** Lance l'analyse puis interroge le backend jusqu'au résultat ou timeout. */
export async function runAnalysisWithPolling(
  startPayload: Record<string, unknown>,
): Promise<CelebrityResult & { analysisId?: string }> {
  const start = await callFunction<AnalysisStartResponse>('analyze', startPayload)

  if (start.error) {
    throw new Error(formatAnalyzeError(start.error))
  }

  if (start.status !== 'pending' && start.name && typeof start.score === 'number') {
    return start as CelebrityResult & { analysisId?: string }
  }

  const pollJobId = start.pollJobId
  if (!pollJobId) {
    throw new Error('Réponse serveur invalide (pollJobId manquant)')
  }

  const intervalMs = start.pollIntervalMs ?? ANALYSIS_POLL_INTERVAL_MS
  const timeoutMs = start.pollTimeoutMs ?? ANALYSIS_POLL_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    try {
      const poll = await callFunction<AnalysisPollResponse>('analyze', { pollJobId })
      if (poll.status === 'pending') continue
      if (poll.status === 'failed' || poll.error) {
        const message = poll.error ?? 'Analyse échouée'
        if (isRetryableAnalysisPollError(500, message)) continue
        throw new Error(formatAnalyzeError(message))
      }
      if (poll.name && typeof poll.score === 'number') {
        return poll as CelebrityResult & { analysisId?: string }
      }
    } catch (err) {
      if (isRetryablePollTransport(err)) continue
      if (err instanceof FunctionCallError) {
        throw new Error(formatAnalyzeError(err.message, err.code))
      }
      throw err
    }
  }

  throw new Error('L\'analyse prend plus de temps que prévu. Réessaie dans un instant.')
}
