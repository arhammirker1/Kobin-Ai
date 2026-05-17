export async function retrieveRelevantChunks(query: string) {
  const embeddings = await embed(query)

  const results = await db.query(`
    SELECT content, similarity
    FROM chunks
    ORDER BY similarity DESC
    LIMIT 5
  `)

  return results
}

export async function generateAnswer(query: string) {
  const chunks = await retrieveRelevantChunks(query)

  const context = chunks.map(c => c.content).join("\n")

  return llm(`
    Answer the question using context:
    ${context}

    Question: ${query}
  `)
}