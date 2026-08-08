import 'package:flutter/material.dart';

class Product {
  final String id;
  final int dbProductId;
  final String name;
  final String category;
  final double price;
  final String description;
  final IconData icon;
  final bool isActive;

  const Product({
    required this.id,
    required this.dbProductId,
    required this.name,
    required this.category,
    required this.price,
    required this.description,
    required this.icon,
    this.isActive = true,
  });
}
