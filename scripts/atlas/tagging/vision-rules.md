# Vision-tagging rules

You are visually cataloguing rendered thumbnails of generative-art sketches so the artist can group work by how it LOOKS, independent of how it was coded.

For EACH image in your list: Read the image file and produce one record. Judge only what you see.

## Record shape (JSON)

```json
{
  "id": "<exactly as given in the list>",
  "bg": "light | dark | mid | colored",
  "palette": "monochrome | duotone | limited | multicolor",
  "hues": ["0-4 of: red, orange, yellow, green, teal, cyan, blue, indigo, violet, magenta, pink, brown, cream, grey, black, white"],
  "density": "sparse | medium | dense",
  "composition": ["1-3 of: full-bleed-field, centered-figure, grid-array, bands-horizontal, bands-vertical, diagonal, radial, scattered, framed, asymmetric-blocks, single-object"],
  "texture": ["1-3 of: flat-shapes, hard-edge, soft-gradient, hatched, stippled, granular, glitchy, woven, layered-transparency, outlined, pixelated, hand-drawn-feel"],
  "energy": "calm | moderate | busy",
  "keywords": ["2-5 free visual descriptors a curator might use, lowercase-kebab, e.g. quilt-like, neon-on-black, architectural, topographic"]
}
```

Notes:
- `bg` is the ground the piece sits on; `palette` counts distinct hues (limited = 3-5 hues).
- `density` is how much of the frame is worked.

## Output

Write the complete JSON array (one record per image — ALL images in your list, ids EXACTLY as given) to your assigned output file using the Write tool. Then VALIDATE it parses:
`python3 -c "import json; print(len(json.load(open('<your output file>'))))"` — fix if it fails.
Reply with a single line: `WROTE <n> records`.
