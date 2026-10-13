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

- **New canvas:** library (☰) → "+ New canvas". The tools, shortcuts and styles are Excalidraw's.
- **Linking an element** to a note, another canvas or a web page: select the element and press "🔗 Link" (above the canvas). The link opens from the element's icon.
- **Loose connectors:** if an arrow becomes detached from a shape, a notice lets you select those arrows.
- **Export** ("Export…" button above the canvas, or the canvas ☰ menu):
  - **PNG or SVG**, with or without background, at 1×, 2× or 3×;
  - **A4 PDF**, fitted on one page or split across several;
  - **.excalidraw**, to open the canvas in Excalidraw. The dialog lists what is not carried over: internal links, backlinks, history, folders and tags.
  - You can export only the selection. If the image does not fit in the browser memory, the dialog says so and suggests a lower scale; nothing is ever cropped silently.

## 3. Notes

- **New note:** "+ New note". You write Markdown on the left and see the result on the right.
- **Linking another note:** type `[[` and pick a note from the list; if it does not exist, you can create it.
- **Details and links** (🔗 button in the top bar): backlinks (what links here), broken links and tags.
- **Exporting the note:** "Export .md" downloads the note with its frontmatter (id, title and tags).

## 4. Organising and searching

- **Folders:** "+ New folder" creates a folder. Anything created while a folder is selected goes inside it. Deleting a folder never deletes its content: anything left without a folder appears in "Recovery".
- **Tags:** added in Details. In the library they work as a filter.
- **Search** (Ctrl+Shift+F): searches titles, notes and canvas texts. Opening a result highlights the matching text or element.

## 5. Bulk import and export

In the library, "Import and export":

- **Import files:** `.md` notes and `.excalidraw` canvases.
- **Import a Markdown folder:** subfolders are recreated.
- **Export as Markdown (ZIP):** the notes of the selected folder or of the whole vault.

After an import, a report lists what could not be brought in and why. For example:

- embedded web content is not imported, because it would load external pages;
- images linked from the internet are not imported either;
- frontmatter fields the app does not use are not kept.

Importing always creates new documents; it never overwrites existing ones.

## 6. History, trash and conflicts

- **History:** every save is a version. From "Version history" (🕘 button) you can view an earlier version, compare it and restore it. Restoring creates a new version; nothing is lost.
- **Trash:** deleting sends a document to the trash, from where it can be restored. "Delete permanently" asks for confirmation.
- **Conflicts:** if two devices edit the same thing offline, both versions are kept and you are notified. You resolve it by choosing one, merging them or keeping both as separate documents.

## 7. Backups and vaults

In "Status and diagnostics" (ⓘ button):

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
