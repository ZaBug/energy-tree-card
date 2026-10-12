# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## 0.1.3 - 2026-10-12

### Added

- Tap on a node: measured nodes open the Home Assistant more-info dialog of
  their power sensor (else the energy sensor); Home, Rest, Untracked and nodes
  without data show an explanation of how the value is computed, with this
  period's numbers (inline in the bars layout, in a strip under the tree).
  Nodes are keyboard accessible (Tab, Enter, Space).
- `tap_action` per node, source, `home`, `rest` and `untracked`: any standard
  Home Assistant action (`more-info`, `navigate`, `url`, `perform-action`,
  `none`) plus `explain`.
- Compact tree: when the tree is wider than the card, columns shrink down to
  56 px (smaller circles and text) so a 6-column tree fits a 360 px phone;
  only larger trees still scroll sideways.
- The layout toggle is remembered per device and dashboard view.

## 0.1.2 - 2026-10-12

### Changed

- Rest and Untracked costs are their energy at the parent's average price
  (parent cost / parent energy) instead of the parent cost minus the
  children's costs. A consumer whose cost statistics miss part of the range no
  longer shows up as money on Untracked (0.6 kWh shown with 27.17 RON), and
  Rest / Untracked keep a cost when a sibling has no cost sensor.

## 0.1.1 - 2026-10-11

### Fixed

- Layout toggle buttons are 44 x 40 px (were 40 x 32), easier to hit on a phone.
- Bars layout: Home's bar is full, as the 100 % that the consumer bars refer
  to (it was scaled against the largest source).
- Tree layout: when the tree is wider than the card, the edges that hide nodes
  fade out, so cut-off nodes no longer look like missing data.

## 0.1.0 - 2026-10-11

### Added

- Energy tree card (`custom:energy-tree-card`): sources (solar, grid import,
  grid export) on top, Home in the middle, consumers as a tree under Home with
  nesting to any depth through `parent`.
- Period from the Energy date picker (`energy-date-selection` card on the same
  dashboard, or `collection_key`); today with a note when there is no picker.
- kWh per node from the `change` of long-term statistics, with the statistics
  period chosen like the Energy dashboard (hour, day or month).
- Cost per node from the statistics of cost sensors; grid export compensation
  shown as a credit; Home cost = import cost − export compensation.
- Automatic Rest node under every consumer with children and Untracked node
  under Home, for energy and cost.
- Optional live power per node.
- Placeholder "—" for entities without data instead of NaN.
- Two layouts, circles and lines (tree) and indented bars, with `layout: auto`
  choosing by card width (`narrow_width`) and a toggle in the header.
- Romanian and English labels, icons and colours per node, colours from the
  Home Assistant theme.
- HACS manifest and GitHub workflows for build, release and HACS validation.
