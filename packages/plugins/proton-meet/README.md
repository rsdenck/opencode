# Proton Meet

Find [Proton Meet](https://meet.proton.me) rooms that are scheduled in your Proton Calendar.

Proton Meet has no API of its own. Meeting rooms are created by Proton Calendar, and their links exist only inside the
calendar events that schedule them. This plugin reads the same read-only ICS source the
[Proton Calendar](../proton-calendar/README.md) plugin uses and surfaces the rooms: which meetings have one, when they
happen, and the join link.

## How it works

1. Proton Calendar events carry a Meet link either in the RFC 7986 `CONFERENCE` property or as a `meet.proton.me` URL
   in the event's URL, location, or description.
2. The plugin expands recurring events, drops `EXDATE` instances and cancelled meetings, and returns only the events
   that carry a room.
3. Guest links (`meet.proton.me/guest?code=...`) can be opened by people without a Proton account; other links open the
   room for signed-in users.

## Requirements

The same ICS source as the calendar plugin: a **share link** from Proton Calendar settings (read-only, treat it as a
secret) or an **exported `.ics` file**. Both plugins can share one configuration.

## Configure

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    {
      "package": "@opencode/plugin-proton-meet",
      "options": { "url": "https://calendar.proton.me/api/calendar/v1/url/..." }
    }
  ],
}
```

| Option      | Environment variable                                  | Default |
| ----------- | ----------------------------------------------------- | ------- |
| `url`       | `PROTON_MEET_URL`, falls back to `PROTON_CALENDAR_URL` | —       |
| `path`      | `PROTON_MEET_ICS`, falls back to `PROTON_CALENDAR_ICS` | —       |
| `cacheTtlMs`| `PROTON_CALENDAR_CACHE_TTL_MS`                        | `600000`|
| `timeoutMs` | —                                                     | `30000` |

## Tools

| Tool                  | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `proton_meet_info`    | Which calendar is read, event count, source host, fetch time.               |
| `proton_meet_upcoming`| Meetings with rooms in a date range, recurring meetings expanded.           |
| `proton_meet_next`    | The next meeting room from now, or null.                                    |
| `proton_meet_parse`   | Normalize a pasted `meet.proton.me` link: guest or room shape and its code.  |

```json
{ "from": "2026-11-02", "to": "2026-11-06" }
```

`proton_meet_upcoming` returns, for example:

```json
{
  "summary": "Standup",
  "start": "2026-11-02T14:00:00.000Z",
  "end": "2026-11-02T14:15:00.000Z",
  "room": {
    "url": "https://meet.proton.me/guest?code=abc-defg-hij",
    "code": "abc-defg-hij",
    "guest": true
  },
  "recurring": true
}
```

Example prompt: "What is my next Proton Meet room, and send the guest link to the standup."

## Limitations

- **Read-only and calendar-bound.** Rooms can be listed and parsed, not created. Creating a meeting room requires the
  Proton Calendar app; there is no API to schedule one.
- `proton_meet_parse` never contacts Proton, so it cannot tell whether a room is currently open — only Proton Meet
  itself shows that.
- The ICS feed refreshes at Proton's pace (roughly every 8–16 hours for share links), so a meeting created minutes ago
  may not appear yet.
