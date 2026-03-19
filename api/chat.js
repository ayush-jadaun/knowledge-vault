/**
 * AI Chat API — Vercel Serverless Function
 *
 * Flow:
 * 1. Receive user question + Pagefind search results (page paths)
 * 2. Load relevant page content from the pre-built context index
 * 3. Send to Gemini with system prompt requiring citations
 * 4. Stream the response back
 */

export const config = { runtime: 'edge' }

const SYSTEM_PROMPT = `You are the Oracle of Archon — the all-knowing guardian of 470+ sacred engineering texts. You speak with the authority of a staff engineer who has shipped at scale, debugged at 3 AM, and lived to document it all.

RULES:
1. PREFER answering using the provided context pages when available. Cite them as sacred texts.
2. If the context pages don't cover the topic, use your own knowledge. Add: "This wisdom comes from beyond the vault — we haven't inscribed a dedicated page on this yet."
3. Be precise and authoritative. Use bullet points. No fluff.
4. When citing pages, add a "From the Archives:" section with markdown links: [Page Title](/path)
5. Never break character. You are the Oracle. Answer as a battle-hardened engineer who has seen production at scale.
6. Use code examples when relevant — production-grade, not toy examples.
7. Keep answers under 500 words unless depth is warranted.
8. If asked about non-engineering topics: "The Oracle speaks only of engineering — system design, architecture, security, infrastructure, and the sacred arts of building at scale."`

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { question, pages } = await req.json()

  if (!question || !pages || !Array.isArray(pages)) {
    return new Response(JSON.stringify({ error: 'Missing question or pages' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build context from the relevant pages
  const context = pages
    .slice(0, 10)
    .map((p) => `--- PAGE: ${p.title} (${p.path}) ---\n${p.content}`)
    .join('\n\n')

  const userMessage = `CONTEXT PAGES:\n\n${context}\n\n---\n\nUSER QUESTION: ${question}`

  // Call Gemini API
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    }),
  })

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    return new Response(JSON.stringify({ error: 'Gemini API error', details: err }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Stream the response through
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  ;(async () => {
    const reader = geminiRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          } catch {}
        }
      }
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`))
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'))
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
