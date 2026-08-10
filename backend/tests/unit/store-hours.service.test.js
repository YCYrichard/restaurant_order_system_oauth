jest.mock('../../src/repositories/stores.repository');

const storesRepository = require('../../src/repositories/stores.repository');
const storeHoursService = require('../../src/services/store-hours.service');

const store = { id: 1, name: 'Demo Store', timezone: 'Asia/Taipei' };

// A fixed instant, expressed in UTC, so these assertions don't depend on
// the machine's own timezone.
function utc(iso) {
  return new Date(iso);
}

describe('store-hours.service.localTimeIn', () => {
  test('reads the wall clock in the store\'s timezone, not the server\'s', () => {
    // 2026-08-10T02:30:00Z is 10:30 the same day in Taipei (UTC+8).
    const local = storeHoursService.localTimeIn(
      'Asia/Taipei',
      utc('2026-08-10T02:30:00Z')
    );

    expect(local.minutes).toBe(10 * 60 + 30);
    expect(local.isoDate).toBe('2026-08-10');
    expect(local.dayOfWeek).toBe(1); // Monday
  });

  test('rolls the local date forward across the UTC day boundary', () => {
    // 23:00Z Sunday is already 07:00 Monday in Taipei.
    const local = storeHoursService.localTimeIn(
      'Asia/Taipei',
      utc('2026-08-09T23:00:00Z')
    );

    expect(local.isoDate).toBe('2026-08-10');
    expect(local.dayOfWeek).toBe(1);
    expect(local.minutes).toBe(7 * 60);
  });
});

describe('store-hours.service.isWithinWindow', () => {
  test('handles an ordinary daytime window', () => {
    expect(storeHoursService.isWithinWindow(12 * 60, 9 * 60, 17 * 60)).toBe(true);
    expect(storeHoursService.isWithinWindow(8 * 60, 9 * 60, 17 * 60)).toBe(false);
    expect(storeHoursService.isWithinWindow(17 * 60, 9 * 60, 17 * 60)).toBe(false);
  });

  test('handles a window that crosses midnight', () => {
    // 18:00 -> 02:00, which would read as "never open" with naive maths.
    const open = 18 * 60;
    const close = 2 * 60;

    expect(storeHoursService.isWithinWindow(20 * 60, open, close)).toBe(true);
    expect(storeHoursService.isWithinWindow(1 * 60, open, close)).toBe(true);
    expect(storeHoursService.isWithinWindow(10 * 60, open, close)).toBe(false);
  });
});

describe('store-hours.service.getStoreOpenState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findClosureOnDate.mockResolvedValue(null);
  });

  test('a store with no configured hours stays open', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([]);

    const state = await storeHoursService.getStoreOpenState(store);

    // Hours are opt-in; defaulting to closed would have shut every
    // existing store the moment this shipped.
    expect(state.isOpen).toBe(true);
    expect(state.hoursConfigured).toBe(false);
  });

  test('open during the configured window', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00', is_closed: 0 },
    ]);

    const state = await storeHoursService.getStoreOpenState(
      store,
      utc('2026-08-10T02:30:00Z') // 10:30 Monday in Taipei
    );

    expect(state.isOpen).toBe(true);
  });

  test('closed outside the configured window', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00', is_closed: 0 },
    ]);

    const state = await storeHoursService.getStoreOpenState(
      store,
      utc('2026-08-09T22:00:00Z') // 06:00 Monday in Taipei
    );

    expect(state.isOpen).toBe(false);
    expect(state.reason).toMatch(/Closed right now/);
  });

  test('a day marked closed is closed', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '00:00:00', close_time: '00:00:00', is_closed: 1 },
    ]);

    const state = await storeHoursService.getStoreOpenState(
      store,
      utc('2026-08-10T02:30:00Z')
    );

    expect(state.isOpen).toBe(false);
    expect(state.reason).toMatch(/Closed on Monday/);
  });

  test('a day with no row is closed once any hours exist', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 2, open_time: '09:00:00', close_time: '17:00:00', is_closed: 0 },
    ]);

    const state = await storeHoursService.getStoreOpenState(
      store,
      utc('2026-08-10T02:30:00Z') // Monday, only Tuesday configured
    );

    expect(state.isOpen).toBe(false);
  });

  test('still open in the small hours from the previous night\'s window', async () => {
    // Open 18:00 Sunday -> 02:00 Monday; it is 01:00 Monday in Taipei.
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 0, open_time: '18:00:00', close_time: '02:00:00', is_closed: 0 },
      { day_of_week: 1, open_time: '18:00:00', close_time: '02:00:00', is_closed: 0 },
    ]);

    const state = await storeHoursService.getStoreOpenState(
      store,
      utc('2026-08-09T17:00:00Z') // 01:00 Monday Taipei
    );

    expect(state.isOpen).toBe(true);
  });

  test('a holiday closure overrides open hours', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00', is_closed: 0 },
    ]);
    storesRepository.findClosureOnDate.mockResolvedValue({
      closure_date: '2026-08-10',
      reason: 'Lunar New Year',
    });

    const state = await storeHoursService.getStoreOpenState(
      store,
      utc('2026-08-10T02:30:00Z')
    );

    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe('Lunar New Year');
  });
});

describe('store-hours.service.getPickupSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findClosureOnDate.mockResolvedValue(null);
  });

  const storeWithPrep = { ...store, min_prep_minutes: 15 };

  test('rejects with no slots when the store is not open right now', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '00:00:00', close_time: '00:00:00', is_closed: 1 },
    ]);

    const result = await storeHoursService.getPickupSlots(
      storeWithPrep,
      utc('2026-08-10T02:30:00Z')
    );

    expect(result.isOpen).toBe(false);
    expect(result.slots).toEqual([]);
    expect(result.asapReadyAt).toBeNull();
    expect(result.reason).toMatch(/Closed on Monday/);
  });

  test('rounds the earliest slot up to the next boundary past the prep window', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([]); // always open

    // 10:30 Taipei + 15 min prep = 10:45, already a 15-minute boundary.
    const result = await storeHoursService.getPickupSlots(
      storeWithPrep,
      utc('2026-08-10T02:30:00Z')
    );

    expect(result.isOpen).toBe(true);
    expect(result.slots[0]).toMatchObject({ label: '10:45' });
    expect(result.asapReadyAt).toBe('2026-08-10T02:45:00.000Z');
  });

  test('rounds up rather than down when prep time lands mid-interval', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([]);

    // 10:31 Taipei + 15 min prep = 10:46 -> next boundary is 10:45... no,
    // it must round UP, so the first offerable slot is 11:00.
    const result = await storeHoursService.getPickupSlots(
      storeWithPrep,
      utc('2026-08-10T02:31:00Z')
    );

    expect(result.slots[0]).toMatchObject({ label: '11:00' });
  });

  test('stops offering slots at closing time', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00', is_closed: 0 },
    ]);

    const result = await storeHoursService.getPickupSlots(
      storeWithPrep,
      utc('2026-08-10T02:30:00Z') // 10:30 Taipei
    );

    expect(result.slots[0]).toMatchObject({ label: '10:45' });
    expect(result.slots[result.slots.length - 1]).toMatchObject({ label: '16:45' });
    expect(result.slots.every((s) => s.label < '17:00')).toBe(true);
  });

  test('reports no slots left when prep time pushes past closing, without saying the store is closed', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '09:00:00', close_time: '11:00:00', is_closed: 0 },
    ]);

    const result = await storeHoursService.getPickupSlots(
      storeWithPrep,
      utc('2026-08-10T02:50:00Z') // 10:50 Taipei, +15 min prep = 11:05, past 11:00 close
    );

    expect(result.isOpen).toBe(true);
    expect(result.slots).toEqual([]);
    expect(result.reason).toMatch(/No pickup times left/);
  });

  test('caps an unbounded (always-open) store at a sane number of slots', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([]);

    const result = await storeHoursService.getPickupSlots(
      storeWithPrep,
      utc('2026-08-10T02:30:00Z')
    );

    expect(result.slots.length).toBeLessThanOrEqual(32);
  });

  test('returns each slot as a real ISO instant, not just a label', async () => {
    storesRepository.findHoursForStore.mockResolvedValue([
      { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00', is_closed: 0 },
    ]);

    const result = await storeHoursService.getPickupSlots(
      { ...storeWithPrep, min_prep_minutes: 0 },
      utc('2026-08-10T02:30:00Z')
    );

    expect(result.slots[0]).toMatchObject({
      label: '10:30',
      readyAt: '2026-08-10T02:30:00.000Z',
    });
  });
});
