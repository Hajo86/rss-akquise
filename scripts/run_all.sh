#!/bin/bash
set -u
declare -a ROWS=(
  "1001|Buchholz|buchholz"
  "1011|Elbmarsch|elbmarsch"
  "1028|Hanstedt|hanstedt"
  "1050|Hollenstedt|hollenstedt"
  "1074|Jesteburg|jesteburg"
  "1081|Neu Wulmstorf|neu-wulmstorf"
  "1094|Rosengarten|rosengarten"
  "1108|Salzhausen|salzhausen"
  "1150|Stelle|stelle"
  "1157|Tostedt|tostedt"
  "1187|Winsen|winsen"
)
for row in "${ROWS[@]}"; do
  IFS='|' read -r id name slug <<< "$row"
  echo "==== $name ($id) -> abfuhr-$slug.json ===="
  python3 scrape_lkharburg.py "$id" "../data/abfuhr-$slug.json" 2026 "$name"
  echo "---- fertig $name ----"
done
echo "ALL DONE"
