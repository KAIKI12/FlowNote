# Qualification assets

`list-image.png` is the local L11 image fixture: a 320 × 180 PNG with three colored bars at increasing indentation.

FlowNote's Vite development server serves this file at `/qualification.assets/list-image.png`, matching the unchanged relative reference in `04-list-block-content.md`. The fixture route is development-only; production builds do not copy the image.

Run `npm run test:qualification-assets` from the application directory to verify the served PNG bytes, HEAD response, missing files, and path containment. This does not validate product image-file import or resource persistence.
