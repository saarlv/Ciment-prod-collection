# Design world: pages, theme, direct edits, code

## Pages

- The **Design** panel has three groups: **Pages**, **Dynamic pages** (detail pages opened from a list item, which can't be previewed on their own) and **Chat components**.
- Hovering a page shows its URL.
- **Ask Ella to add, rename or remove pages.** There's no "add page" or rename button. A page's "…" menu has:
  - **Ask in chat…**
  - **Open code**
  - **Settings**
- The landing page is the app's home page; ask Ella to change it. Only older apps have a **Set default page** option.
- As a builder you see every page, including ones hidden from users, such as success pages and role-only pages. If Ella says she built something you can't find, check the Design panel and **View as role**.

## Theme

- **Edit theme** on the canvas toolbar opens the Theme panel: a column of cards, each a setting's name over its current value with a preview on the right.
  - **Preset** — pick a ready-made theme; it reads **Custom** once you change anything. **Copy theme from another app** is the copy icon in the panel's title row.
  - **Colors**: **Brand**, **Highlight** and **Base** cards, **More colors** (**Secondary**, **Error**, **Surface**, **Subtle**, **Popover**, **Lines**, **Input lines**, **Focus ring** and **Sidebar**), then **Charts**. A card shows its background's hex and an "Aa" swatch; click it to open its **Background** and **Text** rows, and click a color dot to pick a color.
  - The **Colors** line ends with **Light mode** or **Dark mode**: the mode the canvas previews is the one you're editing. Click it to **Preview as** Light, Dark or Match platform (the same switch as **Preview theme** on the canvas toolbar). Fonts, radius and shadow apply to both modes.
  - **Font** (the app's main font; click the card to search Google Fonts, filter by category, and see each font in itself), then **More fonts** (**Serif**, **Monospace**). A card reads **System font** while the app uses the device's own font for it.
  - **Radius** (**None**, **Small**, **Medium**, **Large**, **Round**) and **Shadow** (**None**, **Soft**, **Medium**, **Strong**).
  - Spacing, letter spacing and the shadow's exact numbers aren't in the panel; ask Ella to change them.
- **Save theme** rebuilds the app: "Rebuilding the app with the new theme…", then **Theme applied**.
- The theme can't be edited while Ella is working.
- You can also just ask Ella ("make it darker", "use our brand blue #…").

## Editing the page directly

- **Edit the page directly** on the canvas toolbar lets you click any element and change it by hand:
  - **Content** (text)
  - **Appearance** (background, text color)
  - **Layout** (size, gap, padding, margin, corners)
- Then click **Save** or **Discard**.
- Each element also has **Ask about this element in chat**.

## Role preview

**View as role** on the canvas toolbar shows the app the way each role sees it. A person can't be both a team member and an external user, so View as is the way to test what roles see.

## Code

- **Open code** (canvas toolbar or a page's menu) shows the app's source files with search.
- Builders can edit and **Save changes**, then **Compile App** to rebuild ("Compilation successful" / "Compilation failed").
- Editing is locked while Ella works.
- **Downloading the full code isn't available to regular builders.** Connecting **Git Sync** [flag: git-sync] keeps a copy of the app's code in your GitHub repository. See `app-capabilities/capabilities-and-limits.md`.
