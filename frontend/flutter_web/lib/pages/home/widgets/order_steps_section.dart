import 'package:flutter/material.dart';

import '../../../core/widgets/section_container.dart';

class OrderStepsSection extends StatelessWidget {
  const OrderStepsSection({super.key});

  @override
  Widget build(BuildContext context) {
    return SectionContainer(
      title: 'How ordering works',
      subtitle:
          'A simple flow for the next features you will connect after the first page.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth > 800;
          final steps = const [
            _StepCard(
              number: '01',
              title: 'Login',
              description: 'Sign in with Google, Facebook, or LINE.',
            ),
            _StepCard(
              number: '02',
              title: 'Choose items',
              description: 'Browse categories and add products to your cart.',
            ),
            _StepCard(
              number: '03',
              title: 'Checkout',
              description:
                  'Confirm store, order details, and payment flow later.',
            ),
          ];

          return isWide
              ? Row(
                  children: steps
                      .map((step) => Expanded(
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 8),
                              child: step,
                            ),
                          ))
                      .toList(),
                )
              : Column(
                  children: steps
                      .map((step) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: step,
                          ))
                      .toList(),
                );
        },
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  final String number;
  final String title;
  final String description;

  const _StepCard({
    required this.number,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFFFF5EF),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              number,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: Colors.deepOrange,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: const TextStyle(
                color: Color(0xFF625D5A),
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
