# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

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
