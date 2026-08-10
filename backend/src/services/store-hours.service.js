const storesRepository = require('../repositories/stores.repository');

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/// A store's "now" has to be read in its own timezone, not the server's -
/// the server may sit in a different one, and UTC certainly does. Returns
/// the local weekday index, minutes-since-midnight, and ISO date.
function localTimeIn(timezone, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .indexOf(lookup.weekday);

  // 24:00 shows up as hour "24" in some locales at exactly midnight.
  const hour = Number(lookup.hour) % 24;
  const minute = Number(lookup.minute);

  return {
    dayOfWeek: weekdayIndex,
    minutes: hour * 60 + minute,
    isoDate: `${lookup.year}-${lookup.month}-${lookup.day}`,
  };
}

function toMinutes(timeValue) {
  // MySQL TIME comes back as 'HH:MM:SS'.
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  return hours * 60 + minutes;
}

/// True when `minutes` falls inside the window, handling windows that cross
/// midnight (18:00-02:00), which are normal for restaurants and would
/// otherwise read as "never open".
function isWithinWindow(minutes, openMinutes, closeMinutes) {
  if (closeMinutes > openMinutes) {
    return minutes >= openMinutes && minutes < closeMinutes;
  }

  // Crosses midnight: open late tonight OR early this morning.
  return minutes >= openMinutes || minutes < closeMinutes;
}

/// Resolves whether a store is currently taking orders.
///
/// A store with no configured hours is OPEN. Hours are opt-in, and
/// defaulting to closed would have silently shut every existing store the
/// moment this shipped.
async function getStoreOpenState(store, at = new Date()) {
  const timezone = store.timezone || 'Asia/Taipei';
  const local = localTimeIn(timezone, at);

  const closure = await storesRepository.findClosureOnDate(
    store.id,
    local.isoDate
  );

  if (closure) {
    return {
      isOpen: false,
      reason: closure.reason || 'Closed for the day',
      timezone,
    };
  }

  const hours = await storesRepository.findHoursForStore(store.id);

  if (hours.length === 0) {
    return { isOpen: true, reason: null, timezone, hoursConfigured: false };
  }

  const today = hours.find((row) => row.day_of_week === local.dayOfWeek);

  // A day with no row is treated as closed once *some* hours exist - at
  // that point the absence is a statement, not a lack of configuration.
  if (!today || today.is_closed) {
    return {
      isOpen: false,
      reason: `Closed on ${DAY_NAMES[local.dayOfWeek]}`,
      timezone,
      hoursConfigured: true,
    };
  }

  const openMinutes = toMinutes(today.open_time);
  const closeMinutes = toMinutes(today.close_time);

  // A window that crosses midnight also has to consider yesterday's window
  // still running (02:00 now, opened 18:00 yesterday).
  let isOpen = isWithinWindow(local.minutes, openMinutes, closeMinutes);

  if (!isOpen && closeMinutes <= openMinutes) {
    const yesterdayIndex = (local.dayOfWeek + 6) % 7;
    const yesterday = hours.find((row) => row.day_of_week === yesterdayIndex);

    if (yesterday && !yesterday.is_closed) {
      const yOpen = toMinutes(yesterday.open_time);
      const yClose = toMinutes(yesterday.close_time);

      if (yClose <= yOpen && local.minutes < yClose) {
        isOpen = true;
      }
    }
  }

  return {
    isOpen,
    reason: isOpen
      ? null
      : `Closed right now (${String(today.open_time).slice(0, 5)}–${String(
          today.close_time
        ).slice(0, 5)})`,
    timezone,
    hoursConfigured: true,
    todayHours: {
      open: String(today.open_time).slice(0, 5),
      close: String(today.close_time).slice(0, 5),
    },
  };
}

/// Converts "this many local wall-clock minutes-of-day, today" into the UTC
/// instant that represents - anchored to the already-known-good instant
/// `at` rather than reconstructing a date from scratch, so this is just
/// "move `at` forward/back by the wall-clock difference." Correct as long
/// as both instants fall in the same local calendar day (no DST jump
/// between them), which holds for every slot this generates - all "today."
function utcInstantForLocalMinutesToday(timezone, at, targetMinutes) {
  const local = localTimeIn(timezone, at);
  return new Date(at.getTime() + (targetMinutes - local.minutes) * 60000);
}

/// Ready-by pickup slots for the rest of today, spaced every `stepMinutes`
/// starting at the store's own minimum prep time from now, rounded up to
/// the next boundary. Scoped to today only - offering tomorrow's slots
/// needs capacity rules to mean anything, which is a deliberately separate
/// feature.
async function getPickupSlots(store, at = new Date(), { stepMinutes = 15, maxSlots = 32 } = {}) {
  const timezone = store.timezone || 'Asia/Taipei';
  const minPrepMinutes = Number(store.min_prep_minutes) || 0;
  const openState = await getStoreOpenState(store, at);

  if (!openState.isOpen) {
    // No slots for a store that isn't accepting orders right now at all -
    // createOrder already rejects this case outright, so a slot list here
    // would just be an offer the order will bounce off of.
    return {
      timezone,
      minPrepMinutes,
      isOpen: false,
      reason: openState.reason,
      asapReadyAt: null,
      slots: [],
    };
  }

  const local = localTimeIn(timezone, at);
  const earliestMinutes =
    Math.ceil((local.minutes + minPrepMinutes) / stepMinutes) * stepMinutes;
  const asapReadyAt = utcInstantForLocalMinutesToday(
    timezone,
    at,
    local.minutes + minPrepMinutes
  );

  // A window crossing midnight (open until 02:00) technically closes
  // tomorrow - slots stay within today's calendar day regardless, so the
  // effective boundary is end-of-day rather than that later closing time.
  let closeMinutes = 24 * 60;

  if (openState.todayHours) {
    const [closeHour, closeMinute] = openState.todayHours.close
      .split(':')
      .map(Number);
    const configuredClose = closeHour * 60 + closeMinute;

    if (configuredClose > local.minutes) {
      closeMinutes = configuredClose;
    }
  }

  const slots = [];

  for (
    let minutes = earliestMinutes;
    minutes < closeMinutes && slots.length < maxSlots;
    minutes += stepMinutes
  ) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;

    slots.push({
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      readyAt: utcInstantForLocalMinutesToday(timezone, at, minutes).toISOString(),
    });
  }

  return {
    timezone,
    minPrepMinutes,
    isOpen: true,
    reason: slots.length === 0 ? 'No pickup times left before closing.' : null,
    asapReadyAt: asapReadyAt.toISOString(),
    slots,
  };
}

module.exports = {
  DAY_NAMES,
  localTimeIn,
  isWithinWindow,
  getStoreOpenState,
  getPickupSlots,
};
