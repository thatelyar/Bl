<p align="center"><img src="icons/icon.svg" width="96" alt="Kairo logo"></p>
<h1 align="center">Kairo</h1>
<p align="center">A calm, minimal daily planner — tasks, goals, focus and reminders.</p>

## Install

**Open → [thatelyar.github.io/Bl](https://thatelyar.github.io/Bl/)**

- **Android / Chrome / Edge:** open the link, then *You → Install Kairo* (or browser menu → *Install app*).
- **iPhone / iPad:** open the link in Safari → *Share* → *Add to Home Screen*.
- **Desktop:** click the install icon in the address bar.

> The link goes live once GitHub Pages is enabled: **Settings → Pages → Deploy from a branch →** pick the branch, folder `/ (root)`.

## Features

- **Today** — week strip, scheduled + anytime lists, progress ring, carried-over tasks.
- **Quick add** — type `Gym 6-7pm tomorrow !` and Kairo fills in the date, start, end and priority.
- **Start & end times** — every task can have both; Kairo shows the duration, what is happening now, and time spent per goal and per week.
- **Goals** — set a goal, link tasks as steps, watch progress and days left.
- **Reminders** — per-task notifications (at time, or 5–60 min before) and an optional daily briefing.
- **Focus** — 15 / 25 / 50-minute sessions tied to a task.
- **You** — streak, weekly chart, completion rate.
- Repeating tasks, light / dark themes, offline support, JSON export / import.

Everything is stored on your device. No account, no server, no tracking.

### A note on reminders

Kairo has no server, so reminders are delivered while the app is open or running in the background.
If it was fully closed, missed reminders appear the next time you open it.

## Develop

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Colors and fonts are tokens at the top of `styles.css`.
