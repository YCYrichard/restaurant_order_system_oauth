const modifiersService = require('../services/modifiers.service');
const modifiersRepository = require('../repositories/modifiers.repository');
const categoriesRepository = require('../repositories/categories.repository');

// Reuses the store-access query the categories repository already owns
// rather than adding a fourth copy of the same lookup.
const hasStoreAccess = (userId, storeId) =>
  categoriesRepository.hasStoreAccess(userId, storeId);

exports.listGroupsForStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const groups = await modifiersService.listGroupsForStore(storeId);

    res.status(200).json({ groups });
  } catch (error) {
    next(error);
  }
};

exports.createGroup = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const group = await modifiersService.createGroup(storeId, req.body);

    res.status(201).json({ group });
  } catch (error) {
    next(error);
  }
};

exports.addOption = async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    await modifiersService.resolveGroupAccess(groupId, req.user, hasStoreAccess);

    const group = await modifiersService.addOption(groupId, req.body);

    res.status(201).json({ group });
  } catch (error) {
    next(error);
  }
};

exports.deleteGroup = async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    await modifiersService.resolveGroupAccess(groupId, req.user, hasStoreAccess);
    await modifiersService.deleteGroup(groupId);

    res.status(200).json({ message: 'Modifier group deleted' });
  } catch (error) {
    next(error);
  }
};

exports.deleteOption = async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);
    const option = await modifiersRepository.findOptionById(optionId);

    if (!option) {
      throw new modifiersService.ModifierNotFoundError('Option not found');
    }

    await modifiersService.resolveGroupAccess(
      option.group_id,
      req.user,
      hasStoreAccess
    );
    await modifiersService.deleteOption(optionId);

    res.status(200).json({ message: 'Option deleted' });
  } catch (error) {
    next(error);
  }
};

exports.attachGroupToProduct = async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const productId = Number(req.params.productId);

    await modifiersService.resolveGroupAccess(groupId, req.user, hasStoreAccess);
    await modifiersRepository.attachGroupToProduct(productId, groupId);

    res.status(200).json({ message: 'Modifier group attached' });
  } catch (error) {
    next(error);
  }
};

exports.detachGroupFromProduct = async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const productId = Number(req.params.productId);

    await modifiersService.resolveGroupAccess(groupId, req.user, hasStoreAccess);
    await modifiersRepository.detachGroupFromProduct(productId, groupId);

    res.status(200).json({ message: 'Modifier group detached' });
  } catch (error) {
    next(error);
  }
};
