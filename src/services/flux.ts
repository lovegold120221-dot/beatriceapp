/**
 * Hugging Face Flux.1-dev image generation via Inference API
 * https://huggingface.co/black-forest-labs/FLUX.1-dev
 * Requires HF Pro for FLUX.1-dev. For free tier, use FLUX.1-schnell.
 */

const HF_TOKEN = process.env.NEXT_PUBLIC_HF_TOKEN || process.env.HF_TOKEN;
const FLUX_MODEL = 'black-forest-labs/FLUX.1-dev';

// Map aspect ratio to width x height (within ~2M pixel limit)
const ASPECT_DIMENSIONS: Record<string, [number, number]> = {
  '1:1': [1024, 1024],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
  '4:3': [1152, 896],
  '3:4': [896, 1152],
  '3:2': [1216, 832],
  '2:3': [832, 1216],
  '4:5': [896, 1120],
  '5:4': [1120, 896],
  '21:9': [1344, 576],
  '9:21': [576, 1344],
};

function getDimensions(aspectRatio: string, size: '1K' | '2K' | '4K'): [number, number] {
  const base = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['1:1'];
  const scale = size === '1K' ? 1 : size === '2K' ? 1.3 : 1.6;
  return [Math.round(base[0] * scale), Math.round(base[1] * scale)];
}

export async function generateImage(
  prompt: string,
  size: '1K' | '2K' | '4K' = '1K',
  aspectRatio: string = '1:1'
): Promise<string | null> {
  if (!HF_TOKEN) throw new Error('Hugging Face API token not configured. Set HF_TOKEN or NEXT_PUBLIC_HF_TOKEN in .env');

  const [width, height] = getDimensions(aspectRatio, size);

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${FLUX_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        width,
        height,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Flux API error: ${response.status} ${err}`);
  }

  const blob = await response.blob();
  return new Promise<string | null>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
