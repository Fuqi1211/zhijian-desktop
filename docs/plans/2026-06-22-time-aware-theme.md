# Time-aware Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Code execution and verification guidance to implement this plan task-by-task.

**Goal:** Give the existing bottom-left theme control explicit light, dark, and time-aware modes, with the time-aware mode selected by default.

**Architecture:** Replace the icon-only toggle with an accessible native selector in the sidebar footer. Keep the resolved visual theme on `document.documentElement`, persist only the user's mode choice, and resolve automatic mode to light from 06:00 to 17:59 and dark at all other local times.

**Tech Stack:** HTML, CSS, vanilla JavaScript, browser localStorage.

---

### Task 1: Theme selector and time resolver

**Files:**
- Modify: `index.html`

**Steps:**
1. Add an accessible, compact theme selector to the sidebar footer.
2. Add styles for normal, hover, focus, and narrow-screen states.
3. Add deterministic time-to-theme resolution and persisted `auto`, `light`, and `dark` modes.
4. Re-evaluate automatic mode on the existing minute timer.

### Task 2: Verification

**Files:**
- Test: `index.html` through the local browser.

**Steps:**
1. Verify automatic mode resolves correctly at 05:59, 06:00, 17:59, and 18:00.
2. Verify manual light/dark selections update the page and persist across reloads.
3. Verify the footer layout and focus state visually at desktop and mobile widths.
4. Run `git diff --check`, inspect the final diff, and commit the implementation.
