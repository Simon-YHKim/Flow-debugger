// the app's single AI entry point
export async function summarize(text) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o-mini', input: text }),
  });
  return (await res.json()).output_text;
}
