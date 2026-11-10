---
name: events-calendar
description: Building interactive event calendars, appointment schedulers, or any time-based view with drag-and-drop support in this project — using the Blocks EventsCalendar component that wraps react-big-calendar. Load this skill whenever the task involves a calendar view, event scheduling, time slots, appointments, or drag-and-drop event management.
user-invocable: false
---

# Event Calendar Skill

**EventsCalendar** wraps `react-big-calendar` with theming, localization, and drag-and-drop pre-configured; all `react-big-calendar` props pass through. Use it for calendar views, schedulers, appointments, and time-slot UIs — not for date picking in a form, which is the `calendar` registry component.

It ships in the local Blocks registry (`.blocks-registry/` at the project root). If `src/components/ui/events-calendar.tsx` does not exist yet:

```bash
yes n | CI=1 pnpm dlx shadcn@4.23.0 add ./.blocks-registry/events-calendar.json -y
```

```tsx
import { EventsCalendar, Event, Slot } from '@/components/ui/events-calendar';

// The DB returns ISO strings; the calendar needs Date objects.
const events: Event[] =
  appointments?.map((apt) => ({
    title: apt.title,
    start: new Date(apt.startDateTime),
    end: new Date(apt.endDateTime),
    allDay: apt.isAllDay, // only if the entity has this field
    resource: apt, // the row itself, for the handlers
  })) || [];

// Slot clicked — slotInfo.start / .end are Date objects with the time
async function handleSelectSlot(slotInfo: Slot) {
  await createFunction({
    data: {
      startDateTime: slotInfo.start.toISOString(),
      endDateTime: slotInfo.end.toISOString(),
    },
  });
}

// Dragged or resized — start/end are the NEW Date objects
async function handleEventDrop({ event, start, end, allDay }: Event) {
  const data: Record<string, any> = {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
  };
  // allDay = true when it landed on the all-day row; only set it if the entity has the field
  if ('isAllDay' in event.resource) data.isAllDay = allDay;
  await updateFunction({ id: event.resource.id, data });
}

async function handleEventResize({ event, start, end }: Event) {
  await updateFunction({
    id: event.resource.id,
    data: {
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
    },
  });
}

<EventsCalendar
  events={events}
  onSelectSlot={handleSelectSlot}
  onEventDrop={handleEventDrop}
  onEventResize={handleEventResize}
  eventPropGetter={(e) => ({
    style: {
      backgroundColor: colorByType[e.resource?.type] || 'var(--chart-1)',
      color: 'white',
    },
  })}
  style={{ height: '700px' }}
/>;
```

## Rules

1. **Date objects in, ISO strings out.** `react-big-calendar` silently renders nothing when `start`/`end` are strings; write back with `.toISOString()`.
2. **Wire both `onEventDrop` and `onEventResize`** (same handler shape). Omitting one leaves that gesture visually working but never persisted.
3. **Set the height on `EventsCalendar` itself** — `style={{ height: '700px' }}`. A wrapper div for sizing collapses the calendar.
4. **When the entity has an `isAllDay` field**, persist the `allDay` param from `onEventDrop`; it is the only signal that the event moved onto or off the all-day row.
5. **Theme tokens are full OKLCH colors** — reference them as `var(--chart-1)`. `hsl(var(--chart-1))` does not resolve and the color silently no-ops.
