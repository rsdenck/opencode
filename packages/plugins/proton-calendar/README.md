# Proton Calendar

Read Proton Calendar events from OpenCode using a read-only ICS share link or an exported `.ics` file.

Proton Calendar is end-to-end encrypted and deliberately has no CalDAV endpoint, so it cannot be read with a standard
calendar client. The two machine-readable sources are:

- a **share link** (`https://calendar.proton.me/api/calendar/v1/url/.../calendar.ics`), which Proton serves read-only,
- an **exported `.ics` file** from Proton Calendar settings, which is a one-time snapshot.

This plugin reads either one. It cannot create, edit, or delete events.

Proton Meet has no API of its own either. Meeting links live inside calendar events, so the plugin surfaces them in the
`meet` field of each event instead of pretending to start or join calls.

## Get a source

**Share link (live, recommended).** In Proton Calendar, open Settings, select the calendar, enable sharing by link, and
copy the ICS link. Proton refreshes shared calendars every 8 to 16 hours, so changes can lag behind the app.

**Export (snapshot).** In Proton Calendar, select the calendar and choose Export. Proton limits exports to 10 MB or
15,000 events, and the file does not update afterwards.

Treat the share link as a password: anyone who has it can read the calendar.

## Configure

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    {
      "package": "@opencode/plugin-proton-calendar",
      "options": {
        "url": "https://calendar.proton.me/api/calendar/v1/url/<token>/calendar.ics",
      },
    },
  ],
}
```

An exported file works the same way with `path`:

```jsonc
{ "package": "@opencode/plugin-proton-calendar", "options": { "path": "/home/me/Personal.ics" } }
```

| Option       | Environment variable         | Default      |
| ------------ | ---------------------------- | ------------ |
| `url`        | `PROTON_CALENDAR_URL`        | —            |
| `path`       | `PROTON_CALENDAR_ICS`        | —            |
| `cacheTtlMs` | `PROTON_CALENDAR_CACHE_TTL_MS` | `600000`   |
| `timeoutMs`  | —                            | `30000`      |

Set either `url` or `path`. `webcal://` links are accepted and fetched over HTTPS. Responses are cached for ten minutes
by default to avoid hammering the share link on every tool call.

## Tools

| Tool                     | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `proton_calendar_info`   | Calendar name, timezone, raw event count, source host, fetch time.   |
| `proton_calendar_events` | Events in a date range, recurring events expanded into occurrences.  |

`proton_calendar_events` takes `from`, `to`, `limit`, and an optional `text` filter. It defaults to the next seven days
and sorts by start time. Each event includes `meet` when the event carries a conferencing link.

```json
{ "from": "2026-11-01", "to": "2026-11-30", "text": "dentist" }
```

Example prompt: "What is on my Proton Calendar next week, send me the Meet links, and does anything conflict with my
15:00 focus block?"

## Behavior

- Recurring events are expanded inside the requested range. `EXDATE` instances are dropped and `RECURRENCE-ID`
  overrides replace the original occurrence.
- `STATUS:CANCELLED` events are omitted.
- Timed events use ISO 8601 UTC timestamps. All-day events keep `YYYY-MM-DD` dates, where the end date is exclusive, as
  iCalendar defines it.
- `meet` carries the conferencing link: the RFC 7986 `CONFERENCE` property when present, otherwise the first
  `meet.proton.me` URL found in the event's URL, location, or description.
- Share links are credentials, so tool output reports only the host, never the full URL.

## Limitations

- Read-only. There is no CalDAV or write API in Proton Calendar.
- Only one calendar per plugin instance. Point `url` or `path` at the calendar you want to read.
- Attachments, participants, reminders, and alarms are not returned.
- A share link that is revoked or password protected surfaces as an HTTP error or an HTML body; the plugin explains both
  instead of returning empty results.
