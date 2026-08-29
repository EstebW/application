import { callFunction, FunctionCallError } from './functions'
import { formatKieError } from './kie-errors'

export const GENERATION_POLL_INTERVAL_MS = 3000
export const GENERATION_POLL_TIMEOUT_MS = 300_000

export interface GenerationStartResponse {
  status?: 'pending' | 'success'
  pollJobId?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
  imageBase64?: string
  generationId?: string
  creditsBalance?: number
  error?: string
}

export interface GenerationPollResponse {
  status?: 'pending' | 'success'
  pollJobId?: string
  imageBase64?: string
  generationId?: string
  error?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Lance la génération puis interroge le backend jusqu’au résultat ou timeout. */
export async function runGenerationWithPolling(
  startPayload: Record<string, unknown>,
): Promise<{ imageBase64: string; generationId?: string; creditsBalance?: number }> {
  const start = await callFunction<GenerationStartResponse>('generate', startPayload)

  if (start.error) {
    throw new Error(start.error)
  }

  if (start.imageBase64) {
    return {
      imageBase64: start.imageBase64,
      generationId: start.generationId,
      creditsBalance: start.creditsBalance,
    }
  }

  const pollJobId = start.pollJobId
  if (!pollJobId) {
    throw new Error('Réponse serveur invalide (pollJobId manquant)')
  }

  const intervalMs = start.pollIntervalMs ?? GENERATION_POLL_INTERVAL_MS
  const timeoutMs = start.pollTimeoutMs ?? GENERATION_POLL_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    try {
      const poll = await callFunction<GenerationPollResponse>('generate', { pollJobId })
      if (poll.status === 'pending') continue
      if (poll.imageBase64) {
        return {
          imageBase64: poll.imageBase64,
          generationId: poll.generationId,
        }
      }
      if (poll.error) throw new Error(poll.error)
    } catch (err) {
      if (err instanceof FunctionCallError) {
        throw new Error(formatKieError(err.message, err.code))
      }
      throw err
    }
  }

  throw new Error('Nano Banana 2: timeout — la génération n’a pas renvoyé d’image à temps')
}
