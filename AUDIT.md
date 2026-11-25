# Publication Audit: Daybreak (Momentum Dash replica)

This file records the publication audit for this project:

- what was checked
- what was found
- which findings needed action
- what was fixed
- what remains open

It is sanitized: no secret values or personal contact details appear here.

| | |
|---|---|
| Tool | Claude Code (AI coding assistant), run from this project's root folder |
| Prompt | The audit prompt from the course submission guidelines (unchanged) |
| Audit 1 | 2026-11-25, read-only (no files changed, no code run, nothing committed) |
| Fixes | 2026-11-25, after reviewing the findings |
| Audit 2 | 2026-11-25, the same checks repeated after the fixes |
| Audit 3 | 2026-11-25, logged-out check of the published repository |

## What was checked

| Area | How |
|---|---|
| Git status | `git status --ignored`: tracked, untracked and ignored files |
| Tracked files | Every tracked file listed with its size and reviewed |
| Secrets | Pattern scan of every file and **every commit**. It covered API keys (Supabase, GitHub, AWS), JWTs, private keys, and words like "password", "secret", "token" and "api key". It printed file names only. |
| Personal data | Scan for email addresses, local user paths and real names, including in the screenshot. Commit author and committer metadata. Metadata chunks in every PNG (screenshot and icons). |
| Exclusions | `git check-ignore` on typical local files: `.env`, `.DS_Store`, editor folders, logs, and packed extension files (`*.pem` signing key, `*.crx`, `*.zip`) |
| Extension permissions | `manifest.json`: permissions, host permissions, content scripts |
| Privacy | Which external services the extension contacts and what they receive |
| Code safety | Where API data ends up in the page (`innerHTML`, links, image URLs) |
| Licences and credits | Code licence; credit for the photos (Unsplash photographers) and the weather data (Open-Meteo) |
| Originality | Whether anything was taken from the reference project or from Momentum (code, text, images, name) |
| README | Checked against the required sections: purpose, data collection, persistence, user interaction, setup, learning, limitations and assistance |

## Audit 1: findings and decisions

"Confirmed" means the issue was verified in the files or the history. "Possible concern" means it depends on context or a judgement call.

| # | Finding | Type | Action needed? | Decision |
|---|---|---|---|---|
| 1 | No secrets in the files or the history. Neither service needs an API key. | Confirmed (OK) | No | — |
| 2 | The word "secret" matched in `.gitignore` (a comment) and in `quotes.js` ("The secret of getting ahead…"). | Confirmed false positive | No | — |
| 3 | No personal data. The only commit uses the GitHub `noreply` address. The screenshot uses the made-up example name "Alex". | Confirmed (OK) | No | — |
| 4 | The photographer link comes from Picsum's API and was inserted as a link without checking. A manipulated value such as `javascript:…` would become clickable. The photo id was also used in the image URL without checking. | Confirmed | **Yes** | Fixed |
| 5 | No `LICENSE` file. | Confirmed | **Yes** | Fixed (MIT) |
| 6 | The README setup used a clone URL with placeholders (`<your-username>/<this-repository>`). | Confirmed | **Yes** | Fixed |
| 7 | The permissions are minimal: `storage` and `search`. There are no host permissions and no content scripts, so the extension can't read the websites you visit. | Confirmed (OK) | No | — |
| 8 | Privacy: Picsum and Open-Meteo see the user's IP address, and Open-Meteo receives the coordinates of the chosen city. | Possible concern | No | **Accepted and documented** in the README (Data collection). No browser location is used. |
| 9 | Stored data (name, focus, to-dos) is not encrypted. | Possible concern | No | Normal for `chrome.storage.local`; documented in the README |
| 10 | The repository name and the README mention "Momentum". | Possible concern | No | **Accepted:** the assignment is a *Momentum Dash replica*. The extension has its own name (Daybreak), icon, design and code, and the README says it is only inspired by Momentum. |
| 11 | Originality: compared with the reference project another student shared. No files, text, images or names match, and the feature set differs (photo, weather, search, settings). | Confirmed (OK) | No | The README discloses that the reference was looked at |
| 12 | Some quote attributions are traditional rather than verified. | Possible concern | No | Two are marked "(attributed)"; the code comment says so too |
| 13 | It could not be tested automatically as an installed extension, because Chrome no longer allows loading extensions from the command line. It was tested as a normal page with the same code. | Possible concern | Yes | See "Remaining items": manual **Load unpacked** test |

## Fixes made

| Finding | Fix | File |
|---|---|---|
| 4 | Added `safeHttps()`. The photographer link is only used if it is an `https://` address, otherwise just the name is shown. The photo id must be a number before it is used in the image URL. Re-tested: `javascript:` is rejected, and the photo and the credit link still appear. | `app.js` |
| 5 | Added the MIT licence, plus a licence section in the README that credits the photographers and Open-Meteo | `LICENSE`, `README.md` |
| 6 | Setup now says to copy the address from the green **Code** button | `README.md` |

## Audit 2: re-check after fixes

| Check | Result |
|---|---|
| Secret patterns in the files to be published and in all commits | None found |
| Email addresses, local user paths, real names | None. The only name is the public GitHub username in `LICENSE`. |
| Commit emails | Only the GitHub `noreply` address |
| Links and image URLs built from API data | Checked by `safeHttps()` and the numeric id check; no `innerHTML` anywhere |
| Manifest | Permissions `storage` and `search` only; no host permissions, no content scripts |
| `LICENSE` | Present (MIT) |
| README placeholders | None left |
| PNG metadata (screenshot and 4 icons) | Only image chunks (`IHDR`, `IDAT`, `IEND`) |
| `.env`, `.DS_Store`, editor folders, logs, `*.pem`, `*.crx`, `*.zip` | Ignored |
| README sections | All seven required sections present, and their claims match the code |

## Remaining items

- [x] **Load the extension in Chrome** (finding 13). It was loaded with `chrome://extensions` → Developer mode → Load unpacked, and the new tab shows Daybreak.
- [x] **Make the repository public** and check that it opens while logged out of GitHub (see Audit 3).

## Audit 3: check after publishing

This check was run without logging in to GitHub, on a fresh clone of the public repository.

| Check | Result |
|---|---|
| Repository page while logged out | Opens (HTTP 200) |
| Branches on GitHub | `main` only, matching the local commit |
| Files in the public repository | 14, exactly the files listed in the README's project structure |
| `.env`, `*.pem` or other local files | Not present |
| Commit emails | Only the GitHub `noreply` address |
| Secret patterns in the full public history | None found |
| Screenshot used in the README | Reachable (HTTP 200) |

## What could not be verified

- **The installed extension:** it could not be tested automatically; it was checked by hand instead (see finding 13).
- **GitHub settings beyond the code:** releases, issues, Actions and wiki. Visibility and branches were checked in Audit 3.
- **Every photo's licence:** the Unsplash licence of each photo served by Picsum. The app relies on Picsum and Unsplash.
- **Other Chromium browsers:** Edge, Brave and Arc were not tested.
- **Secrets in formats** that the pattern scan doesn't cover.

Finding no issues in an automated scan does not prove the project is safe.
