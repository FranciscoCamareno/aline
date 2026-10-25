# User guide

Aline (the interface still shows the provisional name “MindNote”) is a personal mind-map and connected-notes system. It runs in the browser on a PC (Chrome or Edge) and on iPad (Safari). It can be installed as an app and works offline.

_Versión en español: [guia-de-uso.md](guia-de-uso.md)._

## 1. Getting started

- **Opening:** an empty canvas is ready when you open the app. No account is needed.
- **Where it is stored:** everything is saved in this browser a moment after each change. The top bar shows "Saved on this device" once the change is written.
- **Installing** (recommended, especially on iPad):
  - on a PC, with the install icon in the address bar;
  - on iPad, with Safari → Share → "Add to Home Screen".

  Once installed, the app keeps its data more reliably and opens offline.

## 2. Canvases and mind maps

- **New canvas:** in the sidebar's **Notes** tab, "+ New" → "Canvas". The tools are in the tray at the bottom; their shortcuts and styles are Excalidraw's.
- **Sticky notes and stickers:** the note in the tray (or the N key) puts a sticky note in the middle of the view; double-click it to write. The sticker sheet (or the B key) opens the stickers: click one or drag it onto the canvas.
- **Templates:** select elements (images and stickers too), press "Templates" (top right) → "Save selection" and give it a name. Each template shows a thumbnail. To use it, click it in the panel or drag it onto the canvas: a copy is inserted.
- **Linking an element** to a note, another canvas or a web page: select the element and press "Link" (above the canvas). The link opens from the element's icon.
- **Loose connectors:** if an arrow becomes detached from a shape, a notice lets you select those arrows.
- **Export** ("Export" in the top bar → "Image, PDF or .excalidraw…", or the canvas ☰ menu):
  - **PNG or SVG**, with or without background, at 1×, 2× or 3×;
  - **A4 PDF**, fitted on one page or split across several;
  - **.excalidraw**, to open the canvas in Excalidraw. The dialog lists what is not carried over: internal links, backlinks, history, folders and tags.
  - You can export only the selection. If the image does not fit in the browser memory, the dialog says so and suggests a lower scale; nothing is ever cropped silently.

## 3. Notes

- **New note:** "+ New" → "Note". You write Markdown on the left and see the result on the right.
- **Linking another note:** type `[[` and pick a note from the list; if it does not exist, you can create it.
- **Linking a canvas element:** when you choose a canvas in the link picker (`[[`, Ctrl/⌘+K or the link button), you can link the whole canvas or one of its elements: search for it in the list or click it in the preview. Following the link opens the canvas with that element selected.
- **Details and links** ("Links" button in the top bar): backlinks (what links here), broken links and tags.
- **Exporting the note:** "Export" → "Note as Markdown (.md)" downloads the note with its frontmatter (id, title and tags).

## 3 bis. Calendar

- In the sidebar, the **Calendar** tab opens the month; **Week** and **Day** show timed events as blocks and a red line at the current time.
- If a calendar was edited in two places at once, a notice with **Resolve** appears: keep one version, both, or **merge the events** (both sets are combined).
- **New event** (or double-click a day or an hour): title, calendar, all day or timed, start and end dates and a colour (the sticky-note colours).
- Click an event to edit it, move it to another calendar or delete it.
- **My calendars:** "+" creates another calendar; its checkbox shows or hides it. Each calendar has history and is included in backups and sync like any document.
- Before using the calendar or templates, update the app on all your devices: an older version does not recognise them.

## 3 ter. Documents (beta)

- The sidebar's **Documents** tab has its own "+ New", search and folders (separate from the ones in "Notes"):
  - **Formatted document:** headings, bold, italic, underline, strikethrough, lists, quotes and alignment. It is edited only inside the app.
  - **Markdown document:** shown formatted but saved as Markdown, like a note: it has a readable copy in the folder or in unencrypted Drive, can be edited outside and is searchable. Saving normalises the Markdown (list style, for example). Images are shown as text, without downloading them.
  - **Folder:** for documents only.
- **Continuous / Page** only changes the presentation (running text or an A4 sheet); there are no page breaks while editing. Rich documents show as a page and Markdown documents as continuous text; change it in **Profile → Preferences and language → Documents**, not from the document.
- **Images:** click an image to select it. Drag its corners to resize it, or use the bar above it: 25/50/75/100 % of the width, rotate left or right, **Crop** (drag the frame or its corners; Enter applies) and **Reset**. The original file does not change; Word and Markdown get the image already cropped and rotated. In Markdown documents you can only rotate or crop, and a copy of the image is saved.
- **Fonts like Arial, Times New Roman and Georgia:** those fonts cannot be shipped with the app, so **Arimo**, **Tinos** and **Gelasio**, with the same metrics, are offered instead; search for them by either name.
- **Document links:** the link button on the right of the toolbar opens a panel with every link in the document (all tabs), where each one leads and whether its target changed or was lost. Hovering one shows a preview of the target (an excerpt, a canvas thumbnail or the event; web addresses are not loaded). "Go to the text" selects the link in the document.
- Before using documents, update the app on all your devices: an older version does not recognise them.

## 3 quater. Appearance and Zen mode

- **Colour schemes:** in **Profile → Preferences and language** you choose a light scheme (Paper, White, Mist or Sage) and a dark one (Night, Black, Tide or Forest). The switch at the top right toggles between them and remembers your choice; "Follow system" uses the light one by day and the dark one by night. The same section holds the pointer (with a preview of aline's and the system's), the language and the first day of the week.
- The canvas is painted with the scheme's background, but what is saved and exported keeps its own background.
- **Zen mode** (right-click the canvas → "Zen mode", or Alt+Z): it also hides the sidebar and the header. The canvas tools stay visible; leaving it brings everything back.

## 4. Organising and searching

- **Folders:** "+ New" → "Folder" creates a folder. To move a canvas or a note, drag it onto a folder, or onto the empty space of "All" to take it out; it can also be changed in Details. Anything created while a folder is selected goes inside it. Deleting a folder never deletes its content: anything left without a folder appears in "Recovery".
- **Tags:** added in Details. In the library they work as a filter.
- **Search files:** the library field filters the list by title. The "All" and "Recent" tabs switch the view; each document's actions (rename, trash) are in its "⋯" menu.
- **Search** (Ctrl+Shift+F, or "⋯" in the top bar → "Search"): searches titles, notes and canvas texts. Opening a result highlights the matching text or element.

## 5. Bulk import and export

- **Import files:** "+ New" → "Import files…" (`.md` notes and `.excalidraw` canvases).
- **Import a Markdown folder:** "+ New" → "Import folder…"; subfolders are recreated.
- **Export as Markdown (ZIP):** "Export" in the top bar → the notes of the selected folder or of the whole vault.

After an import, a report lists what could not be brought in and why. For example:

- embedded web content is not imported, because it would load external pages;
- images linked from the internet are not imported either;
- frontmatter fields the app does not use are not kept.

Importing always creates new documents; it never overwrites existing ones.

## 6. History, trash and conflicts

- **History:** every save is a version. From "Version history" (clock button in the top bar) you can view an earlier version, compare it and restore it. Restoring creates a new version; nothing is lost.
- **Trash:** deleting sends a document to the trash (**Profile → Trash**, at the bottom of the sidebar), from where it can be restored. "Delete permanently" asks for confirmation.
- **Conflicts:** if two devices edit the same thing offline, both versions are kept and you are notified. You resolve it by choosing one, merging them or keeping both as separate documents.

## 7. Backups and vaults

In "Status and diagnostics" ("⋯" in the top bar):

- **Full backup (ZIP):** the whole vault with history, trash and attachments, in the open format. Make one regularly and keep it off the device.
- **Restoring a backup:** always goes into a new vault, never over the current one.
- **Several vaults:** you can create several independent vaults and switch between them.
- **Emergency export:** available if the browser storage fails.

## 8. Several devices: folder or Google Drive

In "Where it is stored" you connect **one** destination per vault.

**Computer folder** (Chrome or Edge on a PC):

- The folder receives the open format: notes readable with any editor, versions and copies.
- The copies in `readable/` can be edited outside the app; they come in as new versions.

**Google Drive:**

- Before connecting you choose the mode:
  - **not encrypted:** Google can read the content; in exchange, notes can be read and edited from Drive;
  - **end-to-end encrypted:** Google cannot read the content.
- With encryption:
  - you create a password and keep a **recovery code**;
  - if both are lost, the Drive copy cannot be recovered;
  - each device asks for the password once.
- "Encryption and password" lets you change the password, generate a new code or switch mode. Other devices adapt on their own.
- After reloading the page you press "Authorize again", because Google's permission only lives while the page is open.

**From another device:** create or open a vault, connect the same destination and choose "Open that vault here".

Sync happens on opening, when returning to the tab, a few seconds after each change and every minute. It does not happen while the app is closed.

## 9. iPad and Apple Pencil

- **Pencil:** with the Apple Pencil the canvas switches to the engine's pen mode. The pencil draws and fingers pan and pinch to zoom. The pen mode button appears in the canvas toolbar once the pencil is detected.
- **Library:** in portrait it overlays the canvas. It closes when a document opens, when you tap outside it or when you swipe it left.
- **Buttons:** they are at least 44 px so they can be tapped with a finger.
- **No local folder:** there is no local folder on iPad; use Google Drive or ZIP backups.

## 10. Privacy

- Without Google Drive the app connects to no external service: no analytics, no telemetry.
- Diagnostics are local and never contain note text.
- External images in notes are shown as links and are not loaded automatically.
