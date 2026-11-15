# AI use disclosure

The Space Apps Challenge asks participants to say where and how AI tools were used, and to acknowledge AI-generated images.

## Logo (AI-generated image)

- The Umbral logo was generated with an AI image tool from my description. The generated source images (`umbral-logo.png`, `umbral-logo-v2.png`) are kept outside this repository; only the vector versions below are part of the app.
- `public/logo.svg` is a vector redrawing of `umbral-logo-v2.png` for the web app (same design and colours; the crop rows are redrawn as simple shapes). `public/logo-mark.svg` and `public/favicon.svg` are crops of that vector without the word mark.
- The Space Apps 2026 Project Submission Guide asks for a visible indication on AI-generated images. The logo carries it where the logo itself is shown: the caption "Logo: AI-generated" next to the logo in the app header, at every screen width (and "AI-generated" in the image's alternative text), the text "AI-generated logo" inside `public/logo.svg` (the file embedded in the Markdown export), and an export caption. The footer and "Sources and methods" also say it.
- Any slide or video that shows the logo keeps an "AI-generated" mark next to it.
- No AI-generated image is used as data. Maps, satellite images and charts come from the cited sources.

## Code, research and documentation

I used AI assistants (large language models) to search the literature, write and review code, run automated browser and accessibility checks, review the interface as hypothetical users, and draft documentation. I defined the problem, chose the data, assumptions and scope, and checked the outputs against the cited sources. An AI walkthrough or an automated accessibility check is not a test with growers: agronomic and usability validation with local growers or agronomists is still pending, and no institution has reviewed or endorsed the app.

## In the app

No part of the app calls an AI model. Suggestions, explanations and checks are computed by the documented rules in `src/engine/`.
