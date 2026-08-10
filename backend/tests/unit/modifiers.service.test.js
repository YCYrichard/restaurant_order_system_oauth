jest.mock('../../src/repositories/modifiers.repository');

const modifiersService = require('../../src/services/modifiers.service');

const product = { id: 1, name: 'Burger' };

/// Mirrors what modifiersRepository.groupRowsByProduct produces for one
/// product: a Map of groupId -> group with options.
function groupsFor(...groups) {
  return new Map(groups.map((group) => [group.id, group]));
}

const sizeGroup = {
  id: 10,
  name: 'Size',
  min_select: 1,
  max_select: 1,
  is_required: 1,
  options: [
    { id: 100, name: 'Regular', price_delta: 0, is_active: 1 },
    { id: 101, name: 'Large', price_delta: 2.5, is_active: 1 },
  ],
};

const addOnsGroup = {
  id: 20,
  name: 'Add-ons',
  min_select: 0,
  max_select: 2,
  is_required: 0,
  options: [
    { id: 200, name: 'Bacon', price_delta: 1.5, is_active: 1 },
    { id: 201, name: 'Cheese', price_delta: 1, is_active: 1 },
    { id: 202, name: 'Truffle', price_delta: 5, is_active: 0 },
  ],
};

describe('modifiers.service.resolveLineModifiers', () => {
  test('a product with no groups accepts no selections and adds nothing', () => {
    const result = modifiersService.resolveLineModifiers(product, [], undefined);

    expect(result.priceDelta).toBe(0);
    expect(result.modifiers).toEqual([]);
  });

  test('sums the price deltas of the chosen options', () => {
    const result = modifiersService.resolveLineModifiers(
      product,
      [101, 200],
      groupsFor(sizeGroup, addOnsGroup)
    );

    expect(result.priceDelta).toBe(4); // 2.50 large + 1.50 bacon
    expect(result.modifiers).toHaveLength(2);
  });

  test('snapshots the group and option names, not just ids', () => {
    const result = modifiersService.resolveLineModifiers(
      product,
      [101],
      groupsFor(sizeGroup)
    );

    // These strings are what gets persisted, so the order still reads
    // correctly after the menu is edited.
    expect(result.modifiers[0]).toEqual({
      optionId: 101,
      groupName: 'Size',
      optionName: 'Large',
      priceDelta: 2.5,
    });
  });

  test('rejects an option that belongs to a different product', () => {
    expect(() =>
      modifiersService.resolveLineModifiers(
        product,
        [999],
        groupsFor(sizeGroup)
      )
    ).toThrow(/not available for Burger/);
  });

  test('rejects an option the store has switched off', () => {
    expect(() =>
      modifiersService.resolveLineModifiers(
        product,
        [100, 202],
        groupsFor(sizeGroup, addOnsGroup)
      )
    ).toThrow(/not currently available/);
  });

  test('enforces a required group', () => {
    expect(() =>
      modifiersService.resolveLineModifiers(
        product,
        [],
        groupsFor(sizeGroup)
      )
    ).toThrow(/please choose an option for Size/);
  });

  test('enforces max_select', () => {
    expect(() =>
      modifiersService.resolveLineModifiers(
        product,
        [100, 200, 201],
        groupsFor(sizeGroup, { ...addOnsGroup, max_select: 1 })
      )
    ).toThrow(/allows at most 1 choice/);
  });

  test('enforces min_select on an optional-but-bounded group', () => {
    expect(() =>
      modifiersService.resolveLineModifiers(
        product,
        [100],
        groupsFor(sizeGroup, {
          ...addOnsGroup,
          min_select: 2,
          is_required: 0,
        })
      )
    ).toThrow(/needs at least 2 choice/);
  });

  test('a client cannot smuggle in its own price - only ids are accepted', () => {
    // Selections are ids; there is no price field to tamper with, and the
    // delta comes from the option row.
    const result = modifiersService.resolveLineModifiers(
      product,
      [101],
      groupsFor(sizeGroup)
    );

    expect(result.priceDelta).toBe(2.5);
  });
});

describe('modifiers.service.createGroup validation', () => {
  test('requires a name', () => {
    expect(() =>
      modifiersService.createGroup(1, { name: '   ', maxSelect: 1 })
    ).rejects.toThrow(/group name is required/);
  });

  test('rejects minSelect greater than maxSelect', () => {
    expect(() =>
      modifiersService.createGroup(1, {
        name: 'Size',
        minSelect: 3,
        maxSelect: 1,
      })
    ).rejects.toThrow(/cannot be greater than maxSelect/);
  });

  test('rejects maxSelect below one', () => {
    expect(() =>
      modifiersService.createGroup(1, { name: 'Size', maxSelect: 0 })
    ).rejects.toThrow(/at least one/);
  });
});
