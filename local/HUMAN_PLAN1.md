# Human Plan: Building Your Fast Gesture Drawing App

This is a step-by-step guide to building the `random-pics` app. It's based on the professional architecture documents but translated into a practical plan for someone with your experience. The goal is to build a solid foundation first, then add features, so you always have a working app.

### The Core Idea (The "Secret Sauce")

The most important concept from the architecture docs is **separation**. Think of your app like a person:

1.  **The Brain (Domain Logic):** This is pure Python code that thinks. It manages the list of images, knows which one is next, and handles the timer. It has no idea what a "button" or a "database" is. This makes it super easy to test with `pytest`.
2.  **The Senses & Hands (Adapters):** These parts interact with the outside world.
    *   **UI:** The window, buttons, and image display (`PySide6`).
    *   **Database:** A simple database to remember your image files (`SQLite`).
    *   **File System:** The part that scans your folders for images.
3.  **The Coordinator (Application Service):** This is the boss that connects the Brain to the Senses through narrow interfaces (`ports`). It listens for a button click, tells the Brain to go to the next image, then asks adapters (DB, FS, decoder, timer) to do work, and finally tells the UI what to show.

This separation is the key to preventing the lag you hate in other apps. The UI never gets stuck waiting for the database or the file system.

---

## Your Step-by-Step Implementation Plan

Follow these phases in order. Don't jump ahead!

### Phase 1: The Skeleton - A Window on the Screen

**Goal:** Get a basic, non-functional UI shell running.

1.  **Set Up Your Environment:**
    *   Use a Python virtual environment (`python -m venv .venv`).
    *   Install PySide6: `pip install PySide6`.
2.  **Create Your First Window:**
    *   Write a simple Python script (`app.py`) that uses PySide6 to create and show a blank window.
3.  **Add Basic Controls:**
    *   Add "Next," "Previous," and "Change Folder" buttons to your window.
    *   Add a label where the image path will go.
    *   For now, make the buttons just print a message to the console when you click them (e.g., `"Next button clicked"`).

**At the end of this phase, you'll have a window that appears, has buttons, but does nothing. This is a great first step.**

### Phase 2: The Brain - Logic with Fake Data

**Goal:** Control the app's state with pure Python logic, without touching real images yet.

1.  **Create the "Playlist":**
    *   In a new file (e.g., `domain.py`), create a `Playlist` class.
    *   It should hold a list of fake image paths (e.g., `['C:/fake/img1.jpg', 'C:/fake/img2.jpg']`).
    *   Add methods like `next()`, `previous()`, and `current_image()` that manage the position in the list.
2.  **Create the Application Service:**
    *   Build a thin class (e.g., `AppController`) that owns the `Playlist`, the adapters (even if they're fake for now), and exposes intent methods like `on_next_clicked()`.
    *   Keep UI widgets ignorant of the playlist: they signal intents, the controller mutates domain state, then pushes new values back to the UI.
3.  **Connect Logic to UI:**
    *   Wire your PySide6 signals to the controller methods.
    *   Controller reads `playlist.current_image()` and calls UI update helpers; UI never calls domain methods directly.
3.  **Test Your Brain:**
    *   Since your `Playlist` is pure Python, write a `pytest` test for it! Verify that `next()` and `previous()` work correctly.

**At the end of this phase, you'll have an app where you can click "Next" and "Previous" to cycle through a FAKE list of file paths. The core logic is working and testable.**

### Phase 3: The Real Deal - Loading and Showing Images

**Goal:** Scan a folder and display real images. This is where you'll tackle the "lag" problem head-on.

1.  **Implement the Folder Scanner:**
    *   Write a function that takes a folder path, scans it for image files (`.jpg`, `.png`), and returns a list of their full paths.
2.  **Set Up the Database:**
    *   Use Python's built-in `sqlite3`.
    *   Create a simple database with two tables: `folders` and `images` (the `architecture_improved.md` has a perfect schema for this).
    *   When the user chooses a folder, scan it and save the image paths to the database. This way, you only have to scan a big folder once.
3.  **Load and Display Images (The Right Way):**
    *   The controller must gate UI consumption until the playlist is rebuilt for the newly chosen folder. No direct DB reads inside widgets.
    *   First paint is always a thumbnail (cached on disk) so the UI hits the ≤500 ms goal; then promote to the decoded full-res image when ready.
    *   **CRUCIAL ADVICE:** Image loading can be slow. Do NOT do it on the main UI thread. If you do, your app will freeze. Use Python's `threading` or `QThreadPool` to load the image file in the background and marshal the finished pixmap back through a Qt signal.

**At the end of this phase, your app will be functional! You can choose a folder, and it will show you images.**

### Phase 4: Speed, Polish, and Features

**Goal:** Make the app feel instant and add the core drawing timer feature.

1.  **Instant First Image with Thumbnails:**
    *   To make images appear instantly, especially on a folder switch, you need thumbnails.
    *   When you load a full-quality image, create a small version of it (a "thumbnail") and save it to a cache folder keyed by `image_id`.
    *   Now, when you need to show an image, you can load the tiny thumbnail *first* (which is instant), and then start loading the full-quality image in the background to swap in when it's ready. This is a key trick for a snappy UI.
2.  **Implement the Timer & Preloader Queue:**
    *   Add the timer feature for gesture drawing. PySide6 has a `QTimer` class that is perfect for this. Treat it like any other adapter behind a port.
    *   When the timer elapses, make it automatically call your controller's `on_auto_advance()` which in turn advances the playlist.
    *   Build a bounded, LIFO decode/preload queue so rapid `Next/Prev` cancels stale work instead of flooding threads.
3.  **Stress Test and Instrument:**
    *   Test your app with a folder containing 10,000+ images.
    *   Log/play back timings for folder switch, thumbnail hits, and decode durations so you catch regressions early.

---

### General Advice to Make Your App Great

*   **Test Early, Test Often:** You already know `pytest`. Use it for your entire "Brain" layer. It will save you countless hours.
*   **Keep It Separate:** The #1 rule. Never let your UI code talk directly to the database. Never let your Brain know about UI buttons. The Coordinator (`Application Service`) is the only one who talks to everyone.
*   **Ask for Help:** When you get stuck on a specific step (e.g., "How do I use QThreadPool?"), ask an AI assistant. You can give it your code and a snippet from the architecture docs for context.
*   **Commit Your Work:** Use `git` to save your progress after every small success. It's your safety net.

This plan gives you a clear path from zero to a fast, functional application. Good luck!
