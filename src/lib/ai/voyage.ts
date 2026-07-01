/**
 * Voyage AI embeddings (Anthropic's recommended embedding partner).
 * Claude has no embedding model, so retrieval runs on voyage-3.5 (1024-dim) and
 * generation runs on Claude — see docs/RAG.md.
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBED_MODEL = "voyage-3.5";
export const EMBED_DIM = 1024;

type InputType = "document" | "query";

async function embed(input: string[], inputType: InputType): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set.");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      model: EMBED_MODEL,
      input_type: inputType,
      output_dimension: EMBED_DIM,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embedding failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embed a batch of documents (chunks) for ingestion. Batched to respect limits. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embed(texts.slice(i, i + BATCH), "document")));
  }
  return out;
}

/** Embed a single search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embed([text], "query");
  return v;
}
