import Anthropic from '@anthropic-ai/sdk'
import { HttpError } from './core.js'

// One model setting for every Claude feature (price estimates, listing writer).
export const CLAUDE_MODEL = 'claude-opus-4-8'

export function claudeClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, 'The assistant isn’t set up yet (missing ANTHROPIC_API_KEY)')
  return new Anthropic()
}

// Runs a structured-output request and maps API failures to friendly HttpErrors.
export async function parseWithClaude(params) {
  let response
  try {
    response = await claudeClient().messages.parse({ model: CLAUDE_MODEL, max_tokens: 16000, thinking: { type: 'adaptive' }, ...params })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'The assistant is busy — try again in a minute')
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `The assistant couldn’t read that request: ${e.message}`)
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `The assistant isn’t responding right now (${e.status}) — try again shortly`)
    throw e
  }
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The assistant couldn’t help with that — try rewording it')
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new HttpError(502, 'The assistant’s answer was cut off — try again')
  return response.parsed_output
}
