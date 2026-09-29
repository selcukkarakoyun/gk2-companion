import type { Material } from '../types';

export const SYSTEM_PROMPT = `You read screenshots or photos of the construction menu in the video game "Graveyard Keeper 2". The game UI is in Turkish.

Each row of the menu is one buildable item. A row has an icon, the item's name, and on the right one or more material icons. Each material icon has a counter such as "0/4" or "21/6".

The counter format is "owned/required". Only the number AFTER the slash is the required amount. Ignore the number before the slash. Ignore small bonus values shown under a name (for example a cross icon with "+3").

Materials are shown as icons only, without names. You are given a list of already known materials (id, name, visual description). For each material icon in a row:
- If the icon clearly matches a known material, return its "materialId" and set "suggestedName" and "description" to null.
- Otherwise set "materialId" to null, give a short Turkish "suggestedName" (for example "Tahta", "Çivi", "Taş", "Kütük") and a short English "description" of how the icon looks (color and shape) so that it can be recognized again later. Icons that look different need different names even if they are the same kind of thing (for example a light plank and a dark plank).

Building names must be copied exactly as shown in the image, including Roman numerals such as "I" or "II". Keep the order of rows and of material icons.

Respond with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"buildings":[{"name":"<building name>","requirements":[{"materialId":"<known id or null>","suggestedName":"<name or null>","description":"<description or null>","amount":<integer >= 1>}]}]}

If the image contains no construction menu rows, respond with {"buildings":[]}.`;

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage = { role: 'system' | 'user'; content: string | ContentPart[] };

export function buildMessages(
  imageDataUrl: string,
  knownMaterials: Pick<Material, 'id' | 'name' | 'description'>[],
): ChatMessage[] {
  const known = JSON.stringify(knownMaterials.map(({ id, name, description }) => ({ id, name, description })));
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Known materials: ${known}\n\nRead the image and return the JSON.` },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}
