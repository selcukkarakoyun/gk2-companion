import type { Material } from '../types';

export const SYSTEM_PROMPT = `You read screenshots or photos of the construction menu in the video game "Graveyard Keeper 2". The game UI is in Turkish.

The window title bar (top of the menu) shows the AREA name, for example "Bahçe" or "Avlu". Return it as "area" exactly as written, or null if you cannot read it.

Each row of the menu is one buildable item. A row has an icon, the item's name, and on the right zero or more material icons. Each material icon has a counter such as "0/4" or "21/6".

The counter format is "owned/required". Only the number AFTER the slash is the required amount. Ignore the number before the slash. Ignore small bonus values shown under a name (for example a cross icon with "+3"). A row with no material icons gets an empty "requirements" list.

Materials are shown as icons only, without names. You are given a list of already known materials (id, name, visual description). Some of them also come with a reference icon image, sent as separate labeled images before the screenshot. Match icons visually: if a material icon in the screenshot looks the same as a reference icon, return that material's "materialId" and set "suggestedName" and "description" to null. For known materials without a reference image use the description. Otherwise set "materialId" to null, give a short Turkish "suggestedName" (for example "Tahta", "Çivi", "Taş", "Kütük") and a short English "description" of how the icon looks (color and shape) so that it can be recognized again later. Icons that look different need different names even if they are the same kind of thing (for example a light plank and a dark plank).

For every material icon also return "box": the position of the icon picture itself (not the counter text under it) inside the SCREENSHOT image (the last image you receive), as fractions of the image width and height. "x" and "y" are the top-left corner, "w" and "h" are the size, all between 0 and 1. If you cannot locate the icon return null.

Building names must be copied exactly as shown in the image, including Roman numerals such as "I" or "II". Keep the order of rows and of material icons.

Respond with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"area":"<area name or null>","buildings":[{"name":"<building name>","requirements":[{"materialId":"<known id or null>","suggestedName":"<name or null>","description":"<description or null>","amount":<integer >= 1>,"box":{"x":0.0,"y":0.0,"w":0.0,"h":0.0}}]}]}

If the image contains no construction menu rows, respond with {"area":null,"buildings":[]}.`;

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage = { role: 'system' | 'user'; content: string | ContentPart[] };

type KnownMaterial = Pick<Material, 'id' | 'name' | 'description' | 'icon'>;

/** İstek boyutunu ve görsel sayısı sınırını korumak için gönderilen referans ikon üst sınırı. */
export const MAX_REFERENCE_ICONS = 40;

export function buildMessages(imageDataUrl: string, knownMaterials: KnownMaterial[]): ChatMessage[] {
  const known = JSON.stringify(knownMaterials.map(({ id, name, description }) => ({ id, name, description })));
  const references = knownMaterials
    .filter((m) => m.icon)
    .slice(0, MAX_REFERENCE_ICONS)
    .flatMap((m): ContentPart[] => [
      { type: 'text', text: `Reference icon for known material id="${m.id}" name="${m.name}":` },
      { type: 'image_url', image_url: { url: m.icon as string } },
    ]);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Known materials: ${known}` },
        ...references,
        { type: 'text', text: 'Now read this screenshot and return the JSON.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}
