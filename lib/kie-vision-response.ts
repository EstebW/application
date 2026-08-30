/** Extraction du texte modèle depuis les réponses KIE / OpenAI / Gemini. */

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== 'object') return ''
        const b = block as Record<string, unknown>
        if (typeof b.text === 'string') return b.text
        if (typeof b.content === 'string') return b.content
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>
    if (typeof c.text === 'string') return c.text
  }
  return ''
}

export function extractTextFromVisionResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>

  const choices = d.choices as Array<{ message?: { content?: unknown } }> | undefined
  if (choices?.[0]?.message?.content != null) {
    const text = messageContentToString(choices[0].message.content)
    if (text) return text
  }

  const candidates = d.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  if (candidates?.[0]?.content?.parts?.length) {
    const text = candidates[0].content.parts
      .map((p) => p?.text ?? '')
      .filter(Boolean)
      .join('\n')
    if (text) return text
  }

  if (typeof d.text === 'string' && d.text) return d.text
  if (typeof d.output === 'string' && d.output) return d.output
  if (typeof d.result === 'string' && d.result) return d.result

  if (typeof d.data === 'string' && d.data.trim()) {
    try {
      return extractTextFromVisionResponse(JSON.parse(d.data))
    } catch {
      return d.data
    }
  }

  if (d.data && typeof d.data === 'object') {
    return extractTextFromVisionResponse(d.data)
  }

  return ''
}
