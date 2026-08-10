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

module.exports = {
  DAY_NAMES,
  localTimeIn,
  isWithinWindow,
  getStoreOpenState,
};
